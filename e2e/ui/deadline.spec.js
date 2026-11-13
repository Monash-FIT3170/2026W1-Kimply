const { test, expect, createRoom, bot, start, dbPlayer, db, sleep } = require('../lib/game');
for (const offline of [false, true]) {
  test(`round deadline keeps an ${offline ? 'offline reconnecting' : 'idle'} player as a spectator`, async ({
    page,
    context,
  }) => {
    const game = await createRoom(page, { abilities: false });
    const other = await bot(game.pin);
    // Two survivors keep the game running after the human times out.
    const third = await bot(game.pin, 'Survivor');
    await start(page, game, [other, third]);
    await other.answer();
    await third.answer();
    const me = await dbPlayer(game);
    const round = await (await db()).collection('rounds').findOne({ _id: me.roundId });
    if (offline) {
      await sleep(+round.deadlineAt - Date.now() - 5000);
      await context.setOffline(true);
      await sleep(+round.deadlineAt - Date.now() + 6000);
      await context.setOffline(false);
    }
    await expect(page.getByText('You are spectating', { exact: true })).toBeVisible({ timeout: 75_000 });
    await expect(page.getByText('Could not join the game.', { exact: true })).toHaveCount(0);
    expect(await dbPlayer(game)).toMatchObject({ eliminated: true });
    await expect(page.locator('#live-feed').getByText('You were eliminated.', { exact: true })).toBeVisible();
  });
}
