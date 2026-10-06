import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { createHash, randomBytes } from 'crypto';
import { MIN_PASSWORD_LENGTH } from '../constants';
import { googleClientId, verifyGoogleIdToken } from './googleAuth';
import { GlobalLeaderboardCollection } from './globalLeaderboard';

// Guard against --full-app test mode evaluating this module twice
// (app bundle + test bundle both load it; global is shared across both).
if (!global._PlayerAccountsCollection) {
  global._PlayerAccountsCollection = new Mongo.Collection('playerAccounts');
}
export const PlayerAccountsCollection = global._PlayerAccountsCollection;

function cleanText(value) {
  return String(value || '').trim();
}

function normaliseEmail(email) {
  return cleanText(email).toLowerCase();
}

function hashPassword(password, salt) {
  return createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function publicAccount(account) {
  return { _id: account._id, displayName: account.displayName, email: account.email };
}

// Mints a session token for the account and returns it with the public account fields.
// Only the token's hash is stored, so a copy of the database does not hand out working
// sessions. Expired sessions are dropped first, so the array cannot grow without bound.
async function issueSession(account) {
  const sessionToken = Random.secret();
  const now = new Date();
  await PlayerAccountsCollection.updateAsync(account._id, {
    $pull: { sessions: { expiresAt: { $lte: now } } },
  });
  await PlayerAccountsCollection.updateAsync(account._id, {
    $push: {
      sessions: {
        hash: hashSessionToken(sessionToken),
        createdAt: now,
        expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
      },
    },
  });
  return { ...publicAccount(account), sessionToken };
}

export const DISPLAY_NAME_MAX_LENGTH = 40;
const FALLBACK_DISPLAY_NAME = 'Player';

// Display names are unique ignoring case and runs of whitespace, so "Alice  G" and
// "alice g" are the same name. displayNameKey is what the unique index is built on.
export function normaliseDisplayName(value) {
  return cleanText(value).replace(/\s+/g, ' ').slice(0, DISPLAY_NAME_MAX_LENGTH).trim();
}

export function displayNameKey(name) {
  return normaliseDisplayName(name).toLowerCase();
}

function isDuplicateKey(error, field) {
  return error?.code === 11000 && (Boolean(error.keyPattern?.[field]) || String(error.message).includes(field));
}

function nameTakenError() {
  return new Meteor.Error('name-taken', 'That display name is taken. Try another.');
}

// "Alice", "Alice 2", "Alice 3", ... trimming the base so the suffix always fits.
function displayNameVariant(base, attempt) {
  if (attempt === 1) return base;
  const suffix = ` ${attempt}`;
  return `${base.slice(0, DISPLAY_NAME_MAX_LENGTH - suffix.length).trim()}${suffix}`;
}

async function isDisplayNameTaken(name, exceptAccountId = null) {
  const selector = { displayNameKey: displayNameKey(name) };
  if (exceptAccountId) selector._id = { $ne: exceptAccountId };
  return Boolean(await PlayerAccountsCollection.findOneAsync(selector, { fields: { _id: 1 } }));
}

async function firstFreeDisplayName(base) {
  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const candidate = displayNameVariant(base, attempt);
    if (!(await isDisplayNameTaken(candidate))) return candidate;
  }
  return displayNameVariant(base, Random.id(4));
}

function googleDisplayName(payload, email) {
  return normaliseDisplayName(payload.name || email.split('@')[0]) || FALLBACK_DISPLAY_NAME;
}

// Keeps the leaderboard row in step with the account it belongs to. Matching only a row
// whose name differs makes this a no-op when nothing changed, so the startup pass does
// not rewrite every row on every boot.
async function syncLeaderboardName(accountId, displayName) {
  await GlobalLeaderboardCollection.updateAsync(
    { accountId, displayName: { $ne: displayName } },
    { $set: { displayName } }
  );
}

