// Room-scoped blocks. Session blocks last until the room document expires. IP bans
// carry expiresAt and stop applying at that instant, whether or not anything deletes them.
// Neither structure is in a publication.
import { Meteor } from 'meteor/meteor';
import { RoomsCollection } from './rooms';
import { PlayersCollection } from './players';
import { LeaderboardCollection } from './leaderboard';
import { RoundsCollection } from './rounds';
import { sessionIdOf } from './browserSessions';
import { addressOf } from './clientAddress';
import { detectionEnabled } from './botDetection';
import { checkWinner, advanceRoundIfReady } from './gameEngine';
import { ROOM_IP_BAN_MS } from '../constants';

function atMillis(value) {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : NaN;
}

// boundAt, when passed, exempts a player who was already in the room before this ban
// was written. Entry checks omit it, so a new session at the banned address is refused.
export function activeBan(room, { sessionId = null, address = null, now = new Date(), boundAt = undefined } = {}) {
  const security = room?.security;
  if (!security) return null;
  const nowMs = atMillis(now);
  if (sessionId && Array.isArray(security.blockedSessionIds) && security.blockedSessionIds.includes(sessionId)) {
    return { reason: 'session' };
  }
  if (!address || !Array.isArray(security.ipBans)) return null;
  const ban = security.ipBans.find((entry) => entry?.address === address && atMillis(entry.expiresAt) > nowMs);
  if (!ban) return null;
  if (boundAt !== undefined && boundAt !== null && atMillis(boundAt) < atMillis(ban.createdAt)) return null;
  return { reason: 'address', expiresAt: ban.expiresAt };
}

function bannedError(ban) {
  const message =
    ban.reason === 'address' ? 'This network is blocked from this room' : 'This browser is blocked from this room';
  return new Meteor.Error('banned', message, {
    reason: ban.reason,
    expiresAt: ban.expiresAt ? new Date(ban.expiresAt) : null,
  });
}

async function roomByPin(pin) {
  if (typeof pin !== 'string' || !pin) return null;
  return RoomsCollection.findOneAsync({ pin });
}

export async function assertEntryAllowed(pin, connection) {
  if (!detectionEnabled()) return;
  const room = await roomByPin(pin);
  if (!room) return;
  const ban = activeBan(room, {
    sessionId: sessionIdOf(connection),
    address: addressOf(connection),
    now: new Date(),
  });
  if (ban) throw bannedError(ban);
}

// Session blocks always apply. An IP ban applies only when this player was bound at or
// after the ban, so someone already playing from a shared address stays on their
// current connection and is refused on the next join, reconnect, or rebind.
export async function assertPlayAllowed(player, connection) {
  if (!detectionEnabled() || !player?.gameId) return;
  const room = await roomByPin(player.gameId);
  if (!room) return;
  const sessionHit = activeBan(room, { sessionId: sessionIdOf(connection), now: new Date() });
  if (sessionHit) throw bannedError(sessionHit);
  const addressHit = activeBan(room, {
    address: addressOf(connection),
    now: new Date(),
    boundAt: player.guard?.boundAt ?? null,
  });
  if (addressHit) throw bannedError(addressHit);
}

// Writes the blocks first, then drops the player from the lobby, the game, and the
// leaderboard. Winner selection and round advancement run immediately, with no
// disconnect grace. Logs the reason and ids only.
export async function removeDetectedPlayer(player, connection, reason) {
  const sessionId = sessionIdOf(connection) || player.guard?.browserSessionId || null;
  const address = addressOf(connection);
  const now = new Date();
  const update = {};
  if (sessionId) update.$addToSet = { 'security.blockedSessionIds': sessionId };
  if (address) {
    update.$push = {
      'security.ipBans': {
        address,
        expiresAt: new Date(now.getTime() + ROOM_IP_BAN_MS),
        createdAt: now,
      },
    };
  } else {
    console.warn(`[bot-detection] missing client address gameId=${player.gameId} playerId=${player._id}`);
  }
  if (Object.keys(update).length) {
    await RoomsCollection.updateAsync({ pin: player.gameId }, update);
  }

  await PlayersCollection.removeAsync(player._id);
  await LeaderboardCollection.removeAsync({ gameId: player.gameId, playerId: player._id });
  if (player.lobbyPlayerId) {
    await RoomsCollection.updateAsync({ pin: player.gameId }, { $pull: { players: { id: player.lobbyPlayerId } } });
  }

  await checkWinner(player.gameId, player.isBattleRoyale ?? false);
  const round = await RoundsCollection.findOneAsync(player.roundId);
  if (round) await advanceRoundIfReady(round);

  console.info(`[bot-detection] removed gameId=${player.gameId} playerId=${player._id} reason=${reason}`);
  return { expiresAt: address ? new Date(now.getTime() + ROOM_IP_BAN_MS) : null };
}
