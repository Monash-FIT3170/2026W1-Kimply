// Scenario 2: the standard game loop over many rounds, with a signed-in player.
const L = require('../lib/fixtures');
const { test } = L;

test('Lives, streaks, bonus lives and signed-in results', async () => {
  const d = await L.db();
  const { accountId } = await L.seedAccount();
  const ann = new L.Player('Ann');
  const bo = new L.Player('Bo');
  const cy = new L.Player('Cy');
  try {
    for (const p of [ann, bo, cy]) await p.connect();
    await ann.create('default', { abilities: false, accountId });
    await bo.join(ann.pin);
    await cy.join(ann.pin);
    await L.startGame(ann, [bo, cy]);

    // Round 1: Ann misses once, then clears. Bo and Cy clear.
    const miss = await ann.answer(false);
    L.check(
      'a miss costs one life and resets nothing else',
      miss.remainingLives === 2 && ann.me().roundStatus === 'Playing',
      JSON.stringify(miss)
    );
    await L.waitUntil(() => ann.me().lives === 2, 5000, 'ann lives 2');
    await ann.answer(true);
    L.check('a miss then a clear leaves the streak at 1', (await L.dbPlayer(ann)).currentStreak === 1);
    L.check('round does not advance until everyone clears', ann.round().roundNumber === 1);
    await bo.answer(true);
    await cy.answer(true);
    await L.waitUntil(() => ann.round()?.roundNumber === 2, 10000, 'round 2');

    // Round 2 and 3: everyone clears. Ann reaches a streak of 3 below her starting lives.
    for (const p of [ann, bo, cy]) await p.answer(true);
    await L.waitUntil(() => ann.round()?.roundNumber === 3, 10000, 'round 3');
    const annR3 = await ann.answer(true);
    L.check(
      'streak of 3 below starting lives earns a life',
      annR3.lifeAward?.streak === true && annR3.lifeAward.lives === 3,
      JSON.stringify(annR3.lifeAward)
    );
    const boR3 = await bo.answer(true);
    L.check(
      'streak of 3 at full lives earns nothing (capped)',
      boR3.lifeAward === null,
      JSON.stringify(boR3.lifeAward)
    );

    // Cy goes out in round 3, then leaves as a spectator.
    for (let i = 0; i < 3; i++) await cy.answer(false);
    await L.waitUntil(() => cy.me()?.eliminated, 5000, 'cy out');
    L.check('three misses eliminate', cy.me().eliminated && cy.me().lives === 0);
    await L.waitUntil(() => ann.round()?.roundNumber === 4, 10000, 'round 4');
    await cy.call('players.leaveGame', cy.playerId);
    const cyAfter = await L.dbPlayer(cy);
    L.check(
      'a spectator who leaves keeps their result',
      cyAfter && cyAfter.eliminated && cyAfter.eliminatedRound === 3,
      JSON.stringify(cyAfter && { e: cyAfter.eliminated, r: cyAfter.eliminatedRound })
    );

    // Rounds 4 to 7: Ann and Bo clear. Round 7 gives everyone a bonus life, above the cap.
    for (let round = 4; round <= 7; round++) {
      const a = await ann.answer(true);
      const b = await bo.answer(true);
      if (round === 7) {
        L.check('round 7 bonus life (Ann)', a.lifeAward?.bonusRound === true, JSON.stringify(a.lifeAward));
        L.check(
          'round 7 bonus life goes above starting lives (Bo)',
          b.lifeAward?.bonusRound === true && b.lifeAward.lives === 4,
          JSON.stringify(b.lifeAward)
        );
      }
      await L.waitUntil(() => ann.round()?.roundNumber === round + 1, 10000, `round ${round + 1}`);
    }
    L.check('sequence grows each round', ann.round().lengthOfSequence === 11, `${ann.round().lengthOfSequence}`);

    // Round 8: both run out of lives in the same round, which is a tie for the win.
    const annLives = (await L.dbPlayer(ann)).lives;
    const boLives = (await L.dbPlayer(bo)).lives;
    for (let i = 0; i < annLives - 1; i++) await ann.answer(false);
    for (let i = 0; i < boLives - 1; i++) await bo.answer(false);
    await ann.answer(false);
    const annDoc = await L.dbPlayer(ann);
    const boDoc = await L.dbPlayer(bo);
    // When Ann goes out first, Bo is the last one standing and wins.
    L.check(
      'last player standing wins',
      boDoc.winner === true && annDoc.gameFinished === true && !annDoc.winner,
      JSON.stringify({ ann: annDoc.winner, bo: boDoc.winner })
    );

    // Ann's account recorded the game.
    await L.sleep(500);
    const acct = await d.collection('playerAccounts').findOne({ _id: accountId });
    L.check(
      'signed-in player: game recorded',
      acct.gamesPlayed === 1 && acct.wins === 0 && acct.bestRound === 8,
      JSON.stringify({ g: acct.gamesPlayed, w: acct.wins, b: acct.bestRound })
    );
    const row = await d.collection('globalLeaderboard').findOne({ accountId });
    L.check(
      'global leaderboard row',
      row && row.bestRound === 8,
      JSON.stringify(row && { b: row.bestRound, g: row.gamesPlayed })
    );
    const guests = await d.collection('globalLeaderboard').countDocuments({
      displayName: { $in: ['Bo', 'Cy'] },
      accountId: { $in: [null, undefined] },
    });
    L.check('guests get no global row', guests === 0);
  } finally {
    await d.collection('playerAccounts').deleteOne({ _id: accountId });
    await d.collection('globalLeaderboard').deleteMany({ accountId });
    for (const p of [ann, bo, cy]) p.close();
  }
});
