import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import { RoundsCollection } from '../imports/api/rounds';
import { PlayersCollection } from '../imports/api/players';
import { LeaderboardCollection } from '../imports/api/leaderboard';
import { GameEventsCollection } from '../imports/api/gameEvents';
import { RoomsCollection } from '../imports/api/rooms';
import '../server/publications.js';

const READY = Symbol('ready');

function runPublication(name, ...args) {
  return runPublicationAs(null, name, ...args);
}

// connectionId stands in for the DDP connection that subscribed.
function runPublicationAs(connectionId, name, ...args) {
  const handler = Meteor.server.publish_handlers[name];
  assert.ok(handler, `publication "${name}" is not registered`);
  const connection = connectionId ? { id: connectionId } : null;
  return handler.call({ ready: () => READY, userId: null, connection }, ...args);
}

async function fetchPublication(name, ...args) {
  return fetchPublicationAs(null, name, ...args);
}

async function fetchPublicationAs(connectionId, name, ...args) {
  const result = runPublicationAs(connectionId, name, ...args);
  assert.notStrictEqual(result, READY, `publication "${name}" unexpectedly returned ready()`);
  return result.fetchAsync();
}

if (Meteor.isServer) {
  describe('publications are scoped to a single game', function () {
    const OURS = 'AAA11';
    const THEIRS = 'BBB22';

    beforeEach(async function () {
      await RoundsCollection.removeAsync({});
      await PlayersCollection.removeAsync({});
      await LeaderboardCollection.removeAsync({});
      await GameEventsCollection.removeAsync({});
    });

    describe('rounds', function () {
      it('returns only the current round for the requested game', async function () {
        await RoundsCollection.insertAsync({
          gameId: OURS,
          lengthOfSequence: 4,
          sequence: ['red', 'blue', 'green', 'yellow'],
          createdAt: new Date(),
          advanced: false,
          isCurrent: true,
        });

        const docs = await fetchPublication('rounds', OURS);

        assert.strictEqual(docs.length, 1);
        assert.strictEqual(docs[0].gameId, OURS);
      });

      it('does not publish rounds from another game', async function () {
        await RoundsCollection.insertAsync({
          gameId: THEIRS,
          lengthOfSequence: 4,
          sequence: ['red', 'blue', 'green', 'yellow'],
          createdAt: new Date(),
          advanced: false,
          isCurrent: true,
        });

        const docs = await fetchPublication('rounds', OURS);

        assert.strictEqual(docs.length, 0);
      });

      it('never publishes a sequence, so no player can read another level ahead', async function () {
        await RoundsCollection.insertAsync({
          gameId: OURS,
          level: 9,
          lengthOfSequence: 9,
          sequence: ['red', 'red', 'red', 'red', 'red', 'red', 'red', 'red', 'red'],
          createdAt: new Date(),
          advanced: false,
          isCurrent: false,
        });

        const docs = await fetchPublication('rounds', OURS);

        assert.strictEqual(docs.length, 1);
        assert.ok(!('sequence' in docs[0]), 'sequence must be excluded from the publication');
        assert.strictEqual(docs[0].lengthOfSequence, 9);
      });

      it('does not publish past rounds, so their sequences stay hidden', async function () {
        await RoundsCollection.insertAsync({
          gameId: OURS,
          lengthOfSequence: 4,
          sequence: ['red', 'red', 'red', 'red'],
          createdAt: new Date(),
          advanced: true,
          isCurrent: false,
        });

        const docs = await fetchPublication('rounds', OURS);

        assert.strictEqual(docs.length, 0);
      });

      it('publishes nothing when gameId is missing or not a string', function () {
        assert.strictEqual(runPublication('rounds'), READY);
        assert.strictEqual(runPublication('rounds', ''), READY);
        assert.strictEqual(runPublication('rounds', 42), READY);
        assert.strictEqual(runPublication('rounds', { gameId: OURS }), READY);
      });
    });

    describe('players', function () {
      async function insertPlayer(gameId, name) {
        return PlayersCollection.insertAsync({
          gameId,
          roundId: 'round-1',
          name,
          lives: 3,
          attemptedSequence: ['red', 'blue', 'green', 'yellow'],
          currentStreak: 0,
          longestStreak: 0,
          totalGuesses: 0,
          correctGuesses: 0,
          eliminatedRound: null,
          eliminated: false,
          winner: false,
          completeRound: false,
          gameFinished: false,
        });
      }

      it('never publishes secret, which holds each player sequence, draft and hand', async function () {
        const id = await insertPlayer(OURS, 'Player 1');
        await PlayersCollection.updateAsync(id, {
          $set: { secret: { sequence: { roundId: 'round-1', colours: ['red'], version: 1 }, hand: [] } },
        });

        const [doc] = await fetchPublication('players', OURS);

        assert.ok(!('secret' in doc), 'secret must be excluded from the publication');
      });

      it('never publishes attemptedSequence, which holds the correct answer', async function () {
        await insertPlayer(OURS, 'Player 1');

        const docs = await fetchPublication('players', OURS);

        assert.strictEqual(docs.length, 1);
        assert.ok(!('attemptedSequence' in docs[0]), 'attemptedSequence must be excluded from the publication');
      });

      it('never publishes guard, which holds strikes, attempts and the browser session', async function () {
        const id = await insertPlayer(OURS, 'Player 1');
        await PlayersCollection.updateAsync(id, {
          $set: { guard: { browserSessionId: 'session-1', botStrikes: 2, attempt: { id: 'attempt-1' } } },
        });

        const [doc] = await fetchPublication('players', OURS);

        assert.ok(!('guard' in doc));
      });

      it('still publishes the fields the UI needs', async function () {
        await insertPlayer(OURS, 'Player 1');

        const [doc] = await fetchPublication('players', OURS);

        assert.strictEqual(doc.name, 'Player 1');
        assert.strictEqual(doc.lives, 3);
        assert.strictEqual(doc.winner, false);
      });

      it('does not publish players from another game', async function () {
        await insertPlayer(OURS, 'Ours');
        await insertPlayer(THEIRS, 'Theirs');

        const docs = await fetchPublication('players', OURS);

        assert.strictEqual(docs.length, 1);
        assert.strictEqual(docs[0].name, 'Ours');
      });

      it('publishes nothing when gameId is missing or not a string', function () {
        assert.strictEqual(runPublication('players'), READY);
        assert.strictEqual(runPublication('players', ''), READY);
        assert.strictEqual(runPublication('players', 42), READY);
      });
    });

    describe('leaderboard', function () {
      async function insertEntry(gameId, name) {
        return LeaderboardCollection.insertAsync({
          gameId,
          playerId: `player-${name}`,
          name,
          lives: 3,
          roundId: 'round-1',
          completedAt: new Date(),
        });
      }

      it('does not publish leaderboard entries from another game', async function () {
        await insertEntry(OURS, 'Ours');
        await insertEntry(THEIRS, 'Theirs');

        const docs = await fetchPublication('leaderboard', OURS);

        assert.strictEqual(docs.length, 1);
        assert.strictEqual(docs[0].name, 'Ours');
      });

      it('publishes nothing when gameId is missing or not a string', function () {
        assert.strictEqual(runPublication('leaderboard'), READY);
        assert.strictEqual(runPublication('leaderboard', ''), READY);
        assert.strictEqual(runPublication('leaderboard', 42), READY);
      });
    });

    describe('players.secret', function () {
      async function insertBoundPlayer(gameId, name, connectionId) {
        return PlayersCollection.insertAsync({
          gameId,
          roundId: 'round-1',
          name,
          lives: 3,
          eliminated: false,
          connectionId,
          secret: { sequence: { roundId: 'round-1', colours: ['red', 'blue'], version: 1 }, hand: [] },
        });
      }

      it("publishes only the subscribing connection's own secret", async function () {
        const mine = await insertBoundPlayer(OURS, 'Mine', 'conn-mine');
        await insertBoundPlayer(OURS, 'Theirs', 'conn-theirs');

        const docs = await fetchPublicationAs('conn-mine', 'players.secret', OURS);

        assert.strictEqual(docs.length, 1);
        assert.strictEqual(docs[0]._id, mine);
        assert.deepStrictEqual(docs[0].secret.sequence.colours, ['red', 'blue']);
        assert.ok(!('name' in docs[0]), 'only the secret field is published here');
      });

      it('publishes nothing without a connection or a valid gameId', function () {
        assert.strictEqual(runPublication('players.secret', OURS), READY);
        assert.strictEqual(runPublicationAs('conn-mine', 'players.secret'), READY);
        assert.strictEqual(runPublicationAs('conn-mine', 'players.secret', 42), READY);
      });
    });

    describe('eliminations', function () {
      it('never publishes secret or attemptedSequence', async function () {
        await PlayersCollection.insertAsync({
          gameId: OURS,
          name: 'Out',
          eliminated: true,
          eliminatedAt: new Date(),
          attemptedSequence: ['red'],
          secret: { sequence: { roundId: 'r', colours: ['red'], version: 1 } },
          guard: { botStrikes: 1 },
        });

        const [doc] = await fetchPublication('eliminations', OURS);

        assert.ok(!('secret' in doc));
        assert.ok(!('attemptedSequence' in doc));
        assert.ok(!('guard' in doc));
      });
    });

    describe('gameFeed', function () {
      async function insertEvent(playerId, targetId = null) {
        return GameEventsCollection.insertAsync({
          gameId: OURS,
          type: 'ability',
          playerId,
          targetId,
          createdAt: new Date(),
        });
      }

      it('gameFeed publishes every ability event in the game and nothing else', async function () {
        for (let i = 0; i < 25; i++) await insertEvent(`p${i}`);
        await GameEventsCollection.insertAsync({
          gameId: OURS,
          type: 'level-up',
          playerId: 'p1',
          createdAt: new Date(),
        });
        await GameEventsCollection.insertAsync({
          gameId: THEIRS,
          type: 'ability',
          playerId: 'p1',
          createdAt: new Date(),
        });

        const docs = await fetchPublication('gameFeed', OURS);

        assert.strictEqual(docs.length, 25, 'all of them, not a newest-N window');
        assert.ok(docs.every((d) => d.type === 'ability' && d.gameId === OURS));
      });

      it('publishes nothing when gameId is missing or not a string', function () {
        assert.strictEqual(runPublication('gameFeed'), READY);
        assert.strictEqual(runPublication('gameFeed', ''), READY);
        assert.strictEqual(runPublication('gameFeed', 42), READY);
      });
    });

    describe('rooms.lobby', function () {
      it('does not publish security blocks or a player browser session', async function () {
        await RoomsCollection.removeAsync({ pin: OURS });
        await RoomsCollection.insertAsync({
          pin: OURS,
          status: 'lobby',
          gameName: 'Game',
          hostName: 'Host',
          createdAt: new Date(),
          security: { blockedSessionIds: ['session-1'], ipBans: [{ address: '203.0.113.5' }] },
          players: [{ id: 'p1', name: 'Host', connected: true, browserSessionId: 'session-1' }],
        });

        const [doc] = await fetchPublication('rooms.lobby', OURS);

        assert.ok(!('security' in doc));
        assert.strictEqual(doc.players[0].name, 'Host');
        assert.ok(!('browserSessionId' in doc.players[0]));
        await RoomsCollection.removeAsync({ pin: OURS });
      });
    });
  });
}
