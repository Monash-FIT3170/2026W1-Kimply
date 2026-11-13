const { test, expect, createRoom, noOverflow } = require('../lib/game');
for (const viewport of [
  { width: 1456, height: 829 },
  { width: 390, height: 844 },
]) {
  test(`navigation and TileLattice clipping at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByText(/Click anywhere/i)).toBeVisible();
    await noOverflow(page);
    await page.getByText(/Click anywhere/i).click();
    await expect(page).toHaveURL(/\/play$/);
    await noOverflow(page);
    await page.getByRole('link', { name: 'Leaderboard' }).click();
    await expect(page.getByRole('heading', { name: /Leaderboard/ })).toBeVisible();
    await noOverflow(page);
    await page.goto('/play/join');
    await noOverflow(page);
    await createRoom(page);
    await noOverflow(page);
  });
}
