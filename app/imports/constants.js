// Central place for tunable game/config constants. Pure module (no imports),
// safe on client and server. Values are unchanged from where they were inlined.

// --- Gameplay ---
export const DEFAULT_STARTING_LIVES = 3;
export const DEFAULT_SEQUENCE_LENGTH = 4;
export const INITIAL_LEVEL = 4; // starting currentLevel (level 1 == sequence length 4)
export const BONUS_LIFE_ROUND = 7; // completing this round grants +1 life
export const STREAK_BONUS_LIFE_THRESHOLD = 3; // a life for every N correct rounds in a row (capped at starting lives outside battle royale)
export const ROUND_TIMER_SECONDS = 50; // whole-round countdown (not battle royale)
// Round 1's clock starts when the last lobby member has joined, or this long after the round
// is created if someone has not, whichever comes first.
export const ROUND_START_FALLBACK_MS = 5000;
// The server accepts an answer this long past deadlineAt (one round trip, plus clock skew)
// before it eliminates whoever has not cleared the round.
export const ROUND_EXPIRE_GRACE_MS = 2000;
export const ROUND_SWEEP_INTERVAL_MS = 5000; // how often the server looks for rounds whose timer was lost
export const ROUND_EXPIRE_LEASE_MS = 10000; // how long one expireRound call owns a round before another may retry
export const STARTING_REPLAYS = 1; // sequence replays each player starts with (not battle royale)
export const REPLAY_BONUS_STREAK = 2; // +1 replay every time the streak reaches a multiple of this
export const SEQUENCE_COLOURS = ['red', 'blue', 'green', 'yellow'];

// --- Abilities ---
export const DRAFT_SECONDS = 20; // how long the pick-1-of-3 draft stays open before a round
export const ABILITY_CARDS_OFFERED = 3;
// Relative odds of each card being dealt. Free Pass and Jump are kept until used, so they are rare.
// The live feed keeps a game's ability events for its whole length; this only bounds a
// pathological game so one subscription can not grow without limit.
export const FEED_EVENT_LIMIT = 500;
export const ABILITY_WEIGHTS = {
  steal: 3,
  strike: 3,
  shield: 3,
  reroll: 3,
  scramble: 2,
  slowMo: 2,
  fastForward: 2,
  lightsOut: 2,
  freePass: 1,
  jump: 1,
};

// --- Rooms ---
export const PIN_LENGTH = 5;
export const PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DISCONNECT_GRACE_MS = 15000; // remove a disconnected player after this

// --- Bot detection ---
// A flagged attempt has at least this many colours, every gap under BOT_MAX_INTERVAL_MS,
// and those gaps within BOT_MAX_SPREAD_MS of each other. The server clock must agree.
export const BOT_MIN_COLOURS = 4;
export const BOT_MAX_INTERVAL_MS = 60;
export const BOT_MAX_SPREAD_MS = 5;
export const BOT_STRIKES_TO_REMOVE = 3;
// How far the server's observed duration may run past the client's last offset and still
// count as the same speed. Covers one round trip; a forged fast trace on a slow attempt does not fit.
export const BOT_SERVER_SLACK_MS = 500;
export const ROOM_IP_BAN_MS = 15 * 60 * 1000;
export const BROWSER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

// Game-mode presets, copied into room.customSettings on selection.
export const GAME_MODE_PRESETS = {
  default: { flashingSpeed: 'medium', startingLives: 3, startingSequenceLength: 4, sequenceGrowth: 1 },
  easy: { flashingSpeed: 'slow', startingLives: 5, startingSequenceLength: 1, sequenceGrowth: 1 },
  medium: { flashingSpeed: 'medium', startingLives: 3, startingSequenceLength: 3, sequenceGrowth: 1 },
  hard: { flashingSpeed: 'fast', startingLives: 1, startingSequenceLength: 3, sequenceGrowth: 1 },
  custom: { flashingSpeed: 'medium', startingLives: 3, startingSequenceLength: 4, sequenceGrowth: 1 },
  battle_royale: { flashingSpeed: 'medium', startingLives: 1, startingSequenceLength: 4, sequenceGrowth: 1 },
};

// Sequence playback speeds, in ms.
export const FLASH_SPEEDS = {
  slow: { flash: 900, gap: 350 },
  medium: { flash: 600, gap: 250 },
  fast: { flash: 350, gap: 150 },
};

// Slo-Mo and 2x Speed scale the room's playback speed. The floor keeps a 2x Speed in a
// fast room something a person can still see.
export const PLAYBACK_SPEED_FACTORS = { slow: 2, fast: 0.5 };
export const MIN_FLASH_MS = 160;
export const MIN_GAP_MS = 70;
// Lights Out darkens one flash in every LIGHTS_OUT_EVERY, rounded down, never the first.
export const LIGHTS_OUT_EVERY = 3;
// The longest the board takes to fade to dark before a hidden flash, and back after it.
export const LIGHTS_OUT_FADE_MS = 150;

// --- Accounts ---
export const MIN_PASSWORD_LENGTH = 8;

// --- Leaderboard ---
export const GLOBAL_LEADERBOARD_SIZE = 50;

// --- UI durations (ms) ---
export const ELIMINATION_FEED_MS = 4000;
export const LEVEL_UP_TOAST_MS = 4000;

// A full lobby (~100 players) fires level-ups and eliminations faster than the
// toasts expire, so both live feeds are capped: oldest drops when a new one lands.
export const MAX_LIVE_FEED_ITEMS = 3;
