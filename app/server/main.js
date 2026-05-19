import { Meteor } from "meteor/meteor";
import { LinksCollection } from "/imports/api/links";
import { Random } from "meteor/random";
import { generateSequence } from "/imports/api/sequence";
import { RoundsCollection } from "../imports/api/rounds";
import { PlayersCollection } from "../imports/api/players";
import { LeaderboardCollection } from "../imports/api/leaderboard";
import '../imports/api/gameMethods';
import "/imports/api/rooms";

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
      isCurrent: true
    });
  }
});

// Publish collections
Meteor.publish('rounds', () => RoundsCollection.find());
Meteor.publish('players', () => PlayersCollection.find());
Meteor.publish('leaderboard', () => LeaderboardCollection.find());