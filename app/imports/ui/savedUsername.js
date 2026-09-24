// Remembers the last username a player used, so it is prefilled on the next visit.
// Storage can be missing or throw (private mode, blocked site data), in which case
// the player simply types their name again.

export const USERNAME_STORAGE_KEY = 'kimply.username';
export const USERNAME_MAX_LENGTH = 30;

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadUsername(storage = defaultStorage()) {
  try {
    const saved = storage?.getItem(USERNAME_STORAGE_KEY);
    return typeof saved === 'string' ? saved.trim().slice(0, USERNAME_MAX_LENGTH) : '';
  } catch {
    return '';
  }
}

export function saveUsername(name, storage = defaultStorage()) {
  const trimmed = String(name ?? '')
    .trim()
    .slice(0, USERNAME_MAX_LENGTH);
  if (!trimmed) return;
  try {
    storage?.setItem(USERNAME_STORAGE_KEY, trimmed);
  } catch {
    // Not being able to remember the name is not worth surfacing.
  }
}
