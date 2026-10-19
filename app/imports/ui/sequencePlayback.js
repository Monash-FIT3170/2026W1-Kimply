// Which sequences this tab has already watched, and whether the board should play one now.

// Whether this tab has already watched a sequence, so a refresh skips straight to input.
// Per tab (sessionStorage), not per browser: two players in one browser must each watch
// their own. Keyed on the version too, so a Reroll or Scramble plays the new sequence.
const seqSeenKey = (gameId, roundId, version) => `seqSeen:${gameId}:${roundId}:${version}`;

export const hasSeenSequence = (gameId, roundId, version, storage = globalThis.sessionStorage) => {
  try {
    return Boolean(gameId && roundId && storage.getItem(seqSeenKey(gameId, roundId, version)));
  } catch {
    return false;
  }
};

export const markSequenceSeen = (gameId, roundId, version, storage = globalThis.sessionStorage) => {
  try {
    if (gameId && roundId) storage.setItem(seqSeenKey(gameId, roundId, version), '1');
  } catch {
    // Storage blocked: a refresh replays the sequence, which is harmless.
  }
};

// What the board does when its effect runs.
//   'wait'  there is no sequence to show yet
//   'play'  flash it
//   'skip'  show "your turn" without flashing it
//
// `requested` is true when this run was asked for: a new round or sequence, the Replay
// button, or a wrong answer. Those always play. Any other run is the sequence turning up
// after the board mounted (a refresh, a reconnect re-publishing it, the draft closing), and
// that must not replay a sequence the player has already watched, whichever order the
// subscriptions deliver in.
export function playbackDecision({ hasSequence, requested, autoPlay }) {
  if (!hasSequence) return 'wait';
  if (!requested && !autoPlay) return 'skip';
  return 'play';
}
