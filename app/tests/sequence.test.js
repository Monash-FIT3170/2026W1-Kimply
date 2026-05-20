import assert from 'assert';
import { generateSequence, COLOURS } from '../imports/api/sequence';


describe('generateSequence', () => {
  it('generates a sequence of 4 colours by default', () => {
    const seq = generateSequence();
    assert.strictEqual(seq.length, 4);
  });

  it('generates a sequence of a custom length', () => {
    const seq = generateSequence(6);
    assert.strictEqual(seq.length, 6);
  });

  it('only selects colours from the predefined set', () => {
    const seq = generateSequence(4);
    seq.forEach((colour) => {
      assert.ok(COLOURS.includes(colour));
    });
  });

  it('each colour is a non-empty string', () => {
    const seq = generateSequence(4);
    seq.forEach((colour) => {
      assert.strictEqual(typeof colour, 'string');
      assert.ok(colour.length > 0);
    });
  });
});
