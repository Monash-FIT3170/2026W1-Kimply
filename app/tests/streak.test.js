import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import '../imports/api/gameMethods.js';
import { PlayersCollection } from '../imports/api/players.js';
import { RoundsCollection } from '../imports/api/rounds.js';
import { RoomsCollection } from '../imports/api/rooms.js';
import { STREAK_BONUS_LIFE_THRESHOLD, DEFAULT_STARTING_LIVES, GAME_MODE_PRESETS } from '../imports/constants.js';

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

    describe('streak life reward', function () {
      afterEach(async function () {
        await RoomsCollection.removeAsync({});
      });

      it('awards a life when the streak reaches STREAK_BONUS_LIFE_THRESHOLD and lives are below the starting count', async function () {
        await PlayersCollection.updateAsync(playerId, {
          $set: { lives: 1, currentStreak: STREAK_BONUS_LIFE_THRESHOLD - 1 },
        });
        const result = await Meteor.callAsync('players.submitSequence', playerId, correctSequence);
        const player = await PlayersCollection.findOneAsync(playerId);
        assert.strictEqual(player.lives, 2);
        assert.strictEqual(result.lifeAward.streak, true);
        assert.strictEqual(result.lifeAward.lives, 2);
      });

      it('does not award a life between multiples of the streak length', async function () {
        await PlayersCollection.updateAsync(playerId, {
          $set: { lives: 1, currentStreak: STREAK_BONUS_LIFE_THRESHOLD },
        });
        const result = await Meteor.callAsync('players.submitSequence', playerId, correctSequence);
        const player = await PlayersCollection.findOneAsync(playerId);
        assert.strictEqual(player.lives, 1);
        assert.strictEqual(result.lifeAward, null);
      });

      it('never exceeds the starting life count', async function () {
        await PlayersCollection.updateAsync(playerId, { $set: { currentStreak: STREAK_BONUS_LIFE_THRESHOLD - 1 } });
        const result = await Meteor.callAsync('players.submitSequence', playerId, correctSequence);
        const player = await PlayersCollection.findOneAsync(playerId);
        assert.strictEqual(player.lives, DEFAULT_STARTING_LIVES);
        assert.strictEqual(result.lifeAward, null);
      });

      it("tops up to the room's chosen starting lives rather than the default", async function () {
        await RoomsCollection.insertAsync({ pin: 'streak-test', customSettings: { startingLives: 5 } });
        await PlayersCollection.updateAsync(playerId, {
          $set: { lives: 4, currentStreak: STREAK_BONUS_LIFE_THRESHOLD - 1 },
        });
        const result = await Meteor.callAsync('players.submitSequence', playerId, correctSequence);
        const player = await PlayersCollection.findOneAsync(playerId);
        assert.strictEqual(player.lives, 5);
        assert.strictEqual(result.lifeAward.lives, 5);
      });

      it("does not go above the room's chosen starting lives", async function () {
        await RoomsCollection.insertAsync({ pin: 'streak-test', customSettings: { startingLives: 5 } });
        await PlayersCollection.updateAsync(playerId, {
          $set: { lives: 5, currentStreak: STREAK_BONUS_LIFE_THRESHOLD - 1 },
        });
        const result = await Meteor.callAsync('players.submitSequence', playerId, correctSequence);
        const player = await PlayersCollection.findOneAsync(playerId);
        assert.strictEqual(player.lives, 5);
        assert.strictEqual(result.lifeAward, null);
      });

      it('starts battle royale players on one life and lets a streak go above it', async function () {
        await RoomsCollection.insertAsync({
          pin: 'streak-test',
          gameMode: 'battle_royale',
          customSettings: { ...GAME_MODE_PRESETS.battle_royale },
        });
        const royaleId = await Meteor.callAsync('players.join', roundId, 'Royale Player', 'streak-test', null, true);
        assert.strictEqual((await PlayersCollection.findOneAsync(royaleId)).lives, 1);

        await PlayersCollection.updateAsync(royaleId, { $set: { currentStreak: STREAK_BONUS_LIFE_THRESHOLD - 1 } });
        const result = await Meteor.callAsync('players.submitSequence', royaleId, correctSequence);
        const player = await PlayersCollection.findOneAsync(royaleId);
        assert.strictEqual(player.lives, 2);
        assert.strictEqual(result.lifeAward.streak, true);
        assert.strictEqual(result.lifeAward.lives, 2);
      });
    });
  });
}
