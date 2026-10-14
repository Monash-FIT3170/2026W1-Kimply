// Raw DDP client that plays a room at machine speed. Meteor does not load tests/ into the app.
//
//   node app/tests/manual/ddpBot.mjs --url ws://localhost:3000/websocket --pin ABCDE --name Bot
//
// Join while the room is still a lobby. The script waits until the host starts, then
// submits three wrong four-colour attempts with a 20ms gap, so the player stays on
// the round long enough for the third one to remove them. A human can play the same room
// in a browser at the same time.
//
// Optional --xff 198.51.100.20 sends a spoofed X-Forwarded-For. With HTTP_FORWARDED_COUNT=0
// the server ignores it. Behind the documented one-hop proxy, count 1 keeps the appended peer.

import WebSocket from 'ws';

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

const url = option('--url', 'ws://localhost:3000/websocket');
const pin = option('--pin');
const name = option('--name', 'DdpBot');
const xff = option('--xff');
if (!pin) {
  console.error('Pass --pin for a lobby that is still open.');
  process.exit(1);
}

const headers = xff ? { 'X-Forwarded-For': xff } : undefined;
const socket = new WebSocket(url, { headers });
let nextId = 1;
const pending = new Map();
const waiters = { round: [], sequence: [] };

function send(message) {
  socket.send(JSON.stringify(message));
}

function call(method, params) {
  const id = String(nextId);
  nextId += 1;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ msg: 'method', id, method, params });
  });
}

function waitFor(kind) {
  return new Promise((resolve) => waiters[kind].push(resolve));
}

function deliver(kind, value) {
  const queued = waiters[kind].splice(0);
  if (queued.length === 0) waiters[kind].held = value;
  queued.forEach((resolve) => resolve(value));
}

socket.on('message', (raw) => {
  const message = JSON.parse(raw.toString());
  if (message.msg === 'ping') {
    send({ msg: 'pong' });
    return;
  }
  if (message.msg === 'added' && message.collection === 'rounds') {
    deliver('round', message.id);
  }
  const colours = message.fields?.secret?.sequence?.colours;
  if ((message.msg === 'added' || message.msg === 'changed') && colours) {
    deliver('sequence', message.fields.secret.sequence);
  }
  if (message.msg === 'result') {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(message.error);
    else waiter.resolve(message.result);
  }
});

socket.on('open', () => {
  send({ msg: 'connect', version: '1', support: ['1', 'pre2', 'pre1'] });
});

socket.on('message', async (raw) => {
  const message = JSON.parse(raw.toString());
  if (message.msg !== 'connected') return;
  try {
    const resumed = await call('browserSessions.resume', [null]);
    console.log(`session ${resumed.token.slice(0, 8)}…`);
    const joined = await call('rooms.join', [pin, name, null]);
    console.log(`joined ${joined.roomId} as ${joined.playerId}; waiting for the host to start`);
    send({ msg: 'sub', id: 'rounds', name: 'rounds', params: [pin] });
    const roundId = waiters.round.held || (await waitFor('round'));
    console.log(`round ${roundId}`);
    const playerId = await call('players.join', [roundId, name, pin, joined.playerId, false, null]);
    console.log(`playing as ${playerId}`);
    send({ msg: 'sub', id: 'secret', name: 'players.secret', params: [pin] });
    const sequence = waiters.sequence.held || (await waitFor('sequence'));
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const started = await call('players.startAttempt', [playerId, roundId]);
      const wrong = sequence.colours.every((colour) => colour === 'red') ? 'blue' : 'red';
      const colours = sequence.colours.map(() => wrong);
      const offsets = colours.map((_, index) => index * 20);
      await new Promise((resolve) => setTimeout(resolve, offsets.at(-1) || 0));
      try {
        const result = await call('players.submitSequence', [
          playerId,
          colours,
          { attemptId: started.attemptId, roundId, offsets },
        ]);
        console.log(`attempt ${attempt}`, result);
      } catch (error) {
        console.log(`attempt ${attempt} rejected`, error.error || error);
        if (error.error === 'removed-automation' || error.error === 'banned') break;
      }
    }
  } catch (error) {
    console.error(error.error || error);
    process.exitCode = 1;
  } finally {
    socket.close();
  }
});
