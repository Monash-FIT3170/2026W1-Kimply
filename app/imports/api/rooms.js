import { Mongo } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';

export const RoomsCollection = new Mongo.Collection('rooms');

const PIN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePin() {
  return Array.from({ length: 5 }, () => PIN_CHARS[Math.floor(Math.random() * PIN_CHARS.length)]).join('');
}

if (Meteor.isServer) {
  Meteor.publish('rooms.lobby', function (pin) {
    if (typeof pin !== 'string') return this.ready();
    return RoomsCollection.find(
      { pin },
      { fields: { _id: 1, pin: 1, status: 1, gameName: 1, hostName: 1, 'players.name': 1, 'players.id': 1 } }
    );
  });

  Meteor.methods({
    async 'rooms.create'(hostName) {
      if (typeof hostName !== 'string' || !hostName.trim()) {
        throw new Meteor.Error('invalid', 'Invalid name');
      }
      const name = hostName.trim();

      let pin;
      for (let i = 0; i < 10; i++) {
        const candidate = generatePin();
        const exists = await RoomsCollection.findOneAsync({ pin: candidate });
        if (!exists) { pin = candidate; break; }
      }
      if (!pin) throw new Meteor.Error('server-error', 'Could not generate a unique PIN');

      await RoomsCollection.insertAsync({
        pin,
        hostName: name,
        gameName: `Game${pin}`,
        status: 'lobby',
        players: [{ id: Random.id(), name }],
        createdAt: new Date(),
      });

      return { pin };
    },

    async 'rooms.kick'(pin, playerId) {
      if (typeof pin !== 'string' || !pin.trim()) throw new Meteor.Error('invalid', 'Invalid PIN');
      if (typeof playerId !== 'string' || !playerId.trim()) throw new Meteor.Error('invalid', 'Invalid player ID');

      const room = await RoomsCollection.findOneAsync({ pin: pin.trim() });
      if (!room) throw new Meteor.Error('not-found', 'Room not found');
      if (room.status !== 'lobby') throw new Meteor.Error('not-lobby', 'Game already started');

      const isHost = (room.players || []).find(p => p.id === playerId)?.name === room.hostName;
      if (isHost) throw new Meteor.Error('invalid', 'Cannot kick the host');

      await RoomsCollection.updateAsync(
        { _id: room._id },
        { $pull: { players: { id: playerId } } }
      );
    },

    async 'rooms.disconnect'(pin, playerName){
      if (typeof pin !== 'string' || !pin.trim()) throw new Meteor.Error('invalid', 'Invalid PIN');
      if (typeof playerName !== 'string' || !playerName.trim()) throw new Meteor.Error('invalid', 'Invalid player name');

      const room = await RoomsCollection.findOneAsync({ pin: pin.trim(), status: 'lobby' });
      if (!room) throw new Meteor.Error('not-found', 'Room not found');
      
      const isHost = (room.players || []).find(p=> p.name=== playerName)?.name === room.hostName

      if (isHost){ // Delete room if host disconnects
        await RoomsCollection.removeAsync({ _id : room._id });
        return
      }

      await RoomsCollection.updateAsync(
        {_id: room._id},
        { $pull: { players: { name: playerName}}}
      );
    },

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

    async 'rooms.updateGameName'(pin, gameName){
      if (typeof pin !== 'string' || !pin.trim()){
        throw new Meteor.Error('invalid', "Invalid PIN");
      }
      if (typeof gameName !== 'string' || !gameName.trim()){
        throw new Meteor.Error('invalid', 'Invalid name');
      }

      const room = await RoomsCollection.findOneAsync({ pin: pin.trim() });
      if (!room) throw new Meteor.Error('not-found', 'Room not found');
      if (room.status !== 'lobby') throw new Meteor.Error('not-lobby', 'Game already started');

      await RoomsCollection.updateAsync(
        { _id: room._id },
        { 
          $set:{
            gameName: gameName
          }
        }
      )

    },

    

  });
}
