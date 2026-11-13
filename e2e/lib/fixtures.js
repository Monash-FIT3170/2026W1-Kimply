const { test: base, expect } = require('@playwright/test');
const scope = require('./scope');
const database = require('./db');
const test = base.extend({
  ownedData: [
    async ({}, use) => {
      scope.begin();
      try {
        await use();
      } finally {
        await database.cleanup();
      }
    },
    { auto: true },
  ],
});
const check = (label, ok, detail = '') => expect(Boolean(ok), `${label}${detail ? `: ${detail}` : ''}`).toBe(true);
async function expectError(label, promise, code) {
  await expect(promise, label).rejects.toMatchObject({ error: code });
}
module.exports = {
  test,
  expect,
  check,
  expectError,
  ...database,
  ...require('./ddp'),
  ...require('./wait'),
};
