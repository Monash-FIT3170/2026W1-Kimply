import { Meteor } from 'meteor/meteor';
import { RoundsCollection } from './rounds';
import { PlayersCollection } from './players';
import { LeaderboardCollection } from './leaderboard';

const COLOURS = ['red', 'blue', 'green', 'yellow'];

// generate random colour sequence
function generateSequence(length) {
  return Array.from({ length }, () => COLOURS[Math.floor(Math.random() * COLOURS.length)]);
}

async function checkWinner(roundId) {
  const players = await PlayersCollection.find({ roundId }).fetchAsync();

  const alreadyFinished = players.some((p) => p.gameFinished);
  if (alreadyFinished) return;

  const active = players.filter((p) => !p.eliminated);

  if (active.length === 1) {
    await PlayersCollection.updateAsync(active[0]._id, {
      $set: {
        winner: true,
      },
    });

    await PlayersCollection.updateAsync(
      { roundId },
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
        roundId,
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
      { roundId },
      {
        $set: {
          gameFinished: true,
        },
      },
      { multi: true }
    );
  }
}

if (Meteor.isServer && !global._gameMethodsInitialized) {
  global._gameMethodsInitialized = true;
  Meteor.methods({
    // Generate a new round with a colour sequence
    'rounds.generate'(length = 4) {
      const sequence = generateSequence(length);

      return RoundsCollection.insertAsync({
        lengthOfSequence: length,
        sequence,
        createdAt: new Date(),
        advanced: false,
        isCurrent: true,
      });
    },

    // Add a player to a round
    'players.join'(roundId, playerName) {
      return PlayersCollection.insertAsync({
        roundId,
        name: playerName,
        lives: 3,
        attemptedSequence: [],
        eliminatedRound: null,
        eliminated: false,
        winner: false,
        completeRound: false,
        gameFinished: false,
      });
    },

    // Submit a player's attempted sequence
    async 'players.submitSequence'(playerId, attemptedSequence) {
      // get player and current round
      const player = await PlayersCollection.findOneAsync(playerId);
      const round = await RoundsCollection.findOneAsync(player.roundId);

      // compare submitted sequence with actual sequence
      const correct = JSON.stringify(attemptedSequence) === JSON.stringify(round.sequence);

      // if correct update player values
      if (correct) {
        // mark player as completed
        await PlayersCollection.updateAsync(playerId, {
          $set: {
            attemptedSequence,
            completeRound: true,
          },
        });

        await checkWinner(player.roundId);

        // add successful completion to leaderboard
        await LeaderboardCollection.insertAsync({
          playerId,
          name: player.name,
          lives: player.lives,
          roundId: player.roundId,
          completedAt: new Date(),
        });
      } else {
        // remove one life for wrong sequence
        const newLives = player.lives - 1;
        const eliminated = newLives <= 0;

        await PlayersCollection.updateAsync(playerId, {
          $set: {
            attemptedSequence,
            lives: newLives,
            eliminated,
            eliminatedRound: eliminated ? round.lengthOfSequence - 3 : player.eliminatedRound,
          },
        });

        await checkWinner(player.roundId);

        // return failed attempt to client
        return {
          success: false,
          sequenceComplete: false,
          remainingLives: newLives,
        };
      }

      // check all players in current round
      const playersInRound = await PlayersCollection.find({
        roundId: player.roundId,
      }).fetchAsync();

      // only active players
      const activePlayers = playersInRound.filter((p) => !p.eliminated);

      // check if all active players finished
      const allFinished = activePlayers.length > 0 && activePlayers.every((p) => p.completeRound);

      const hasWinner = playersInRound.some((p) => p.winner);

      // move to next round if everyone finished
      if (!round.advanced && allFinished && !hasWinner) {
        await Meteor.callAsync('rounds.advance', player.roundId);
      }

      // return successful completion
      return {
        success: true,
        sequenceComplete: true,
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

      // create next round
      const nextRoundId = await RoundsCollection.insertAsync({
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
  });
}
