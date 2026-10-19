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

      it('returns selected game mode details to joining players', async function () {
        await Meteor.callAsync('rooms.setGameMode', testPin, 'easy');

        const result = await Meteor.callAsync('rooms.join', testPin, 'Player2');

        assert.strictEqual(result.gameMode, 'easy');
        assert.deepStrictEqual(result.customSettings, {
          flashingSpeed: 'slow',
          startingLives: 5,
          startingSequenceLength: 1,
          sequenceGrowth: 1,
        });
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

    // ─── host reconnect (D6) ─────────────────────────────────────────────────

    describe('host reconnect', function () {
      it('records the host on the room', async function () {
        const { pin, hostId } = await Meteor.callAsync('rooms.create', 'Alice');
        const room = await RoomsCollection.findOneAsync({ pin });
        assert.strictEqual(room.hostId, hostId);
        assert.strictEqual(room.players[0].id, hostId);
      });

      it('reports isHost for the host and not for a joiner', async function () {
        const { pin, hostId } = await Meteor.callAsync('rooms.create', 'Alice');
        const { playerId } = await Meteor.callAsync('rooms.join', pin, 'Bob');
        const host = await Meteor.callAsync('rooms.reconnect', pin, hostId);
        const joiner = await Meteor.callAsync('rooms.reconnect', pin, playerId);
        assert.deepStrictEqual(host, { playerName: 'Alice', isHost: true, playerId: hostId });
        assert.strictEqual(joiner.isHost, false);
      });

      it('never publishes hostId', async function () {
        const { pin } = await Meteor.callAsync('rooms.create', 'Alice');
        const cursor = Meteor.server.publish_handlers['rooms.lobby'].apply({ connection: { id: 'x' } }, [pin]);
        const [room] = await cursor.fetchAsync();
        assert.ok(!('hostId' in room));
      });

      it('knows the host of a room created before hostId was recorded, by name', async function () {
        const { pin, hostId } = await Meteor.callAsync('rooms.create', 'Alice');
        await RoomsCollection.updateAsync({ pin }, { $unset: { hostId: '' } });
        const host = await Meteor.callAsync('rooms.reconnect', pin, hostId);
        assert.strictEqual(host.isHost, true);
        await assert.rejects(Meteor.callAsync('rooms.kick', pin, hostId), (err) => err.error === 'invalid');
      });

      it('deletes the room when the host leaves the lobby', async function () {
        const { pin, hostId } = await Meteor.callAsync('rooms.create', 'Alice');
        await Meteor.callAsync('rooms.join', pin, 'Bob');
        await Meteor.callAsync('rooms.disconnect', pin, hostId);
        assert.strictEqual(await RoomsCollection.findOneAsync({ pin }), undefined);
      });
    });
  });
}
