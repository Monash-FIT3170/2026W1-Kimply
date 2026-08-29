import { Meteor } from 'meteor/meteor';
import { RoundsCollection } from '../imports/api/rounds.js';
import { PlayersCollection } from '../imports/api/players.js';
import { LeaderboardCollection } from '../imports/api/leaderboard.js';

// Publications live here rather than in server/main.js so that tests can import
// them directly. Plain `meteor test` does not load the app's server entry point,
// only `meteor test --full-app` does, so publications defined in main.js are
// unreachable from the default test run.
//
// The guard matches the pattern used across imports/api/*: under --full-app this
// module is evaluated by main.js and again by the test importing it, and Meteor
// throws on a duplicate publication name.
if (Meteor.isServer && !global._publicationsInitialized) {
  global._publicationsInitialized = true;

  // Publications are scoped to a single game. `gameId` is the 5-character room PIN.
  //
  // These used to be `.find()` over the whole collection with no projection, which
  // sent every room's data to every connected client. That leaked other rooms'
  // sequences and other players' answers, and produced O(N^2) DDP fan-out because
  // any write was pushed to every session rather than the handful in that room.
  //
  // Invalid input resolves to an empty subscription rather than throwing, matching
  // the existing `rooms.lobby` convention in imports/api/rooms.js.

  // Only the current round, so past rounds' sequences are never sent.
  Meteor.publish('rounds', function (gameId) {
    if (typeof gameId !== 'string' || !gameId) return this.ready();
    return RoundsCollection.find({ gameId, advanced: false });
  });

  // `attemptedSequence` is excluded: it holds the answer a player submitted, so
  // publishing it handed the correct sequence to everyone who had not played yet.
  Meteor.publish('players', function (gameId) {
    if (typeof gameId !== 'string' || !gameId) return this.ready();
    return PlayersCollection.find({ gameId }, { fields: { attemptedSequence: 0 } });
  });

  Meteor.publish('leaderboard', function (gameId) {
    if (typeof gameId !== 'string' || !gameId) return this.ready();
    return LeaderboardCollection.find({ gameId });
  });
}
