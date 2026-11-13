const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
async function waitUntil(fn, timeoutMs = 20_000, label = 'condition') {
  const end = Date.now() + timeoutMs;
  do {
    const value = await fn();
    if (value) return value;
    await sleep(100);
  } while (Date.now() < end);
  throw new Error(`Timed out waiting for ${label}`);
}
module.exports = { sleep, waitUntil };
