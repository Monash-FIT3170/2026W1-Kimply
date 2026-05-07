import { Meteor } from 'meteor/meteor';
import { RoundsCollection } from './rounds';
import { PlatersCollection } from './players';
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
        return PlatersCollection.insertAsync({
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
            PlatersCollection.updateAsync(playerId, {
                $set: {
                    attemptedSequence,
                    completeRound: true,
                    winner: true,
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
        return correct;
    },
});