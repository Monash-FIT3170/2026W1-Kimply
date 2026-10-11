import assert from 'assert';
import {
  ABILITIES,
  dealCards,
  eligibleAbilities,
  isCallerBound,
  isShielded,
  playableHand,
} from '../imports/api/abilityRules';

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
      // Standard pool in catalogue order: steal 3, strike 3, shield 3, freePass 1, reroll 3, scramble 2 (total 15).
      // A roll of 0 takes the first card each time.
      assert.deepStrictEqual(dealCards({ startingLives: 3 }, sequenceRng([0])), ['steal', 'strike', 'shield']);
      // 9.5 of 15 lands in freePass (9 to 10).
      assert.strictEqual(dealCards({ startingLives: 3 }, sequenceRng([9.5 / 15]), 1)[0], 'freePass');
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

  describe('isCallerBound', function () {
    it('trusts server calls and otherwise requires the owning connection', function () {
      assert.strictEqual(isCallerBound({ connectionId: 'c1' }, null), true);
      assert.strictEqual(isCallerBound({ connectionId: 'c1' }, 'c1'), true);
      assert.strictEqual(isCallerBound({ connectionId: 'c1' }, 'c2'), false);
      assert.strictEqual(isCallerBound(null, 'c1'), false);
    });
  });
});
