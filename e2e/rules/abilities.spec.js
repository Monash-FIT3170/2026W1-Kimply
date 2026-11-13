// Scenario 4: every ability card in a standard game, with the drafts seeded.
const L = require('../lib/fixtures');
const { test } = L;

test('Every standard ability and draft resolution', async () => {
  const d = await L.db();
  const A = new L.Player('Ann');
  const B = new L.Player('Bo');
  const C = new L.Player('Cy');
  const D = new L.Player('Dee');
  const all = [A, B, C, D];
  const events = async (pin) => d.collection('gameEvents').find({ gameId: pin }).sort({ createdAt: 1 }).toArray();
  const ev = (list, ability, actor) => list.filter((e) => e.ability === ability && e.playerName === actor).pop();
  const roundOf = async (pin) => d.collection('rounds').findOne({ gameId: pin, isCurrent: true, advanced: false });
  const clearAll = async (players) => {
    for (const p of players)
      if (!(await L.dbPlayer(p)).completeRound && !(await L.dbPlayer(p)).eliminated) await p.answer(true);
  };
  const nextRound = async (n) =>
    L.waitUntil(async () => (await roundOf(A.pin))?.roundNumber === n, 15000, `round ${n}`);
  const waitResolved = async () =>
    L.waitUntil(async () => (await roundOf(A.pin))?.draft?.resolved, 30000, 'draft resolved');
  try {
    for (const p of all) await p.connect();
    await A.create('default');
    for (const p of [B, C, D]) await p.join(A.pin);
    await L.startGame(A, [B, C, D]);

    L.check('round 1 has no draft', !(await roundOf(A.pin)).draft);
    await clearAll(all);
    await nextRound(2);

    let r2 = await roundOf(A.pin);
    L.check('round 2 opens with a draft and no clock yet', r2.draft && !r2.draft.resolved && r2.deadlineAt === null);
    await L.expectError(
      'cannot answer while the draft is open',
      A.call('players.startAttempt', A.playerId, r2._id),
      'draft-open'
    );
    await L.seedDraft(A, ['strike', 'shield', 'reroll']);
    await L.seedDraft(B, ['shield', 'strike', 'reroll']);
    await L.seedDraft(C, ['steal', 'shield', 'reroll']);
    await L.seedDraft(D, ['strike', 'shield', 'reroll']);
    await L.expectError(
      'cannot pick a card not dealt',
      A.call('abilities.pick', A.playerId, 'freePass'),
      'invalid-ability'
    );
    await L.expectError(
      'cannot target yourself',
      A.call('abilities.pick', A.playerId, 'strike', A.playerId),
      'invalid-target'
    );
    await A.call('abilities.pick', A.playerId, 'strike', B.playerId);
    await L.expectError('cannot pick twice', A.call('abilities.pick', A.playerId, 'shield'), 'already-chosen');
    await B.call('abilities.pick', B.playerId, 'shield');
    await C.call('abilities.pick', C.playerId, 'steal', A.playerId);
    await D.call('abilities.pick', D.playerId, 'strike', C.playerId);
    await waitResolved();
    r2 = await roundOf(A.pin);
    L.check('draft closes early once everyone chose', Date.now() < new Date(r2.draft.endsAt).getTime());
    L.check(
      'clock starts when the draft closes',
      r2.deadlineAt && Math.abs(new Date(r2.deadlineAt) - new Date(r2.draft.resolvedAt) - 50000) < 1000
    );
    let e = await events(A.pin);
    L.check('Strike on a shielded player is blocked', ev(e, 'strike', 'Ann')?.outcome === 'blocked');
    L.check('Steal hits', ev(e, 'steal', 'Cy')?.outcome === 'hit');
    L.check('Strike hits', ev(e, 'strike', 'Dee')?.outcome === 'hit');
    const lives = Object.fromEntries(await Promise.all(all.map(async (p) => [p.name, (await L.dbPlayer(p)).lives])));
    L.check(
      'lives after: Ann lost one to Steal, Cy +1 from Steal -1 from Strike, Bo untouched',
      lives.Ann === 2 && lives.Bo === 3 && lives.Cy === 3 && lives.Dee === 3,
      JSON.stringify(lives)
    );
    await clearAll(all);
    await nextRound(3);

    await L.seedDraft(A, ['slowMo', 'shield', 'reroll']);
    await L.seedDraft(C, ['fastForward', 'shield', 'reroll']);
    await L.seedDraft(D, ['lightsOut', 'shield', 'reroll']);
    await L.seedDraft(B, ['freePass', 'shield', 'reroll']);
    await A.call('abilities.pick', A.playerId, 'slowMo', B.playerId);
    await L.sleep(50);
    await C.call('abilities.pick', C.playerId, 'fastForward', B.playerId);
    await D.call('abilities.pick', D.playerId, 'lightsOut', B.playerId);
    await B.call('abilities.pick', B.playerId, 'freePass');
    await waitResolved();
    const r3 = await roundOf(A.pin);
    let bDoc = await L.dbPlayer(B);
    L.check(
      'Slo-Mo lands on the target for this round',
      bDoc.secret.playback?.speed?.value === 'slow' && bDoc.secret.playback.speed.roundId === r3._id
    );
    e = await events(A.pin);
    L.check('a second speed card on the same target misses', ev(e, 'fastForward', 'Cy')?.outcome === 'failed');
    L.check(
      'Lights Out stacks with a speed change',
      bDoc.secret.playback?.lightsOut?.roundId === r3._id && ev(e, 'lightsOut', 'Dee')?.outcome === 'hit'
    );
    const t0 = Date.now();
    const seen = await L.waitUntil(
      () => B.me().secret.playback?.speed?.value === 'slow' && B.me().secret.playback?.lightsOut,
      15000,
      'bo sees effects'
    ).catch(() => false);
    L.check('Bo sees the effects in their own secret', seen, `after ${Date.now() - t0} ms`);
    L.check("nobody else sees Bo's secret", !A.docs('players').find((p) => p._id === B.playerId)?.secret);
    L.check(
      'Free Pass goes to the hand',
      bDoc.secret.hand.some((c) => c.type === 'freePass')
    );
    const unusedRerollId = await L.seedHand(D, 'reroll');
    await clearAll(all); // Bo answers normally and keeps the Free Pass
    await nextRound(4);
    bDoc = await L.dbPlayer(B);
    L.check('playback effects lapse with the round', bDoc.secret.playback.speed.roundId !== bDoc.roundId);
    L.check(
      'Free Pass is kept into the next round',
      bDoc.secret.hand.some((c) => c.type === 'freePass')
    );

    L.check(
      'unused round-only card expires on advancement',
      !(await L.dbPlayer(D)).secret.hand.some((c) => c.id === unusedRerollId)
    );
    await L.seedDraft(A, ['reroll', 'shield', 'strike']);
    await L.seedDraft(C, ['scramble', 'shield', 'strike']);
    await L.seedDraft(D, ['fastForward', 'shield', 'strike']);
    await A.call('abilities.pick', A.playerId, 'reroll');
    await C.call('abilities.pick', C.playerId, 'scramble');
    await D.call('abilities.pick', D.playerId, 'fastForward', C.playerId);
    const freePassId = bDoc.secret.hand.find((c) => c.type === 'freePass').id;
    await L.expectError(
      'cannot play a card while the draft is open',
      B.call('abilities.use', B.playerId, freePassId),
      'draft-open'
    );
    await B.call('abilities.skip', B.playerId);
    await waitResolved();
    L.check('2x Speed lands on an unmodified target', (await L.dbPlayer(C)).secret.playback.speed.value === 'fast');
    await B.call('abilities.use', B.playerId, freePassId);
    bDoc = await L.dbPlayer(B);
    L.check('Free Pass clears the round as Passed', bDoc.completeRound && bDoc.roundStatus === 'Passed');
    L.check('Free Pass is spent', !bDoc.secret.hand.some((c) => c.type === 'freePass'));
    const aBefore = (await L.dbPlayer(A)).secret.sequence;
    const rerollId = (await L.dbPlayer(A)).secret.hand.find((c) => c.type === 'reroll').id;
    await A.call('abilities.use', A.playerId, rerollId);
    const aAfter = (await L.dbPlayer(A)).secret.sequence;
    L.check(
      'Reroll gives a new version of the same length',
      aAfter.version === aBefore.version + 1 && aAfter.colours.length === aBefore.colours.length
    );
    const scrambleId = (await L.dbPlayer(C)).secret.hand.find((c) => c.type === 'scramble').id;
    await L.expectError(
      'Scramble cannot hit a player who cleared',
      C.call('abilities.use', C.playerId, scrambleId, B.playerId),
      'target-cleared'
    );
    const dBefore = (await L.dbPlayer(D)).secret.sequence.version;
    await C.call('abilities.use', C.playerId, scrambleId, D.playerId);
    L.check('Scramble gives the target a new sequence', (await L.dbPlayer(D)).secret.sequence.version === dBefore + 1);
    await L.waitUntil(() => D.me().secret.sequence.version === dBefore + 1, 20000, 'scramble reaches Dee');
    await L.expectError(
      'a round-only card expires: none left to replay',
      A.call('abilities.use', A.playerId, rerollId),
      'invalid-ability'
    );
    const jumpId = await L.seedHand(A, 'jump');
    await L.expectError('Jump is Battle Royale only', A.call('abilities.use', A.playerId, jumpId), 'invalid-ability');
    await clearAll(all);
    await nextRound(5);

    await d.collection('players').updateOne({ _id: D.playerId }, { $set: { lives: 1 } });
    await L.seedDraft(A, ['strike', 'shield', 'reroll']);
    await A.call('abilities.pick', A.playerId, 'strike', D.playerId);
    const r5 = await roundOf(A.pin);
    L.check(
      'closeDraft before the timer does nothing',
      (await A.call('abilities.closeDraft', r5._id)) === false || !(await roundOf(A.pin)).draft.resolved
    );
    // Nobody else chooses: the draft closes on its timer.
    await L.waitUntil(async () => (await roundOf(A.pin))?.draft?.resolved, 30000, 'draft closes on its timer');
    const r5b = await roundOf(A.pin);
    L.check('draft closed on its timer', new Date(r5b.draft.resolvedAt) >= new Date(r5b.draft.endsAt) - 50);
    const left = await L.dbPlayer(C);
    L.check('an unpicked draft expires', left.secret.draft?.status === 'expired', left.secret.draft?.status);
    e = await events(A.pin);
    L.check(
      'Strike on a player with 1 life eliminates',
      ev(e, 'strike', 'Ann')?.outcome === 'eliminated' && (await L.dbPlayer(D)).eliminated
    );
    L.check('the live feed reaches players', A.docs('gameEvents').length > 0);
  } finally {
    for (const p of all) p.close();
  }
});