// One-off repair, run at startup before the unique index is built: gives every account
// a displayNameKey and suffixes duplicate names. The oldest account keeps the name.
// Idempotent, so it is a no-op once the data is clean.
export async function ensureUniqueDisplayNames() {
  const accounts = await PlayerAccountsCollection.find(
    {},
    { sort: { createdAt: 1, _id: 1 }, fields: { displayName: 1, displayNameKey: 1 } }
  ).fetchAsync();

  const taken = new Set();
  let renamed = 0;
  for (const account of accounts) {
    const base = normaliseDisplayName(account.displayName) || FALLBACK_DISPLAY_NAME;
    let attempt = 1;
    let name = base;
    while (taken.has(displayNameKey(name))) {
      attempt += 1;
      name = displayNameVariant(base, attempt);
    }
    taken.add(displayNameKey(name));

    if (name !== account.displayName || account.displayNameKey !== displayNameKey(name)) {
      await PlayerAccountsCollection.updateAsync(account._id, {
        $set: { displayName: name, displayNameKey: displayNameKey(name) },
      });
      if (name !== account.displayName) renamed += 1;
    }
    await syncLeaderboardName(account._id, name);
  }
  if (renamed) console.log(`[playerAccounts] Renamed ${renamed} account(s) with a duplicate display name.`);
}

