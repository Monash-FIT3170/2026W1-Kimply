import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import { RoundsCollection } from '../imports/api/rounds';
import { PlayersCollection } from '../imports/api/players';
import { LeaderboardCollection } from '../imports/api/leaderboard';
import '../server/publications.js';

const READY = Symbol('ready');

function runPublication(name, ...args) {
  const handler = Meteor.server.publish_handlers[name];
  assert.ok(handler, `publication "${name}" is not registered`);
  return handler.call({ ready: () => READY, userId: null }, ...args);
}

async function fetchPublication(name, ...args) {
  const result = runPublication(name, ...args);
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

      it('never publishes attemptedSequence, which holds the correct answer', async function () {
        await insertPlayer(OURS, 'Player 1');

        const docs = await fetchPublication('players', OURS);

        assert.strictEqual(docs.length, 1);
        assert.ok(!('attemptedSequence' in docs[0]), 'attemptedSequence must be excluded from the publication');
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
  });
}
