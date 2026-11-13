const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  fullyParallel: true,
  workers: process.env.CI ? 4 : 2,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    actionTimeout: 20_000,
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'rules', testDir: './rules' },
    {
      name: 'ui',
      testDir: './ui',
      use: { browserName: 'chromium', viewport: { width: 1456, height: 829 } },
    },
  ],
});
