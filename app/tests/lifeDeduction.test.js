import assert from 'assert';
import '../imports/api/gameMethods.js';
import { PlayersCollection } from '../imports/api/players.js';
import { RoundsCollection } from '../imports/api/rounds.js';
import { GAME_MODES } from '../imports/api/gameModes.js';

describe('Life Deduction', () => {
  let playerId;
  let roundId;

  beforeEach(async () => {
    await PlayersCollection.removeAsync({});
    await RoundsCollection.removeAsync({});

    roundId = await RoundsCollection.insertAsync({
      lengthOfSequence: 4,
      sequence: ['red', 'blue', 'green', 'yellow'],
      createdAt: new Date(),
      advanced: false,
      isCurrent: true,
    });

    playerId = await PlayersCollection.insertAsync({
      roundId,
      name: 'Test Player',
      lives: 3,
      attemptedSequence: [],
      currentStreak: 0,
      longestStreak: 0,
      eliminated: false,
      winner: false,
      completeRound: false,
    });
  });

  if (Meteor.isServer) {
    it('player starts with 3 lives', async () => {
      const player = await PlayersCollection.findOneAsync(playerId);
      assert.strictEqual(player.lives, 3);
    });

    it('players join with the lives configured on the round', async () => {
      const hardRoundId = await RoundsCollection.insertAsync({
        gameMode: GAME_MODES.HARD,
        lengthOfSequence: 5,
        lives: 1,
        sequence: ['red', 'blue', 'green', 'yellow', 'red'],
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      const suddenDeathPlayerId = await Meteor.callAsync(
        'players.join',
        hardRoundId,
        'Sudden Death Player',
        'hard-game'
      );
      const player = await PlayersCollection.findOneAsync(suddenDeathPlayerId);

      assert.strictEqual(player.lives, 1);
      assert.strictEqual(player.startingLives, 1);
      assert.strictEqual(player.gameMode, GAME_MODES.HARD);
    });

    it('incorrect guess is detected and returns success false', async () => {
      const wrongSequence = ['blue', 'blue', 'blue', 'blue'];
      const result = await Meteor.callAsync('players.submitSequence', playerId, wrongSequence);
      assert.strictEqual(result.success, false);
    });

    it('incorrect guess deducts one life', async () => {
      const wrongSequence = ['blue', 'blue', 'blue', 'blue'];
      await Meteor.callAsync('players.submitSequence', playerId, wrongSequence);
      const player = await PlayersCollection.findOneAsync(playerId);
      assert.strictEqual(player.lives, 2);
    });

    it('correct guess does not deduct a life', async () => {
      const correctSequence = ['red', 'blue', 'green', 'yellow'];
      await Meteor.callAsync('players.submitSequence', playerId, correctSequence);
      const player = await PlayersCollection.findOneAsync(playerId);
      assert.strictEqual(player.lives, 3);
    });

    it('correct guess increases current and longest streak', async () => {
      const correctSequence = ['red', 'blue', 'green', 'yellow'];
      await Meteor.callAsync('players.submitSequence', playerId, correctSequence);
      const player = await PlayersCollection.findOneAsync(playerId);
      assert.strictEqual(player.currentStreak, 1);
      assert.strictEqual(player.longestStreak, 1);
    });

    it('incorrect guess resets current streak and keeps longest streak', async () => {
      await PlayersCollection.updateAsync(playerId, {
        $set: {
          currentStreak: 2,
          longestStreak: 2,
        },
      });

      const wrongSequence = ['blue', 'blue', 'blue', 'blue'];
      await Meteor.callAsync('players.submitSequence', playerId, wrongSequence);

      const player = await PlayersCollection.findOneAsync(playerId);
      assert.strictEqual(player.currentStreak, 0);
      assert.strictEqual(player.longestStreak, 2);
    });
  }
});
