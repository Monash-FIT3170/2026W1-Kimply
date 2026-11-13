const { test, expect, Player, startGame, dbPlayer } = require('../lib/fixtures');
test('three machine-speed attempts remove an automated player', async () => {
  const host = new Player('Host');
  const bot = new Player('Machine');
  await host.connect();
  await bot.connect();
  await host.create('default', { abilities: false });
  await bot.join(host.pin);
  await startGame(host, [bot]);
  for (let strike = 1; strike <= 3; strike++) {
    await bot.ready();
    const me = bot.me();
    const { attemptId } = await bot.call('players.startAttempt', bot.playerId, me.roundId);
    const attempt = bot.call(
      'players.submitSequence',
      bot.playerId,
      me.secret.sequence.colours.map((c) => (c === 'red' ? 'blue' : 'red')),
      {
        attemptId,
        roundId: me.roundId,
        offsets: me.secret.sequence.colours.map((_, i) => i + 1),
      }
    );
    if (strike < 3) expect((await attempt).remainingLives).toBe(3 - strike);
    else
      await expect(attempt).rejects.toMatchObject({
        error: 'removed-automation',
      });
  }
  expect(await dbPlayer(bot)).toBeNull();
});
