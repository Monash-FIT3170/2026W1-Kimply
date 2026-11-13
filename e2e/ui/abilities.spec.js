const {
  test,
  expect,
  createRoom,
  bot,
  start,
  nextRound,
  seedDraft,
  seedHand,
  dbPlayer,
  sleep,
  draftClock,
  answer,
  yourTurn,
  waitUntil,
} = require('../lib/game');
test('draft reload clock, targeting, playback, Shield and a held Free Pass', async ({ page }) => {
  const game = await createRoom(page);
  const bo = await bot(game.pin, 'Bo');
  const cy = await bot(game.pin, 'Cy');
  await start(page, game, [bo, cy]);
  await nextRound(page, game, [bo, cy], 2);
  await Promise.all([seedDraft(game, ['steal', 'shield', 'reroll']), seedDraft(bo, ['slowMo', 'shield', 'reroll'])]);
  await expect(page.getByRole('button', { name: /^Steal/ })).toBeVisible();
  await sleep(6500);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Steal/ })).toBeVisible();
  await draftClock(page, game);
  await page.getByRole('button', { name: /^Steal/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: /Bo/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Cy/ })).toBeVisible();
  await page.keyboard.press('2');
  await bo.call('abilities.pick', bo.playerId, 'slowMo', game.playerId);
  await cy.call('abilities.skip', cy.playerId);
  await expect(page.getByTestId('playback-effect-slow')).toBeVisible();
  await expect(page.locator('#live-feed').getByText('You stole a life from Cy.', { exact: true })).toBeVisible();
  expect((await dbPlayer(game)).lives).toBe(4);
  await nextRound(page, game, [bo, cy], 3);
  await Promise.all([seedDraft(game, ['shield', 'steal', 'reroll']), seedDraft(bo, ['lightsOut', 'shield', 'reroll'])]);
  await page.getByRole('button', { name: /^Shield/ }).click();
  await bo.call('abilities.pick', bo.playerId, 'lightsOut', game.playerId);
  await cy.call('abilities.skip', cy.playerId);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.locator('#live-feed').getByText("Your Shield blocked Bo's Lights Out.", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("Your Shield blocked Bo's Lights Out.", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Your Shield blocked Bo's Lights Out.", { exact: true }).last()).toBeVisible();
  await seedHand(game, 'freePass');
  await expect(page.getByRole('button', { name: /Play a card/i })).toBeVisible();
  await yourTurn(page);
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog', { name: 'Play a card' })).toBeVisible();
  await page.keyboard.press('1');
  await expect(page.getByText('Round complete', { exact: true })).toBeVisible();
  await waitUntil(async () => (await dbPlayer(game)).roundStatus === 'Passed');
});
