import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

export const PlayerAccountsCollection = new Mongo.Collection('playerAccounts');

function cleanText(value) {
  return String(value || '').trim();
}

function normaliseEmail(email) {
  return cleanText(email).toLowerCase();
}

if (Meteor.isServer) {
  Meteor.methods({
    async 'playerAccounts.register'(account) {
      const displayName = cleanText(account?.displayName);
      const email = normaliseEmail(account?.email);

      if (!displayName) {
        throw new Meteor.Error('invalid-name', 'Please enter a display name.');
      }

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Meteor.Error('invalid-email', 'Please enter a valid email address.');
      }

      const existingAccount = await PlayerAccountsCollection.findOneAsync({ email });

      if (existingAccount) {
        throw new Meteor.Error('account-exists', 'An account with this email already exists.');
      }

      await PlayerAccountsCollection.insertAsync({
        displayName,
        email,
        gamesPlayed: 0,
        wins: 0,
        bestRound: 0,
        createdAt: new Date(),
      });

      return { displayName, email };
    },

    async 'playerAccounts.signIn'(emailInput) {
      const email = normaliseEmail(emailInput);

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Meteor.Error('invalid-email', 'Please enter a valid email address.');
      }

      const account = await PlayerAccountsCollection.findOneAsync({ email });

      if (!account) {
        throw new Meteor.Error('not-found', 'No account found with this email.');
      }

      return {
        displayName: account.displayName,
        email: account.email,
      };
    },
  });
}
