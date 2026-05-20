import assert from 'assert';
import {
  appendRoomCodeInput,
  clearCapturedInput,
  normalizeRoomCode,
  roomCodeFromSearchParams,
} from '/imports/ui/roomCode';
import { combineKeyHandlers, removeOnBackspace, submitOnEnter } from '/imports/ui/keyboard';

function keyEvent(key) {
  return {
    key,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

describe('UI helpers', function () {
  describe('roomCode', function () {
    it('normalizes room codes to uppercase alphanumeric text', function () {
      assert.strictEqual(normalizeRoomCode('ab-12!', 5), 'AB12');
    });

    it('truncates room codes to the max length', function () {
      assert.strictEqual(normalizeRoomCode('abcdef123', 5), 'ABCDE');
    });

    it('reads and normalizes room code search params', function () {
      const params = new URLSearchParams('code=a1-b2-c3');
      assert.strictEqual(roomCodeFromSearchParams(params, 'code', 5), 'A1B2C');
    });

    it('returns an empty code when the search param is missing', function () {
      const params = new URLSearchParams('');
      assert.strictEqual(roomCodeFromSearchParams(params, 'code', 5), '');
    });

    it('appends normalized input to the current code', function () {
      assert.strictEqual(appendRoomCodeInput('AB', 'c-12!', 5), 'ABC12');
    });

    it('clears captured hidden input values', function () {
      const event = { target: { value: 'ABC' } };
      clearCapturedInput(event);
      assert.strictEqual(event.target.value, '');
    });
  });

  describe('keyboard', function () {
    it('submits and prevents default on Enter', function () {
      let submitted = false;
      const event = keyEvent('Enter');

      submitOnEnter(() => {
        submitted = true;
      })(event);

      assert.strictEqual(submitted, true);
      assert.strictEqual(event.defaultPrevented, true);
    });

    it('ignores non-Enter keys when submitting', function () {
      let submitted = false;
      const event = keyEvent('Escape');

      submitOnEnter(() => {
        submitted = true;
      })(event);

      assert.strictEqual(submitted, false);
      assert.strictEqual(event.defaultPrevented, false);
    });

    it('does not submit when the Enter condition fails', function () {
      let submitted = false;
      const event = keyEvent('Enter');

      submitOnEnter(
        () => {
          submitted = true;
        },
        { when: () => false }
      )(event);

      assert.strictEqual(submitted, false);
      assert.strictEqual(event.defaultPrevented, false);
    });

    it('removes and prevents default on Backspace', function () {
      let removed = false;
      const event = keyEvent('Backspace');

      removeOnBackspace(() => {
        removed = true;
      })(event);

      assert.strictEqual(removed, true);
      assert.strictEqual(event.defaultPrevented, true);
    });

    it('stops combined handlers after one prevents default', function () {
      const calls = [];
      const event = keyEvent('Backspace');

      combineKeyHandlers(
        removeOnBackspace(() => calls.push('backspace')),
        () => calls.push('next')
      )(event);

      assert.deepStrictEqual(calls, ['backspace']);
    });

    it('runs later combined handlers when earlier handlers ignore the key', function () {
      const calls = [];
      const event = keyEvent('Enter');

      combineKeyHandlers(
        removeOnBackspace(() => calls.push('backspace')),
        submitOnEnter(() => calls.push('enter'))
      )(event);

      assert.deepStrictEqual(calls, ['enter']);
    });
  });
});
