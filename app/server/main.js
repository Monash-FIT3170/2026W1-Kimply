import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { generateSequence } from '../imports/api/sequence.js';
import { RoundsCollection } from '../imports/api/rounds.js';
import { PlayersCollection } from '../imports/api/players.js';
import { LeaderboardCollection } from '../imports/api/leaderboard.js';
import { GameEventsCollection } from '../imports/api/gameEvents.js';
import { GlobalLeaderboardCollection } from '../imports/api/globalLeaderboard.js';
import '../imports/api/gameMethods';
import '../imports/api/playerAccounts';

import '/imports/api/rooms';

Meteor.startup(async () => {
  await RoundsCollection.removeAsync({});
  let existingRound = await RoundsCollection.findOneAsync({ isCurrent: true });
  if (!existingRound) {
    const sequence = generateSequence(4);
    await RoundsCollection.insertAsync({
      lengthOfSequence: 4,
      sequence,
      createdAt: new Date(),
      advanced: false,
      isCurrent: true,
    });
  }
});

// Publish collections
Meteor.publish('rounds', () => RoundsCollection.find());
Meteor.publish('players', () => PlayersCollection.find());
Meteor.publish('leaderboard', () => LeaderboardCollection.find());

Meteor.publish('eliminations', function (gameId) {
  if (typeof gameId !== 'string' || !gameId.trim()) {
    return this.ready();
  }

  return PlayersCollection.find(
    { gameId: gameId.trim(), eliminated: true },
    { sort: { eliminatedAt: -1 }, limit: 20 }
  );
});

Meteor.publish('gameEvents', function (gameId) {
  if (typeof gameId !== 'string' || !gameId.trim()) {
    return this.ready();
  }

  return GameEventsCollection.find(
    { gameId: gameId.trim() },
    { sort: { createdAt: -1 }, limit: 20 }
  );
});

Meteor.publish('globalLeaderboard', () =>
  GlobalLeaderboardCollection.find({}, { sort: { bestRound: -1, wins: -1, achievedAt: 1 } })
);
