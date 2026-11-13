const { test, expect, Player, waitUntil, dbPlayer } = require('../lib/fixtures');
test('a lone entrant times out and finishes when other lobby members never enter', async () => {
  const host = new Player('Lone');
  const absent = new Player('Absent');
  await host.connect();
  await absent.connect();
  await host.create('default', { abilities: false });
  await absent.join(host.pin);
  await host.call('rooms.start', host.pin);
  await host.enter();
  await waitUntil(async () => (await dbPlayer(host)).gameFinished, 70_000, 'fallback deadline and solo game finish');
  expect((await dbPlayer(host)).eliminated).toBe(true);
});
