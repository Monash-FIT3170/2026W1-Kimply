import assert from 'assert';
import '../imports/api/gameMethods.js';
import { PlayersCollection } from '../imports/api/players.js';
import { RoundsCollection } from '../imports/api/rounds.js';
import { RoomsCollection } from '../imports/api/rooms.js';

describe('Life Deduction', () => {
  let playerId;
  let roundId;

  beforeEach(async () => {
    await PlayersCollection.removeAsync({});
    await RoundsCollection.removeAsync({});
    await RoomsCollection.removeAsync({});

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

    it('battle royale players start with exactly 1 life', async () => {
      const roomPin = 'BR123';
      await RoomsCollection.removeAsync({ pin: roomPin });
      await RoomsCollection.insertAsync({
        pin: roomPin,
        gameMode: 'battle_royale',
        customSettings: {
          startingLives: 3,
          startingSequenceLength: 4,
          flashingSpeed: 'medium',
        },
      });

      const battleRoundId = await RoundsCollection.insertAsync({
        gameId: roomPin,
        lengthOfSequence: 4,
        sequence: ['red', 'blue', 'green', 'yellow'],
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      const battlePlayerId = await Meteor.callAsync('players.join', battleRoundId, 'Battle Royale Player', roomPin, null, true);
      const player = await PlayersCollection.findOneAsync(battlePlayerId);

      assert.strictEqual(player.lives, 1);
    });

    it('battle royale players are eliminated after one wrong answer', async () => {
      const roomPin = 'BR124';
      await RoomsCollection.removeAsync({ pin: roomPin });
      await RoomsCollection.insertAsync({
        pin: roomPin,
        gameMode: 'battle_royale',
        customSettings: {
          startingLives: 3,
          startingSequenceLength: 4,
          flashingSpeed: 'medium',
        },
      });

      const battleRoundId = await RoundsCollection.insertAsync({
        gameId: roomPin,
        lengthOfSequence: 4,
        sequence: ['red', 'blue', 'green', 'yellow'],
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      const battlePlayerId = await Meteor.callAsync('players.join', battleRoundId, 'Battle Royale Player', roomPin, null, true);
      const wrongSequence = ['blue', 'blue', 'blue', 'blue'];
      const result = await Meteor.callAsync('players.submitSequence', battlePlayerId, wrongSequence);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.remainingLives, 0);

      const updatedPlayer = await PlayersCollection.findOneAsync(battlePlayerId);
      assert.strictEqual(updatedPlayer.lives, 0);
      assert.strictEqual(updatedPlayer.eliminated, true);
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
