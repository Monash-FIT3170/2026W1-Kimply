// Ownership for gameplay mutations. A server call with no connection is trusted, matching
// isCallerBound, so existing tests keep calling methods directly. A real connection must
// own the player. This is not a login wall.
import { Meteor } from 'meteor/meteor';
import { PlayersCollection } from './players';
import { isCallerBound } from './abilityRules';
import { sessionIdOf } from './browserSessions';
import { detectionEnabled } from './botDetection';

export async function boundPlayer(playerId, connection) {
  if (typeof playerId !== 'string' || !playerId) throw new Meteor.Error('invalid', 'Invalid player');
  const player = await PlayersCollection.findOneAsync(playerId);
  if (!player) throw new Meteor.Error('not-found', 'Player not found');
  if (!isCallerBound(player, connection?.id)) throw new Meteor.Error('not-yours', 'That is not your player');
  return player;
}

// Present connections must already have resumed a browser session. Server-side calls
// (tests, and methods invoking each other) have no connection and skip the requirement.
export function requireBrowserSession(connection) {
  if (!connection?.id) return null;
  const sessionId = sessionIdOf(connection);
  // Detection off means a local agent may keep the old call shape, with no browser session.
  if (!sessionId && detectionEnabled()) throw new Meteor.Error('no-session', 'Browser session required');
  return sessionId;
}
