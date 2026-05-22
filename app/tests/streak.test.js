import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import '../imports/api/gameMethods.js';
import { PlayersCollection } from '../imports/api/players.js';
import { RoundsCollection } from '../imports/api/rounds.js';

if (Meteor.isServer) {
  describe('Player streak tracking', function () {
    let roundId;
    let playerId;

    const correctSequence = ['red', 'blue', 'green', 'yellow'];
    const wrongSequence = ['blue', 'blue', 'blue', 'blue'];

    beforeEach(async function () {
      await PlayersCollection.removeAsync({});
      await RoundsCollection.removeAsync({});

      roundId = await RoundsCollection.insertAsync({
        gameId: 'streak-test',
        lengthOfSequence: 4,
        sequence: correctSequence,
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      playerId = await Meteor.callAsync('players.join', roundId, 'Streak Player', 'streak-test');
    });

    it('starts new players with zero current and longest streak', async function () {
      const player = await PlayersCollection.findOneAsync(playerId);

      assert.strictEqual(player.currentStreak, 0);
      assert.strictEqual(player.longestStreak, 0);
    });

    it('increments current and longest streak after a correct guess', async function () {
      await Meteor.callAsync('players.submitSequence', playerId, correctSequence);

      const player = await PlayersCollection.findOneAsync(playerId);
      assert.strictEqual(player.currentStreak, 1);
      assert.strictEqual(player.longestStreak, 1);
    });

    it('resets current streak after a wrong guess but keeps the longest streak', async function () {
      await PlayersCollection.updateAsync(playerId, {
        $set: {
          currentStreak: 3,
          longestStreak: 3,
        },
      });

      await Meteor.callAsync('players.submitSequence', playerId, wrongSequence);

      const player = await PlayersCollection.findOneAsync(playerId);
      assert.strictEqual(player.currentStreak, 0);
      assert.strictEqual(player.longestStreak, 3);
    });

    it('updates longest streak when the new current streak beats the previous best', async function () {
      await PlayersCollection.updateAsync(playerId, {
        $set: {
          currentStreak: 3,
          longestStreak: 3,
        },
      });

      await Meteor.callAsync('players.submitSequence', playerId, correctSequence);

      const player = await PlayersCollection.findOneAsync(playerId);
      assert.strictEqual(player.currentStreak, 4);
      assert.strictEqual(player.longestStreak, 4);
    });
  });
}
