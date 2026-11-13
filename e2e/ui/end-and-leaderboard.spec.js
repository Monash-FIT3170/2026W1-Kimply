const {
  test,
  expect,
  seedAccount,
  createRoom,
  bot,
  start,
  answer,
  yourTurn,
  dbPlayer,
  waitUntil,
} = require('../lib/game');
test('distinct final ranks, New Game and the signed-in global leaderboard', async ({ page }) => {
  const account = await seedAccount();
  await page.addInitScript((token) => localStorage.setItem('kimply.session', token), account.token);
  const game = await createRoom(page, { abilities: false });
  const champ = await bot(game.pin, 'Champ');
  const two = await bot(game.pin, 'Two');
  await start(page, game, [champ, two]);
  expect((await dbPlayer(game)).accountId).toBe(account.accountId);
  for (let i = 0; i < 3; i++) await answer(page, game, { correct: false });
  await champ.answer();
  await two.answer();
  await waitUntil(() => two.round()?.roundNumber === 2);
  await champ.answer();
  for (let i = 0; i < 3; i++) await two.answer(false);
  await expect(page.getByText('You came 3rd', { exact: true })).toBeVisible();
  for (const [name, rank] of [
    ['Champ', '1'],
    ['Two', '2'],
    [game.name, '3'],
  ]) {
    const row = page.locator('div.rounded-xl.py-3').filter({ has: page.getByText(name, { exact: true }) });
    await expect(row.locator(':scope > span').first()).toHaveText(rank);
  }
  await expect(page.getByText(/^=[123]$/)).toHaveCount(0);
  await page.getByRole('button', { name: /New Game/i }).click();
  await expect(page).toHaveURL(/\/play$/);
  await page.getByRole('link', { name: 'Leaderboard' }).click();
  await expect(page.getByText(account.displayName, { exact: true }).first()).toBeVisible();
});
