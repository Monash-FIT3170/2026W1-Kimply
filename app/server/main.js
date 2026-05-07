import { Meteor } from "meteor/meteor";
import { LinksCollection } from "/imports/api/links";
import { Random } from "meteor/random";
import { RoundsCollection } from "../imports/api/rounds";
import { PlayersCollection } from "../imports/api/players";
import { LeaderboardCollection } from "../imports/api/leaderboard";
import '../imports/api/gameMethods';


Meteor.startup(async () => {
  const count = await RoundsCollection.find().countAsync();
  // Seed a round if empty
  if (count == 0) {
    const colours = ['red', 'blue', 'green', 'yellow'];

    const sequence = Array.from({ length: 4 }, () =>
      colours[Math.floor(Math.random() * colours.length)]
    );

    RoundsCollection.insertAsync({
      lengthOfSequence: 4,
      sequence,
      createdAt: new Date(),
    });
  }
});

// Pulish collections
Meteor.publish('rounds', () => RoundsCollection.find());
Meteor.publish('players', () => PlayersCollection.find());
Meteor.publish('leaderboard', () => LeaderboardCollection.find());