// Finds the account for a verified Google identity: by Google subject first, then by
// email (linking the Google identity to an existing email-and-password account),
// otherwise creates one with no password.
//
// Linking removes the account's password and ends its sessions. Registration never
// proves who owns an email, so a password account for someone else's address may have
// been created by anyone; Google has now proven the real owner. Keeping the password
// would let whoever set it share the owner's account.
async function findOrCreateGoogleAccount(payload) {
  const googleSub = payload.sub;
  const email = normaliseEmail(payload.email);

  const bySub = await PlayerAccountsCollection.findOneAsync({ googleSub });
  if (bySub) return bySub;

  const byEmail = await PlayerAccountsCollection.findOneAsync({ email });
  if (byEmail) {
    if (byEmail.googleSub) {
      throw new Meteor.Error('account-linked', 'This email is already linked to a different Google account.');
    }
    await PlayerAccountsCollection.updateAsync(byEmail._id, {
      $set: { googleSub, sessions: [], updatedAt: new Date() },
      $unset: { passwordSalt: '', passwordHash: '' },
    });
    const { passwordSalt, passwordHash, ...linked } = byEmail;
    return { ...linked, googleSub, sessions: [] };
  }

  // A clash with an existing display name takes the next free variant ("Alice G 2");
  // the player can rename themselves afterwards.
  const base = googleDisplayName(payload, email);
  for (let tries = 0; tries < 5; tries += 1) {
    const displayName = await firstFreeDisplayName(base);
    const account = {
      displayName,
      displayNameKey: displayNameKey(displayName),
      email,
      googleSub,
      gamesPlayed: 0,
      wins: 0,
      bestRound: 0,
      sessions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    try {
      account._id = await PlayerAccountsCollection.insertAsync(account);
      return account;
    } catch (error) {
      // Someone took the same name between the check and the insert: try the next one.
      if (isDuplicateKey(error, 'displayNameKey')) continue;
      // Two first-time sign-ins racing: the unique email index lets one insert win.
      if (error?.code !== 11000) throw error;
      const winner = await PlayerAccountsCollection.findOneAsync({ email });
      if (!winner) throw error;
      return winner;
    }
  }
  throw nameTakenError();
}

async function findAccountBySession(token) {
  if (typeof token !== 'string' || !token) return null;
  return PlayerAccountsCollection.findOneAsync({
    sessions: { $elemMatch: { hash: hashSessionToken(token), expiresAt: { $gt: new Date() } } },
  });
}

if (Meteor.isServer && !global._playerAccountsServerInitialized) {
  global._playerAccountsServerInitialized = true;
  Meteor.methods({
    async 'playerAccounts.register'(account) {
      const displayName = normaliseDisplayName(account?.displayName);
      const email = normaliseEmail(account?.email);
      const password = String(account?.password || '');

      if (!displayName) {
        throw new Meteor.Error('invalid-name', 'Please enter a display name.');
      }

      if (!validateEmail(email)) {
        throw new Meteor.Error('invalid-email', 'Please enter a valid email address.');
      }

      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Meteor.Error('weak-password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      }

      const existingAccount = await PlayerAccountsCollection.findOneAsync({ email });
      if (existingAccount) {
        throw new Meteor.Error('account-exists', 'An account with this email already exists.');
      }

      if (await isDisplayNameTaken(displayName)) {
        throw nameTakenError();
      }

      const passwordSalt = randomBytes(16).toString('hex');

      let accountId;
      try {
        accountId = await PlayerAccountsCollection.insertAsync({
          displayName,
          displayNameKey: displayNameKey(displayName),
          email,
          passwordSalt,
          passwordHash: hashPassword(password, passwordSalt),
          gamesPlayed: 0,
          wins: 0,
          bestRound: 0,
          sessions: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (error) {
        // The checks above lost a race; the unique indexes decide.
        if (isDuplicateKey(error, 'displayNameKey')) throw nameTakenError();
        if (isDuplicateKey(error, 'email')) {
          throw new Meteor.Error('account-exists', 'An account with this email already exists.');
        }
        throw error;
      }

      return issueSession({ _id: accountId, displayName, email });
    },

    async 'playerAccounts.signIn'(credentials) {
      const email = normaliseEmail(credentials?.email);
      const password = String(credentials?.password || '');

      if (!validateEmail(email)) {
        throw new Meteor.Error('invalid-email', 'Please enter a valid email address.');
      }

      if (!password) {
        throw new Meteor.Error('missing-password', 'Please enter your password.');
      }

      const account = await PlayerAccountsCollection.findOneAsync({ email });
      if (!account) {
        throw new Meteor.Error('not-found', 'No account found with this email.');
      }

      if (!account.passwordHash) {
        throw new Meteor.Error('use-google', 'This account signs in with Google. Use the Google button instead.');
      }

      const attemptedHash = hashPassword(password, account.passwordSalt);
      if (attemptedHash !== account.passwordHash) {
        throw new Meteor.Error('wrong-password', 'Incorrect password.');
      }

      return issueSession(account);
    },

    // The public OAuth client ID for the browser, or null when Google sign-in is off.
    'playerAccounts.googleClientId'() {
      return googleClientId();
    },

    async 'playerAccounts.googleSignIn'(idToken) {
      const audience = googleClientId();
      if (!audience) {
        throw new Meteor.Error('google-disabled', 'Google sign-in is not available.');
      }
      if (typeof idToken !== 'string' || !idToken) {
        throw new Meteor.Error('invalid-google-token', 'Google sign-in failed. Please try again.');
      }

      let payload;
      try {
        payload = await verifyGoogleIdToken(idToken, audience);
      } catch (error) {
        console.warn(`[playerAccounts.googleSignIn] ID token rejected: ${error?.message}`);
        throw new Meteor.Error('invalid-google-token', 'Google sign-in failed. Please try again.');
      }

      if (!payload?.sub || !validateEmail(normaliseEmail(payload.email))) {
        throw new Meteor.Error('invalid-google-token', 'Google sign-in failed. Please try again.');
      }
      // Linking by email is only safe when Google has verified the address.
      if (payload.email_verified !== true) {
        throw new Meteor.Error('unverified-email', 'Your Google account email is not verified.');
      }

      return issueSession(await findOrCreateGoogleAccount(payload));
    },

    async 'playerAccounts.resume'(token) {
      const account = await findAccountBySession(token);
      if (!account) {
        throw new Meteor.Error('invalid-session', 'Your session has expired. Please sign in again.');
      }
      return publicAccount(account);
    },

    // Renames the signed-in account. The account comes from the session token, never
    // from a client-supplied id, so a player can only rename themselves.
    async 'playerAccounts.updateDisplayName'(token, name) {
      const account = await findAccountBySession(token);
      if (!account) {
        throw new Meteor.Error('invalid-session', 'Your session has expired. Please sign in again.');
      }

      const displayName = normaliseDisplayName(name);
      if (!displayName) {
        throw new Meteor.Error('invalid-name', 'Please enter a display name.');
      }
      if (displayName === account.displayName) return publicAccount(account);

      if (await isDisplayNameTaken(displayName, account._id)) {
        throw nameTakenError();
      }

      try {
        await PlayerAccountsCollection.updateAsync(account._id, {
          $set: { displayName, displayNameKey: displayNameKey(displayName), updatedAt: new Date() },
        });
      } catch (error) {
        if (isDuplicateKey(error, 'displayNameKey')) throw nameTakenError();
        throw error;
      }
      await syncLeaderboardName(account._id, displayName);

      return publicAccount({ ...account, displayName });
    },

    async 'playerAccounts.signOut'(token) {
      if (typeof token !== 'string' || !token) return;
      await PlayerAccountsCollection.updateAsync(
        { 'sessions.hash': hashSessionToken(token) },
        { $pull: { sessions: { hash: hashSessionToken(token) } } }
      );
    },
  });
}
