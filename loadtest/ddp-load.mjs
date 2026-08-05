#!/usr/bin/env node
/**
 * Kimply load test: N concurrent players over real DDP.
 *
 * Drives the actual protocol with real WebSocket connections, so it exercises the
 * whole path - TLS, the nginx upgrade, DDP, methods, the scoped publications and
 * MongoDB - rather than approximating it with HTTP requests.
 *
 *   node loadtest/ddp-load.mjs --players 100 --rooms 13
 *   node loadtest/ddp-load.mjs --players 100 --rooms 1     # worst case: one big room
 *   node loadtest/ddp-load.mjs --players 20 --rooms 4 --rounds 5
 *   node loadtest/ddp-load.mjs --url wss://localhost/websocket --insecure
 *
 * Two things it asserts that a pure latency test would miss, both targeting the
 * documented read-then-write races in gameMethods.js:
 *
 *   - exactly ONE round is current per game after a synchronised submission burst
 *   - at most ONE winner per game
 *
 * Submissions are released from a barrier so every player in a room submits within
 * a few milliseconds of each other. That is the burst the races need to appear;
 * players trickling in one at a time would never trigger them.
 *
 * No dependencies - uses Node's built-in WebSocket (Node 22+).
 */

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? dflt : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);

const URL_ = opt('url', 'wss://kimply.online/websocket');
const PLAYERS = parseInt(opt('players', '100'), 10);
const ROOMS = parseInt(opt('rooms', '13'), 10);
const ROUNDS = parseInt(opt('rounds', '3'), 10);
const RAMP_MS = parseInt(opt('ramp', '5000'), 10);

if (flag('insecure')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 23)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- metrics ---------------------------------------------------------------
const samples = { connect: [], method: {}, roundAdvance: [] };
const errors = [];
function record(bucket, ms, key) {
  if (key) (samples.method[key] ??= []).push(ms);
  else samples[bucket].push(ms);
}
function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
const fmt = (n) => (n === null ? '   -' : `${Math.round(n)}ms`);

// --- a single DDP client ---------------------------------------------------
class Client {
  constructor(name) {
    this.name = name;
    this.pending = new Map();
    this.subs = new Map();
    this.store = { rooms: new Map(), rounds: new Map(), players: new Map() };
    this.nextId = 0;
    this.closed = false;
  }

  connect() {
    const t0 = Date.now();
    return new Promise((resolve, reject) => {
      const ws = (this.ws = new WebSocket(URL_));
      const timer = setTimeout(() => reject(new Error('connect timeout')), 30000);

      ws.addEventListener('error', (e) => {
        clearTimeout(timer);
        reject(new Error(`ws error: ${e.message || 'unknown'}`));
      });
      ws.addEventListener('close', () => {
        this.closed = true;
      });
      ws.addEventListener('open', () => ws.send(JSON.stringify({ msg: 'connect', version: '1', support: ['1'] })));
      ws.addEventListener('message', (ev) => {
        let m;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        switch (m.msg) {
          case 'ping':
            ws.send(JSON.stringify({ msg: 'pong', id: m.id }));
            return;
          case 'connected':
            clearTimeout(timer);
            record('connect', Date.now() - t0);
            resolve(this);
            return;
          case 'added':
          case 'changed': {
            const c = this.store[m.collection];
            // _id arrives as the message's `id`, never inside `fields`. Without
            // folding it in, doc._id is undefined - which silently passes
            // roundId: null to players.join and only surfaces much later as an
            // unhandled TypeError inside submitSequence.
            if (c) c.set(m.id, { _id: m.id, ...(c.get(m.id) || {}), ...(m.fields || {}) });
            return;
          }
          case 'removed':
            this.store[m.collection]?.delete(m.id);
            return;
          case 'ready':
            for (const s of m.subs) {
              this.subs.get(s)?.resolve();
              this.subs.delete(s);
            }
            return;
          case 'result': {
            const p = this.pending.get(m.id);
            if (!p) return;
            this.pending.delete(m.id);
            record(null, Date.now() - p.t0, p.method);
            if (m.error) {
              errors.push(`${p.method}: ${m.error.reason || m.error.message || 'error'}`);
              p.reject(new Error(m.error.reason || 'method error'));
            } else p.resolve(m.result);
            return;
          }
        }
      });
    });
  }

