// Central place for tunable game/config constants. Pure module (no imports),
// safe on client and server. Values are unchanged from where they were inlined.

// --- Gameplay ---
export const DEFAULT_STARTING_LIVES = 3;
export const DEFAULT_SEQUENCE_LENGTH = 4;
export const INITIAL_LEVEL = 4; // starting currentLevel (level 1 == sequence length 4)
export const BONUS_LIFE_ROUND = 7; // completing this round grants +1 life
export const ROUND_TIMER_SECONDS = 45; // whole-round countdown (not battle royale)
export const SEQUENCE_COLOURS = ['red', 'blue', 'green', 'yellow'];

// --- Rooms ---
export const PIN_LENGTH = 5;
export const PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DISCONNECT_GRACE_MS = 15000; // remove a disconnected player after this

// Game-mode presets, copied into room.customSettings on selection.
export const GAME_MODE_PRESETS = {
  default: { flashingSpeed: 'medium', startingLives: 3, startingSequenceLength: 4, sequenceGrowth: 1 },
  easy: { flashingSpeed: 'slow', startingLives: 5, startingSequenceLength: 1, sequenceGrowth: 1 },
  medium: { flashingSpeed: 'medium', startingLives: 3, startingSequenceLength: 3, sequenceGrowth: 1 },
  hard: { flashingSpeed: 'fast', startingLives: 1, startingSequenceLength: 3, sequenceGrowth: 1 },
  custom: { flashingSpeed: 'medium', startingLives: 3, startingSequenceLength: 4, sequenceGrowth: 1 },
  battle_royale: { flashingSpeed: 'medium', startingLives: 3, startingSequenceLength: 4, sequenceGrowth: 1 },
};

// Sequence playback speeds, in ms.
export const FLASH_SPEEDS = {
  slow: { flash: 900, gap: 350 },
  medium: { flash: 600, gap: 250 },
  fast: { flash: 350, gap: 150 },
};

// --- Accounts ---
export const MIN_PASSWORD_LENGTH = 8;

// --- Leaderboard ---
export const GLOBAL_LEADERBOARD_SIZE = 50;

// --- UI durations (ms) ---
export const ELIMINATION_FEED_MS = 4000;
export const LEVEL_UP_TOAST_MS = 4000;
