import { Meteor } from 'meteor/meteor';
import { RoundsCollection } from '../imports/api/rounds.js';
import { PlayersCollection } from '../imports/api/players.js';
import { LeaderboardCollection } from '../imports/api/leaderboard.js';
import { GameEventsCollection } from '../imports/api/gameEvents.js';
import { GlobalLeaderboardCollection } from '../imports/api/globalLeaderboard.js';

// Also imported by tests. Plain `meteor test` never loads server/main.js.
if (Meteor.isServer && !global._publicationsInitialized) {
  global._publicationsInitialized = true;

  Meteor.publish('rounds', function (gameId) {
    if (typeof gameId !== 'string' || !gameId) return this.ready();
    return RoundsCollection.find({ gameId, isCurrent: true });
  });

  Meteor.publish('players', function (gameId) {
    if (typeof gameId !== 'string' || !gameId) return this.ready();
    return PlayersCollection.find({ gameId }, { fields: { attemptedSequence: 0 } });
  });

  Meteor.publish('leaderboard', function (gameId) {
    if (typeof gameId !== 'string' || !gameId) return this.ready();
    return LeaderboardCollection.find({ gameId });
  });

  Meteor.publish('eliminations', function (gameId) {
    if (typeof gameId !== 'string' || !gameId.trim()) return this.ready();
    return PlayersCollection.find(
      { gameId: gameId.trim(), eliminated: true },
      { sort: { eliminatedAt: -1 }, limit: 20, fields: { attemptedSequence: 0 } }
    );
  });

  Meteor.publish('gameEvents', function (gameId) {
    if (typeof gameId !== 'string' || !gameId.trim()) return this.ready();
    return GameEventsCollection.find({ gameId: gameId.trim() }, { sort: { createdAt: -1 }, limit: 20 });
  });

  Meteor.publish('globalLeaderboard', function () {
    return GlobalLeaderboardCollection.find(
      {},
      { sort: { bestRound: -1, wins: -1, achievedAt: 1 }, limit: 50 }
    );
  });
}
