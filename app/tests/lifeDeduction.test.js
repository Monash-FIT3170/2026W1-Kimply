import assert from 'assert';
import '../imports/api/gameMethods.js';
import { PlayersCollection } from '../imports/api/players.js';
import { RoundsCollection } from '../imports/api/rounds.js';

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
  }
});
