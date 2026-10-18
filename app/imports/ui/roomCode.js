const ROOM_CODE_CHARS = /[^A-Z0-9]/g;

export function normalizeRoomCode(value, maxLength) {
  return value.toUpperCase().replace(ROOM_CODE_CHARS, '').slice(0, maxLength);
}

export function roomCodeFromSearchParams(searchParams, key, maxLength) {
  return normalizeRoomCode(searchParams.get(key) || '', maxLength);
}

export function appendRoomCodeInput(currentCode, inputValue, maxLength) {
  return normalizeRoomCode(`${currentCode}${inputValue}`, maxLength);
}

export function clearCapturedInput(event) {
  event.target.value = '';
}

// The join page for a room, as an invite link uses it. An empty code opens plain code entry.
export function joinRoomPath(code) {
  return code ? `/play/join?code=${encodeURIComponent(code)}` : '/play/join';
}
