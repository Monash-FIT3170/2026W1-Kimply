const ROOM_CODE_CHARS = /[^A-Z0-9]/g;

export function normalizeRoomCode(value, maxLength) {
  return value.toUpperCase().replace(ROOM_CODE_CHARS, '').slice(0, maxLength);
}

export function roomCodeFromSearchParams(searchParams, key, maxLength) {
  return normalizeRoomCode(searchParams.get(key) || '', maxLength);
}

// What to write back into the hidden input after it changed, or null to leave it alone.
// The input holds the whole code and is never cleared: a keyboard with predictive text keeps
// the word it is composing in its own buffer, and emptying the field behind its back makes
// it resend that buffer, so letters duplicate. Writing to the field mid-composition does the
// same, so tidy it (stray spaces, lower case, extra characters) only once composing ends.
export function roomCodeInputWriteBack(rawValue, normalized, composing) {
  if (composing || rawValue === normalized) return null;
  return normalized;
}

// The link that takes a player to the join page with the room code filled in. The copy
// button and the QR code both carry it, so a scan lands where a pasted link does.
export function inviteLink(origin, pin) {
  return `${origin}/play/join?code=${encodeURIComponent(pin)}`;
}
