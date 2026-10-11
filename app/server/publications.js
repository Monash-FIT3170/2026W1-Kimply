import { Meteor } from 'meteor/meteor';
import { RoundsCollection } from '../imports/api/rounds.js';
import { PlayersCollection } from '../imports/api/players.js';
import { LeaderboardCollection } from '../imports/api/leaderboard.js';
import { GameEventsCollection } from '../imports/api/gameEvents.js';
import { GlobalLeaderboardCollection } from '../imports/api/globalLeaderboard.js';

// attemptedSequence holds a submitted answer and secret holds a player's sequence,
// draft and hand. Neither may reach other players.
const PRIVATE_PLAYER_FIELDS = { attemptedSequence: 0, secret: 0 };

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

  // scope 'me' keeps only the events a player is part of, so in a big game a burst of
  // other players' events can not push theirs out of the newest-20 window.
  Meteor.publish('gameEvents', function (gameId, scope = 'everyone', playerId = null) {
    if (typeof gameId !== 'string' || !gameId.trim()) return this.ready();
    const selector = { gameId: gameId.trim() };
    if (scope === 'me') {
      if (typeof playerId !== 'string' || !playerId) return this.ready();
      selector.$or = [{ playerId }, { targetId: playerId }];
    }
    return GameEventsCollection.find(selector, { sort: { createdAt: -1 }, limit: 20 });
  });

  Meteor.publish('globalLeaderboard', function () {
    return GlobalLeaderboardCollection.find({}, { sort: { bestRound: -1, wins: -1, achievedAt: 1 }, limit: 50 });
  });
}
