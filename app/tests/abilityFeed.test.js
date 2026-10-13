import assert from 'assert';
import {
  abilityGuide,
  abilityTags,
  buildFeedRows,
  describeAbilityEvent,
  isInFeed,
  normaliseFeedScope,
} from '../imports/ui/abilities/abilityFeed';

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

  describe('abilityGuide', function () {
    const typesOf = (guide) => Object.fromEntries(guide.sections.map((s) => [s.key, s.types]));

    it('lists every card a standard game deals, by when it is played', function () {
      const guide = abilityGuide();
      assert.deepStrictEqual(typesOf(guide), {
        pre: ['steal', 'strike', 'shield', 'slowMo', 'fastForward', 'lightsOut'],
        in: ['freePass', 'reroll', 'scramble'],
      });
      assert.strictEqual(guide.count, 9);
      assert.strictEqual(
        guide.sections[0].note,
        'They all land together when the draft closes: Steals first, then Strikes, then the rest.'
      );
      assert.match(
        guide.intro,
        /^From round 2, before every round, you are dealt 3 cards\. Pick 1 or skip within 20 seconds\.$/
      );
    });

    it('adds Jump and the level-up draft in Battle Royale', function () {
      const guide = abilityGuide({ isBattleRoyale: true });
      assert.deepStrictEqual(typesOf(guide).in, ['freePass', 'reroll', 'scramble', 'jump']);
      assert.strictEqual(guide.count, 10);
      assert.match(guide.intro, /^Every time you level up/);
      assert.match(guide.sections[0].note, /next level/);
    });

    it('leaves Steal out, and says why, when everyone starts on 1 life', function () {
      const guide = abilityGuide({ startingLives: 1 });
      assert.ok(!typesOf(guide).pre.includes('steal'));
      assert.strictEqual(guide.count, 8);
      assert.strictEqual(
        guide.sections[0].note,
        'They all land together when the draft closes: Strikes first, then the rest.'
      );
      assert.match(guide.intro, /Steal is left out: everyone starts on 1 life\.$/);
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

    it('describes Slo-Mo, 2x Speed and Lights Out for each reader', function () {
      const slowMo = event({ ability: 'slowMo', outcome: 'hit' });
      assert.strictEqual(describeAbilityEvent(slowMo, 'ian'), "You slowed Sam's sequence.");
      assert.strictEqual(describeAbilityEvent(slowMo, 'sam'), 'Ian slowed your sequence.');
      assert.strictEqual(describeAbilityEvent(slowMo, 'zoe'), "Ian slowed Sam's sequence.");
      const fast = event({ ability: 'fastForward', outcome: 'hit' });
      assert.strictEqual(describeAbilityEvent(fast, 'sam'), 'Ian sped up your sequence.');
      const lights = event({ ability: 'lightsOut', outcome: 'hit' });
      assert.strictEqual(describeAbilityEvent(lights, 'sam'), 'Ian turned your lights out.');
      assert.strictEqual(describeAbilityEvent(lights, 'ian'), "You turned the lights out on Sam's sequence.");
    });

    it('says when a playback card missed or waits for the next level', function () {
      const missed = event({ ability: 'fastForward', outcome: 'failed' });
      assert.strictEqual(describeAbilityEvent(missed, 'ian'), 'Your 2x Speed on Sam missed.');
      assert.strictEqual(describeAbilityEvent(missed, 'sam'), "Ian's 2x Speed missed you.");
      const pending = event({ ability: 'slowMo', outcome: 'hit', pending: true });
      assert.strictEqual(describeAbilityEvent(pending, 'sam'), 'Ian slowed your next level.');
      const pendingLights = event({ ability: 'lightsOut', outcome: 'hit', pending: true });
      assert.strictEqual(describeAbilityEvent(pendingLights, 'sam'), 'Ian turned your lights out for your next level.');
      const blocked = event({ ability: 'lightsOut', outcome: 'blocked' });
      assert.strictEqual(describeAbilityEvent(blocked, 'ian'), "Sam's Shield blocked your Lights Out.");
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

  describe('buildFeedRows', function () {
    const abilityEvents = [
      event({ _id: 'e1', ability: 'strike', outcome: 'hit', round: 2, createdAt: new Date(1000) }),
      event({
        _id: 'e2',
        ability: 'steal',
        outcome: 'hit',
        playerId: 'zoe',
        playerName: 'Zoe',
        round: 3,
        createdAt: new Date(3000),
      }),
    ];
    const players = [
      { _id: 'sam', name: 'Sam', eliminated: true, eliminatedAt: new Date(2000), eliminatedRound: 2 },
      { _id: 'zoe', name: 'Zoe', eliminated: false },
    ];

    it('merges ability events and eliminations, newest first', function () {
      const rows = buildFeedRows({ abilityEvents, players, viewerId: 'zoe' });
      assert.deepStrictEqual(
        rows.map((row) => row.key),
        ['e2', 'elimination-sam', 'e1']
      );
      assert.strictEqual(rows[1].text, 'Sam was eliminated.');
      assert.strictEqual(rows[1].round, 2);
    });

    it('marks rows involving the viewer, and the ones aimed at them', function () {
      const rows = buildFeedRows({ abilityEvents, players, viewerId: 'sam' });
      const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
      assert.strictEqual(byKey.e1.mine, true);
      assert.strictEqual(byKey.e1.aimedAtMe, true);
      assert.strictEqual(byKey['elimination-sam'].text, 'You were eliminated.');
      assert.strictEqual(byKey.e2.mine, true, 'Zoe stole from Sam');
    });

    it("keeps only the viewer's rows in the 'me' scope", function () {
      const rows = buildFeedRows({ abilityEvents, players, viewerId: 'ian', scope: 'me' });
      assert.deepStrictEqual(
        rows.map((row) => row.key),
        ['e1']
      );
    });
  });
});
