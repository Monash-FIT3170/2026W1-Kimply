import { Meteor } from 'meteor/meteor';
import { generateSequence, LeaderboardCollection, PlayersCollection, RoundsCollection } from '/imports/api';

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
