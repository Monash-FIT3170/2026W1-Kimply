import { Mongo } from 'meteor/mongo';

if (!global._GameEventsCollection) {
  global._GameEventsCollection = new Mongo.Collection('gameEvents');
}

export const GameEventsCollection = global._GameEventsCollection;
