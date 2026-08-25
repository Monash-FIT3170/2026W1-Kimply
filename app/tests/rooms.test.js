import { Meteor } from 'meteor/meteor';
import assert from 'assert';
import { RoomsCollection } from '/imports/api/rooms';
import { RoundsCollection } from '/imports/api/rounds';
import { DEFAULT_CUSTOM_SETTINGS, DEFAULT_GAME_MODE, GAME_MODES } from '/imports/api/gameModes';

if (Meteor.isServer) {
  describe('rooms API', function () {
    beforeEach(async function () {
      await RoomsCollection.removeAsync({});
      await RoundsCollection.removeAsync({});
    });

    // ─── rooms.create ────────────────────────────────────────────────────────

    describe('rooms.create', function () {
      it('throws on empty hostName', async function () {
        await assert.rejects(Meteor.callAsync('rooms.create', ''), (err) => err.error === 'invalid');
      });

      it('throws on whitespace-only hostName', async function () {
        await assert.rejects(Meteor.callAsync('rooms.create', '   '), (err) => err.error === 'invalid');
      });

      it('throws on non-string hostName', async function () {
        await assert.rejects(Meteor.callAsync('rooms.create', 42), (err) => err.error === 'invalid');
      });

      it('returns a 5-character PIN', async function () {
        const result = await Meteor.callAsync('rooms.create', 'Alice');
        assert.ok(result.pin);
        assert.strictEqual(result.pin.length, 5);
      });

      it('PIN contains only valid characters', async function () {
        const result = await Meteor.callAsync('rooms.create', 'Alice');
        assert.match(result.pin, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
      });

      it('persists room with correct fields', async function () {
        const result = await Meteor.callAsync('rooms.create', 'Alice');
        const room = await RoomsCollection.findOneAsync({ pin: result.pin });
        assert.ok(room);
        assert.strictEqual(room.hostName, 'Alice');
        assert.strictEqual(room.status, 'lobby');
        assert.strictEqual(room.gameMode, DEFAULT_GAME_MODE);
        assert.deepStrictEqual(room.customSettings, DEFAULT_CUSTOM_SETTINGS);
        assert.strictEqual(room.players.length, 1);
        assert.strictEqual(room.players[0].name, 'Alice');
        assert.ok(room.players[0].id);
      });

      it('trims whitespace from hostName', async function () {
        const result = await Meteor.callAsync('rooms.create', '  Bob  ');
        const room = await RoomsCollection.findOneAsync({ pin: result.pin });
        assert.strictEqual(room.hostName, 'Bob');
      });
    });

    // ─── rooms.updateGameMode ────────────────────────────────────────────────

    describe('rooms.updateGameMode', function () {
      let testPin;

      beforeEach(async function () {
        ({ pin: testPin } = await Meteor.callAsync('rooms.create', 'Host'));
      });

      it('throws on empty PIN', async function () {
        await assert.rejects(
          Meteor.callAsync('rooms.updateGameMode', '', GAME_MODES.EASY),
          (err) => err.error === 'invalid'
        );
      });

      it('throws on invalid game mode', async function () {
        await assert.rejects(
          Meteor.callAsync('rooms.updateGameMode', testPin, 'impossible-mode'),
          (err) => err.error === 'invalid-mode'
        );
      });

      it('throws not-found for unknown PIN', async function () {
        await assert.rejects(
          Meteor.callAsync('rooms.updateGameMode', 'ZZZZZ', GAME_MODES.HARD),
          (err) => err.error === 'not-found'
        );
      });

      it('throws not-lobby when game is in progress', async function () {
        await RoomsCollection.updateAsync({ pin: testPin }, { $set: { status: 'in-progress' } });
        await assert.rejects(
          Meteor.callAsync('rooms.updateGameMode', testPin, GAME_MODES.CUSTOM),
          (err) => err.error === 'not-lobby'
        );
      });

      it('updates the selected game mode', async function () {
        await Meteor.callAsync('rooms.updateGameMode', testPin, GAME_MODES.BATTLE_ROYALE);
        const room = await RoomsCollection.findOneAsync({ pin: testPin });
        assert.strictEqual(room.gameMode, GAME_MODES.BATTLE_ROYALE);
      });
    });

    // ─── rooms.updateCustomSettings ──────────────────────────────────────────

    describe('rooms.updateCustomSettings', function () {
      let testPin;

      beforeEach(async function () {
        ({ pin: testPin } = await Meteor.callAsync('rooms.create', 'Host'));
      });

      it('throws on invalid custom settings', async function () {
        await assert.rejects(
          Meteor.callAsync('rooms.updateCustomSettings', testPin, null),
          (err) => err.error === 'invalid-settings'
        );
      });

      it('saves normalized settings and switches to custom mode', async function () {
        await Meteor.callAsync('rooms.updateCustomSettings', testPin, {
          startingLength: 7,
          lives: 5,
          sequenceGrowth: 2,
        });

        const room = await RoomsCollection.findOneAsync({ pin: testPin });
        assert.strictEqual(room.gameMode, GAME_MODES.CUSTOM);
        assert.deepStrictEqual(room.customSettings, {
          startingLength: 7,
          lives: 5,
          sequenceGrowth: 2,
        });
      });

      it('clamps custom settings to supported ranges', async function () {
        await Meteor.callAsync('rooms.updateCustomSettings', testPin, {
          startingLength: 99,
          lives: 0,
          sequenceGrowth: 4,
        });

        const room = await RoomsCollection.findOneAsync({ pin: testPin });
        assert.deepStrictEqual(room.customSettings, {
          startingLength: 10,
          lives: 1,
          sequenceGrowth: 3,
        });
      });
    });

    // ─── rooms.start ─────────────────────────────────────────────────────────

    describe('rooms.start', function () {
      it('starts hard mode as sudden death', async function () {
        const { pin } = await Meteor.callAsync('rooms.create', 'Host');
        await Meteor.callAsync('rooms.updateGameMode', pin, GAME_MODES.HARD);

        await Meteor.callAsync('rooms.start', pin);

        const round = await RoundsCollection.findOneAsync({ gameId: pin, isCurrent: true });
        assert.strictEqual(round.gameMode, GAME_MODES.HARD);
        assert.strictEqual(round.lengthOfSequence, 5);
        assert.strictEqual(round.lives, 1);
      });

      it('starts custom mode with host settings', async function () {
        const { pin } = await Meteor.callAsync('rooms.create', 'Host');
        await Meteor.callAsync('rooms.updateCustomSettings', pin, {
          startingLength: 6,
          lives: 4,
          sequenceGrowth: 2,
        });

        await Meteor.callAsync('rooms.start', pin);

        const round = await RoundsCollection.findOneAsync({ gameId: pin, isCurrent: true });
        assert.strictEqual(round.gameMode, GAME_MODES.CUSTOM);
        assert.strictEqual(round.lengthOfSequence, 6);
        assert.strictEqual(round.lives, 4);
        assert.strictEqual(round.sequenceGrowth, 2);
      });
    });

    // ─── rooms.join ──────────────────────────────────────────────────────────

    describe('rooms.join', function () {
      let testPin;

      beforeEach(async function () {
        ({ pin: testPin } = await Meteor.callAsync('rooms.create', 'Host'));
      });

      it('throws on empty PIN', async function () {
        await assert.rejects(Meteor.callAsync('rooms.join', '', 'Player'), (err) => err.error === 'invalid');
      });

      it('throws on empty playerName', async function () {
        await assert.rejects(Meteor.callAsync('rooms.join', testPin, ''), (err) => err.error === 'invalid');
      });

      it('throws not-found for unknown PIN', async function () {
        await assert.rejects(Meteor.callAsync('rooms.join', 'ZZZZZ', 'Player'), (err) => err.error === 'not-found');
      });

      it('throws not-lobby when game is in progress', async function () {
        await RoomsCollection.updateAsync({ pin: testPin }, { $set: { status: 'in-progress' } });
        await assert.rejects(Meteor.callAsync('rooms.join', testPin, 'Player2'), (err) => err.error === 'not-lobby');
      });

      it('throws name-taken when name is already used', async function () {
        await assert.rejects(Meteor.callAsync('rooms.join', testPin, 'Host'), (err) => err.error === 'name-taken');
      });

      it('name-taken check is case-insensitive', async function () {
        await assert.rejects(Meteor.callAsync('rooms.join', testPin, 'host'), (err) => err.error === 'name-taken');
      });

      it('adds a new player to the room', async function () {
        await Meteor.callAsync('rooms.join', testPin, 'Player2');
        const room = await RoomsCollection.findOneAsync({ pin: testPin });
        assert.strictEqual(room.players.length, 2);
        const joined = room.players.find((p) => p.name === 'Player2');
        assert.ok(joined);
        assert.ok(joined.id);
      });

      it('trims whitespace from playerName', async function () {
        await Meteor.callAsync('rooms.join', testPin, '  Player2  ');
        const room = await RoomsCollection.findOneAsync({ pin: testPin });
        assert.ok(room.players.find((p) => p.name === 'Player2'));
      });
    });

    // ─── rooms.kick ──────────────────────────────────────────────────────────

    describe('rooms.kick', function () {
      let testPin;
      let nonHostPlayerId;

      beforeEach(async function () {
        ({ pin: testPin } = await Meteor.callAsync('rooms.create', 'Host'));
        await Meteor.callAsync('rooms.join', testPin, 'Player2');
        const room = await RoomsCollection.findOneAsync({ pin: testPin });
        nonHostPlayerId = room.players.find((p) => p.name === 'Player2').id;
      });

      it('throws on empty PIN', async function () {
        await assert.rejects(Meteor.callAsync('rooms.kick', '', nonHostPlayerId), (err) => err.error === 'invalid');
      });

      it('throws on empty playerId', async function () {
        await assert.rejects(Meteor.callAsync('rooms.kick', testPin, ''), (err) => err.error === 'invalid');
      });

      it('throws not-found for unknown PIN', async function () {
        await assert.rejects(
          Meteor.callAsync('rooms.kick', 'ZZZZZ', nonHostPlayerId),
          (err) => err.error === 'not-found'
        );
      });

      it('throws not-lobby when game is in progress', async function () {
        await RoomsCollection.updateAsync({ pin: testPin }, { $set: { status: 'in-progress' } });
        await assert.rejects(
          Meteor.callAsync('rooms.kick', testPin, nonHostPlayerId),
          (err) => err.error === 'not-lobby'
        );
      });

      it('throws when trying to kick the host', async function () {
        const room = await RoomsCollection.findOneAsync({ pin: testPin });
        const hostId = room.players.find((p) => p.name === 'Host').id;
        await assert.rejects(Meteor.callAsync('rooms.kick', testPin, hostId), (err) => err.error === 'invalid');
      });

      it('removes a non-host player from the room', async function () {
        await Meteor.callAsync('rooms.kick', testPin, nonHostPlayerId);
        const room = await RoomsCollection.findOneAsync({ pin: testPin });
        assert.strictEqual(room.players.length, 1);
        assert.ok(!room.players.find((p) => p.name === 'Player2'));
      });

      it('does not remove the host when kicking another player', async function () {
        await Meteor.callAsync('rooms.kick', testPin, nonHostPlayerId);
        const room = await RoomsCollection.findOneAsync({ pin: testPin });
        assert.ok(room.players.find((p) => p.name === 'Host'));
      });
    });
  });
}
