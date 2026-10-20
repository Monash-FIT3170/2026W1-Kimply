#!/usr/bin/env node
/**
 * One room of N players playing real rounds over DDP, like a class all in one game.
 *
 * Each simulated player plays the current protocol, so the numbers are the game's:
 * it reads its own sequence from `players.secret`, opens an attempt with
 * `players.startAttempt`, waits out human-paced gaps (bot detection stays on and must
 * stay quiet), and submits with the offsets. From round 2 it skips the draft or
 * raises a Shield, like players who pick quickly.
 *
 * It reports method latencies and the round fan-out: how long from the first to the
 * last player seeing a new round. With several tasks and no oplog, that spread is
 * where cross-task polling shows up.
 *
 *   node loadtest/ddp-roomLoadTest.mjs wss://www.kimply.online/websocket
 *   PLAYERS=100 ROUNDS=5 LABEL="2 tasks" node loadtest/ddp-roomLoadTest.mjs wss://dev.kimply.online/websocket
 *
 * Config (env vars):
 *   PLAYERS=100   players in the one room, host included
 *   ROUNDS=5      stop once this many rounds have been played
 *   CORRECT=0.92  chance a player answers correctly
 *   LABEL=run     name for the results block
 *
 * Results are printed and appended to loadtest/logs/ddp-roomLoad-results.log.
 * It leaves its room and guest players in the target database, like any game.
 * No dependencies: Node 22+ has a global WebSocket.
 */
import { appendFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";

const URL = process.argv[2] || "ws://localhost:3000/websocket";
const N = Number(process.env.PLAYERS || 100);
const ROUNDS = Number(process.env.ROUNDS || 5);
const CORRECT = Number(process.env.CORRECT || 0.92);
const LABEL = process.env.LABEL || "run";
const THINK_MS = [1500, 6000]; // before answering
const DRAFT_MS = [1000, 5000]; // before picking
const HARD_TIMEOUT_MS = 12 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = ([a, b]) => a + Math.floor(Math.random() * (b - a));

// ---------- measurements ----------
const latency = {}; // method -> [ms]
const errors = {}; // "method:error" -> count
const roundSeen = new Map(); // roundId -> [ms when each client first saw it]
const roundNumber = new Map();

function record(method, ms, error) {
  (latency[method] ||= []).push(ms);
  if (error)
    errors[`${method}:${error}`] = (errors[`${method}:${error}`] || 0) + 1;
}

// ---------- one DDP client ----------
class Player {
  constructor(name) {
    this.name = name;
    this.store = { rounds: new Map(), players: new Map(), rooms: new Map() };
    this.pending = new Map();
    this.nextId = 0;
    this.reconnectToken = randomBytes(32).toString("base64url");
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(URL);
      this.ws.addEventListener("error", () =>
        reject(new Error("websocket error")),
      );
      this.ws.addEventListener("open", () =>
        this.send({ msg: "connect", version: "1", support: ["1"] }),
      );
      this.ws.addEventListener("message", (event) => {
        const m = JSON.parse(event.data);
        if (m.msg === "connected")
          this.call("browserSessions.resume", null).then(resolve, reject);
        else this.onMessage(m);
      });
    });
  }

  send(m) {
    this.ws.send(JSON.stringify(m));
  }

  onMessage(m) {
    if (m.msg === "ping") return this.send({ msg: "pong" });
    if (m.msg === "result") {
      const w = this.pending.get(m.id);
      if (!w) return;
      this.pending.delete(m.id);
      return m.error ? w.reject(m.error) : w.resolve(m.result);
    }
    if (m.collection === "rounds" && m.msg === "added") {
      if (!roundSeen.has(m.id)) roundSeen.set(m.id, []);
      roundSeen.get(m.id).push(Date.now());
      if (m.fields?.roundNumber) roundNumber.set(m.id, m.fields.roundNumber);
    }
    const coll = this.store[m.collection];
    if (!coll) return;
    if (m.msg === "removed") return coll.delete(m.id);
    // DDP always sends a top-level field whole, so replace rather than merge.
    const doc = { _id: m.id, ...(coll.get(m.id) || {}), ...(m.fields || {}) };
    for (const k of m.cleared || []) delete doc[k];
    coll.set(m.id, doc);
  }

  call(method, ...params) {
    const id = String(++this.nextId);
    const started = Date.now();
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: (r) => (record(method, Date.now() - started), resolve(r)),
        reject: (e) => (
          record(method, Date.now() - started, e.error || e.reason),
          reject(e)
        ),
      });
      this.send({ msg: "method", id, method, params });
    });
  }

  sub(name, ...params) {
    this.send({ msg: "sub", id: `${name}:${params.join(",")}`, name, params });
  }

  me() {
    return this.store.players.get(this.playerId);
  }

  round() {
    const me = this.me();
    return me && this.store.rounds.get(me.roundId);
  }

  async enter(pin, lobbyId) {
    this.sub("rounds", pin);
    const deadline = Date.now() + 30000;
    while (!this.store.rounds.size) {
      if (Date.now() > deadline) throw new Error("no round");
      await sleep(100);
    }
    const roundId = [...this.store.rounds.keys()][0];
    this.playerId = await this.call(
      "players.join",
      roundId,
      this.name,
      pin,
      lobbyId,
      false,
      null,
      this.reconnectToken,
    );
    this.sub("players", pin);
    this.sub("players.secret", pin);
  }

  // Answer like a person: 90-200 ms between colours, and really wait them out.
  async answer(correct) {
    const me = this.me();
    const roundId = me.roundId;
    const expected = me.secret.sequence.colours;
    const colours = correct
      ? expected
      : expected.map((c) => (c === "red" ? "blue" : "red"));
    const { attemptId } = await this.call(
      "players.startAttempt",
      this.playerId,
      roundId,
    );
    const offsets = [];
    let t = 0;
    for (let i = 0; i < colours.length; i++)
      offsets.push((t += 90 + Math.floor(Math.random() * 110)));
    await sleep(t);
    return this.call("players.submitSequence", this.playerId, colours, {
      attemptId,
      roundId,
      offsets,
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function play(p, finished) {
  const done = new Set();
  while (!finished()) {
    const me = p.me();
    if (me && (me.eliminated || me.gameFinished)) return;
    const round = p.round();
    const draft = me?.secret?.draft;
    if (
      draft?.status === "open" &&
      draft.roundId === me.roundId &&
      !done.has(`draft:${me.roundId}`)
    ) {
      done.add(`draft:${me.roundId}`);
      await sleep(rand(DRAFT_MS));
      const shield = Math.random() < 0.5 && draft.offered.includes("shield");
      await (
        shield
          ? p.call("abilities.pick", p.playerId, "shield")
          : p.call("abilities.skip", p.playerId)
      ).catch(() => {});
      continue;
    }
    const seq = me?.secret?.sequence;
    const ready =
      round &&
      (!round.draft || round.draft.resolved) &&
      seq?.roundId === me.roundId &&
      !me.completeRound;
    const key = `${me?.roundId}:${seq?.version}:${me?.lives}`;
    if (ready && !done.has(key)) {
      done.add(key);
      await sleep(rand(THINK_MS));
      await p.answer(Math.random() < CORRECT).catch(() => done.delete(key));
      continue;
    }
    await sleep(150);
  }
}

// ---------- report ----------
const pct = (arr, q) =>
  [...arr].sort((a, b) => a - b)[
    Math.min(arr.length - 1, Math.floor((q / 100) * arr.length))
  ];
const stat = (arr) =>
  arr?.length
    ? `n=${arr.length} p50=${pct(arr, 50)} p95=${pct(arr, 95)} p99=${pct(arr, 99)} max=${Math.max(...arr)} ms`
    : "n=0";

// ---------- scenario ----------
const started = Date.now();
console.log(`[${LABEL}] ${N} players, ${ROUNDS} rounds -> ${URL}`);
const host = new Player("LoadHost");
await host.connect();
const { pin, hostId } = await host.call("rooms.create", "LoadHost", null);
host.sub("rooms.lobby", pin);
console.log(`[${LABEL}] room ${pin}`);

const guests = [];
await Promise.all(
  Array.from({ length: N - 1 }, async (_, i) => {
    await sleep(i * 30); // a class arriving over a few seconds
    const g = new Player(`Load${String(i + 1).padStart(3, "0")}`);
    try {
      await g.connect();
      g.lobbyId = (await g.call("rooms.join", pin, g.name, null)).playerId;
      g.sub("rooms.lobby", pin);
      guests.push(g);
    } catch (e) {
      record("connect/join", 0, e.error || e.message);
    }
  }),
);
host.lobbyId = hostId;
const players = [host, ...guests];
console.log(`[${LABEL}] lobby: ${players.length}/${N}`);

await host.call("rooms.start", pin);
const entered = await Promise.all(
  players.map((p) =>
    p.enter(pin, p.lobbyId).then(
      () => true,
      () => false,
    ),
  ),
);
console.log(
  `[${LABEL}] in game: ${entered.filter(Boolean).length}/${players.length}`,
);

const reachedRound = () =>
  Math.max(0, ...players.map((p) => p.round()?.roundNumber ?? 0));
const finished = () =>
  reachedRound() > ROUNDS ||
  players.every((p) => !p.me() || p.me().gameFinished || p.me().eliminated) ||
  Date.now() - started > HARD_TIMEOUT_MS;
await Promise.all(
  players.filter((p) => p.playerId).map((p) => play(p, finished)),
);

const fanout = [...roundSeen.entries()]
  .filter(([id]) => (roundNumber.get(id) ?? 0) > 1)
  .sort(([a], [b]) => roundNumber.get(a) - roundNumber.get(b))
  .map(([id, seen]) => {
    const first = Math.min(...seen);
    return `  round ${roundNumber.get(id)}: seen by ${seen.length}, spread ${Math.max(...seen) - first} ms, p95 ${pct(
      seen.map((t) => t - first),
      95,
    )} ms`;
  });

const report = [
  `===== ${LABEL} =====`,
  `target ${URL}  room ${pin}  ${new Date().toISOString()}`,
  `players ${players.length}/${N}, entered ${entered.filter(Boolean).length}, rounds reached ${reachedRound()}, wall ${Math.round((Date.now() - started) / 1000)} s`,
  `rooms.join             ${stat(latency["rooms.join"])}`,
  `players.join           ${stat(latency["players.join"])}`,
  `players.startAttempt   ${stat(latency["players.startAttempt"])}`,
  `players.submitSequence ${stat(latency["players.submitSequence"])}`,
  `abilities.pick/skip    ${stat([...(latency["abilities.pick"] || []), ...(latency["abilities.skip"] || [])])}`,
  "round fan-out (first to last player seeing a new round):",
  ...fanout,
  `errors: ${JSON.stringify(errors)}`,
].join("\n");
console.log(report);

const logDir = join(dirname(fileURLToPath(import.meta.url)), "logs");
mkdirSync(logDir, { recursive: true });
appendFileSync(join(logDir, "ddp-roomLoad-results.log"), report + "\n\n");
for (const p of players) p.close();
process.exit(0);
