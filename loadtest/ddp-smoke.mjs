#!/usr/bin/env node
/**
 * DDP smoke test over a real WebSocket.
 *
 * Drives the actual Meteor DDP protocol end to end through whatever is in front of
 * the app, so it proves the full path: TLS, the nginx WebSocket upgrade, DDP, the
 * methods, the scoped publications, and MongoDB.
 *
 * A browser test proves the same thing but cannot be scripted in CI. This can, and
 * it is the foundation the Phase 7 load harness builds on.
 *
 *   node loadtest/ddp-smoke.mjs wss://localhost/websocket --insecure
 *   node loadtest/ddp-smoke.mjs wss://kimply.example.com/websocket
 *
 * Exit 0 if every assertion passes, 1 otherwise.
 */

const url = process.argv[2] || 'wss://localhost/websocket';
const insecure = process.argv.includes('--insecure');

// Self-signed certificates are expected for local validation only.
if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);
let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' :: ' + detail : ''}`);
  if (!ok) failures++;
}

const ws = new WebSocket(url);
const pending = new Map(); // method id -> resolver
const subs = new Map(); // sub id -> resolver
const collections = { rooms: new Map(), rounds: new Map(), players: new Map() };

let nextId = 0;
const id = () => String(++nextId);

function send(msg) {
  ws.send(JSON.stringify(msg));
}

function callMethod(method, params = []) {
  const mid = id();
  return new Promise((resolve, reject) => {
    pending.set(mid, { resolve, reject });
    send({ msg: 'method', method, params, id: mid });
  });
}

function subscribe(name, params = []) {
  const sid = id();
  return new Promise((resolve, reject) => {
    subs.set(sid, { resolve, reject });
    send({ msg: 'sub', name, params, id: sid });
  });
}

const timeout = setTimeout(() => {
  log('TIMEOUT: test did not complete within 30s');
  process.exit(1);
}, 30000);

ws.addEventListener('open', () => {
  log(`connected to ${url}`);
  send({ msg: 'connect', version: '1', support: ['1'] });
});

ws.addEventListener('error', (e) => {
  log('WebSocket error:', e.message || e);
  process.exit(1);
});

ws.addEventListener('message', async (event) => {
  // Meteor's SockJS-free raw endpoint sends one JSON object per frame.
  let m;
  try {
    m = JSON.parse(event.data);
  } catch {
    return;
  }

  switch (m.msg) {
    case 'ping':
      send({ msg: 'pong', id: m.id });
      return;

    case 'connected':
      log(`DDP session established (${m.session})`);
      run().catch((e) => {
        log('test error:', e);
        process.exit(1);
      });
      return;

    case 'added':
    case 'changed': {
      const c = collections[m.collection];
      if (c) c.set(m.id, { ...(c.get(m.id) || {}), ...(m.fields || {}) });
      return;
    }

    case 'removed': {
      const c = collections[m.collection];
      if (c) c.delete(m.id);
      return;
    }

    case 'ready':
      for (const sid of m.subs) {
        subs.get(sid)?.resolve();
        subs.delete(sid);
      }
      return;

    case 'nosub':
      for (const [sid, p] of subs) {
        p.reject(new Error(JSON.stringify(m.error)));
        subs.delete(sid);
      }
      return;

    case 'result': {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.reason || JSON.stringify(m.error)));
      else p.resolve(m.result);
      return;
    }
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log('\n--- DDP end-to-end ---');

  // 1. Create a room. Exercises a method call, and rooms.create writes to MongoDB.
  const created = await callMethod('rooms.create', ['SmokeHost']);
  const pin = created?.pin;
  check('rooms.create returns a 5-character PIN', /^[A-Z0-9]{5}$/.test(pin || ''), pin);

  // 2. Subscribe to that room's lobby.
  await subscribe('rooms.lobby', [pin]);
  await sleep(300);
  const room = [...collections.rooms.values()].find((r) => r.pin === pin);
  check('rooms.lobby publishes the room', !!room, room ? `host=${room.hostName}` : 'not received');
  check('host is listed as a player', room?.players?.some((p) => p.name === 'SmokeHost') === true);

  // 3. A second player joins.
  await callMethod('rooms.join', [pin, 'SmokeGuest']);
  await sleep(300);
  const room2 = [...collections.rooms.values()].find((r) => r.pin === pin);
  check('join is reflected reactively over DDP', room2?.players?.length === 2, `players=${room2?.players?.length}`);

  // 4. Start the game, which generates the first round.
  await callMethod('rooms.start', [pin]);
  await sleep(500);

  // 5. Subscribe to the scoped publications.
  await subscribe('rounds', [pin]);
  await subscribe('players', [pin]);
  await sleep(400);

  const rounds = [...collections.rounds.values()];
  check('rounds publishes exactly one current round', rounds.length === 1, `count=${rounds.length}`);
  check('the round belongs to this game', rounds[0]?.gameId === pin, rounds[0]?.gameId);

  // 6. The security assertions this whole phase exists for.
  const foreign = await subscribeForeign();
  check('subscribing to a foreign gameId yields no rounds', foreign === 0, `leaked=${foreign}`);

  const playerDocs = [...collections.players.values()];
  const leaked = playerDocs.filter((p) => 'attemptedSequence' in p);
  check('no player document exposes attemptedSequence', leaked.length === 0, `leaked=${leaked.length}`);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
  clearTimeout(timeout);
  ws.close();
  process.exit(failures === 0 ? 0 : 1);
}

async function subscribeForeign() {
  const before = collections.rounds.size;
  await subscribe('rounds', ['ZZZZZ']);
  await sleep(300);
  return collections.rounds.size - before;
}
