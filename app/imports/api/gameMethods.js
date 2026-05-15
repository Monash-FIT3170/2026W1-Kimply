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
            advanced: false,
            isCurrent: true 
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
    async 'players.submitSequence'(playerId, attemptedSequence) {
        const player = await PlayersCollection.findOneAsync(playerId);
        const round = await RoundsCollection.findOneAsync(player.roundId);
        const correct = JSON.stringify(attemptedSequence) == JSON.stringify(round.sequence);

        // if correct update player values 
        if (correct) {

    // mark player as completed
    await PlayersCollection.updateAsync(playerId, {
        $set: {
            attemptedSequence,
            completeRound: true,
        },
    });

    // store successful completion in leaderboard
    await LeaderboardCollection.insertAsync({
        playerId,
        name: player.name,
        lives: player.lives,
        roundId: player.roundId,
        completedAt: new Date(),
    });

    // return completion state to client
    return {
        success: true,
        sequenceComplete: true,
    };
}
            ;
        
            await PlayersCollection.updateAsync(playerId, {
                $set: {
                    attemptedSequence,
                    lives: newLives,
                    eliminated: newLives <=0,
                },
            });
        }
            return {
        success: false,
        sequenceComplete: false,
    };
        const playersInRound = await PlayersCollection.find({
            roundId: player.roundId,
        }).fetchAsync();

        const activePlayers = playersInRound.filter(p => !p.eliminated);
        const allFinished = activePlayers.length > 0 && activePlayers.every(p => p.completeRound);

        if (!round.advanced && allFinished) {
            await Meteor.callAsync('rounds.advance', player.roundId);
        }

        return correct;
    },

    async 'rounds.advance'(currentRoundId) {

        // get current round
        const currentRound = await RoundsCollection.findOneAsync(currentRoundId);

        if (!currentRound) {
            throw new Meteor.Error('round-not-found', 'Current round does not exist');
        }

        if (currentRound.advanced) return;

        await RoundsCollection.updateAsync(currentRoundId, {
                $set: { 
                    advanced: true,
                    isCurrent: false
                }
        });

        const nextLength = currentRound.lengthOfSequence + 1;
        const nextSequence = generateSequence(nextLength);

        // create next round
        const nextRoundId = await RoundsCollection.insertAsync({
            lengthOfSequence: nextLength,
            sequence: nextSequence,
            createdAt: new Date(),
            advanced: false,
            isCurrent: true 
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