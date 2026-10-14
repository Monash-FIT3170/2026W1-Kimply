import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import {
  BrowserSessionsCollection,
  bindSession,
  hashBrowserToken,
  releaseConnection,
  sessionIdOf,
} from '../imports/api/browserSessions';

function callAs(connection, name, ...args) {
  const handler = Meteor.server.method_handlers[name];
  assert.ok(handler, name);
  return handler.apply({ connection, userId: null, unblock() {} }, args);
}

if (Meteor.isServer) {
  describe('browser sessions', function () {
    beforeEach(async function () {
      await BrowserSessionsCollection.removeAsync({});
    });

    it('stores a hash, resumes the same token, and replaces an unknown one', async function () {
      const connection = { id: 'conn-session', clientAddress: '203.0.113.4' };
      const created = await callAs(connection, 'browserSessions.resume', null);
      assert.strictEqual(typeof created.token, 'string');
      const stored = await BrowserSessionsCollection.findOneAsync({});
      assert.strictEqual(stored.tokenHash, hashBrowserToken(created.token));
      assert.ok(!('token' in stored));
      assert.strictEqual(sessionIdOf(connection), stored._id);

      const again = await callAs(connection, 'browserSessions.resume', created.token);
      assert.strictEqual(again.token, created.token);
      assert.strictEqual(await BrowserSessionsCollection.find().countAsync(), 1);

      const other = { id: 'conn-other', clientAddress: '203.0.113.4' };
      const minted = await callAs(other, 'browserSessions.resume', 'not-a-real-token-value');
      assert.notStrictEqual(minted.token, created.token);
      assert.strictEqual(await BrowserSessionsCollection.find().countAsync(), 2);
      assert.strictEqual(sessionIdOf(other) === sessionIdOf(connection), false);
    });

    it('drops the binding when the connection closes', function () {
      const connection = { id: 'conn-close' };
      bindSession(connection, 'session-1');
      assert.strictEqual(sessionIdOf(connection), 'session-1');
      releaseConnection(connection.id);
      assert.strictEqual(sessionIdOf(connection), null);
    });
  });
}
