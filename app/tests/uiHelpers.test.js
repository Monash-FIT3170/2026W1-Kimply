import assert from 'assert';
import {
  appendRoomCodeInput,
  clearCapturedInput,
  normalizeRoomCode,
  roomCodeFromSearchParams,
} from '/imports/ui/roomCode';
import { combineKeyHandlers, removeOnBackspace, submitOnEnter } from '/imports/ui/keyboard';
import { loadUsername, saveUsername, USERNAME_STORAGE_KEY } from '/imports/ui/savedUsername';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
  };
}

function throwingStorage() {
  return {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
}

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

  describe('savedUsername', function () {
    it('returns an empty name when nothing is saved', function () {
      assert.strictEqual(loadUsername(memoryStorage()), '');
    });

    it('saves a trimmed name and loads it back', function () {
      const storage = memoryStorage();
      saveUsername('  Ian  ', storage);
      assert.strictEqual(storage.data[USERNAME_STORAGE_KEY], 'Ian');
      assert.strictEqual(loadUsername(storage), 'Ian');
    });

    it('does not overwrite a saved name with a blank one', function () {
      const storage = memoryStorage({ [USERNAME_STORAGE_KEY]: 'Ian' });
      saveUsername('   ', storage);
      assert.strictEqual(loadUsername(storage), 'Ian');
    });

    it('caps a saved name at the username input length', function () {
      const storage = memoryStorage();
      saveUsername('x'.repeat(50), storage);
      assert.strictEqual(loadUsername(storage).length, 30);
    });

    it('falls back to an empty name when storage is unavailable', function () {
      assert.strictEqual(loadUsername(null), '');
      assert.strictEqual(loadUsername(throwingStorage()), '');
      assert.doesNotThrow(() => saveUsername('Ian', throwingStorage()));
    });
  });
});
