import { Meteor } from 'meteor/meteor';
import { RoundsCollection } from './rounds';
import { PlayersCollection } from './players';
import { LeaderboardCollection } from './leaderboard';
import { PlayerAccountsCollection } from './playerAccounts';
import { GameEventsCollection } from './gameEvents';
import { GlobalLeaderboardCollection } from './globalLeaderboard';

const COLOURS = ['red', 'blue', 'green', 'yellow'];
const GLOBAL_LEADERBOARD_SIZE = 50;

function generateSequence(length) {
  return Array.from({ length }, () => COLOURS[Math.floor(Math.random() * COLOURS.length)]);
}

async function recordGlobalResult(accountId, displayName, levelReached, won) {
  if (!accountId) return;

  const now = new Date();

  await PlayerAccountsCollection.updateAsync(accountId, {
    $inc: { gamesPlayed: 1, wins: won ? 1 : 0 },
    $max: { bestRound: levelReached },
    $set: { updatedAt: now },
  });

  const account = await PlayerAccountsCollection.findOneAsync(accountId);
  if (!account) return;

  const existing = await GlobalLeaderboardCollection.findOneAsync({ accountId });

  if (!existing) {
    await GlobalLeaderboardCollection.insertAsync({
      accountId,
      displayName,
      bestRound: levelReached,
      achievedAt: now,
      gamesPlayed: account.gamesPlayed,
      wins: account.wins,
      updatedAt: now,
    });
  } else {
    const isNewBest = levelReached > existing.bestRound;
    await GlobalLeaderboardCollection.updateAsync(existing._id, {
      $set: {
        displayName,
        gamesPlayed: account.gamesPlayed,
        wins: account.wins,
        updatedAt: now,
        ...(isNewBest ? { bestRound: levelReached, achievedAt: now } : {}),
      },
    });
  }

  const total = await GlobalLeaderboardCollection.find().countAsync();
  if (total > GLOBAL_LEADERBOARD_SIZE) {
    const overflow = await GlobalLeaderboardCollection.find(
      {},
      { sort: { bestRound: 1, wins: 1, achievedAt: -1 }, limit: total - GLOBAL_LEADERBOARD_SIZE }
    ).fetchAsync();
    await GlobalLeaderboardCollection.removeAsync({ _id: { $in: overflow.map((doc) => doc._id) } });
  }
}

async function checkWinner(gameId) {
  const players = await PlayersCollection.find({ gameId }).fetchAsync();

  const alreadyFinished = players.some((p) => p.gameFinished);
  if (alreadyFinished) return;

  const active = players.filter((p) => !p.eliminated);
  const hasMultiplePlayers = players.length > 1;

  if (hasMultiplePlayers && active.length === 1) {
    const winner = active[0];
    await PlayersCollection.updateAsync(winner._id, {
      $set: {
        winner: true,
      },
    });

    await PlayersCollection.updateAsync(
      { gameId },
      {
        $set: {
          gameFinished: true,
        },
      },
      { multi: true }
    );

    const winnerRound = await RoundsCollection.findOneAsync(winner.roundId);
    const winnerLevel = winnerRound ? winnerRound.lengthOfSequence - 3 : winner.eliminatedRound ?? 0;

    for (const p of players) {
      const isWinner = p._id === winner._id;
      await recordGlobalResult(p.accountId, p.name, isWinner ? winnerLevel : p.eliminatedRound ?? 0, isWinner);
    }
  }

  if (hasMultiplePlayers && active.length === 0 && players.length > 0) {
    const highestRound = Math.max(...players.map((p) => p.eliminatedRound ?? 0));

    await PlayersCollection.updateAsync(
      {
        gameId,
        eliminatedRound: highestRound,
      },
      {
        $set: {
          winner: true,
        },
      },
      { multi: true }
    );

    await PlayersCollection.updateAsync(
      { gameId },
      {
        $set: {
          gameFinished: true,
        },
      },
      { multi: true }
    );

    for (const p of players) {
      const isWinner = p.eliminatedRound === highestRound;
      await recordGlobalResult(p.accountId, p.name, p.eliminatedRound ?? 0, isWinner);
    }
  }
}

async function advanceRoundIfReady(round) {
  const playersInRound = await PlayersCollection.find({
    roundId: round._id,
  }).fetchAsync();

  const activePlayers = playersInRound.filter((p) => !p.eliminated);
  const allFinished = activePlayers.length > 0 && activePlayers.every((p) => p.completeRound);
  const hasWinner = await PlayersCollection.findOneAsync({
    gameId: round.gameId,
    winner: true,
  });

  if (!round.advanced && allFinished && !hasWinner) {
    await Meteor.callAsync('rounds.advance', round._id);
  }
}

