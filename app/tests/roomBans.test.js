import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { RoomsCollection } from '../imports/api/rooms';
import { RoundsCollection } from '../imports/api/rounds';
import { PlayersCollection } from '../imports/api/players';
import { LeaderboardCollection } from '../imports/api/leaderboard';
import { activeBan } from '../imports/api/roomBans';
import { sessionIdOf } from '../imports/api/browserSessions';
import { ROOM_IP_BAN_MS } from '../imports/constants';
import '../imports/api/gameMethods';

function callAs(connection, name, ...args) {
  const handler = Meteor.server.method_handlers[name];
  assert.ok(handler, name);
  return handler.apply({ connection, userId: null, unblock() {} }, args);
}

function fastOffsets(length) {
  return Array.from({ length }, (_, index) => index * 20);
}

async function resume(connection) {
  await callAs(connection, 'browserSessions.resume', null);
  return sessionIdOf(connection);
}

async function playingPair(address = '203.0.113.10') {
  const pin = Random.id().slice(0, 5).toUpperCase();
  const connection = { id: `conn-${pin}`, clientAddress: address };
  const sessionId = await resume(connection);
  const roundId = await RoundsCollection.insertAsync({
    gameId: pin,
    sequence: ['blue', 'blue', 'blue', 'blue'],
    lengthOfSequence: 4,
    level: 4,
    roundNumber: 1,
    advanced: false,
    isCurrent: true,
    createdAt: new Date(),
  });
  await RoomsCollection.insertAsync({
    pin,
    status: 'in_progress',
    hostName: 'Host',
    gameName: `Game${pin}`,
    createdAt: new Date(),
    players: [
      { id: 'lobby-host', name: 'Host', connected: true },
      { id: 'lobby-bot', name: 'Bot', connected: true, browserSessionId: sessionId },
    ],
  });
  const playerId = await PlayersCollection.insertAsync({
    gameId: pin,
    roundId,
    lobbyPlayerId: 'lobby-bot',
    name: 'Bot',
    lives: 6,
    connectionId: connection.id,
    connected: true,
    eliminated: false,
    completeRound: false,
    winner: false,
    gameFinished: false,
    isBattleRoyale: false,
    currentStreak: 0,
    longestStreak: 0,
    secret: { sequence: { roundId, colours: ['blue', 'blue', 'blue', 'blue'], version: 1 }, hand: [] },
    guard: { browserSessionId: sessionId, boundAt: new Date(Date.now() - 60_000), botStrikes: 0, attempt: null },
  });
  await PlayersCollection.insertAsync({
    gameId: pin,
    roundId,
    lobbyPlayerId: 'lobby-host',
    name: 'Host',
    lives: 3,
    connectionId: 'conn-host',
    connected: true,
    eliminated: false,
    completeRound: false,
    winner: false,
    gameFinished: false,
    isBattleRoyale: false,
    secret: { sequence: { roundId, colours: ['blue', 'blue', 'blue', 'blue'], version: 1 }, hand: [] },
  });
  return { pin, roundId, connection, sessionId, playerId };
}

async function submitFast(ctx) {
  const started = await callAs(ctx.connection, 'players.startAttempt', ctx.playerId, ctx.roundId);
  return callAs(ctx.connection, 'players.submitSequence', ctx.playerId, ['red', 'red', 'red', 'red'], {
    attemptId: started.attemptId,
    roundId: ctx.roundId,
    offsets: fastOffsets(4),
  });
}

