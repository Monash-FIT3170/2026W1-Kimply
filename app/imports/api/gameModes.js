export const GAME_MODES = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
  CUSTOM: 'custom',
  BATTLE_ROYALE: 'battle-royale',
};

export const DEFAULT_GAME_MODE = GAME_MODES.MEDIUM;

export const CUSTOM_SETTING_LIMITS = {
  startingLength: { min: 3, max: 10 },
  lives: { min: 1, max: 5 },
  sequenceGrowth: { min: 1, max: 3 },
};

export const DEFAULT_CUSTOM_SETTINGS = {
  startingLength: 4,
  lives: 3,
  sequenceGrowth: 1,
};

export const GAME_MODE_RULES = {
  [GAME_MODES.EASY]: {
    gameMode: GAME_MODES.EASY,
    startingLength: 3,
    lives: 4,
    sequenceGrowth: 1,
  },
  [GAME_MODES.MEDIUM]: {
    gameMode: GAME_MODES.MEDIUM,
    startingLength: 4,
    lives: 3,
    sequenceGrowth: 1,
  },
  [GAME_MODES.HARD]: {
    gameMode: GAME_MODES.HARD,
    startingLength: 5,
    lives: 1,
    sequenceGrowth: 1,
  },
  [GAME_MODES.BATTLE_ROYALE]: {
    gameMode: GAME_MODES.BATTLE_ROYALE,
    startingLength: 4,
    lives: 2,
    sequenceGrowth: 2,
  },
};

export const GAME_MODE_OPTIONS = [
  {
    value: GAME_MODES.EASY,
    label: 'Easy',
    detail: '4 lives',
  },
  {
    value: GAME_MODES.MEDIUM,
    label: 'Medium',
    detail: 'Classic',
  },
  {
    value: GAME_MODES.HARD,
    label: 'Hard',
    detail: 'Sudden Death',
  },
  {
    value: GAME_MODES.CUSTOM,
    label: 'Custom',
    detail: 'Host Rules',
  },
  {
    value: GAME_MODES.BATTLE_ROYALE,
    label: 'Battle Royale',
    detail: 'Fast Elimination',
  },
];

export function isValidGameMode(gameMode) {
  return GAME_MODE_OPTIONS.some((option) => option.value === gameMode);
}

function wholeNumberInRange(value, fallback, limits) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(limits.max, Math.max(limits.min, Math.round(numericValue)));
}

export function normalizeCustomSettings(settings = {}) {
  return {
    startingLength: wholeNumberInRange(
      settings.startingLength,
      DEFAULT_CUSTOM_SETTINGS.startingLength,
      CUSTOM_SETTING_LIMITS.startingLength
    ),
    lives: wholeNumberInRange(settings.lives, DEFAULT_CUSTOM_SETTINGS.lives, CUSTOM_SETTING_LIMITS.lives),
    sequenceGrowth: wholeNumberInRange(
      settings.sequenceGrowth,
      DEFAULT_CUSTOM_SETTINGS.sequenceGrowth,
      CUSTOM_SETTING_LIMITS.sequenceGrowth
    ),
  };
}

export function resolveGameSettings(gameMode = DEFAULT_GAME_MODE, customSettings = {}) {
  const selectedMode = isValidGameMode(gameMode) ? gameMode : DEFAULT_GAME_MODE;

  if (selectedMode === GAME_MODES.CUSTOM) {
    return {
      gameMode: selectedMode,
      ...normalizeCustomSettings(customSettings),
    };
  }

  return GAME_MODE_RULES[selectedMode] || GAME_MODE_RULES[DEFAULT_GAME_MODE];
}

export function gameModeLabel(gameMode) {
  return GAME_MODE_OPTIONS.find((option) => option.value === gameMode)?.label || gameModeLabel(DEFAULT_GAME_MODE);
}
