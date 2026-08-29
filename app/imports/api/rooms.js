import { Mongo } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { PlayersCollection } from './players.js';
import { RoundsCollection } from './rounds.js';

// Guard against --full-app test mode evaluating this module twice
// (app bundle + test bundle both load it; global is shared across both).
if (!global._RoomsCollection) {
  global._RoomsCollection = new Mongo.Collection('rooms');
}
export const RoomsCollection = global._RoomsCollection;

const PIN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GAME_MODE_PRESETS = {
  default: { flashingSpeed: 'medium', startingLives: 3, startingSequenceLength: 4 },
  easy: { flashingSpeed: 'slow', startingLives: 5, startingSequenceLength: 1 },
  medium: { flashingSpeed: 'medium', startingLives: 3, startingSequenceLength: 3 },
  hard: { flashingSpeed: 'fast', startingLives: 1, startingSequenceLength: 3 },
  battle_royale: { flashingSpeed: 'medium', startingLives: 1, startingSequenceLength: 4 },
};

function generatePin() {
  return Array.from({ length: 5 }, () => PIN_CHARS[Math.floor(Math.random() * PIN_CHARS.length)]).join('');
}

if (Meteor.isServer && !global._roomsServerInitialized) {
  global._roomsServerInitialized = true;
  Meteor.publish('rooms.lobby', function (pin) {
    if (typeof pin !== 'string') return this.ready();
    return RoomsCollection.find(
      { pin },
      {
        fields: {
          _id: 1,
          pin: 1,
          status: 1,
          gameName: 1,
          hostName: 1,
          customSettings: 1,
          gameMode: 1,
          'players.name': 1,
          'players.id': 1,
        },
      }
    );
  });

  Meteor.methods({
    async 'rooms.create'(hostName) {
      if (typeof hostName !== 'string' || !hostName.trim()) {
        throw new Meteor.Error('invalid', 'Invalid name');
      }
      const name = hostName.trim();
      const hostId = Random.id();

      let pin;
      for (let i = 0; i < 10; i++) {
        const candidate = generatePin();
        const exists = await RoomsCollection.findOneAsync({ pin: candidate });
        if (!exists) {
          pin = candidate;
          break;
        }
      }
      if (!pin) throw new Meteor.Error('server-error', 'Could not generate a unique PIN');
      await RoomsCollection.insertAsync({
        pin,
        hostName: name,
        gameName: `Game${pin}`,
        status: 'lobby',
        players: [{ id: hostId, name }],
        createdAt: new Date(),
        gameMode: 'default',
        customSettings: {
          flashingSpeed: 'medium',
          startingLives: 3,
          startingSequenceLength: 4,
        },
      });

      return { pin: pin, hostId: hostId };
    },

    async 'rooms.setGameMode'(pin, gameMode) {
      if (typeof pin !== 'string' || !pin.trim()) throw new Meteor.Error('invalid', 'Invalid PIN');
      if (!['default', 'easy', 'medium', 'hard', 'custom', 'battle_royale'].includes(gameMode)) {
        throw new Meteor.Error('invalid', 'Invalid game mode');
      }
      const room = await RoomsCollection.findOneAsync({ pin: pin.trim() });
      if (!room) throw new Meteor.Error('not-found', 'Room not found');
      if (room.status !== 'lobby') throw new Meteor.Error('not-lobby', 'Game already started');

      const update = { gameMode };
      if (GAME_MODE_PRESETS[gameMode]) {
        update.customSettings = GAME_MODE_PRESETS[gameMode];
      }

      await RoomsCollection.updateAsync(
        {
          _id: room._id,
        },
        { $set: update }
      );
    },

    async 'rooms.updateSettings'(pin, settings) {
      const room = await RoomsCollection.findOneAsync({ pin });
      if (room?.gameMode !== 'custom') {
        throw new Meteor.Error('not-custom-mode', 'Settings only apply in custom game mode');
      }

      const validSpeeds = ['slow', 'medium', 'fast'];
      if (settings.flashingSpeed && !validSpeeds.includes(settings.flashingSpeed)) {
        throw new Meteor.Error('invalid-speed', 'flashingSpeed must be slow, medium, or fast');
      }

      if (settings.startingLives != null && (!Number.isInteger(settings.startingLives) || settings.startingLives < 1)) {
        throw new Meteor.Error('invalid-lives', 'startingLives must be a positive integer');
      }
      if (
        settings.startingSequenceLength != null &&
        (!Number.isInteger(settings.startingSequenceLength) || settings.startingSequenceLength < 1)
      ) {
        throw new Meteor.Error('invalid-length', 'startingSequenceLength must be a positive integer');
      }

      await RoomsCollection.updateAsync({ pin }, { $set: { customSettings: settings } });
    },

    async 'rooms.start'(pin, gameMode = 'standard') {
      if (typeof pin !== 'string' || !pin.trim()) {
        throw new Meteor.Error('invalid', 'Invalid PIN');
      }
      const room = await RoomsCollection.findOneAsync({ pin: pin.trim() });
      if (!room) throw new Meteor.Error('not-found', 'Room not found');
      if (room.status !== 'lobby') throw new Meteor.Error('not-lobby', 'Game already started');

      // Clear old game data so new game starts fresh
      await PlayersCollection.removeAsync({ gameId: pin });
      await RoundsCollection.removeAsync({ gameId: pin });

      await RoomsCollection.updateAsync({ _id: room._id }, { $set: { status: 'in_progress', gameMode } });
      await Meteor.callAsync('rounds.generate', room.pin);
    },

    async 'rooms.kick'(pin, playerId) {
      if (typeof pin !== 'string' || !pin.trim()) throw new Meteor.Error('invalid', 'Invalid PIN');
      if (typeof playerId !== 'string' || !playerId.trim()) throw new Meteor.Error('invalid', 'Invalid player ID');
      const room = await RoomsCollection.findOneAsync({ pin: pin.trim() });
      if (!room) throw new Meteor.Error('not-found', 'Room not found');
      if (room.status !== 'lobby') throw new Meteor.Error('not-lobby', 'Game already started');

      const isHost = (room.players || []).find((p) => p.id === playerId)?.name === room.hostName;
      if (isHost) throw new Meteor.Error('invalid', 'Cannot kick the host');

      await RoomsCollection.updateAsync({ _id: room._id }, { $pull: { players: { id: playerId } } });
    },

    async 'rooms.disconnect'(pin, playerId) {
      if (typeof pin !== 'string' || !pin.trim()) throw new Meteor.Error('invalid', 'Invalid PIN');
      if (typeof playerId !== 'string' || !playerId.trim()) throw new Meteor.Error('invalid', 'Invalid player ID');

      const room = await RoomsCollection.findOneAsync({ pin: pin.trim(), status: 'lobby' });
      if (!room) throw new Meteor.Error('not-found', 'Room not found');

      const isHost = (room.players || []).find((p) => p.id === playerId)?.name === room.hostName;

      if (isHost) {
        // Delete room if host disconnects
        await RoomsCollection.removeAsync({ _id: room._id });
        return;
      }

      await RoomsCollection.updateAsync({ _id: room._id }, { $pull: { players: { id: playerId } } });
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

      const nameTaken = (room.players || []).some((p) => p.name.toLowerCase() === playerName.trim().toLowerCase());
      if (nameTaken) throw new Meteor.Error('name-taken', 'Name already taken');

      const playerId = Random.id();

      await RoomsCollection.updateAsync(
        { _id: room._id },
        { $push: { players: { id: playerId, name: playerName.trim() } } }
      );

      return { roomId: room.pin, playerId: playerId };
    },

    async 'rooms.updateGameName'(pin, gameName) {
      if (typeof pin !== 'string' || !pin.trim()) {
        throw new Meteor.Error('invalid', 'Invalid PIN');
      }
      if (typeof gameName !== 'string' || !gameName.trim()) {
        throw new Meteor.Error('invalid', 'Invalid name');
      }

      const room = await RoomsCollection.findOneAsync({ pin: pin.trim() });
      if (!room) throw new Meteor.Error('not-found', 'Room not found');
      if (room.status !== 'lobby') throw new Meteor.Error('not-lobby', 'Game already started');

      await RoomsCollection.updateAsync(
        { _id: room._id },
        {
          $set: {
            gameName: gameName,
          },
        }
      );
    },

    async 'rooms.reconnect'(pin, playerId) {
      if (typeof pin !== 'string' || !pin.trim()) {
        throw new Meteor.Error('invalid', 'Invalid PIN');
      }
      if (typeof playerId !== 'string' || !playerId.trim()) {
        throw new Meteor.Error('invalid', 'Invalid player ID');
      }

      const room = await RoomsCollection.findOneAsync({ pin: pin.trim() });
      if (!room) throw new Meteor.Error('not-found', 'Room not found');
      if (room.status !== 'lobby') throw new Meteor.Error('not-lobby', 'Game already started');

      const player = room.players.find((p) => p.id === playerId);

      if (!player) {
        throw new Meteor.Error('player-not-found');
      }

      return {
        playerName: player.name,
        isHost: room.hostId === playerId,
        playerId: playerId,
      };
    },
  });
}
