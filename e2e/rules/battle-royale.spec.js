// Scenario 5: Battle Royale abilities: level-up drafts, pending playback cards, Shield, Jump.
const L = require('../lib/fixtures');
const { test } = L;

test('Independent levels and Battle Royale abilities', async () => {
  const d = await L.db();
  const A = new L.Player('Ann');
  const B = new L.Player('Bo');
  const C = new L.Player('Cy');
  const all = [A, B, C];
  const events = async () => d.collection('gameEvents').find({ gameId: A.pin }).sort({ createdAt: 1 }).toArray();
  const ev = (list, ability, actor) => list.filter((e) => e.ability === ability && e.playerName === actor).pop();
  const offeredSeen = [];
  const draftOpen = async (p) => {
    const doc = await L.waitUntil(
      async () => {
        const x = await L.dbPlayer(p);
        return x.secret?.draft?.status === 'open' && x.secret.draft.roundId === x.roundId && x;
      },
      15000,
      `${p.name} level-up draft`
    );
    offeredSeen.push(...doc.secret.draft.offered);
    return doc;
  };
  try {
    for (const p of all) await p.connect();
    await A.create('battle_royale');
    for (const p of [B, C]) await p.join(A.pin);
    await L.startGame(A, [B, C], { isBattleRoyale: true });

    L.check('no draft before the first level', !(await L.dbPlayer(A)).secret.draft);
    await A.answer(true);
    await draftOpen(A);
    L.check('clearing a level opens a draft for that player only', !(await L.dbPlayer(B)).secret.draft);
    const aRound = (await L.dbPlayer(A)).roundId;
    await L.expectError(
      'cannot start the next level with the draft open',
      A.call('players.startAttempt', A.playerId, aRound),
      'draft-open'
    );
    await L.seedDraft(A, ['slowMo', 'jump', 'shield']);
    await A.call('abilities.pick', A.playerId, 'slowMo', B.playerId);
    let bDoc = await L.dbPlayer(B);
    let e = await events();
    L.check(
      "Slo-Mo waits for the target's next level",
      bDoc.secret.playback?.speed?.roundId === null && ev(e, 'slowMo', 'Ann')?.pending === true
    );
    await B.answer(true);
    await L.waitUntil(async () => (await L.dbPlayer(B)).currentLevel === 5, 10000, 'bo level 2');
    bDoc = await L.dbPlayer(B);
    L.check(
      '…and binds to it when they level up',
      bDoc.secret.playback.speed.roundId === bDoc.roundId && bDoc.secret.playback.speed.value === 'slow'
    );

    await draftOpen(B);
    await L.seedDraft(B, ['shield', 'jump', 'reroll']);
    await B.call('abilities.pick', B.playerId, 'shield');
    bDoc = await L.dbPlayer(B);
    L.check('Shield covers the level Bo is on', bDoc.secret.shieldRoundId === bDoc.roundId);
    await C.answer(true);
    await draftOpen(C);
    await L.seedDraft(C, ['strike', 'shield', 'reroll']);
    await C.call('abilities.pick', C.playerId, 'strike', B.playerId);
    e = await events();
    L.check('Strike on a shielded player resolves on pick, blocked', ev(e, 'strike', 'Cy')?.outcome === 'blocked');
    L.check('Bo keeps their life', (await L.dbPlayer(B)).lives === 1);

    await A.answer(true); // Ann to level 3
    await draftOpen(A);
    await L.seedDraft(A, ['jump', 'shield', 'reroll']);
    await A.call('abilities.pick', A.playerId, 'jump');
    const jumpId = (await L.dbPlayer(A)).secret.hand.find((c) => c.type === 'jump').id;
    const levels = {
      B: (await L.dbPlayer(B)).currentLevel,
      C: (await L.dbPlayer(C)).currentLevel,
    };
    const res = await A.call('abilities.use', A.playerId, jumpId);
    const dbAfter = (await L.dbPlayer(A)).roundId;
    const tj = Date.now();
    const arrived = await L.waitUntil(() => A.me().roundId === dbAfter, 25000, 'jump reaches Ann').catch(() => false);
    L.check(
      "Jump reaches the player's screen promptly",
      arrived && Date.now() - tj < 2000,
      arrived ? `after ${Date.now() - tj} ms` : 'not within 25 s'
    );
    const aDoc = await L.dbPlayer(A);
    L.check(
      "Jump moves to another player's level",
      [levels.B, levels.C].includes(aDoc.currentLevel),
      `${JSON.stringify(levels)} -> ${aDoc.currentLevel}`
    );
    L.check(
      "Jump puts them on that level's round with its sequence",
      aDoc.secret.sequence.roundId === aDoc.roundId && aDoc.secret.sequence.colours.length === aDoc.currentLevel
    );
    L.check('Jump reports the level', res.level === aDoc.currentLevel - 3);

    const shieldRound = (await L.dbPlayer(B)).secret.shieldRoundId;
    await B.answer(true);
    await draftOpen(B);
    L.check('Shield lapses when its owner levels up', (await L.dbPlayer(B)).roundId !== shieldRound);
    L.check('Steal is never dealt with 1 starting life', !offeredSeen.includes('steal'), offeredSeen.join(','));
    for (const p of all) {
      const doc = await L.dbPlayer(p);
      if (doc.secret?.draft?.status === 'open') await p.call('abilities.skip', p.playerId);
    }
    for (const p of all) {
      const doc = await L.dbPlayer(p);
      if (doc.eliminated) continue;
      await p.answer(false);
    }
    await L.waitUntil(async () => (await L.dbPlayer(A)).gameFinished, 10000, 'game over');
    const final = await Promise.all(all.map(L.dbPlayer));
    const top = Math.max(...final.map((x) => x.currentLevel));
    L.check(
      'the highest level wins',
      final.every((x) => x.winner === (x.currentLevel === top)),
      final.map((x) => `${x.name}:${x.currentLevel}:${x.winner}`).join(' ')
    );
  } finally {
    for (const p of all) p.close();
  }
});
