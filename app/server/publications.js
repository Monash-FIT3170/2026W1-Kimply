import { Meteor } from 'meteor/meteor';
import { RoundsCollection } from '../imports/api/rounds.js';
import { PlayersCollection } from '../imports/api/players.js';
import { LeaderboardCollection } from '../imports/api/leaderboard.js';
import { GameEventsCollection } from '../imports/api/gameEvents.js';
import { GlobalLeaderboardCollection } from '../imports/api/globalLeaderboard.js';
import { FEED_EVENT_LIMIT } from '../imports/constants.js';

// attemptedSequence holds a submitted answer and secret holds a player's sequence,
// draft and hand. Neither may reach other players.
const PRIVATE_PLAYER_FIELDS = { attemptedSequence: 0, secret: 0, guard: 0, reconnectTokenHash: 0 };

// Also imported by tests. Plain `meteor test` never loads server/main.js.
if (Meteor.isServer && !global._publicationsInitialized) {
  global._publicationsInitialized = true;

  Meteor.publish('rounds', function (gameId) {
    if (typeof gameId !== 'string' || !gameId) return this.ready();
    // Sequences never leave the server through here. Each player gets their own copy
    // in players.secret.sequence, so nobody can read another level's answer.
    return RoundsCollection.find({ gameId, advanced: false }, { fields: { sequence: 0 } });
  });

  Meteor.publish('players', function (gameId) {
    if (typeof gameId !== 'string' || !gameId) return this.ready();
    return PlayersCollection.find({ gameId }, { fields: PRIVATE_PLAYER_FIELDS });
  });

  // The caller's own hidden state: their sequence, draft and hand. Keyed on the
  // connection rather than an argument, and reactive, so a reconnect that rebinds the
  // player (players.rebind) moves it to the new connection.
  Meteor.publish('players.secret', function (gameId) {
    if (typeof gameId !== 'string' || !gameId || !this.connection) return this.ready();
    return PlayersCollection.find({ gameId, connectionId: this.connection.id }, { fields: { secret: 1 } });
  });

  Meteor.publish('leaderboard', function (gameId) {
    if (typeof gameId !== 'string' || !gameId) return this.ready();
    return LeaderboardCollection.find({ gameId });
  });

  Meteor.publish('eliminations', function (gameId) {
    if (typeof gameId !== 'string' || !gameId.trim()) return this.ready();
    return PlayersCollection.find(
      { gameId: gameId.trim(), eliminated: true },
      { sort: { eliminatedAt: -1 }, limit: 20, fields: PRIVATE_PLAYER_FIELDS }
    );
  });

  // Every ability event in a game, for the persistent live feed. Results only: picks
  // that have not resolved yet stay in players.secret.
  Meteor.publish('gameFeed', function (gameId) {
    if (typeof gameId !== 'string' || !gameId.trim()) return this.ready();
    return GameEventsCollection.find(
      { gameId: gameId.trim(), type: 'ability' },
      { sort: { createdAt: -1 }, limit: FEED_EVENT_LIMIT }
    );
  });

  Meteor.publish('globalLeaderboard', function () {
    return GlobalLeaderboardCollection.find({}, { sort: { bestRound: -1, wins: -1, achievedAt: 1 }, limit: 50 });
  });
}
