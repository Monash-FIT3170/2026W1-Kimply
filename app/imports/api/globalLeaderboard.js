import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { PlayerAccountsCollection } from './playerAccounts';

if (!global._GlobalLeaderboardCollection) {
  global._GlobalLeaderboardCollection = new Mongo.Collection('globalLeaderboard');
}
export const GlobalLeaderboardCollection = global._GlobalLeaderboardCollection;

if (Meteor.isServer && !global._globalLeaderboardIndexesInitialized) {
  global._globalLeaderboardIndexesInitialized = true;
  Meteor.startup(async () => {
    const raw = GlobalLeaderboardCollection.rawCollection();
    await raw.createIndex({ accountId: 1 }, { unique: true });
    await raw.createIndex({ bestRound: -1, wins: -1, achievedAt: 1 });
  });
}

if (Meteor.isServer && !global._globalLeaderboardMethodsInitialized) {
  global._globalLeaderboardMethodsInitialized = true;
  Meteor.methods({
    async 'globalLeaderboard.myStanding'(accountId) {
      if (typeof accountId !== 'string' || !accountId.trim()) {
        throw new Meteor.Error('invalid', 'Invalid account id');
      }

      const account = await PlayerAccountsCollection.findOneAsync(accountId.trim());
      if (!account || !account.gamesPlayed) return null;

      return {
        displayName: account.displayName,
        bestRound: account.bestRound,
        gamesPlayed: account.gamesPlayed,
        wins: account.wins,
      };
    },
  });
}
