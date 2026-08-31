import { Meteor } from 'meteor/meteor';
import { RoundsCollection } from './rounds';
import { PlayersCollection } from './players';
import { LeaderboardCollection } from './leaderboard';
import { PlayerAccountsCollection } from './playerAccounts';
import { GameEventsCollection } from './gameEvents';
import { GlobalLeaderboardCollection } from './globalLeaderboard';
import { RoomsCollection } from './rooms';

const COLOURS = ['red', 'blue', 'green', 'yellow'];
const GLOBAL_LEADERBOARD_SIZE = 50;

// generate random colour sequence
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

async function checkWinner(gameId, isBattleRoyale = false) {
  const players = await PlayersCollection.find({ gameId }).fetchAsync();

  const alreadyFinished = players.some((p) => p.gameFinished);
  if (alreadyFinished) return;

  // Wait until every lobby member has actually joined before declaring a winner.
  const room = await RoomsCollection.findOneAsync({ pin: gameId });
  const expectedPlayerCount = room?.players?.length ?? 0;
  if (players.length < expectedPlayerCount) return;

  const active = players.filter((p) => !p.eliminated);
  const hasMultiplePlayers = players.length > 1;

  // Battle Royale: everyone races independently; the winner is whoever reached
  // the highest level once nobody is left standing.
  if (isBattleRoyale) {
    if (active.length > 0) return; // game is still going

    const highestLevel = Math.max(...players.map((p) => p.currentLevel ?? 4));
    const winners = players.filter((p) => (p.currentLevel ?? 4) === highestLevel);
    const winnerIds = new Set(winners.map((w) => w._id));

    await PlayersCollection.updateAsync(
      { gameId, _id: { $in: winners.map((w) => w._id) } },
      { $set: { winner: true } },
      { multi: true }
    );
    await PlayersCollection.updateAsync({ gameId }, { $set: { gameFinished: true } }, { multi: true });

    for (const p of players) {
      const isWinner = winnerIds.has(p._id);
      await recordGlobalResult(p.accountId, p.name, (p.currentLevel ?? 4) - 3, isWinner);
    }
    return;
  }

  // Standard mode - last player standing wins.
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
    const winnerLevel = winnerRound
      ? winnerRound.roundNumber ?? winnerRound.lengthOfSequence - 3
      : winner.eliminatedRound ?? 0;

    for (const p of players) {
      const isWinner = p._id === winner._id;
      await recordGlobalResult(p.accountId, p.name, isWinner ? winnerLevel : p.eliminatedRound ?? 0, isWinner);
    }
    return;
  }

  // Standard mode - everyone was eliminated on the same round: highest round reached wins.
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
      const isWinner = (p.eliminatedRound ?? 0) === highestRound;
      await recordGlobalResult(p.accountId, p.name, p.eliminatedRound ?? 0, isWinner);
    }
  }
}

async function advanceRoundIfReady(round) {
  if (!round) return false;

  const playersInRound = await PlayersCollection.find({
    roundId: round._id,
  }).fetchAsync();
  const room = await RoomsCollection.findOneAsync({ pin: round.gameId });
  const lobbyPlayerIds = (room?.players || []).map((player) => player.id).filter(Boolean);
  const expectedPlayerCount = lobbyPlayerIds.length;

  const playersToEvaluate = lobbyPlayerIds.length
    ? lobbyPlayerIds
        .map((lobbyPlayerId) => playersInRound.find((player) => player.lobbyPlayerId === lobbyPlayerId))
        .filter(Boolean)
    : playersInRound;

  if (playersToEvaluate.length < expectedPlayerCount) return false;

  const activePlayers = playersToEvaluate.filter((p) => !p.eliminated);
  const allFinished = activePlayers.length > 0 && activePlayers.every((p) => p.completeRound);
  const hasWinner = await PlayersCollection.findOneAsync({
    gameId: round.gameId,
    winner: true,
  });

  if (!round.advanced && allFinished && !hasWinner) {
    await Meteor.callAsync('rounds.advance', round._id);
    return true;
  }
  return false;
}

