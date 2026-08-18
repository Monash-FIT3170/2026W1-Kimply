import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import { RoundsCollection } from '../imports/api/rounds';
import { PlayersCollection } from '../imports/api/players';

if (Meteor.isServer) {
  describe('rounds.advance', function () {
    beforeEach(async function () {
      await RoundsCollection.removeAsync({});
      await PlayersCollection.removeAsync({});
    });

    it('creates a new round with incremented sequence length', async function () {
      const roundId = await RoundsCollection.insertAsync({
        lengthOfSequence: 4,
        sequence: ['red', 'blue', 'green', 'yellow'],
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      const nextRoundId = await Meteor.callAsync('rounds.advance', roundId);

      const nextRound = await RoundsCollection.findOneAsync(nextRoundId);
      assert.equal(nextRound.lengthOfSequence, 5);
      assert.equal(nextRound.sequence.length, 5);
    });

    it('marks the current round as advanced and not current', async function () {
      const roundId = await RoundsCollection.insertAsync({
        lengthOfSequence: 4,
        sequence: ['red', 'blue', 'green', 'yellow'],
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      await Meteor.callAsync('rounds.advance', roundId);

      const oldRound = await RoundsCollection.findOneAsync(roundId);
      assert.strictEqual(oldRound.advanced, true);
      assert.strictEqual(oldRound.isCurrent, false);
    });

    it('moves active players to the new round', async function () {
      const roundId = await RoundsCollection.insertAsync({
        lengthOfSequence: 4,
        sequence: ['red', 'blue', 'green', 'yellow'],
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      await PlayersCollection.insertAsync({
        roundId,
        name: 'Player 1',
        lives: 3,
        eliminated: false,
        completeRound: true,
        attemptedSequence: ['red'],
        winner: false,
      });

      const nextRoundId = await Meteor.callAsync('rounds.advance', roundId);

      const player = await PlayersCollection.findOneAsync({ name: 'Player 1' });
      assert.equal(player.roundId, nextRoundId);
      assert.strictEqual(player.completeRound, false);
      assert.deepEqual(player.attemptedSequence, []);
    });

    it('does not move eliminated players to the new round', async function () {
      const roundId = await RoundsCollection.insertAsync({
        lengthOfSequence: 4,
        sequence: ['red', 'blue', 'green', 'yellow'],
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      await PlayersCollection.insertAsync({
        roundId,
        name: 'Eliminated Player',
        lives: 0,
        eliminated: true,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      const nextRoundId = await Meteor.callAsync('rounds.advance', roundId);

      const player = await PlayersCollection.findOneAsync({ name: 'Eliminated Player' });
      assert.equal(player.roundId, roundId); // still on old round
      assert.notEqual(player.roundId, nextRoundId);
    });

    it('does not advance if round already advanced', async function () {
      const roundId = await RoundsCollection.insertAsync({
        lengthOfSequence: 4,
        sequence: ['red', 'blue', 'green', 'yellow'],
        createdAt: new Date(),
        advanced: true, // already advanced
        isCurrent: false,
      });

      await Meteor.callAsync('rounds.advance', roundId);

      const roundCount = await RoundsCollection.find({}).countAsync();
      assert.equal(roundCount, 1); // no new round created
    });

    it('throws if round does not exist', async function () {
      try {
        await Meteor.callAsync('rounds.advance', 'nonexistent-id');
        assert.fail('Should have thrown');
      } catch (err) {
        assert.equal(err.error, 'round-not-found');
      }
    });
  });
}
