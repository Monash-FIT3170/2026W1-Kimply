// Scenario 6: reconnecting mid-game, ownership, and the round deadline with players who
// stall, drop, or drop and come back.
const L = require('../lib/fixtures');
const { test } = L;

test('Reconnect ownership, disconnect grace and round deadline', async () => {
  const d = await L.db();
  const people = [];
  const make = async (name, browserToken = null) => {
    const p = new L.Player(name);
    await p.connect(browserToken);
    people.push(p);
    return p;
  };
  // A second tab or a reload: same browser, same per-tab credential, new connection.
  const reload = async (p) => {
    p.close();
    const again = await make(p.name, p.browserToken);
    Object.assign(again, {
      pin: p.pin,
      lobbyId: p.lobbyId,
      token: p.token,
      accountId: p.accountId,
    });
    await again.enter();
    return again;
  };
  try {
    const host = await make('Host');
    const ann = await make('Ann');
    const bo = await make('Bo');
    await host.create('default', { abilities: false });
    await ann.join(host.pin);
    await bo.join(host.pin);
    await L.startGame(host, [ann, bo]);
    await ann.answer(false); // Ann on 2 lives
    const annId = ann.playerId;
    const ann2 = await reload(ann);
    L.check('a reload resumes the same player', ann2.playerId === annId);
    L.check('…with their lives', (await L.dbPlayer(ann2)).lives === 2);
    L.check('…and their private sequence on the new connection', !!ann2.me()?.secret?.sequence);
    const thief = await make('Thief', ann.browserToken);
    await L.expectError(
      'a wrong credential cannot rebind',
      thief.call('players.rebind', annId, 'x'.repeat(43)),
      'not-yours'
    );
    const other = await make('Other');
    await L.expectError(
      'another browser cannot rebind with the right credential',
      other.call('players.rebind', annId, ann.token),
      'not-yours'
    );
    await L.expectError(
      'another connection cannot answer for Ann',
      bo.call('players.startAttempt', annId, ann2.me().roundId),
      'not-yours'
    );
    L.check(
      "a connection never receives another player's secret",
      !bo.docs('players').find((p) => p._id === annId)?.secret
    );
    await ann2.answer(true);
    await host.answer(true);
    await bo.answer(true);
    await L.waitUntil(() => host.round()?.roundNumber === 2, 10000, 'round 2');
    L.check(
      'the resumed player plays on',
      (await L.dbPlayer(ann2)).completeRound === false && host.round().roundNumber === 2
    );

    bo.close(); // Bo drops mid-round and does not come back
    await L.waitUntil(async () => (await L.dbPlayer(bo))?.connected === false, 5000, 'bo marked away');
    await L.sleep(16000);
    L.check('…and removed after the grace', !(await L.dbPlayer(bo)));
    L.check('…without stalling the round for the rest', host.round().roundNumber === 2);

    const h = await make('H');
    const h2 = await make('H2');
    const stall = await make('Stall');
    const drop = await make('Drop');
    const back = await make('Back');
    await h.create('default', { abilities: false });
    for (const p of [h2, stall, drop, back]) await p.join(h.pin);
    await L.startGame(h, [h2, stall, drop, back]);
    const r1 = h.round();
    const deadline = new Date(r1.deadlineAt.$date ?? r1.deadlineAt).getTime();
    L.check('round 1 clock started once everyone joined', deadline > Date.now() + 40000);
    await h.answer(true);
    await h2.answer(true);
    await L.expectError(
      'rounds.expire before the deadline does nothing',
      h.call('rounds.expire', r1._id).then((ran) => {
        if (ran) throw { error: 'ran-early' };
        throw { error: 'ok' };
      }),
      'ok'
    );
    // Drop and Back lose their connection 4 s before the deadline.
    await L.sleep(deadline - Date.now() - 4000);
    drop.close();
    back.close();
    await L.sleep(deadline - Date.now() + 3500); // past the 2 s grace
    await L.waitUntil(
      async () => (await d.collection('rounds').findOne({ _id: r1._id })).expiredAt,
      10000,
      'round expired'
    );
    const s = await L.dbPlayer(stall);
    L.check(
      'a connected player who stalled is eliminated and stays on the board',
      s.eliminated && !s.timedOutWhileAway
    );
    const dp = await L.dbPlayer(drop);
    L.check(
      'a dropped player is eliminated, flagged, not deleted',
      dp && dp.eliminated && dp.timedOutWhileAway === true
    );
    await L.waitUntil(() => h.round()?.roundNumber === 2, 5000, 'round 2').catch(() => {});
    L.check(
      'the round moved on, game still running',
      h.round()?.roundNumber === 2 && !(await L.dbPlayer(h)).gameFinished
    );
    // Back returns 6 s after the deadline, inside their 15 s grace.
    await L.sleep(Math.max(0, deadline + 6000 - Date.now()));
    const back2 = await reload(back);
    const bp = await L.dbPlayer(back2);
    L.check(
      'a player who comes back after the deadline is kept, eliminated',
      bp && bp.eliminated && bp.connected && !bp.timedOutWhileAway
    );
    await L.expectError(
      '…and cannot answer their way back in',
      back2.call('players.startAttempt', back2.playerId, r1._id),
      'not-playing'
    );
    await L.sleep(15000);
    L.check('the drop that never came back is removed after the grace', !(await L.dbPlayer(drop)));
    L.check('the one who came back is still there', !!(await L.dbPlayer(back2)));
    const room = await d.collection('rooms').findOne({ pin: h.pin });
    L.check("the removed player's lobby seat is freed", !room.players.some((p) => p.name === 'Drop'));
  } finally {
    for (const p of people) p.close();
  }
});
