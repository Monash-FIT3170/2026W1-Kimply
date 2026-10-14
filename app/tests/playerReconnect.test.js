import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import '../imports/api/gameMethods';
import '../imports/api/browserSessions';
import { PlayersCollection } from '../imports/api/players';
import { RoomsCollection } from '../imports/api/rooms';
import { RoundsCollection } from '../imports/api/rounds';
import '../server/publications';

if (Meteor.isServer) {
  describe('player reconnect ownership', function () {
    const token = 'a'.repeat(43);
    let roundId;
    let playerId;
    const callAs = (connectionId, method, ...args) =>
      Meteor.server.method_handlers[method].apply({ connection: { id: connectionId } }, args);

    // Every connection here shares one browser session: another tab of the same browser,
    // or a script holding its browser token. The session check (#142) cannot tell them
    // apart, so these tests exercise the per-tab reconnect credential on its own.
    const CONNECTIONS = ['owner', 'attacker', 'new-owner'];

    beforeEach(async function () {
      const { token: browserToken } = await callAs('owner', 'browserSessions.resume', null);
      for (const id of CONNECTIONS.slice(1)) await callAs(id, 'browserSessions.resume', browserToken);
      await PlayersCollection.removeAsync({});
      await RoomsCollection.removeAsync({});
      await RoundsCollection.removeAsync({});
      await RoomsCollection.insertAsync({
        pin: 'RCN01',
        players: [{ id: 'lobby-owner', name: 'Owner', connectionId: 'owner' }],
      });
      roundId = await RoundsCollection.insertAsync({ gameId: 'RCN01', sequence: ['red'], advanced: false });
      playerId = await callAs('owner', 'players.join', roundId, 'Owner', 'RCN01', 'lobby-owner', false, null, token);
    });

    it('rejects rebinding with a public player ID alone or the wrong credential', async function () {
      await assert.rejects(callAs('attacker', 'players.rebind', playerId), (e) => e.error === 'not-yours');
      await assert.rejects(
        callAs('attacker', 'players.rebind', playerId, 'b'.repeat(43)),
        (e) => e.error === 'not-yours'
      );
      assert.strictEqual((await PlayersCollection.findOneAsync(playerId)).connectionId, 'owner');
    });

    it('still refuses the right credential from a different browser session', async function () {
      await callAs('other-browser', 'browserSessions.resume', null);
      await assert.rejects(callAs('other-browser', 'players.rebind', playerId, token), (e) => e.error === 'not-yours');
      assert.strictEqual((await PlayersCollection.findOneAsync(playerId)).connectionId, 'owner');
    });

    it('rebinds with the credential without resetting game state', async function () {
      await PlayersCollection.updateAsync(playerId, { $set: { lives: 1, connected: false } });
      await callAs('new-owner', 'players.rebind', playerId, token);
      const player = await PlayersCollection.findOneAsync(playerId);
      assert.strictEqual(player.connectionId, 'new-owner');
      assert.strictEqual(player.connected, true);
      assert.strictEqual(player.lives, 1);
    });

    it('requires the same credential when players.join finds an existing lobby player', async function () {
      const args = [roundId, 'Owner', 'RCN01', 'lobby-owner', false, null];
      await assert.rejects(callAs('attacker', 'players.join', ...args), (e) => e.error === 'not-yours');
      await assert.rejects(callAs('attacker', 'players.join', ...args, 'b'.repeat(43)), (e) => e.error === 'not-yours');
      const resumedId = await callAs('new-owner', 'players.join', ...args, token);
      assert.strictEqual(resumedId, playerId);
      assert.strictEqual(await PlayersCollection.find({ gameId: 'RCN01' }).countAsync(), 1);
    });

    it('checks lobby ownership on the first join', async function () {
      await PlayersCollection.removeAsync(playerId);
      await assert.rejects(
        callAs('attacker', 'players.join', roundId, 'Owner', 'RCN01', 'lobby-owner', false, null, token),
        (e) => e.error === 'not-yours'
      );
    });

    it('does not let a new connection enroll a credential on a legacy player', async function () {
      await PlayersCollection.updateAsync(playerId, { $unset: { reconnectTokenHash: '' } });
      await assert.rejects(callAs('attacker', 'players.rebind', playerId, token), (e) => e.error === 'not-yours');
      await callAs('owner', 'players.rebind', playerId, token);
      await callAs('new-owner', 'players.rebind', playerId, token);
      assert.strictEqual((await PlayersCollection.findOneAsync(playerId)).connectionId, 'new-owner');
    });

    it('rejects borrowing a round from a different game', async function () {
      const foreign = await RoundsCollection.insertAsync({ gameId: 'OTHER', sequence: ['blue'] });
      await assert.rejects(
        callAs('owner', 'players.join', foreign, 'Owner', 'RCN01', 'lobby-owner', false, null, token),
        (e) => e.error === 'invalid-game'
      );
    });

    it('derives an omitted lobby ID only from the caller connection', async function () {
      await PlayersCollection.removeAsync(playerId);
      await assert.rejects(
        callAs('attacker', 'players.join', roundId, 'Owner', 'RCN01', null, false, null, token),
        (e) => e.error === 'not-yours'
      );
      const id = await callAs('owner', 'players.join', roundId, 'Owner', 'RCN01', null, false, null, token);
      assert.strictEqual((await PlayersCollection.findOneAsync(id)).lobbyPlayerId, 'lobby-owner');
    });

    it('never publishes the reconnect credential hash', async function () {
      const player = await PlayersCollection.findOneAsync(playerId);
      assert.strictEqual(typeof player.reconnectTokenHash, 'string');
      assert.notStrictEqual(player.reconnectTokenHash, token);
      await PlayersCollection.updateAsync(playerId, { $set: { eliminated: true, eliminatedAt: new Date() } });
      for (const name of ['players', 'eliminations', 'players.secret']) {
        const cursor = Meteor.server.publish_handlers[name].apply({ connection: { id: 'owner' } }, ['RCN01']);
        const [doc] = await cursor.fetchAsync();
        assert.ok(!('reconnectTokenHash' in doc), name);
      }
    });
  });
}
