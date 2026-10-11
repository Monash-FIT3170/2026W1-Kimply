import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import { assessAttempt, detectionEnabledFrom } from '../imports/api/botDetection';
import { BOT_SERVER_SLACK_MS } from '../imports/constants';

if (Meteor.isServer) {
  describe('bot attempt timing', function () {
    const four = ['red', 'blue', 'green', 'yellow'];

    function offsetsFromIntervals(intervals) {
      const offsets = [0];
      for (const interval of intervals) offsets.push(offsets[offsets.length - 1] + interval);
      return offsets;
    }

    it('flags four colours when every gap is under 60ms and the spread is at most 5ms', function () {
      const offsets = offsetsFromIntervals([59, 59, 59]);
      const result = assessAttempt({ colours: four, offsets, serverElapsedMs: offsets.at(-1) });
      assert.deepStrictEqual(result, { flagged: true, reason: 'uniform-fast-input' });
    });

    it('does not flag a 60ms gap, a 6ms spread, or a three-colour sequence', function () {
      assert.strictEqual(
        assessAttempt({
          colours: four,
          offsets: offsetsFromIntervals([60, 60, 60]),
          serverElapsedMs: 180,
        }).flagged,
        false
      );
      assert.strictEqual(
        assessAttempt({
          colours: four,
          offsets: offsetsFromIntervals([20, 20, 26]),
          serverElapsedMs: 66,
        }).flagged,
        false
      );
      assert.strictEqual(
        assessAttempt({
          colours: ['red', 'blue', 'green'],
          offsets: [0, 20, 40],
          serverElapsedMs: 40,
        }).reason,
        'short'
      );
    });

    it('flags a 5ms spread and refuses a fast trace the server did not observe', function () {
      const tight = offsetsFromIntervals([20, 20, 25]);
      assert.strictEqual(assessAttempt({ colours: four, offsets: tight, serverElapsedMs: tight.at(-1) }).flagged, true);
      const last = tight.at(-1);
      assert.strictEqual(
        assessAttempt({ colours: four, offsets: tight, serverElapsedMs: last + BOT_SERVER_SLACK_MS }).flagged,
        true
      );
      assert.strictEqual(
        assessAttempt({ colours: four, offsets: tight, serverElapsedMs: last + BOT_SERVER_SLACK_MS + 1 }).reason,
        'server-elapsed'
      );
    });

    it('keeps the kill switch development-only', function () {
      assert.strictEqual(detectionEnabledFrom(undefined, false), true);
      assert.strictEqual(detectionEnabledFrom('false', true), false);
      assert.strictEqual(detectionEnabledFrom('false', false), true);
    });
  });
}
