import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { createHash, randomBytes } from 'crypto';
import { MIN_PASSWORD_LENGTH } from '../constants';
import { googleClientId, verifyGoogleIdToken } from './googleAuth';

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

const DISPLAY_NAME_MAX_LENGTH = 40;

function googleDisplayName(payload, email) {
  return cleanText(payload.name || email.split('@')[0]).slice(0, DISPLAY_NAME_MAX_LENGTH);
}

// Finds the account for a verified Google identity: by Google subject first, then by
// email (linking the Google identity to an existing email-and-password account),
// otherwise creates one with no password.
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
    await PlayerAccountsCollection.updateAsync(byEmail._id, { $set: { googleSub, updatedAt: new Date() } });
    return { ...byEmail, googleSub };
  }

  const account = {
    displayName: googleDisplayName(payload, email),
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
    // Two first-time sign-ins racing: the unique email index lets one insert win.
    if (error?.code !== 11000) throw error;
    const winner = await PlayerAccountsCollection.findOneAsync({ email });
    if (!winner) throw error;
    return winner;
  }
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
      const displayName = cleanText(account?.displayName);
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

      const passwordSalt = randomBytes(16).toString('hex');

      const accountId = await PlayerAccountsCollection.insertAsync({
        displayName,
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

    async 'playerAccounts.signOut'(token) {
      if (typeof token !== 'string' || !token) return;
      await PlayerAccountsCollection.updateAsync(
        { 'sessions.hash': hashSessionToken(token) },
        { $pull: { sessions: { hash: hashSessionToken(token) } } }
      );
    },
  });
}
