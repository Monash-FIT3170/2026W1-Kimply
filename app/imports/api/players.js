import { Mongo } from 'meteor/mongo';

// Guard against --full-app test mode evaluating this module twice
// (app bundle + test bundle both load it; global is shared across both).
if (!global._PlayersCollection) {
  global._PlayersCollection = new Mongo.Collection('players');
}
export const PlayersCollection = global._PlayersCollection;
