import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

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
