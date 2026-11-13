const {
  test,
  expect,
  createRoom,
  bot,
  start,
  nextRound,
  seedDraft,
  noOverflow,
  insideViewport,
} = require('../lib/game');
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test('phone lobby, board, draft and target picker fit the viewport', async ({ page }) => {
  const game = await createRoom(page);
  const bo = await bot(game.pin, 'Bo');
  const cy = await bot(game.pin, 'Cy');
  await insideViewport(page.getByRole('button', { name: 'Start Game', exact: true }));
  await noOverflow(page);
  await start(page, game, [bo, cy]);
  await insideViewport(page.getByTestId('colour-tile-red'));
  await noOverflow(page);
  await nextRound(page, game, [bo, cy], 2);
  await seedDraft(game, ['steal', 'shield', 'reroll']);
  const dialog = page.getByRole('dialog');
  await insideViewport(dialog);
  await insideViewport(dialog.getByRole('heading', { name: 'Choose an ability' }));
  await noOverflow(page);
  await page.getByRole('button', { name: /^Steal/ }).click();
  await insideViewport(dialog.getByRole('button', { name: /Bo/ }));
  await insideViewport(dialog.getByRole('button', { name: /Cy/ }));
  await noOverflow(page);
});
