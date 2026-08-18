import { Mongo } from 'meteor/mongo';

// Guard against --full-app test mode evaluating this module twice
// (app bundle + test bundle both load it; global is shared across both).
if (!global._RoundsCollection) {
  global._RoundsCollection = new Mongo.Collection('rounds');
}
export const RoundsCollection = global._RoundsCollection;
