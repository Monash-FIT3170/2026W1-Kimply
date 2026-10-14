// Anonymous browser session. The client keeps the token in localStorage; the server
// stores only its SHA-256 and binds the session to the DDP connection that resumed it.
// A copy of the database cannot replay a session, and the token is never published.
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { createHash } from 'node:crypto';

if (!global._BrowserSessionsCollection) {
  global._BrowserSessionsCollection = new Mongo.Collection('browserSessions');
}
export const BrowserSessionsCollection = global._BrowserSessionsCollection;

if (!global._browserSessionBindings) global._browserSessionBindings = new Map();

export function hashBrowserToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionIdOf(connection) {
  if (!connection?.id) return null;
  return global._browserSessionBindings.get(connection.id) ?? null;
}

export function bindSession(connection, sessionId) {
  if (!connection?.id || !sessionId) return;
  global._browserSessionBindings.set(connection.id, sessionId);
}

// Called when the DDP connection closes, and by tests that simulate that close.
export function releaseConnection(connectionId) {
  if (connectionId) global._browserSessionBindings.delete(connectionId);
}

if (Meteor.isServer && !global._browserSessionsInitialized) {
  global._browserSessionsInitialized = true;

  Meteor.onConnection((connection) => {
    connection.onClose(() => releaseConnection(connection.id));
  });

  Meteor.methods({
    // Missing or unknown tokens mint a new session. The returned token is the only
    // copy; subsequent calls on this connection see it through sessionIdOf.
    async 'browserSessions.resume'(token) {
      if (!this.connection?.id) throw new Meteor.Error('no-connection', 'Browser session requires a connection');
      const now = new Date();
      if (typeof token === 'string' && token.length >= 16) {
        const existing = await BrowserSessionsCollection.findOneAsync({ tokenHash: hashBrowserToken(token) });
        if (existing) {
          await BrowserSessionsCollection.updateAsync(existing._id, { $set: { lastSeenAt: now } });
          bindSession(this.connection, existing._id);
          return { token };
        }
      }
      const fresh = Random.secret();
      const id = await BrowserSessionsCollection.insertAsync({
        tokenHash: hashBrowserToken(fresh),
        createdAt: now,
        lastSeenAt: now,
      });
      bindSession(this.connection, id);
      return { token: fresh };
    },
  });
}
