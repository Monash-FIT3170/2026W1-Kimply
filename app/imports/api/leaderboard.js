import { Mongo } from 'meteor/mongo';

// Guard against --full-app test mode evaluating this module twice
// (app bundle + test bundle both load it; global is shared across both).
if (!global._LeaderboardCollection) {
  global._LeaderboardCollection = new Mongo.Collection('leaderboard');
}
export const LeaderboardCollection = global._LeaderboardCollection;
