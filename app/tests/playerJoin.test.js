import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import '../imports/api/gameMethods.js';
import { PlayersCollection } from '../imports/api/players.js';
import { RoundsCollection } from '../imports/api/rounds.js';

if (Meteor.isServer) {
  describe('players.join idempotency', function () {
    let roundId;

    beforeEach(async function () {
      await PlayersCollection.removeAsync({});
      await RoundsCollection.removeAsync({});
      roundId = await RoundsCollection.insertAsync({
        gameId: 'join-test',
        lengthOfSequence: 4,
        sequence: ['red', 'blue', 'green', 'yellow'],
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });
    });

    it('returns the same _id when the same (gameId, name) joins twice', async function () {
      const firstId = await Meteor.callAsync('players.join', roundId, 'Alice', 'join-test');
      const secondId = await Meteor.callAsync('players.join', roundId, 'Alice', 'join-test');
      assert.strictEqual(firstId, secondId);
    });

    it('does not create a duplicate player record on rejoin', async function () {
      await Meteor.callAsync('players.join', roundId, 'Alice', 'join-test');
      await Meteor.callAsync('players.join', roundId, 'Alice', 'join-test');
      const count = await PlayersCollection.find({ gameId: 'join-test', name: 'Alice' }).countAsync();
      assert.strictEqual(count, 1);
    });

    it('preserves lives, streak, and elimination state across rejoins', async function () {
      const playerId = await Meteor.callAsync('players.join', roundId, 'Alice', 'join-test');
      await PlayersCollection.updateAsync(playerId, {
        $set: {
          lives: 1,
          currentStreak: 4,
          longestStreak: 7,
          totalGuesses: 9,
          correctGuesses: 6,
          eliminated: false,
        },
      });

      const rejoinedId = await Meteor.callAsync('players.join', roundId, 'Alice', 'join-test');
      const player = await PlayersCollection.findOneAsync(rejoinedId);

      assert.strictEqual(player.lives, 1);
      assert.strictEqual(player.currentStreak, 4);
      assert.strictEqual(player.longestStreak, 7);
      assert.strictEqual(player.totalGuesses, 9);
      assert.strictEqual(player.correctGuesses, 6);
    });

    it('does not reset roundId when rejoining mid-game on a later round', async function () {
      const playerId = await Meteor.callAsync('players.join', roundId, 'Alice', 'join-test');

      const laterRoundId = await RoundsCollection.insertAsync({
        gameId: 'join-test',
        lengthOfSequence: 5,
        sequence: ['red', 'blue', 'green', 'yellow', 'red'],
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });
      await PlayersCollection.updateAsync(playerId, { $set: { roundId: laterRoundId } });

      await Meteor.callAsync('players.join', roundId, 'Alice', 'join-test');
      const player = await PlayersCollection.findOneAsync(playerId);
      assert.strictEqual(player.roundId, laterRoundId);
    });

    it('creates a new record when the name differs in the same game', async function () {
      const aliceId = await Meteor.callAsync('players.join', roundId, 'Alice', 'join-test');
      const bobId = await Meteor.callAsync('players.join', roundId, 'Bob', 'join-test');
      assert.notStrictEqual(aliceId, bobId);
      const count = await PlayersCollection.find({ gameId: 'join-test' }).countAsync();
      assert.strictEqual(count, 2);
    });

    it('creates a new record when the same name joins a different game', async function () {
      const firstId = await Meteor.callAsync('players.join', roundId, 'Alice', 'join-test');
      const secondId = await Meteor.callAsync('players.join', roundId, 'Alice', 'other-game');
      assert.notStrictEqual(firstId, secondId);
    });

    it('always inserts a new record when no gameId is provided (preserves legacy behavior)', async function () {
      const firstId = await Meteor.callAsync('players.join', roundId, 'Alice');
      const secondId = await Meteor.callAsync('players.join', roundId, 'Alice');
      assert.notStrictEqual(firstId, secondId);
    });
  });
}
