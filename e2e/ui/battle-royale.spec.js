const {
  test,
  expect,
  createRoom,
  bot,
  start,
  answer,
  seedDraft,
  seedHand,
  dbPlayer,
  waitUntil,
  yourTurn,
} = require('../lib/game');
test('Battle Royale pending Lights Out, Jump, hand wording and first place', async ({ page }) => {
  const game = await createRoom(page, { mode: 'Battle Royale' });
  game.battleRoyale = true;
  const bo = await bot(game.pin, 'Bo');
  const cy = await bot(game.pin, 'Cy');
  await start(page, game, [bo, cy]);
  await expect(page.getByTestId('round-countdown')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /REPLAY/i })).toHaveCount(0);
  await bo.answer();
  await seedDraft(bo, ['lightsOut', 'shield', 'reroll']);
  await bo.call('abilities.pick', bo.playerId, 'lightsOut', game.playerId);
  await expect(
    page.locator('#live-feed').getByText('Bo turned your lights out for your next level.', {
      exact: true,
    })
  ).toBeVisible();
  await answer(page, game);
  await expect(page.getByRole('heading', { name: 'Choose an ability' })).toBeVisible();
  await page.getByRole('button', { name: /Skip/ }).click();
  await expect(page.getByTestId('playback-effect-lightsOut')).toBeVisible();
  await cy.answer();
  await cy.call('abilities.skip', cy.playerId);
  for (const p of [bo, cy]) {
    await p.answer();
    await p.call('abilities.skip', p.playerId);
  }
  await seedHand(game, 'jump');
  await expect(page.getByRole('button', { name: /Play a card/i })).toBeVisible();
  await yourTurn(page);
  await page.keyboard.press('e');
  await expect(page.getByText('Your cards', { exact: true })).toBeVisible();
  await expect(page.getByText(/clock keeps running/i)).toHaveCount(0);
  await page.keyboard.press('1');
  await expect(page.locator('#live-feed').getByText('You jumped to level 3.', { exact: true })).toBeVisible();
  await waitUntil(async () => (await dbPlayer(game)).currentLevel === 6);
  await expect(page.getByText(/^WATCH THE SEQUENCE$/i)).toBeVisible();
  await answer(page, game);
  await page.getByRole('button', { name: /Skip/ }).click();
  await bo.call('players.leaveGame', bo.playerId);
  await cy.call('players.leaveGame', cy.playerId);
  // Battle Royale finishes when its final player stops playing.
  await answer(page, game, { correct: false });
  await expect(page.getByText('You came 1st', { exact: true })).toBeVisible();
});