// Gets an existing round for a level or creates a new one (Battle Royale runs a
// per-player round rather than one shared current round).
async function getOrCreateRound(gameId, level) {
  const existing = await RoundsCollection.findOneAsync({ gameId, level });

  if (existing) {
    return existing._id;
  }
  const sequence = generateSequence(level);
  return await RoundsCollection.insertAsync({
    gameId,
    level,
    lengthOfSequence: level,
    sequence,
    createdAt: new Date(),
    advanced: false,
    isCurrent: false, // current round is not shared, it is per player to accommodate battle royale
  });
}

if (Meteor.isServer && !global._gameMethodsInitialized) {
  global._gameMethodsInitialized = true;
  Meteor.methods({
    // Generate a new round with a colour sequence
    async 'rounds.generate'(gameId = null) {
      const room = await RoomsCollection.findOneAsync({ pin: gameId });
      const length = room?.customSettings?.startingSequenceLength ? room.customSettings.startingSequenceLength : 4;

      const sequence = generateSequence(length);

      return RoundsCollection.insertAsync({
        gameId,
        level: length, // level matches sequence length
        lengthOfSequence: length,
        sequence,
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
        roundNumber: 1,
      });
    },

    // Add a player to a round
    async 'players.join'(roundId, playerName, gameId = null, lobbyPlayerId = null, isBattleRoyale = false, accountId = null) {
      if (lobbyPlayerId) {
        const existing = await PlayersCollection.findOneAsync({ gameId, lobbyPlayerId });
        if (existing) return existing._id;
      }

      const room = await RoomsCollection.findOneAsync({ pin: gameId });
      const startingLives = room?.customSettings?.startingLives ? room.customSettings.startingLives : 3;

      return PlayersCollection.insertAsync({
        gameId,
        roundId,
        lobbyPlayerId,
        name: playerName,
        accountId: typeof accountId === 'string' && accountId.trim() ? accountId.trim() : null,
        lives: startingLives,
        attemptedSequence: [],
        currentStreak: 0,
        longestStreak: 0,
        totalGuesses: 0,
        correctGuesses: 0,
        currentLevel: 4,
        eliminatedRound: null,
        eliminated: false,
        winner: false,
        completeRound: false,
        gameFinished: false,
        isBattleRoyale,
        slowMotionActive: false,
        eliminatedAt: null,
      });
    },

    // Submit a player's attempted sequence
    async 'players.submitSequence'(playerId, attemptedSequence) {
      // get player and current round
      const player = await PlayersCollection.findOneAsync(playerId);
      const round = await RoundsCollection.findOneAsync(player.roundId);
      const isBattleRoyale = player.isBattleRoyale ?? false;

      // compare submitted sequence with actual sequence
      const correct = JSON.stringify(attemptedSequence) === JSON.stringify(round.sequence);

      // if correct update player values
      if (correct) {
        const currentStreak = (player.currentStreak ?? 0) + 1;
        const longestStreak = Math.max(player.longestStreak ?? 0, currentStreak);
        const totalGuesses = (player.totalGuesses ?? 0) + 1;
        const correctGuesses = (player.correctGuesses ?? 0) + 1;

        const bonusLife = round.roundNumber === 7 ? 1 : 0;
        const lives = (player.lives ?? 0) + bonusLife;

        // mark player as completed
        await PlayersCollection.updateAsync(playerId, {
          $set: {
            attemptedSequence,
            currentStreak,
            longestStreak,
            totalGuesses,
            correctGuesses,
            completeRound: true,
            lives,
          },
        });

        await checkWinner(player.gameId, isBattleRoyale);

        // add successful completion to leaderboard
        await LeaderboardCollection.insertAsync({
          gameId: player.gameId,
          playerId,
          name: player.name,
          lives,
          roundId: player.roundId,
          completedAt: new Date(),
        });

        if (isBattleRoyale) {
          // advance player immediately to next round, no waiting for other players
          const nextLevel = (player.currentLevel ?? 4) + 1;
          const nextRoundId = await getOrCreateRound(player.gameId, nextLevel);

          await PlayersCollection.updateAsync(playerId, {
            $set: {
              roundId: nextRoundId,
              currentLevel: nextLevel,
              completeRound: false,
              attemptedSequence: [],
            },
          });

          return { success: true, sequenceComplete: true };
        }

        const updatedRound = await RoundsCollection.findOneAsync(player.roundId);
        await advanceRoundIfReady(updatedRound);

        return { success: true, sequenceComplete: true };
      } else {
        // remove one life for wrong sequence
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
            currentLevel: round.level ?? round.lengthOfSequence,
            eliminatedRound: eliminated ? (round.roundNumber ?? round.lengthOfSequence - 3) : player.eliminatedRound,
            eliminatedAt: eliminated ? new Date() : player.eliminatedAt,
          },
        });

        await checkWinner(player.gameId, isBattleRoyale);

        if (!isBattleRoyale) {
          const updatedRound = await RoundsCollection.findOneAsync(player.roundId);
          await advanceRoundIfReady(updatedRound);
        }

        return {
          success: false,
          sequenceComplete: false,
          remainingLives: newLives,
        };
      }
    },

    // Deduct a life when a player runs out of time on their turn
    async 'players.timeoutTurn'(playerId) {
      const player = await PlayersCollection.findOneAsync(playerId);
      if (!player || player.eliminated || player.winner || player.gameFinished) {
        return { ignored: true };
      }

      const round = await RoundsCollection.findOneAsync(player.roundId);
      if (!round) {
        throw new Meteor.Error('round-not-found', 'Current round does not exist');
      }

      const isBattleRoyale = player.isBattleRoyale ?? false;
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
          currentLevel: round.level ?? round.lengthOfSequence,
          eliminatedRound: eliminated ? (round.roundNumber ?? round.lengthOfSequence - 3) : player.eliminatedRound,
          eliminatedAt: eliminated ? new Date() : player.eliminatedAt,
        },
      });

      await checkWinner(player.gameId, isBattleRoyale);

      if (!isBattleRoyale) {
        const updatedRound = await RoundsCollection.findOneAsync(player.roundId);
        await advanceRoundIfReady(updatedRound);
      }

      return {
        success: true,
        remainingLives: newLives,
        eliminated,
      };
    },

    // advance game to next round
    async 'rounds.advance'(currentRoundId) {
      // get current round
      const currentRound = await RoundsCollection.findOneAsync(currentRoundId);

      if (!currentRound) {
        throw new Meteor.Error('round-not-found', 'Current round does not exist');
      }

      // prevent duplicate advancement
      if (currentRound.advanced) return;

      // mark current round as completed
      await RoundsCollection.updateAsync(currentRoundId, {
        $set: {
          advanced: true,
          isCurrent: false,
        },
      });

      // increase sequence size for next round
      const nextLength = currentRound.lengthOfSequence + 1;
      const nextSequence = generateSequence(nextLength);
      const nextRoundNumber = (currentRound.roundNumber ?? 1) + 1;

      // create next round
      const nextRoundId = await RoundsCollection.insertAsync({
        gameId: currentRound.gameId,
        lengthOfSequence: nextLength,
        sequence: nextSequence,
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
        roundNumber: nextRoundNumber,
      });

      const grantsSlowMotion = currentRound.roundNumber === 5;

      // move active players into next round
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
            slowMotionActive: grantsSlowMotion,
          },
        },
        { multi: true }
      );

      // announce the level-up for everyone who advanced
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
          level: nextRoundNumber,
          createdAt: new Date(),
        });
      }

      return nextRoundId;
    },

    // Reset sequence after game ends
    async 'game.resetSequences'(gameId) {
      await RoundsCollection.removeAsync({ gameId });
    },
  });
}
