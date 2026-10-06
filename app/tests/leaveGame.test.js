import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import '../imports/api/gameMethods.js';
import { LeaderboardCollection } from '../imports/api/leaderboard.js';
import { PlayersCollection } from '../imports/api/players.js';
import { RoundsCollection } from '../imports/api/rounds.js';
import { RoomsCollection } from '../imports/api/rooms.js';

if (Meteor.isServer) {
  describe('players.leaveGame', function () {
    const gameId = 'LEAVE';

    beforeEach(async function () {
      await LeaderboardCollection.removeAsync({});
      await PlayersCollection.removeAsync({});
      await RoundsCollection.removeAsync({});
      await RoomsCollection.removeAsync({});
    });

    it('marks a spectator eliminated and retains their final score', async function () {
      await RoomsCollection.insertAsync({
        pin: gameId,
        status: 'in_progress',
        hostName: 'Remaining player',
        players: [
          { id: 'remaining-lobby-id', name: 'Remaining player' },
          { id: 'spectator-lobby-id', name: 'Spectator' },
        ],
      });
      const roundId = await RoundsCollection.insertAsync({
        gameId,
        lengthOfSequence: 4,
        sequence: ['red', 'blue', 'green', 'yellow'],
        advanced: false,
        isCurrent: true,
      });
      const remainingPlayerId = await PlayersCollection.insertAsync({
        gameId,
        roundId,
        lobbyPlayerId: 'remaining-lobby-id',
        name: 'Remaining player',
        lives: 3,
        eliminated: false,
        completeRound: false,
        winner: false,
      });
      const spectatorId = await PlayersCollection.insertAsync({
        gameId,
        roundId,
        lobbyPlayerId: 'spectator-lobby-id',
        name: 'Spectator',
        lives: 0,
        eliminated: true,
        completeRound: false,
        winner: false,
      });
      await LeaderboardCollection.insertAsync({ gameId, playerId: spectatorId, name: 'Spectator' });

      await Meteor.callAsync('players.leaveGame', spectatorId);

      const spectator = await PlayersCollection.findOneAsync(spectatorId);
      assert.equal(spectator.eliminated, true);
      assert.equal(spectator.roundStatus, 'Eliminated');
      assert.equal(await LeaderboardCollection.find({ playerId: spectatorId }).countAsync(), 1);
      const room = await RoomsCollection.findOneAsync({ pin: gameId });
      assert.equal(room.players.some((player) => player.id === 'spectator-lobby-id'), true);
      const remainingPlayer = await PlayersCollection.findOneAsync(remainingPlayerId);
      assert.equal(remainingPlayer.winner, true);
      assert.equal(remainingPlayer.gameFinished, true);
    });
  });
}
