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
