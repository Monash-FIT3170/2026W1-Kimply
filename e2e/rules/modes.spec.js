// Scenario 1: every game mode's presets reach the round and the players, and a game plays to the end.
const L = require('../lib/fixtures');
const { test } = L;

const PRESETS = {
  default: { lives: 3, length: 4, growth: 1, speed: 'medium' },
  easy: { lives: 5, length: 1, growth: 1, speed: 'slow' },
  medium: { lives: 3, length: 3, growth: 1, speed: 'medium' },
  hard: { lives: 1, length: 3, growth: 1, speed: 'fast' },
};

async function standardMode(mode, expected, settings = null) {
  const host = new L.Player('Host');
  const two = new L.Player('Two');
  await host.connect();
  await two.connect();
  await host.create(mode, { abilities: false, settings });
  await two.join(host.pin);
  const room = await (await L.db()).collection('rooms').findOne({ pin: host.pin });
  L.check(
    'room settings',
    room.customSettings.startingLives === expected.lives &&
      room.customSettings.startingSequenceLength === expected.length &&
      room.customSettings.sequenceGrowth === expected.growth &&
      room.customSettings.flashingSpeed === expected.speed,
    JSON.stringify(room.customSettings)
  );

  await L.startGame(host, [two]);
  const r1 = host.round();
  L.check('round 1 length', r1.lengthOfSequence === expected.length, `${r1.lengthOfSequence}`);
  L.check('round 1 has a deadline', !!r1.deadlineAt);
  L.check(
    'players start with preset lives',
    host.me().lives === expected.lives && two.me().lives === expected.lives,
    `${host.me().lives}/${two.me().lives}`
  );
  L.check('secret sequence length', host.me().secret.sequence.colours.length === expected.length);

  // Both clear round 1; round 2 grows by the preset growth.
  await host.answer(true);
  await two.answer(true);
  await L.waitUntil(() => host.round()?.roundNumber === 2, 10000, 'round 2');
  L.check(
    'round 2 length grows',
    host.round().lengthOfSequence === expected.length + expected.growth,
    `${host.round().lengthOfSequence}`
  );

  // Two runs out of lives on wrong answers; Host is last standing.
  for (let i = 0; i < expected.lives; i++) {
    const res = await two.answer(false);
    if (i < expected.lives - 1)
      L.check(`wrong answer ${i + 1} costs a life`, res.remainingLives === expected.lives - i - 1, JSON.stringify(res));
  }
  await L.waitUntil(() => host.me()?.gameFinished, 10000, 'game finished');
  L.check('Two eliminated', two.me().eliminated === true);
  L.check('Host wins', host.me().winner === true);
  L.check('everyone finished', host.me().gameFinished && two.me().gameFinished);
  host.close();
  two.close();
}

async function battleRoyale() {
  const host = new L.Player('Host');
  const two = new L.Player('Two');
  await host.connect();
  await two.connect();
  await host.create('battle_royale', { abilities: false });
  await two.join(host.pin);
  await L.startGame(host, [two], { isBattleRoyale: true });
  const r1 = host.round();
  L.check('round 1 length 4', r1.lengthOfSequence === 4);
  L.check('no deadline', r1.deadlineAt === undefined, `${r1.deadlineAt}`);
  L.check('one life each', host.me().lives === 1 && two.me().lives === 1);
  // Host levels up twice on its own, Two stays.
  await host.answer(true);
  await L.waitUntil(() => host.round()?.lengthOfSequence === 5, 10000, 'host level 2');
  await host.answer(true);
  await L.waitUntil(() => host.round()?.lengthOfSequence === 6, 10000, 'host level 3');
  L.check('host advanced independently', host.me().roundId !== two.me().roundId);
  L.check('two still on level 1', two.round().lengthOfSequence === 4);
  // Two misses: one life, so out. Host is still playing until they miss.
  await two.answer(false);
  await L.waitUntil(() => two.me()?.eliminated, 10000, 'two out');
  L.check('game not over while host still plays', !host.me().gameFinished);
  await host.answer(false);
  await L.waitUntil(() => host.me()?.gameFinished, 10000, 'game finished');
  L.check('highest level wins', host.me().winner === true && !two.me().winner);
  host.close();
  two.close();
}

for (const [mode, expected] of Object.entries(PRESETS)) {
  test(`${mode} presets, growth and elimination`, async () => standardMode(mode, expected));
}
test('custom presets, growth and elimination', async () =>
  standardMode(
    'custom',
    { lives: 2, length: 6, growth: 2, speed: 'fast' },
    {
      flashingSpeed: 'fast',
      startingLives: 2,
      startingSequenceLength: 6,
      sequenceGrowth: 2,
    }
  ));
test('Battle Royale independent levels and winner', battleRoyale);
