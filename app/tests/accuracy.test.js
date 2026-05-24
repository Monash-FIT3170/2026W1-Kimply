import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import '../imports/api/gameMethods.js';
import { PlayersCollection } from '../imports/api/players.js';
import { RoundsCollection } from '../imports/api/rounds.js';

if (Meteor.isServer) {
  describe('Player accuracy tracking', function () {
    let roundId;
    let playerId;

    const correctSequence = ['red', 'blue', 'green', 'yellow'];
    const wrongSequence = ['blue', 'blue', 'blue', 'blue'];

    beforeEach(async function () {
      await PlayersCollection.removeAsync({});
      await RoundsCollection.removeAsync({});

      roundId = await RoundsCollection.insertAsync({
        gameId: 'accuracy-test',
        lengthOfSequence: 4,
        sequence: correctSequence,
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      playerId = await Meteor.callAsync('players.join', roundId, 'Accuracy Player', 'accuracy-test');
    });

    it('starts new players with zero total and correct guesses', async function () {
      const player = await PlayersCollection.findOneAsync(playerId);

      assert.strictEqual(player.totalGuesses, 0);
      assert.strictEqual(player.correctGuesses, 0);
    });

    it('counts a correct sequence as one total guess and one correct guess', async function () {
      await Meteor.callAsync('players.submitSequence', playerId, correctSequence);

      const player = await PlayersCollection.findOneAsync(playerId);
      assert.strictEqual(player.totalGuesses, 1);
      assert.strictEqual(player.correctGuesses, 1);
    });

    it('counts a wrong sequence as one total guess and no correct guesses', async function () {
      await Meteor.callAsync('players.submitSequence', playerId, wrongSequence);

      const player = await PlayersCollection.findOneAsync(playerId);
      assert.strictEqual(player.totalGuesses, 1);
      assert.strictEqual(player.correctGuesses, 0);
    });

    it('tracks mixed attempts across wrong and correct guesses', async function () {
      await Meteor.callAsync('players.submitSequence', playerId, wrongSequence);
      await Meteor.callAsync('players.submitSequence', playerId, wrongSequence);
      await Meteor.callAsync('players.submitSequence', playerId, correctSequence);

      const player = await PlayersCollection.findOneAsync(playerId);
      assert.strictEqual(player.totalGuesses, 3);
      assert.strictEqual(player.correctGuesses, 1);
    });
  });
}
