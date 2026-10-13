import { Random } from 'meteor/random';

// Each tab owns its credential. Keep it in memory too when storage is blocked,
// so a brief DDP reconnect still works during that page's lifetime.
const tokens = new Map();

export function gameReconnectToken(gameId, lobbyPlayerId) {
  const key = `kimply.gameReconnect:${gameId}:${lobbyPlayerId || 'direct'}`;
  if (tokens.has(key)) return tokens.get(key);
  let token;
  try {
    token = sessionStorage.getItem(key);
  } catch {
    // Browser storage is optional for playing.
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) token = Random.secret(43);
  tokens.set(key, token);
  try {
    sessionStorage.setItem(key, token);
  } catch {
    // The in-memory credential still handles network reconnects.
  }
  return token;
}

export function forgetGameReconnectToken(gameId, lobbyPlayerId) {
  const key = `kimply.gameReconnect:${gameId}:${lobbyPlayerId || 'direct'}`;
  tokens.delete(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Storage may be unavailable.
  }
}
