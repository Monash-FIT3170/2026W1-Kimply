import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { createHash, randomBytes } from 'crypto';

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

      if (password.length < 8) {
        throw new Meteor.Error('weak-password', 'Password must be at least 8 characters.');
      }

      const existingAccount = await PlayerAccountsCollection.findOneAsync({ email });
      if (existingAccount) {
        throw new Meteor.Error('account-exists', 'An account with this email already exists.');
      }

      const passwordSalt = randomBytes(16).toString('hex');

      await PlayerAccountsCollection.insertAsync({
        displayName,
        email,
        passwordSalt,
        passwordHash: hashPassword(password, passwordSalt),
        gamesPlayed: 0,
        wins: 0,
        bestRound: 0,
        createdAt: new Date(),
      });

      return { displayName, email };
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

      const attemptedHash = hashPassword(password, account.passwordSalt);
      if (attemptedHash !== account.passwordHash) {
        throw new Meteor.Error('wrong-password', 'Incorrect password.');
      }

      return {
        displayName: account.displayName,
        email: account.email,
      };
    },
  });
}
