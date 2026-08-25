import { Meteor } from 'meteor/meteor';
import { RoundsCollection } from './rounds';
import { PlayersCollection } from './players';
import { LeaderboardCollection } from './leaderboard';

const COLOURS = ['red', 'blue', 'green', 'yellow'];

// generate random colour sequence
function generateSequence(length) {
  return Array.from({ length }, () => COLOURS[Math.floor(Math.random() * COLOURS.length)]);
}

async function checkWinner(gameId, isBattleRoyale = false) {
  const players = await PlayersCollection.find({ gameId }).fetchAsync();

  const alreadyFinished = players.some((p) => p.gameFinished);
  if (alreadyFinished) return;

  const active = players.filter((p) => !p.eliminated);

  // if Battle Royale mode
  // winner is whoever reaches longest sequences
  if (isBattleRoyale) {
    if (active.length > 0) return; //game is still going

    //if all eliminated then find highest level reached
    const highestLevel = Math.max(...players.map((p) => p.currentLevel ?? 4));

    const winners = players.filter((p) => (p.currentLevel ?? 4) === highestLevel);

    await PlayersCollection.updateAsync(
      { gameId, _id: { $in: winners.map((w) => w._id) } },
      { $set: { winner: true } },
      { multi: true }
    );

    await PlayersCollection.updateAsync({ gameId }, { $set: { gameFinished: true } }, { multi: true });

    return;
  }
  //Standard mode - last player standing wins FIX
  if (!isBattleRoyale && active.length === 1) {
    await PlayersCollection.updateAsync(active[0]._id, {
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
  }

  if (active.length === 0 && players.length > 0) {
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
  }
}

/**async function advanceRoundIfReady(round) {
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
}**/
// Gets an exisint sequence for a level or creates a new one
// Gets existing round for a level or creates a new one
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
    isCurrent: false, //current round is not shared, it is per player to accommodate battle royale
  });
}

if (Meteor.isServer && !global._gameMethodsInitialized) {
  global._gameMethodsInitialized = true;
  Meteor.methods({
    // Generate a new round with a colour sequence
    'rounds.generate'(length = 4, gameId = null) {
      const sequence = generateSequence(length);

      return RoundsCollection.insertAsync({
        gameId,
        level: length, //level matches sequence length
        lengthOfSequence: length,
        sequence,
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });
    },

    // Add a player to a round
    'players.join'(roundId, playerName, gameId = null, isBattleRoyale = false) {
      return PlayersCollection.insertAsync({
        gameId,
        roundId,
        name: playerName,
        lives: 3,
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

        // mark player as completed
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

        await checkWinner(player.gameId, isBattleRoyale);

        // add successful completion to leaderboard
        await LeaderboardCollection.insertAsync({
          gameId: player.gameId,
          playerId,
          name: player.name,
          lives: player.lives,
          roundId: player.roundId,
          completedAt: new Date(),
        });

        if (isBattleRoyale) {
          //advance player immediately to next round, no waiting for next player
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

        await checkWinner(player.gameId, false);
        const playersInRound = await PlayersCollection.find({ roundId: player.roundId }).fetchAsync();

        const activePlayers = playersInRound.filter((p) => !p.eliminated);
        const allFinished = activePlayers.length > 0 && activePlayers.every((p) => p.completeRound);
        const hasWinner = playersInRound.some((p) => p.winner);

        if (!round.advanced && allFinished && !hasWinner) {
          await Meteor.callAsync('rounds.advance', player.roundId);
        }
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
            eliminatedRound: eliminated ? round.lengthOfSequence - 3 : player.eliminatedRound,
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

      // create next round
      const nextRoundId = await RoundsCollection.insertAsync({
        gameId: currentRound.gameId,
        lengthOfSequence: nextLength,
        sequence: nextSequence,
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });

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
          },
        },
        { multi: true }
      );

      return nextRoundId;
    },

    // Reset sequence after game ends
    async 'game.resetSequences'(gameId) {
      await RoundsCollection.removeAsync({ gameId });
    },
  });
}
// Helper is only used in standard mode
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
