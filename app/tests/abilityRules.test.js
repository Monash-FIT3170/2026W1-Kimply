import assert from 'assert';
import {
  ABILITIES,
  dealCards,
  eligibleAbilities,
  isCallerBound,
  isShielded,
  playableHand,
  playbackFor,
  playbackTiming,
} from '../imports/api/abilityRules';
import { FLASH_SPEEDS, MIN_FLASH_MS, MIN_GAP_MS } from '../imports/constants';

// Deterministic rng that walks through the given values in order.
function sequenceRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('ability rules', function () {
  describe('eligibleAbilities', function () {
    it('offers Jump only in Battle Royale', function () {
      assert.ok(!eligibleAbilities({ isBattleRoyale: false }).includes('jump'));
      assert.ok(eligibleAbilities({ isBattleRoyale: true }).includes('jump'));
    });

    it('offers Steal only when players start with more than one life', function () {
      assert.ok(eligibleAbilities({ startingLives: 3 }).includes('steal'));
      assert.ok(!eligibleAbilities({ startingLives: 1 }).includes('steal'));
      assert.ok(!eligibleAbilities({ isBattleRoyale: true, startingLives: 1 }).includes('steal'));
    });
  });

  describe('dealCards', function () {
    it('deals three distinct cards', function () {
      for (let i = 0; i < 50; i++) {
        const cards = dealCards({ isBattleRoyale: true, startingLives: 3 });
        assert.strictEqual(cards.length, 3);
        assert.strictEqual(new Set(cards).size, 3);
        cards.forEach((card) => assert.ok(ABILITIES[card]));
      }
    });

    it('never deals a card that is not eligible', function () {
      for (let i = 0; i < 50; i++) {
        const cards = dealCards({ isBattleRoyale: false, startingLives: 1 });
        assert.ok(!cards.includes('jump'));
        assert.ok(!cards.includes('steal'));
      }
    });

    it('follows the weights for a given roll', function () {
      // Standard pool in catalogue order: steal 3, strike 3, shield 3, slowMo 2, fastForward 2,
      // lightsOut 2, freePass 1, reroll 3, scramble 2 (total 21).
      // A roll of 0 takes the first card each time.
      assert.deepStrictEqual(dealCards({ startingLives: 3 }, sequenceRng([0])), ['steal', 'strike', 'shield']);
      // 15.5 of 21 lands in freePass (15 to 16).
      assert.strictEqual(dealCards({ startingLives: 3 }, sequenceRng([15.5 / 21]), 1)[0], 'freePass');
      // slowMo covers 9 to 11, fastForward 11 to 13, lightsOut 13 to 15.
      assert.strictEqual(dealCards({ startingLives: 3 }, sequenceRng([12 / 21]), 1)[0], 'fastForward');
    });
  });

  describe('isShielded', function () {
    it('holds only for the round the Shield was raised in', function () {
      assert.strictEqual(isShielded({ roundId: 'r1', secret: { shieldRoundId: 'r1' } }), true);
      assert.strictEqual(isShielded({ roundId: 'r2', secret: { shieldRoundId: 'r1' } }), false);
      assert.strictEqual(isShielded({ roundId: 'r1' }), false);
    });
  });

  describe('playableHand', function () {
    it('keeps Free Pass and Jump across rounds but not Reroll or Scramble', function () {
      const player = {
        roundId: 'r2',
        secret: {
          hand: [
            { id: 'a', type: 'freePass', roundId: 'r1' },
            { id: 'b', type: 'jump', roundId: 'r1' },
            { id: 'c', type: 'reroll', roundId: 'r1' },
            { id: 'd', type: 'scramble', roundId: 'r2' },
          ],
        },
      };
      assert.deepStrictEqual(
        playableHand(player).map((card) => card.id),
        ['a', 'b', 'd']
      );
    });
  });

  describe('playback cards', function () {
    it('are dealt in every mode and land before the round', function () {
      for (const type of ['slowMo', 'fastForward', 'lightsOut']) {
        assert.ok(eligibleAbilities({ isBattleRoyale: false }).includes(type));
        assert.ok(eligibleAbilities({ isBattleRoyale: true, startingLives: 1 }).includes(type));
        assert.strictEqual(ABILITIES[type].timing, 'pre');
        assert.strictEqual(ABILITIES[type].targeted, true);
      }
    });
  });

  describe('playbackFor', function () {
    it('holds only for the round each effect landed in', function () {
      const secret = { playback: { speed: { roundId: 'r1', value: 'slow' }, lightsOut: { roundId: 'r2' } } };
      assert.deepStrictEqual(playbackFor({ roundId: 'r1', secret }), { speed: 'slow', lightsOut: false });
      assert.deepStrictEqual(playbackFor({ roundId: 'r2', secret }), { speed: null, lightsOut: true });
      assert.deepStrictEqual(playbackFor({ roundId: 'r1' }), { speed: null, lightsOut: false });
      assert.deepStrictEqual(playbackFor(null), { speed: null, lightsOut: false });
    });

    it('ignores a Battle Royale effect still waiting for the next level', function () {
      const secret = { playback: { lightsOut: { roundId: null } } };
      assert.deepStrictEqual(playbackFor({ roundId: 'r1', secret }), { speed: null, lightsOut: false });
    });
  });

  describe('playbackTiming', function () {
    it('halves the speed for Slo-Mo and doubles it for 2x Speed', function () {
      const { flash, gap } = FLASH_SPEEDS.medium;
      assert.deepStrictEqual(playbackTiming('medium'), FLASH_SPEEDS.medium);
      assert.deepStrictEqual(playbackTiming('medium', 'slow'), { flash: flash * 2, gap: gap * 2 });
      assert.deepStrictEqual(playbackTiming('medium', 'fast'), { flash: flash / 2, gap: gap / 2 });
      assert.deepStrictEqual(playbackTiming('nonsense'), FLASH_SPEEDS.medium);
    });

    it('never plays faster than the floor', function () {
      const { flash, gap } = playbackTiming('fast', 'fast');
      assert.strictEqual(flash, Math.max(MIN_FLASH_MS, FLASH_SPEEDS.fast.flash / 2));
      assert.strictEqual(gap, Math.max(MIN_GAP_MS, FLASH_SPEEDS.fast.gap / 2));
      assert.ok(flash >= MIN_FLASH_MS && gap >= MIN_GAP_MS);
    });
  });

  describe('isCallerBound', function () {
    it('trusts server calls and otherwise requires the owning connection', function () {
      assert.strictEqual(isCallerBound({ connectionId: 'c1' }, null), true);
      assert.strictEqual(isCallerBound({ connectionId: 'c1' }, 'c1'), true);
      assert.strictEqual(isCallerBound({ connectionId: 'c1' }, 'c2'), false);
      assert.strictEqual(isCallerBound(null, 'c1'), false);
    });
  });
});
