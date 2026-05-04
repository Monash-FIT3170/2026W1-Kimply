import { Mongo } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';

export const RoomsCollection = new Mongo.Collection('rooms');

if (Meteor.isServer) {
  Meteor.publish('rooms.lobby', function (pin) {
    if (typeof pin !== 'string') return this.ready();
    return RoomsCollection.find(
      { pin },
      { fields: { _id: 1, pin: 1, status: 1, 'players.name': 1 } }
    );
  });

  Meteor.methods({
    async 'rooms.join'(pin, playerName) {
      if (typeof pin !== 'string' || !pin.trim()) {
        throw new Meteor.Error('invalid', 'Invalid PIN');
      }
      if (typeof playerName !== 'string' || !playerName.trim()) {
        throw new Meteor.Error('invalid', 'Invalid name');
      }

      const room = await RoomsCollection.findOneAsync({ pin: pin.trim() });
      if (!room) throw new Meteor.Error('not-found', 'Room not found');
      if (room.status !== 'lobby') throw new Meteor.Error('not-lobby', 'Game already started');

      const nameTaken = (room.players || []).some(
        (p) => p.name.toLowerCase() === playerName.trim().toLowerCase()
      );
      if (nameTaken) throw new Meteor.Error('name-taken', 'Name already taken');

      await RoomsCollection.updateAsync(
        { _id: room._id },
        { $push: { players: { id: Random.id(), name: playerName.trim() } } }
      );

      return room._id;
    },
  });
}
