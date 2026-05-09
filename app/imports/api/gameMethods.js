import { Meteor } from 'meteor/meteor';
import { RoundsCollection } from './rounds';
import { PlayersCollection } from './players';
import { LeaderboardCollection } from './leaderboard';

const COLOURS = ['red', 'blue', 'green', 'yellow'];

function generateSequence(length) {
    return Array.from({ length }, () =>
        COLOURS[Math.floor(Math.random() * COLOURS.length)]
    );
}

Meteor.methods({
    // Generate a new round with a colour sequence
    'rounds.generate'(length = 4) {
        const sequence = generateSequence(length);
        return RoundsCollection.insertAsync({
            lengthOfSequence: length,
            sequence,
            createdAt: new Date(),
        });
    },

    // Add a player to a round
    'players.join'(roundId, playerName) {
        return PlayersCollection.insertAsync({
            roundId,
            name: playerName,
            lives: 3,
            attemptedSequence: [],
            eliminated: false,
            winner: false,
            completeRound: false,
        });
    },

    // Submit a player's attempted sequence
    'players.submitSequence'(playerId, attemptedSequence) {
        const player = PlayersCollection.findOneAsync(playerId);
        const round = RoundsCollection.findOneAsync(player.roundId);

        const correct = JSON.stringify(attemptedSequence) == JSON.stringify(round.sequence);

        // if correct update player values 
        if (correct) {
            PlayersCollection.updateAsync(playerId, {
                $set: {
                    attemptedSequence,
                    completeRound: true,
                },
            }),

            // add to leaderboard
            LeaderboardCollection.insertAsync({
                playerId,
                name: player.name,
                lives: player.lives,
                roundId: player.roundId,
                completedAt: new Date(),
            });
        } else {
            const newLives = player.lives - 1;
            PlayersCollection.updateAsync(playerId, {
                $set: {
                    attemptedSequence,
                    lives: newLives,
                    eliminated: newLives <=0,
                },
            });
        }

        const activePlayers = await PlayersCollection.find({
            roundId: player.roundId,
            eliminated: false,
        }).fetchAsync();

        const allFinished = activePlayers.every(p => p.completeRound);

        if (allFinished && activePlayers.length > 0) {
            await Meteor.callAsync('rounds.advance', player.roundId);
        }

        return correct;
    },

    'rounds.advance'(currentRoundId) {

        // get current round
        const currentRound = await RoundsCollection.findOneAsync(currentRoundId);

        if (!currentRound) {
            throw new Meteor.Error('round-not-found', 'Current round does not exist');
        }

        const nextLength = currentRound.lengthOfSequence + 1;
        const nextSequence = generateSequence(nextLength);

        // create next round
        const nextRoundId = await RoundsCollection.insertAsync({
            lengthOfSequence: nextLength,
            sequence: nextSequence,
            createdAt: new Date(),
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