if (Meteor.isServer && !global._gameMethodsInitialized) {
  global._gameMethodsInitialized = true;
  Meteor.methods({
    'rounds.generate'(length = 4, gameId = null) {
      const sequence = generateSequence(length);

      return RoundsCollection.insertAsync({
        gameId,
        lengthOfSequence: length,
        sequence,
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });
    },

    'players.join'(roundId, playerName, gameId = null, accountId = null) {
      return PlayersCollection.insertAsync({
        gameId,
        roundId,
        name: playerName,
        accountId: typeof accountId === 'string' && accountId.trim() ? accountId.trim() : null,
        lives: 3,
        attemptedSequence: [],
        currentStreak: 0,
        longestStreak: 0,
        totalGuesses: 0,
        correctGuesses: 0,
        eliminatedRound: null,
        eliminated: false,
        winner: false,
        completeRound: false,
        gameFinished: false,
        eliminatedAt: null,
      });
    },

    async 'players.submitSequence'(playerId, attemptedSequence) {
      const player = await PlayersCollection.findOneAsync(playerId);
      const round = await RoundsCollection.findOneAsync(player.roundId);

      const correct = JSON.stringify(attemptedSequence) === JSON.stringify(round.sequence);

      if (correct) {
        const currentStreak = (player.currentStreak ?? 0) + 1;
        const longestStreak = Math.max(player.longestStreak ?? 0, currentStreak);
        const totalGuesses = (player.totalGuesses ?? 0) + 1;
        const correctGuesses = (player.correctGuesses ?? 0) + 1;

        await PlayersCollection.updateAsync(playerId, {
          $set: {
            attemptedSequence,
            currentStreak,
            longestStreak,
            totalGuesses,
            correctGuesses,
            completeRound: true,
          },
        });

        await checkWinner(player.gameId);

        await LeaderboardCollection.insertAsync({
          gameId: player.gameId,
          playerId,
          name: player.name,
          lives: player.lives,
          roundId: player.roundId,
          completedAt: new Date(),
        });

        const updatedRound = await RoundsCollection.findOneAsync(player.roundId);
        await advanceRoundIfReady(updatedRound);

        return {
          success: true,
          sequenceComplete: true,
        };
      }

      const newLives = player.lives - 1;
      const eliminated = newLives <= 0;
      const longestStreak = Math.max(player.longestStreak ?? 0, player.currentStreak ?? 0);
      const totalGuesses = (player.totalGuesses ?? 0) + 1;

      await PlayersCollection.updateAsync(playerId, {
        $set: {
          attemptedSequence,
          lives: newLives,
          currentStreak: 0,
          longestStreak,
          totalGuesses,
          eliminated,
          eliminatedRound: eliminated ? round.lengthOfSequence - 3 : player.eliminatedRound,
          eliminatedAt: eliminated ? new Date() : player.eliminatedAt,
        },
      });

      await checkWinner(player.gameId);

      const updatedRound = await RoundsCollection.findOneAsync(player.roundId);
      await advanceRoundIfReady(updatedRound);

      return {
        success: false,
        sequenceComplete: false,
        remainingLives: newLives,
      };
    },

    async 'players.timeoutTurn'(playerId) {
      const player = await PlayersCollection.findOneAsync(playerId);
      if (!player || player.eliminated || player.winner || player.gameFinished) {
        return { ignored: true };
      }

      const round = await RoundsCollection.findOneAsync(player.roundId);
      if (!round) {
        throw new Meteor.Error('round-not-found', 'Current round does not exist');
      }

      const newLives = player.lives - 1;
      const eliminated = newLives <= 0;
      const longestStreak = Math.max(player.longestStreak ?? 0, player.currentStreak ?? 0);

      await PlayersCollection.updateAsync(playerId, {
        $set: {
          lives: newLives,
          currentStreak: 0,
          longestStreak,
          totalGuesses: (player.totalGuesses ?? 0) + 1,
          attemptedSequence: [],
          completeRound: false,
          eliminated,
          eliminatedRound: eliminated ? round.lengthOfSequence - 3 : player.eliminatedRound,
        },
      });

      await checkWinner(player.gameId);

      const updatedRound = await RoundsCollection.findOneAsync(player.roundId);
      await advanceRoundIfReady(updatedRound);

      return {
        success: true,
        remainingLives: newLives,
        eliminated,
      };
    },

    async 'rounds.advance'(currentRoundId) {
      const currentRound = await RoundsCollection.findOneAsync(currentRoundId);

      if (!currentRound) {
        throw new Meteor.Error('round-not-found', 'Current round does not exist');
      }

      if (currentRound.advanced) return;

      await RoundsCollection.updateAsync(currentRoundId, {
        $set: {
          advanced: true,
          isCurrent: false,
        },
      });

      const nextLength = currentRound.lengthOfSequence + 1;
      const nextSequence = generateSequence(nextLength);

      const nextRoundId = await RoundsCollection.insertAsync({
        gameId: currentRound.gameId,
        lengthOfSequence: nextLength,
        sequence: nextSequence,
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

      await PlayersCollection.updateAsync(
        {
          roundId: currentRoundId,
          eliminated: false,
        },
        {
          $set: {
            roundId: nextRoundId,
            completeRound: false,
            attemptedSequence: [],
          },
        },
        { multi: true }
      );

      const nextLevel = nextLength - 3;
      const movedPlayers = await PlayersCollection.find({
        roundId: nextRoundId,
        eliminated: false,
      }).fetchAsync();

      for (const player of movedPlayers) {
        await GameEventsCollection.insertAsync({
          gameId: currentRound.gameId,
          type: 'level-up',
          playerId: player._id,
          playerName: player.name,
          level: nextLevel,
          createdAt: new Date(),
        });
      }

      return nextRoundId;
    },
  });
}
