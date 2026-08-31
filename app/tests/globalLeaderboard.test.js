import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import '../imports/api/gameMethods.js';
import { RoundsCollection } from '../imports/api/rounds.js';
import { PlayersCollection } from '../imports/api/players.js';
import { PlayerAccountsCollection } from '../imports/api/playerAccounts.js';
import { GlobalLeaderboardCollection } from '../imports/api/globalLeaderboard.js';

if (Meteor.isServer) {
  describe('global leaderboard', function () {
    let emailCounter = 0;

    async function registerAccount(displayName) {
      emailCounter += 1;
      return Meteor.callAsync('playerAccounts.register', {
        displayName,
        email: `${displayName.toLowerCase()}-${emailCounter}@example.com`,
        password: 'password123',
      });
    }

    beforeEach(async function () {
      await RoundsCollection.removeAsync({});
      await PlayersCollection.removeAsync({});
      await PlayerAccountsCollection.removeAsync({});
      await GlobalLeaderboardCollection.removeAsync({});
    });

    it('records a leaderboard entry and account stats for the winner of a game', async function () {
      const alice = await registerAccount('Alice');

      const roundId = await RoundsCollection.insertAsync({
        gameId: 'lb-game-1',
        lengthOfSequence: 4,
        sequence: ['red', 'blue', 'green', 'yellow'],
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      const aliceId = await PlayersCollection.insertAsync({
        gameId: 'lb-game-1',
        roundId,
        name: 'Alice',
        accountId: alice._id,
        lives: 3,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      const bobId = await PlayersCollection.insertAsync({
        gameId: 'lb-game-1',
        roundId,
        name: 'Bob',
        accountId: null,
        lives: 1,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      // Bob submits a wrong sequence and is eliminated, leaving Alice as the winner
      await Meteor.callAsync('players.submitSequence', bobId, ['red', 'red', 'red', 'red']);

      const aliceAccount = await PlayerAccountsCollection.findOneAsync(alice._id);
      assert.strictEqual(aliceAccount.gamesPlayed, 1);
      assert.strictEqual(aliceAccount.wins, 1);
      assert.strictEqual(aliceAccount.bestRound, 1);

      const entry = await GlobalLeaderboardCollection.findOneAsync({ accountId: alice._id });
      assert.ok(entry);
      assert.strictEqual(entry.displayName, 'Alice');
      assert.strictEqual(entry.bestRound, 1);
      assert.strictEqual(entry.wins, 1);
      assert.strictEqual(entry.gamesPlayed, 1);
    });

    it('records a loss for an eliminated registered player without marking them a winner', async function () {
      const bob = await registerAccount('Bob');

      const roundId = await RoundsCollection.insertAsync({
        gameId: 'lb-game-2',
        lengthOfSequence: 4,
        sequence: ['red', 'blue', 'green', 'yellow'],
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      await PlayersCollection.insertAsync({
        gameId: 'lb-game-2',
        roundId,
        name: 'Alice',
        accountId: null,
        lives: 3,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      const bobId = await PlayersCollection.insertAsync({
        gameId: 'lb-game-2',
        roundId,
        name: 'Bob',
        accountId: bob._id,
        lives: 1,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      await Meteor.callAsync('players.submitSequence', bobId, ['red', 'red', 'red', 'red']);

      const bobAccount = await PlayerAccountsCollection.findOneAsync(bob._id);
      assert.strictEqual(bobAccount.gamesPlayed, 1);
      assert.strictEqual(bobAccount.wins, 0);

      const entry = await GlobalLeaderboardCollection.findOneAsync({ accountId: bob._id });
      assert.ok(entry);
      assert.strictEqual(entry.bestRound, 1);
      assert.strictEqual(entry.wins, 0);
    });

    it('does not create a leaderboard entry for guest players without an account', async function () {
      const roundId = await RoundsCollection.insertAsync({
        gameId: 'lb-game-3',
        lengthOfSequence: 4,
        sequence: ['red', 'blue', 'green', 'yellow'],
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      await PlayersCollection.insertAsync({
        gameId: 'lb-game-3',
        roundId,
        name: 'Alice',
        accountId: null,
        lives: 3,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      const bobId = await PlayersCollection.insertAsync({
        gameId: 'lb-game-3',
        roundId,
        name: 'Bob',
        accountId: null,
        lives: 1,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      await Meteor.callAsync('players.submitSequence', bobId, ['red', 'red', 'red', 'red']);

      const count = await GlobalLeaderboardCollection.find().countAsync();
      assert.strictEqual(count, 0);
    });

    it('keeps the higher bestRound when a later game scores lower', async function () {
      const alice = await registerAccount('Alice');

      // Game 1: Alice wins at a deep round (level 3 => lengthOfSequence 6)
      const roundId1 = await RoundsCollection.insertAsync({
        gameId: 'lb-game-4a',
        lengthOfSequence: 6,
        sequence: ['red', 'blue', 'green', 'yellow', 'red', 'blue'],
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      const aliceId1 = await PlayersCollection.insertAsync({
        gameId: 'lb-game-4a',
        roundId: roundId1,
        name: 'Alice',
        accountId: alice._id,
        lives: 3,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      const bobId1 = await PlayersCollection.insertAsync({
        gameId: 'lb-game-4a',
        roundId: roundId1,
        name: 'Bob',
        accountId: null,
        lives: 1,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      await Meteor.callAsync('players.submitSequence', bobId1, ['red', 'red', 'red', 'red', 'red', 'red']);

      let entry = await GlobalLeaderboardCollection.findOneAsync({ accountId: alice._id });
      assert.strictEqual(entry.bestRound, 3);

      // Game 2: Alice is eliminated immediately at level 1
      const roundId2 = await RoundsCollection.insertAsync({
        gameId: 'lb-game-4b',
        lengthOfSequence: 4,
        sequence: ['red', 'blue', 'green', 'yellow'],
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      const aliceId2 = await PlayersCollection.insertAsync({
        gameId: 'lb-game-4b',
        roundId: roundId2,
        name: 'Alice',
        accountId: alice._id,
        lives: 1,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      await PlayersCollection.insertAsync({
        gameId: 'lb-game-4b',
        roundId: roundId2,
        name: 'Carol',
        accountId: null,
        lives: 3,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      await Meteor.callAsync('players.submitSequence', aliceId2, ['red', 'red', 'red', 'red']);

      const aliceAccount = await PlayerAccountsCollection.findOneAsync(alice._id);
      assert.strictEqual(aliceAccount.gamesPlayed, 2);
      assert.strictEqual(aliceAccount.bestRound, 3);

      entry = await GlobalLeaderboardCollection.findOneAsync({ accountId: alice._id });
      assert.strictEqual(entry.bestRound, 3);
      assert.strictEqual(entry.gamesPlayed, 2);
    });

    it('keeps the global leaderboard capped at 50 entries', async function () {
      // Seed 50 existing leaderboard entries with low scores
      for (let i = 0; i < 50; i++) {
        await GlobalLeaderboardCollection.insertAsync({
          accountId: `seed-account-${i}`,
          displayName: `Seed ${i}`,
          bestRound: i,
          achievedAt: new Date(),
          gamesPlayed: 1,
          wins: 0,
          updatedAt: new Date(),
        });
      }

      const alice = await registerAccount('Alice');

      const roundId = await RoundsCollection.insertAsync({
        gameId: 'lb-game-5',
        lengthOfSequence: 60,
        sequence: Array.from({ length: 60 }, () => 'red'),
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      await PlayersCollection.insertAsync({
        gameId: 'lb-game-5',
        roundId,
        name: 'Alice',
        accountId: alice._id,
        lives: 3,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      const bobId = await PlayersCollection.insertAsync({
        gameId: 'lb-game-5',
        roundId,
        name: 'Bob',
        accountId: null,
        lives: 1,
        eliminated: false,
        completeRound: false,
        attemptedSequence: [],
        winner: false,
      });

      await Meteor.callAsync('players.submitSequence', bobId, ['blue']);

      const total = await GlobalLeaderboardCollection.find().countAsync();
      assert.strictEqual(total, 50);

      const aliceEntry = await GlobalLeaderboardCollection.findOneAsync({ accountId: alice._id });
      assert.ok(aliceEntry);

      const worstSeedStillPresent = await GlobalLeaderboardCollection.findOneAsync({ accountId: 'seed-account-0' });
      assert.strictEqual(worstSeedStillPresent, undefined);
    });
  });
}
