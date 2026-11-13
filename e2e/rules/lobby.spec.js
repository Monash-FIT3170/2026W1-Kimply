// Scenario 3: the lobby. Joining, names, kick, rename, modes and settings, reconnect, host leaving.
const L = require('../lib/fixtures');
const { test } = L;

test('Lobby validation, settings and ownership', async () => {
  const d = await L.db();
  const room = (pin) => d.collection('rooms').findOne({ pin });
  const people = [];
  const make = async (name, token) => {
    const p = new L.Player(name);
    await p.connect(token);
    people.push(p);
    return p;
  };
  try {
    const host = await make('Host');
    const pin = await host.create('default');
    let r = await room(pin);
    L.check(
      'room created in default mode with abilities on',
      r.gameMode === 'default' && r.abilitiesEnabled === true && r.status === 'lobby'
    );
    L.check('hostId is recorded', r.hostId === host.lobbyId);
    L.check('host is the first player', r.players.length === 1 && r.players[0].name === 'Host');

    const ann = await make('Ann');
    await ann.join(pin);
    await L.expectError('duplicate name rejected, case-insensitive', (await make('ANN')).join(pin), 'name-taken');
    await L.expectError('blank name rejected', (await make('   ')).join(pin), 'invalid');
    await L.expectError('unknown room', (await make('Zed')).join('ZZZZZ'), 'not-found');

    // Rename the game.
    await host.call('rooms.updateGameName', pin, 'Friday Night');
    L.check('game renamed', (await room(pin)).gameName === 'Friday Night');

    // Modes and settings.
    await host.call('rooms.setGameMode', pin, 'hard');
    r = await room(pin);
    L.check('mode change copies the preset', r.gameMode === 'hard' && r.customSettings.startingLives === 1);
    await L.expectError(
      'settings refused outside custom',
      host.call('rooms.updateSettings', pin, { startingLives: 9 }),
      'not-custom-mode'
    );
    await host.call('rooms.setGameMode', pin, 'custom');
    await L.expectError(
      'bad speed refused',
      host.call('rooms.updateSettings', pin, { flashingSpeed: 'warp' }),
      'invalid-speed'
    );
    await L.expectError(
      'zero lives refused',
      host.call('rooms.updateSettings', pin, { startingLives: 0 }),
      'invalid-lives'
    );
    await L.expectError(
      'fractional length refused',
      host.call('rooms.updateSettings', pin, { startingSequenceLength: 2.5 }),
      'invalid-length'
    );
    await L.expectError(
      'zero growth refused',
      host.call('rooms.updateSettings', pin, { sequenceGrowth: 0 }),
      'invalid-growth'
    );
    await host.call('rooms.updateSettings', pin, { startingLives: 4 });
    L.check(
      'valid custom setting saved, others kept',
      (await room(pin)).customSettings.startingLives === 4 &&
        (await room(pin)).customSettings.startingSequenceLength === 4
    );
    await host.call('rooms.setAbilities', pin, false);
    L.check('abilities switched off', (await room(pin)).abilitiesEnabled === false);
    await L.expectError('abilities flag must be boolean', host.call('rooms.setAbilities', pin, 'yes'), 'invalid');

    // Kick.
    const bo = await make('Bo');
    await bo.join(pin);
    await host.call('rooms.kick', pin, bo.lobbyId);
    L.check('kicked player removed', !(await room(pin)).players.some((p) => p.name === 'Bo'));
    await L.expectError('cannot kick the host', host.call('rooms.kick', pin, host.lobbyId), 'invalid');

    // A player who leaves the lobby page.
    const cy = await make('Cy');
    await cy.join(pin);
    await cy.call('rooms.disconnect', pin, cy.lobbyId);
    L.check('leaving player removed', !(await room(pin)).players.some((p) => p.name === 'Cy'));

    // Reconnect from the same browser, new connection.
    const dee = await make('Dee');
    await dee.join(pin);
    dee.close();
    await L.waitUntil(
      async () => (await room(pin)).players.find((p) => p.name === 'Dee')?.connected === false,
      5000,
      'dee disconnected'
    );
    const deeBack = await make('Dee', dee.browserToken);
    const back = await deeBack.call('rooms.reconnect', pin, dee.lobbyId);
    L.check('reconnect returns the name', back.playerName === 'Dee');
    L.check('reconnect marks connected', (await room(pin)).players.find((p) => p.name === 'Dee').connected === true);
    const stranger = await make('Mallory');
    await L.expectError(
      'another browser cannot take a lobby seat',
      stranger.call('rooms.reconnect', pin, ann.lobbyId),
      'not-yours'
    );

    const hostBack = await host.call('rooms.reconnect', pin, host.lobbyId);
    L.check('host reconnect restores host controls', hostBack.isHost === true);
    const joinerBack = await ann.call('rooms.reconnect', pin, ann.lobbyId);
    L.check('joiner is not host', joinerBack.isHost === false);
    await L.waitUntil(() => host.docs('rooms').length);
    L.check('hostId stays private', !('hostId' in host.docs('rooms')[0]));

    // Someone who leaves before the start is pruned at start.
    const eve = await make('Eve');
    await eve.join(pin);
    eve.close();
    await L.waitUntil(
      async () => (await room(pin)).players.find((p) => p.name === 'Eve')?.connected === false,
      5000,
      'eve disconnected'
    );
    await host.call('rooms.start', pin);
    r = await room(pin);
    L.check(
      'start prunes disconnected lobby players',
      !r.players.some((p) => p.name === 'Eve'),
      r.players.map((p) => p.name).join(',')
    );
    L.check('room in progress', r.status === 'in_progress');
    await L.expectError('cannot join a started game', (await make('Late')).join(pin), 'not-lobby');
    await L.expectError('cannot rename a started game', host.call('rooms.updateGameName', pin, 'x'), 'not-lobby');
    await L.expectError('cannot kick in a started game', host.call('rooms.kick', pin, ann.lobbyId), 'not-lobby');
    await L.expectError('cannot start twice', host.call('rooms.start', pin), 'not-lobby');
    const round1 = await d.collection('rounds').findOne({ gameId: pin });
    L.check('custom lives reach the game', round1 && round1.lives === 4, `${round1 && round1.lives}`);

    // Host leaving a lobby deletes it.
    const host2 = await make('Host2');
    const pin2 = await host2.create('default');
    const fay = await make('Fay');
    await fay.join(pin2);
    await host2.call('rooms.disconnect', pin2, host2.lobbyId);
    L.check('host leaving deletes the room', !(await room(pin2)));
  } finally {
    for (const p of people) p.close();
  }
});
