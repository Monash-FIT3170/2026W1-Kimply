import assert from 'assert';
import { GAME_MODES, isValidGameMode, normalizeCustomSettings, resolveGameSettings } from '../imports/api/gameModes';

describe('game modes', function () {
  it('accepts each supported mode', function () {
    Object.values(GAME_MODES).forEach((gameMode) => {
      assert.strictEqual(isValidGameMode(gameMode), true);
    });
  });

  it('rejects unknown modes', function () {
    assert.strictEqual(isValidGameMode('impossible-mode'), false);
  });

  it('resolves hard mode as sudden death', function () {
    const settings = resolveGameSettings(GAME_MODES.HARD);

    assert.strictEqual(settings.startingLength, 5);
    assert.strictEqual(settings.lives, 1);
  });

  it('normalizes custom settings to supported ranges', function () {
    assert.deepStrictEqual(
      normalizeCustomSettings({
        startingLength: 99,
        lives: 0,
        sequenceGrowth: 4,
      }),
      {
        startingLength: 10,
        lives: 1,
        sequenceGrowth: 3,
      }
    );
  });
});
