import assert from 'assert';
import { hasSeenSequence, markSequenceSeen, playbackDecision } from '/imports/ui/sequencePlayback';

function memoryStorage() {
  const data = {};
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
  };
}

const blockedStorage = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('blocked');
  },
};

describe('which sequences a tab has watched', function () {
  it('remembers a sequence per game, round and version', function () {
    const storage = memoryStorage();
    assert.strictEqual(hasSeenSequence('G', 'r1', 1, storage), false);

    markSequenceSeen('G', 'r1', 1, storage);

    assert.strictEqual(hasSeenSequence('G', 'r1', 1, storage), true);
    assert.strictEqual(hasSeenSequence('G', 'r1', 2, storage), false, 'a Reroll or Scramble is a new sequence');
    assert.strictEqual(hasSeenSequence('G', 'r2', 1, storage), false, 'the next round is a new sequence');
    assert.strictEqual(hasSeenSequence('H', 'r1', 1, storage), false, 'another game');
  });

  it('remembers nothing without a game or a round, and survives blocked storage', function () {
    const storage = memoryStorage();
    markSequenceSeen(null, 'r1', 1, storage);
    markSequenceSeen('G', undefined, 1, storage);
    assert.strictEqual(hasSeenSequence(null, 'r1', 1, storage), false);
    assert.strictEqual(hasSeenSequence('G', undefined, 1, storage), false);

    assert.doesNotThrow(() => markSequenceSeen('G', 'r1', 1, blockedStorage));
    assert.strictEqual(hasSeenSequence('G', 'r1', 1, blockedStorage), false);
  });
});

describe('when the board plays the sequence', function () {
  it('waits until there is a sequence', function () {
    assert.strictEqual(playbackDecision({ hasSequence: false, requested: true, autoPlay: true }), 'wait');
    assert.strictEqual(playbackDecision({ hasSequence: false, requested: false, autoPlay: false }), 'wait');
  });

  it('plays a sequence the player has not watched', function () {
    assert.strictEqual(playbackDecision({ hasSequence: true, requested: false, autoPlay: true }), 'play');
    assert.strictEqual(playbackDecision({ hasSequence: true, requested: true, autoPlay: true }), 'play');
  });

  it('does not replay a watched sequence when it merely turns up again (refresh, reconnect, draft closing)', function () {
    assert.strictEqual(playbackDecision({ hasSequence: true, requested: false, autoPlay: false }), 'skip');
  });

  it('still plays a watched sequence when asked: the Replay button, or a wrong answer', function () {
    assert.strictEqual(playbackDecision({ hasSequence: true, requested: true, autoPlay: false }), 'play');
  });
});
