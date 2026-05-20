import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import { RoundsCollection } from '../imports/api/rounds';
import { PlayersCollection } from '../imports/api/players';

if (Meteor.isServer) {
  describe('last one standing wins', function () {
    beforeEach(async function () {
      await RoundsCollection.removeAsync({});
      await PlayersCollection.removeAsync({});
    });

    it('sets winner when only one active player remains after elimination', async function () {
      const roundId = await RoundsCollection.insertAsync({
        lengthOfSequence: 4,
        sequence: ['red', 'blue', 'green', 'yellow'],
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      const player1Id = await PlayersCollection.insertAsync({
        roundId,
        name: 'Player 1',
        lives: 3,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      // Player 2 starts with 1 life so one wrong answer eliminates them
      const player2Id = await PlayersCollection.insertAsync({
        roundId,
        name: 'Player 2',
        lives: 1,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      // Player 2 submits wrong sequence — gets eliminated
      await Meteor.callAsync('players.submitSequence', player2Id, ['red', 'red', 'red', 'red']);

      const winner = await PlayersCollection.findOneAsync(player1Id);
      assert.strictEqual(winner.winner, true);
    });

    it('does not advance to next round when a winner exists', async function () {
      const roundId = await RoundsCollection.insertAsync({
        lengthOfSequence: 4,
        sequence: ['red', 'blue', 'green', 'yellow'],
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      const player1Id = await PlayersCollection.insertAsync({
        roundId,
        name: 'Player 1',
        lives: 3,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      const player2Id = await PlayersCollection.insertAsync({
        roundId,
        name: 'Player 2',
        lives: 1,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      // Eliminate player 2 — player 1 becomes winner
      await Meteor.callAsync('players.submitSequence', player2Id, ['red', 'red', 'red', 'red']);

      // Player 1 submits correct sequence
      await Meteor.callAsync('players.submitSequence', player1Id, ['red', 'blue', 'green', 'yellow']);

      // Should still only be 1 round (no advance)
      const roundCount = await RoundsCollection.find({}).countAsync();
      assert.equal(roundCount, 1);
    });

    it('does not declare winner if more than one active player remains', async function () {
      const roundId = await RoundsCollection.insertAsync({
        lengthOfSequence: 4,
        sequence: ['red', 'blue', 'green', 'yellow'],
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      const player1Id = await PlayersCollection.insertAsync({
        roundId,
        name: 'Player 1',
        lives: 3,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      await PlayersCollection.insertAsync({
        roundId,
        name: 'Player 2',
        lives: 3,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      // Player 1 submits wrong — loses one life, but player 2 still active
      await Meteor.callAsync('players.submitSequence', player1Id, ['red', 'red', 'red', 'red']);

      const player2 = await PlayersCollection.findOneAsync({ name: 'Player 2' });
      assert.strictEqual(player2.winner, false);
    });
  });
}
