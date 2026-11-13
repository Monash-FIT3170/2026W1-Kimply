const { test, expect, Player } = require('../lib/game');
test('room code caps, backspace and predictive composition preserve input', async ({ page }) => {
  await page.goto('/play/join?code=ab1');
  const input = page.getByRole('textbox', { name: 'Room code' });
  await expect(input).toHaveValue('AB1');
  await input.focus();
  await page.keyboard.type('c2x');
  await expect(input).toHaveValue('AB1C2');
  await page.keyboard.press('Backspace');
  await expect(input).toHaveValue('AB1C');
  const values = await input.evaluate((el) => {
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const seen = [];
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const value of ['k', 'k7', 'k7 ', 'k7m']) {
      set.call(el, value);
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          isComposing: true,
          data: value,
        })
      );
      seen.push(el.value);
    }
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'k7m' }));
    return seen;
  });
  expect(values).toEqual(['k', 'k7', 'k7 ', 'k7m']);
  await expect(input).toHaveValue('K7M');
});
test('join by Enter and sign-up return path', async ({ page }) => {
  const host = new Player('Host');
  await host.connect();
  await host.create();
  await page.goto('/play/join');
  await page.getByRole('link', { name: 'Sign up' }).click();
  expect(await page.evaluate(() => history.state.usr.returnTo)).toBe('/play/join');
  await page.goBack();
  await page.getByPlaceholder('Enter your username').fill('Visitor');
  await page.getByRole('textbox', { name: 'Room code' }).fill(host.pin);
  await page.getByRole('textbox', { name: 'Room code' }).press('Enter');
  await expect(page).toHaveURL(new RegExp(`/play/${host.pin}$`));
  await expect(page.getByText('Host', { exact: true })).toBeVisible();
});
