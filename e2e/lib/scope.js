// A worker executes one test at a time. Never share cleanup across workers.
let active;
exports.begin = () =>
  (active = {
    people: new Set(),
    pins: new Set(),
    accounts: new Set(),
    browserTokens: new Set(),
  });
exports.current = () => {
  if (!active) throw new Error('Use the E2E test fixture');
  return active;
};
