import assert from 'assert';
import { describeAbilityEvent, isInFeed, normaliseFeedScope, abilityTags } from '../imports/ui/abilities/abilityFeed';

const event = (fields) => ({ playerId: 'ian', playerName: 'Ian', targetId: 'sam', targetName: 'Sam', ...fields });

describe('ability feed', function () {
  describe('isInFeed', function () {
    it("keeps only the viewer's own events in the 'me' feed", function () {
      assert.strictEqual(isInFeed('me', 'sam', { playerId: 'ian', targetId: 'sam' }), true);
      assert.strictEqual(isInFeed('me', 'ian', { playerId: 'ian' }), true);
      assert.strictEqual(isInFeed('me', 'zoe', { playerId: 'ian', targetId: 'sam' }), false);
      assert.strictEqual(isInFeed('me', null, { playerId: 'ian' }), false);
    });

    it("keeps everything in the 'everyone' feed", function () {
      assert.strictEqual(isInFeed('everyone', 'zoe', { playerId: 'ian', targetId: 'sam' }), true);
    });
  });

  it("defaults the feed scope to 'me'", function () {
    assert.strictEqual(normaliseFeedScope(null), 'me');
    assert.strictEqual(normaliseFeedScope('everyone'), 'everyone');
    assert.strictEqual(normaliseFeedScope('nonsense'), 'me');
  });

  describe('describeAbilityEvent', function () {
    it('speaks to the actor, the target and onlookers differently', function () {
      const strike = event({ ability: 'strike', outcome: 'hit' });
      assert.strictEqual(describeAbilityEvent(strike, 'ian'), 'You struck Sam.');
      assert.strictEqual(describeAbilityEvent(strike, 'sam'), 'Ian struck you. You lost a life.');
      assert.strictEqual(describeAbilityEvent(strike, 'zoe'), 'Ian struck Sam.');
    });

    it('names whose Shield blocked whose card', function () {
      const blocked = event({ ability: 'steal', outcome: 'blocked' });
      assert.strictEqual(describeAbilityEvent(blocked, 'sam'), "Your Shield blocked Ian's Steal.");
      assert.strictEqual(describeAbilityEvent(blocked, 'ian'), "Sam's Shield blocked your Steal.");
      assert.strictEqual(describeAbilityEvent(blocked, 'zoe'), "Sam's Shield blocked Ian's Steal.");
    });

    it('explains a Steal that missed and a Strike that eliminated', function () {
      assert.strictEqual(
        describeAbilityEvent(event({ ability: 'steal', outcome: 'failed' }), 'ian'),
        'Sam had no life to spare. Your Steal missed.'
      );
      assert.strictEqual(
        describeAbilityEvent(event({ ability: 'strike', outcome: 'eliminated' }), 'sam'),
        'Ian struck you out of the game.'
      );
    });

    it('describes self cards and Jump', function () {
      const pass = event({ ability: 'freePass', outcome: 'used', targetId: null, targetName: null });
      assert.strictEqual(describeAbilityEvent(pass, 'ian'), 'Free Pass played. Round cleared.');
      assert.strictEqual(describeAbilityEvent(pass, 'zoe'), 'Ian played a Free Pass.');
      const jump = event({ ability: 'jump', outcome: 'used', targetId: null, fromLevel: 2, level: 6 });
      assert.strictEqual(describeAbilityEvent(jump, 'ian'), 'You jumped to level 6.');
      assert.strictEqual(describeAbilityEvent(jump, 'zoe'), 'Ian jumped from level 2 to level 6.');
    });

    it('uses a bare apostrophe after a name ending in s', function () {
      const scramble = event({ ability: 'scramble', outcome: 'hit', targetName: 'Chris' });
      assert.strictEqual(describeAbilityEvent(scramble, 'ian'), "You scrambled Chris' sequence.");
    });
  });

  it('tags cards by when they play and how long they last', function () {
    assert.deepStrictEqual(abilityTags('strike'), ['Pick a player', 'Lands before the round']);
    assert.deepStrictEqual(abilityTags('shield'), ['This round']);
    assert.deepStrictEqual(abilityTags('freePass'), ['Saved until used']);
    assert.deepStrictEqual(abilityTags('scramble'), ['Pick a player', 'Play this round']);
  });
});
