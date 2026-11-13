const { test, expect, createRoom, bot, start, db, noOverflow } = require('../lib/game');
test('custom settings, rename, card guide and kick', async ({ page }) => {
  const game = await createRoom(page, { mode: 'Custom', custom: true });
  const other = await bot(game.pin);
  const room = () => db().then((d) => d.collection('rooms').findOne({ pin: game.pin }));
  expect((await room()).customSettings).toMatchObject({
    flashingSpeed: 'slow',
    startingLives: 4,
    startingSequenceLength: 3,
  });
  // A new lobby starts with its name editor focused. Tab saves it before reopening Rename.
  await page.getByPlaceholder(`Game${game.pin}`).press('Tab');
  await page.getByRole('button', { name: 'Rename game' }).click();
  await page.getByPlaceholder(`Game${game.pin}`).fill('Friday Night');
  await page.getByPlaceholder(`Game${game.pin}`).press('Enter');
  await expect.poll(async () => (await room()).gameName).toBe('Friday Night');
  await page.getByRole('button', { name: /See the cards/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Abilities · 9 cards', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Steal', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Jump', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close the card guide' }).click();
  await page.getByRole('button', { name: `Kick ${other.name}`, exact: true }).click();
  await expect.poll(async () => (await room()).players.length).toBe(1);
  await noOverflow(page);
});
test('host reconnect restores host controls and can start', async ({ page }) => {
  const game = await createRoom(page, { abilities: false });
  const other = await bot(game.pin);
  await page.evaluate(() => history.replaceState(null, ''));
  await page.reload();
  await expect(page.getByText('Rejoin your game?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Rejoin', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start Game', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Kick ${other.name}`, exact: true })).toBeVisible();
  await start(page, game, [other]);
  await expect(page.getByTestId('colour-tile-red')).toBeVisible();
});
test('Back from the mode picker deletes the room without a rejoin prompt', async ({ page }) => {
  await page.goto('/play');
  await page.getByPlaceholder('Enter your username').fill('Host');
  await page.getByRole('button', { name: /Create Room/ }).click();
  await expect(page).toHaveURL(/\/play\/modes\//);
  const pin = page.url().split('/').pop();
  require('../lib/scope').current().pins.add(pin);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => db().then((d) => d.collection('rooms').findOne({ pin }))).toBeNull();
});