if (Meteor.isServer) {
  describe('room bans and attempt checks', function () {
    beforeEach(async function () {
      await RoomsCollection.removeAsync({});
      await RoundsCollection.removeAsync({});
      await PlayersCollection.removeAsync({});
      await LeaderboardCollection.removeAsync({});
      delete process.env.BOT_DETECTION_ENABLED;
    });

    it('treats an IP ban as active until the exact expiresAt', function () {
      const expiresAt = new Date('2026-10-12T03:15:00.000Z');
      const createdAt = new Date('2026-10-12T03:00:00.000Z');
      const room = { security: { ipBans: [{ address: '203.0.113.5', expiresAt, createdAt }] } };
      assert.strictEqual(
        activeBan(room, { address: '203.0.113.5', now: new Date(expiresAt.getTime() - 1) }).reason,
        'address'
      );
      assert.strictEqual(activeBan(room, { address: '203.0.113.5', now: expiresAt }), null);
      assert.strictEqual(
        activeBan(room, {
          address: '203.0.113.5',
          now: new Date(expiresAt.getTime() - 1),
          boundAt: new Date(createdAt.getTime() - 1),
        }),
        null
      );
    });

    it('removes on the third fast attempt, resets on a normal one, and does not award it', async function () {
      const ctx = await playingPair();
      await LeaderboardCollection.insertAsync({
        gameId: ctx.pin,
        playerId: ctx.playerId,
        name: 'Bot',
        lives: 3,
        roundId: ctx.roundId,
        completedAt: new Date(),
      });

      await submitFast(ctx);
      await submitFast(ctx);
      let player = await PlayersCollection.findOneAsync(ctx.playerId);
      assert.strictEqual(player.guard.botStrikes, 2);

      const started = await callAs(ctx.connection, 'players.startAttempt', ctx.playerId, ctx.roundId);
      await callAs(ctx.connection, 'players.submitSequence', ctx.playerId, ['red', 'red', 'red', 'red'], {
        attemptId: started.attemptId,
        roundId: ctx.roundId,
        offsets: [0, 400, 900, 1500],
      });
      player = await PlayersCollection.findOneAsync(ctx.playerId);
      assert.strictEqual(player.guard.botStrikes, 0);

      await submitFast(ctx);
      await submitFast(ctx);
      await assert.rejects(submitFast(ctx), (error) => error.error === 'removed-automation');

      assert.strictEqual(await PlayersCollection.findOneAsync(ctx.playerId), undefined);
      assert.strictEqual(await LeaderboardCollection.find({ playerId: ctx.playerId }).countAsync(), 0);
      const room = await RoomsCollection.findOneAsync({ pin: ctx.pin });
      assert.ok(room.security.blockedSessionIds.includes(ctx.sessionId));
      assert.strictEqual(room.security.ipBans[0].address, '203.0.113.10');
      assert.ok(room.security.ipBans[0].expiresAt.getTime() - Date.now() <= ROOM_IP_BAN_MS);
      assert.ok(!room.players.some((member) => member.id === 'lobby-bot'));
      const host = await PlayersCollection.findOneAsync({ gameId: ctx.pin, name: 'Host' });
      assert.strictEqual(host.winner, true);
      assert.ok(host);
    });

    it('rejects a malformed, duplicate, stale, or mismatched attempt before grading', async function () {
      const ctx = await playingPair();
      const started = await callAs(ctx.connection, 'players.startAttempt', ctx.playerId, ctx.roundId);
      const good = {
        attemptId: started.attemptId,
        roundId: ctx.roundId,
        offsets: [0, 300, 700, 1200],
      };

      await assert.rejects(
        callAs(ctx.connection, 'players.submitSequence', ctx.playerId, ['nope'], good),
        (error) => error.error === 'invalid-attempt'
      );
      await assert.rejects(
        callAs(ctx.connection, 'players.submitSequence', ctx.playerId, ['red', 'red', 'red', 'red'], {
          ...good,
          roundId: 'other-round',
        }),
        (error) => error.error === 'stale-attempt'
      );
      await assert.rejects(
        callAs(ctx.connection, 'players.submitSequence', ctx.playerId, ['red', 'red', 'red', 'red'], {
          ...good,
          attemptId: 'not-the-open-attempt',
        }),
        (error) => error.error === 'stale-attempt'
      );

      const stranger = { id: 'conn-stranger', clientAddress: '198.51.100.4' };
      await resume(stranger);
      await assert.rejects(
        callAs(stranger, 'players.submitSequence', ctx.playerId, ['red', 'red', 'red', 'red'], good),
        (error) => error.error === 'not-yours'
      );

      const first = callAs(ctx.connection, 'players.submitSequence', ctx.playerId, ['red', 'red', 'red', 'red'], good);
      const second = callAs(ctx.connection, 'players.submitSequence', ctx.playerId, ['red', 'red', 'red', 'red'], good);
      const results = await Promise.allSettled([first, second]);
      const rejected = results.filter((result) => result.status === 'rejected');
      assert.strictEqual(rejected.length, 1);
      assert.strictEqual(rejected[0].reason.error, 'duplicate-attempt');
      const graded = await PlayersCollection.findOneAsync(ctx.playerId);
      assert.strictEqual(graded.lives, 5);
    });

    it('blocks a new session at the banned address and still allows another room or address', async function () {
      const ctx = await playingPair('203.0.113.40');
      await submitFast(ctx);
      await submitFast(ctx);
      await assert.rejects(submitFast(ctx), (error) => error.error === 'removed-automation');

      const fresh = { id: 'conn-fresh', clientAddress: '203.0.113.40' };
      await resume(fresh);
      await assert.rejects(callAs(fresh, 'rooms.join', ctx.pin, 'Newbie', null), (error) => {
        assert.strictEqual(error.error, 'banned');
        assert.strictEqual(error.details.reason, 'address');
        assert.ok(error.details.expiresAt);
        return true;
      });

      const elsewhere = { id: 'conn-else', clientAddress: '198.51.100.20' };
      await resume(elsewhere);
      const otherRoom = await callAs(elsewhere, 'rooms.create', 'Elsewhere');
      const joined = await callAs(fresh, 'rooms.join', otherRoom.pin, 'Newbie', null);
      assert.strictEqual(joined.roomId, otherRoom.pin);

      const differentAddress = { id: 'conn-different', clientAddress: '198.51.100.77' };
      await resume(differentAddress);
      await RoomsCollection.updateAsync({ pin: ctx.pin }, { $set: { status: 'lobby' } });
      const back = await callAs(differentAddress, 'rooms.join', ctx.pin, 'OtherNet', null);
      assert.strictEqual(back.roomId, ctx.pin);
    });

    it('lets an existing shared-address player continue, and refuses their rebind', async function () {
      const ctx = await playingPair('203.0.113.50');
      const roomBefore = await RoomsCollection.findOneAsync({ pin: ctx.pin });
      const innocent = { id: 'conn-innocent', clientAddress: '203.0.113.50' };
      const resumed = await callAs(innocent, 'browserSessions.resume', null);
      const innocentSession = sessionIdOf(innocent);
      const innocentId = await PlayersCollection.insertAsync({
        gameId: ctx.pin,
        roundId: ctx.roundId,
        lobbyPlayerId: 'lobby-innocent',
        name: 'Innocent',
        lives: 3,
        connectionId: innocent.id,
        connected: true,
        eliminated: false,
        completeRound: false,
        winner: false,
        gameFinished: false,
        secret: { sequence: { roundId: ctx.roundId, colours: ['blue', 'blue', 'blue', 'blue'], version: 1 }, hand: [] },
        guard: {
          browserSessionId: innocentSession,
          boundAt: new Date(roomBefore.createdAt.getTime() - 1000),
          botStrikes: 0,
          attempt: null,
        },
      });
      await RoomsCollection.updateAsync(
        { pin: ctx.pin },
        { $push: { players: { id: 'lobby-innocent', name: 'Innocent' } } }
      );

      await submitFast(ctx);
      await submitFast(ctx);
      await assert.rejects(submitFast(ctx), (error) => error.error === 'removed-automation');

      const started = await callAs(innocent, 'players.startAttempt', innocentId, ctx.roundId);
      const graded = await callAs(innocent, 'players.submitSequence', innocentId, ['red', 'red', 'red', 'red'], {
        attemptId: started.attemptId,
        roundId: ctx.roundId,
        offsets: [0, 400, 900, 1500],
      });
      assert.strictEqual(graded.success, false);

      const rebound = { id: 'conn-rebind', clientAddress: '203.0.113.50' };
      await callAs(rebound, 'browserSessions.resume', resumed.token);
      await assert.rejects(callAs(rebound, 'players.rebind', innocentId), (error) => error.error === 'banned');
      const stillThere = await PlayersCollection.findOneAsync(innocentId);
      assert.strictEqual(stillThere.connectionId, innocent.id);
    });

    it('advances a finished round without waiting out the disconnect grace', async function () {
      const ctx = await playingPair('203.0.113.70');
      await PlayersCollection.updateAsync({ gameId: ctx.pin, name: 'Host' }, { $set: { completeRound: true } });
      const otherId = await PlayersCollection.insertAsync({
        gameId: ctx.pin,
        roundId: ctx.roundId,
        lobbyPlayerId: 'lobby-other',
        name: 'Other',
        lives: 3,
        connectionId: 'conn-other',
        connected: true,
        eliminated: false,
        completeRound: true,
        winner: false,
        gameFinished: false,
        secret: { sequence: { roundId: ctx.roundId, colours: ['blue', 'blue', 'blue', 'blue'], version: 1 }, hand: [] },
      });
      await RoomsCollection.updateAsync({ pin: ctx.pin }, { $push: { players: { id: 'lobby-other', name: 'Other' } } });

      await submitFast(ctx);
      await submitFast(ctx);
      await assert.rejects(submitFast(ctx), (error) => error.error === 'removed-automation');

      const round = await RoundsCollection.findOneAsync(ctx.roundId);
      assert.strictEqual(round.advanced, true);
      const other = await PlayersCollection.findOneAsync(otherId);
      assert.notStrictEqual(other.roundId, ctx.roundId);
      assert.strictEqual(other.winner, false);
    });

    it('blocks the browser session when the connection has no address, and stores no placeholder ban', async function () {
      const ctx = await playingPair();
      ctx.connection.clientAddress = undefined;
      await submitFast(ctx);
      await submitFast(ctx);
      await assert.rejects(submitFast(ctx), (error) => error.error === 'removed-automation');
      const room = await RoomsCollection.findOneAsync({ pin: ctx.pin });
      assert.ok(room.security.blockedSessionIds.includes(ctx.sessionId));
      assert.ok(!room.security.ipBans);
      const again = await RoomsCollection.findOneAsync({ pin: ctx.pin });
      assert.deepStrictEqual(again.security.blockedSessionIds, room.security.blockedSessionIds);
    });

    it('does not detect or enforce bans when disabled in development', async function () {
      process.env.BOT_DETECTION_ENABLED = 'false';
      const ctx = await playingPair('203.0.113.60');
      await submitFast(ctx);
      await submitFast(ctx);
      await submitFast(ctx);
      const player = await PlayersCollection.findOneAsync(ctx.playerId);
      assert.ok(player);
      assert.strictEqual(player.guard?.botStrikes ?? 0, 0);

      await RoomsCollection.updateAsync(
        { pin: ctx.pin },
        {
          $set: {
            status: 'lobby',
            security: {
              blockedSessionIds: [ctx.sessionId],
              ipBans: [{ address: '203.0.113.60', expiresAt: new Date(Date.now() + 60_000), createdAt: new Date() }],
            },
          },
        }
      );
      const joined = await callAs(ctx.connection, 'rooms.join', ctx.pin, 'StillHere', null);
      assert.strictEqual(joined.roomId, ctx.pin);
    });
  });
}
