import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { PlayerAccountsCollection } from './playerAccounts';

// Guard against --full-app test mode evaluating this module twice
// (app bundle + test bundle both load it; global is shared across both).
if (!global._GlobalLeaderboardCollection) {
  global._GlobalLeaderboardCollection = new Mongo.Collection('globalLeaderboard');
}
export const GlobalLeaderboardCollection = global._GlobalLeaderboardCollection;

// One doc per registered account, capped at the top 50 by bestRound (see
// recordGlobalResult in gameMethods.js, which upserts and trims this collection).
if (Meteor.isServer && !global._globalLeaderboardIndexesInitialized) {
  global._globalLeaderboardIndexesInitialized = true;
  Meteor.startup(async () => {
    const raw = GlobalLeaderboardCollection.rawCollection();
    await raw.createIndex({ accountId: 1 }, { unique: true });
    await raw.createIndex({ bestRound: -1, achievedAt: 1 });
  });
}

// Lets a signed-in player see their position even when it's outside the
// published top 50 — ranked against every account's bestRound, not just
// the trimmed globalLeaderboard collection.
if (Meteor.isServer && !global._globalLeaderboardMethodsInitialized) {
  global._globalLeaderboardMethodsInitialized = true;
  Meteor.methods({
    async 'globalLeaderboard.myStanding'(accountId) {
      if (typeof accountId !== 'string' || !accountId.trim()) {
        throw new Meteor.Error('invalid', 'Invalid account id');
      }

      const account = await PlayerAccountsCollection.findOneAsync(accountId.trim());
      if (!account || !account.gamesPlayed) return null;

      const better = await PlayerAccountsCollection.find({
        bestRound: { $gt: account.bestRound },
      }).countAsync();

      return {
        rank: better + 1,
        displayName: account.displayName,
        bestRound: account.bestRound,
        gamesPlayed: account.gamesPlayed,
        wins: account.wins,
      };
    },
  });
}
