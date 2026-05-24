import { Meteor } from 'meteor/meteor';
import assert from 'assert';
import { RoomsCollection } from '/imports/api/rooms';

if (Meteor.isServer) {
  describe('rooms API', function () {
    beforeEach(async function () {
      await RoomsCollection.removeAsync({});
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
