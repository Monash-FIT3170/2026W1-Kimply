const { test, expect, createRoom, bot, start, answer, yourTurn, dbPlayer, db } = require('../lib/game');
test('keyboard editing, wrong answer, refresh clock, Replay and tile submission', async ({ page }) => {
  const game = await createRoom(page, { abilities: false });
  const other = await bot(game.pin);
  await start(page, game, [other]);
  await yourTurn(page);
  await page.keyboard.press('w');
  await page.keyboard.press('a');
  await expect(page.getByText('Selected: 2/3', { exact: true })).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(page.getByText('Selected: 1/3', { exact: true })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText('Selected: 0/3', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Cleared. Enter the sequence from the start.', {
      exact: true,
    })
  ).toBeVisible();
  await answer(page, game, { correct: false });
  await expect(page.getByText('Wrong sequence! 2 lives remaining.', { exact: true })).toBeVisible();
  await expect(page.getByText(/^WATCH THE SEQUENCE$/i)).toBeVisible();
  await expect(page.getByTestId('hearts').locator('> div').nth(2)).toHaveCSS('background-color', 'rgb(51, 51, 51)');
  await yourTurn(page);
  // Observe every committed DOM update after reload, including brief playback states.
  await page.addInitScript(() => {
    window.sawReplay = false;
    new MutationObserver(() => {
      if (document.body?.innerText.toUpperCase().includes('WATCH THE SEQUENCE')) window.sawReplay = true;
    }).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  await page.reload();
  await yourTurn(page);
  expect(await page.evaluate(() => window.sawReplay)).toBe(false);
  const me = await dbPlayer(game);
  const round = await (await db()).collection('rounds').findOne({ _id: me.roundId });
  const seconds = Number((await page.getByTestId('round-countdown').innerText()).replace(/\D/g, ''));
  expect(Math.abs(seconds - Math.ceil((+round.deadlineAt - Date.now()) / 1000))).toBeLessThanOrEqual(2);
  await page.getByRole('button', { name: /REPLAY/i }).click();
  await expect(page.getByText(/^WATCH THE SEQUENCE$/i)).toBeVisible();
  await answer(page, game, { click: true });
  await expect(page.getByText('Round complete', { exact: true })).toBeVisible();
});