  call(method, params = []) {
    const id = String(++this.nextId);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method, t0: Date.now() });
      this.ws.send(JSON.stringify({ msg: 'method', method, params, id }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          errors.push(`${method}: timeout`);
          reject(new Error(`${method} timeout`));
        }
      }, 30000);
    });
  }

  sub(name, params = []) {
    const id = String(++this.nextId);
    return new Promise((resolve, reject) => {
      this.subs.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ msg: 'sub', name, params, id }));
      setTimeout(() => this.subs.has(id) && (this.subs.delete(id), resolve()), 15000);
    });
  }

  currentRound(gameId) {
    return [...this.store.rounds.values()].find((r) => r.gameId === gameId && r.isCurrent);
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

// --- the test --------------------------------------------------------------
const perRoom = Math.ceil(PLAYERS / ROOMS);

async function main() {
  console.log(`\nKimply load test`);
  console.log(`  target   ${URL_}`);
  console.log(`  players  ${PLAYERS} across ${ROOMS} room(s), ~${perRoom} per room`);
  console.log(`  rounds   ${ROUNDS}`);
  console.log(`  ramp     ${RAMP_MS}ms\n`);

  // 1. Connect everyone, ramped. A thundering herd would measure the ramp, not
  //    the server.
  log(`connecting ${PLAYERS} clients...`);
  const clients = [];
  const gap = RAMP_MS / PLAYERS;
  await Promise.all(
    Array.from({ length: PLAYERS }, async (_, i) => {
      await sleep(i * gap);
      try {
        const c = new Client(`p${i}`);
        await c.connect();
        clients.push(c);
      } catch (e) {
        errors.push(`connect: ${e.message}`);
      }
    })
  );
  log(`connected ${clients.length}/${PLAYERS}`);
  if (!clients.length) throw new Error('no clients connected');

  // 2. One host per room creates it.
  log(`creating ${ROOMS} room(s)...`);
  const rooms = [];
  for (let r = 0; r < ROOMS; r++) {
    const host = clients[r * perRoom];
    if (!host) break;
    try {
      const { pin } = await host.call('rooms.create', [`Host${r}`]);
      rooms.push({ pin, host, members: [host] });
    } catch (e) {
      errors.push(`rooms.create: ${e.message}`);
    }
  }
  log(`created ${rooms.length} room(s)`);

  // 3. Everyone else joins.
  log('joining players...');
  await Promise.all(
    clients.map(async (c, i) => {
      const room = rooms[Math.floor(i / perRoom)];
      if (!room || room.host === c) return;
      try {
        await c.call('rooms.join', [room.pin, `P${i}`]);
        room.members.push(c);
      } catch (e) {
        errors.push(`rooms.join: ${e.message}`);
      }
    })
  );
  log(`rooms populated: ${rooms.map((r) => r.members.length).join(', ')}`);

  // 4. Start every game, then subscribe and join the game itself.
  log('starting games...');
  await Promise.all(rooms.map((r) => r.host.call('rooms.start', [r.pin]).catch((e) => errors.push(`rooms.start: ${e.message}`))));
  await sleep(1500);

  await Promise.all(
    rooms.flatMap((room) =>
      room.members.map(async (c) => {
        try {
          await c.sub('rounds', [room.pin]);
          // --no-player-sub halves the number of live cursors on the server.
          // Meteor cannot use oplog tailing against an Atlas shared tier, so it
          // falls back to poll-and-diff: every write re-polls every matching
          // cursor. If observer work is the bottleneck, dropping this
          // subscription should move latency noticeably.
          if (!flag('no-player-sub')) await c.sub('players', [room.pin]);
          const round = c.currentRound(room.pin);
          if (!round) return errors.push(`no current round for ${room.pin}`);
          c.playerId = await c.call('players.join', [round._id, c.name, room.pin]);
          c.gameId = room.pin;
        } catch (e) {
          errors.push(`players.join: ${e.message}`);
        }
      })
    )
  );
  const active = clients.filter((c) => c.playerId);
  log(`${active.length} players in game`);

  // 5. Play rounds. Every player in a room submits from a shared barrier so the
  //    writes genuinely collide - this is what the race assertions need.
  for (let round = 1; round <= ROUNDS; round++) {
    log(`round ${round}: releasing ${active.length} simultaneous submissions`);
    const t0 = Date.now();
    await Promise.all(
      active.map(async (c) => {
        const r = c.currentRound(c.gameId);
        if (!r?.sequence) return;
        try {
          await c.call('players.submitSequence', [c.playerId, r.sequence]);
        } catch (e) {
          errors.push(`submit: ${e.message}`);
        }
      })
    );
    record('roundAdvance', Date.now() - t0);
    await sleep(2000);
  }

  // 6. Correctness under concurrency - the part a latency test would miss.
  log('checking for race conditions...');
  const violations = [];
  for (const room of rooms) {
    const c = room.members.find((m) => m.playerId) || room.host;
    const current = [...c.store.rounds.values()].filter((r) => r.gameId === room.pin && r.isCurrent);
    if (current.length > 1) violations.push(`${room.pin}: ${current.length} concurrent "isCurrent" rounds (double advance)`);
    const winners = [...c.store.players.values()].filter((p) => p.gameId === room.pin && p.winner);
    if (winners.length > 1) violations.push(`${room.pin}: ${winners.length} winners`);
  }

  report(clients, violations);
  clients.forEach((c) => c.close());
}

function report(clients, violations) {
  console.log('\n' + '='.repeat(64));
  console.log('RESULTS');
  console.log('='.repeat(64));

  console.log(`\n  connections           ${clients.length}/${PLAYERS}`);
  console.log(`  connect p50/p95/p99   ${fmt(pct(samples.connect, 50))} / ${fmt(pct(samples.connect, 95))} / ${fmt(pct(samples.connect, 99))}`);

  console.log('\n  method latency        p50      p95      p99      n');
  for (const [m, arr] of Object.entries(samples.method).sort()) {
    console.log(`    ${m.padEnd(20)}${fmt(pct(arr, 50)).padStart(7)}  ${fmt(pct(arr, 95)).padStart(7)}  ${fmt(pct(arr, 99)).padStart(7)}  ${arr.length}`);
  }

  if (samples.roundAdvance.length) {
    console.log(`\n  full round (all players submit, barrier-released)`);
    console.log(`    p50/p95             ${fmt(pct(samples.roundAdvance, 50))} / ${fmt(pct(samples.roundAdvance, 95))}`);
  }

  console.log(`\n  errors                ${errors.length}`);
  if (errors.length) {
    // Group on the whole message, not just the method name. The reason is the
    // entire point - "submitSequence failed" tells you nothing actionable.
    const counts = {};
    for (const e of errors) counts[e] = (counts[e] || 0) + 1;
    for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`    ${String(v).padStart(5)}x  ${k}`);
    }
  }

  console.log(`\n  race violations       ${violations.length}`);
  for (const v of violations) console.log(`    ${v}`);
  if (!violations.length) console.log('    none detected this run');
  console.log('\n' + '='.repeat(64) + '\n');
}

main().catch((e) => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
