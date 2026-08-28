#!/usr/bin/env node

import WebSocket from "ws";

/**
 * DDP round-latency test: N concurrent players actively playing, not just joining.
 *
 * Builds on ddp-load.mjs, but instead of stopping after everyone joins, this
 * keeps every player submitting sequence guesses for real rounds and measures:
 *
 *   1. players.submitSequence latency (method round-trip, per-call)
 *   2. Round-transition fan-out spread: when a round advances, how long does
 *      it take between the FIRST client to see the new round and the LAST
 *      client to see it? This is the number that degrades under load if
 *      the `rounds` publication or its underlying query gets slow to fan out.
 *
 * ASSUMPTIONS (check these against your actual publish functions):
 *   - The `rounds` publication exposes `sequence` and `lengthOfSequence` to
 *     clients (needed so a real client can display the sequence to guess).
 *   - `attemptedSequence` on PLAYER docs is stripped from the `players` pub
 *     (per your existing smoke test) — this script never reads it.
 *   - Each client can identify "its own" player doc by matching `name` in
 *     the `players` publication, since we don't assume a method's return
 *     shape for the player id.
 *
 * Usage:
 *    node ddp-round-latency-test.mjs wss://localhost/websocket --insecure
 *
 * Config (env vars):
 *    PLAYERS = 20            total simulated players (host + guests) in the one room
 *    JOIN_WINDOW_MS = 500    spread guest joins over this window
 *    ROUNDS_TO_OBSERVE = 5   stop once this many round transitions have been seen
 *    CORRECT_GUESS_RATE = 0.7  fraction of submissions that guess correctly
 *    THINK_MS_MIN = 200      simulated human delay before submitting, min
 *    THINK_MS_MAX = 1200     simulated human delay before submitting, max
 *    HARD_TIMEOUT_MS = 60000 safety cutoff in case rounds stop advancing
 */

// If you switch to the `ws` package instead, replace the line above with:

const url = process.argv[2] || "wss://localhost/websocket";
const insecure = process.argv.includes("--insecure");
if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const CONFIG = {
  totalPlayers: Number(process.env.PLAYERS || 20),
  joinWindowMs: Number(process.env.JOIN_WINDOW_MS || 500),
  roundsToObserve: Number(process.env.ROUNDS_TO_OBSERVE || 5),
  correctGuessRate: Number(process.env.CORRECT_GUESS_RATE || 0.7),
  thinkMsMin: Number(process.env.THINK_MS_MIN || 200),
  thinkMsMax: Number(process.env.THINK_MS_MAX || 1200),
  hardTimeoutMs: Number(process.env.HARD_TIMEOUT_MS || 60000),
  connectTimeoutMs: 10000,
};

const COLOURS = ["red", "blue", "green", "yellow"];

// ---------- stats ----------

const stats = {
  connectOk: 0,
  connectFail: 0,
  connectTimesMs: [],
  methodLatenciesMs: {},
  methodErrors: {},
  subLatenciesMs: {},
  subErrors: {},
  errorsLog: [],
};

// roundId -> array of { playerId, seenAtMs }
// Used to compute fan-out spread: how long between the first and last
// client observing the same round transition.
const roundObservations = new Map();

function recordMethod(name, ms, ok) {
  (stats.methodLatenciesMs[name] ||= []).push(ms);
  if (!ok) stats.methodErrors[name] = (stats.methodErrors[name] || 0) + 1;
}

function recordSub(name, ms, ok) {
  (stats.subLatenciesMs[name] ||= []).push(ms);
  if (!ok) stats.subErrors[name] = (stats.subErrors[name] || 0) + 1;
}

function percentile(arr, p) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  ];
}

function summarize(label, arr) {
  if (!arr.length) return `${label}: no samples`;
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  return (
    `${label}: n=${arr.length} avg=${avg.toFixed(0)}ms p50=${percentile(arr, 50)}ms ` +
    `p95=${percentile(arr, 95)}ms p99=${percentile(arr, 99)}ms max=${Math.max(...arr)}ms`
  );
}

// ---------- minimal DDP client ----------

class DDPClient {
  constructor(id) {
    this.id = id;
    this.ws = null;
    this.pending = new Map();
    this.subs = new Map();
    this.collections = {};
    this._nextId = 0;
    this._onConnected = null;
    // External hook: called with every parsed DDP message, before internal
    // handling. Lets gameplay code observe raw added/changed/removed events
    // (e.g. to detect round transitions) without changing this class.
    this.onMessage = null;
  }

  _id() {
    return String(++this._nextId);
  }

  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }

  connect() {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const to = setTimeout(
        () => reject(new Error("connect timeout")),
        CONFIG.connectTimeoutMs,
      );

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.send({ msg: "connect", version: "1", support: ["1"] });
      };

      this.ws.onerror = (e) => {
        clearTimeout(to);
        reject(new Error(e.message || "ws error"));
      };

      this.ws.onclose = () => {};

      this.ws.onmessage = (event) => this._onMessage(event);

      this._onConnected = () => {
        clearTimeout(to);
        stats.connectTimesMs.push(Date.now() - start);
        resolve();
      };
    });
  }

  _onMessage(event) {
    let m;
    try {
      m = JSON.parse(event.data);
    } catch {
      return;
    }

    this.onMessage?.(m);

    switch (m.msg) {
      case "ping":
        this.send({ msg: "pong", id: m.id });
        return;

      case "connected":
        this._onConnected?.();
        return;

      case "added":
      case "changed": {
        const c = (this.collections[m.collection] ||= new Map());
        c.set(m.id, { ...(c.get(m.id) || {}), ...(m.fields || {}) });
        return;
      }

      case "removed":
        this.collections[m.collection]?.delete(m.id);
        return;

      case "ready":
        for (const sid of m.subs) {
          this.subs.get(sid)?.resolve();
          this.subs.delete(sid);
        }
        return;

      case "nosub": {
        const p = this.subs.get(m.id);
        if (p) {
          p.reject(new Error(JSON.stringify(m.error)));
          this.subs.delete(m.id);
        }
        return;
      }

      case "result": {
        const p = this.pending.get(m.id);
        if (!p) return;

        this.pending.delete(m.id);
        if (m.error)
          p.reject(new Error(m.error.reason || JSON.stringify(m.error)));
        else p.resolve(m.result);
        return;
      }
    }
  }

  call(method, params = []) {
    const method_id = this._id();
    const start = Date.now();

    return new Promise((resolve, reject) => {
      this.pending.set(method_id, {
        resolve: (r) => {
          recordMethod(method, Date.now() - start, true);
          resolve(r);
        },
        reject: (e) => {
          recordMethod(method, Date.now() - start, false);
          stats.errorsLog.push(
            `[client ${this.id}] method ${method}: ${e.message}`,
          );
          reject(e);
        },
      });
      this.send({ msg: "method", method, params, id: method_id });
    });
  }

  subscribe(name, params = []) {
    const sub_id = this._id();
    const start = Date.now();

    return new Promise((resolve, reject) => {
      this.subs.set(sub_id, {
        resolve: () => {
          recordSub(name, Date.now() - start, true);
          resolve();
        },
        reject: (e) => {
          recordSub(name, Date.now() - start, false);
          stats.errorsLog.push(`[client ${this.id}] sub ${name}: ${e.message}`);
          reject(e);
        },
      });
      this.send({ msg: "sub", name, params, id: sub_id });
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randInt = (min, max) => Math.floor(min + Math.random() * (max - min));
const randomSequence = (len) =>
  Array.from(
    { length: len },
    () => COLOURS[Math.floor(Math.random() * COLOURS.length)],
  );

// ---------- connection + join ----------

async function connectClient(playerId) {
  const client = new DDPClient(playerId);
  try {
    await client.connect();
    stats.connectOk++;
    return client;
  } catch (e) {
    stats.connectFail++;
    stats.errorsLog.push(`[client ${playerId}] connect failed: ${e.message}`);
    return null;
  }
}

async function runHost(playerId, playerName) {
  const client = await connectClient(playerId);
  if (!client) return null;
  try {
    const created = await client.call("rooms.create", [playerName]);
    await client.subscribe("rooms.lobby", [created.pin]);
    return { client, pin: created.pin, name: playerName };
  } catch (e) {
    client.close();
    return null;
  }
}

async function runGuestJoin(playerId, playerName, pin) {
  const client = await connectClient(playerId);
  if (!client) return null;
  try {
    await client.call("rooms.join", [pin, playerName]);
    await client.subscribe("rooms.lobby", [pin]);
    return { client, pin, name: playerName };
  } catch (e) {
    client.close();
    return null;
  }
}

// ---------- gameplay ----------

// Watches this client's `rounds` collection for the current round and
// records a timestamp the first time each new roundId is observed by THIS
// client, into the shared roundObservations map keyed by roundId.
function trackRoundTransitions(participant) {
  const { client } = participant;
  let lastSeenRoundId = null;

  client.onMessage = (m) => {
    if (m.msg !== "added" && m.msg !== "changed") return;
    if (m.collection !== "rounds") return;

    if (m.id !== lastSeenRoundId) {
      lastSeenRoundId = m.id;
      const seenAt = Date.now();
      const arr = roundObservations.get(m.id) || [];
      arr.push({ playerId: client.id, seenAtMs: seenAt });
      roundObservations.set(m.id, arr);
    }
  };
}

// One player's play loop: waits for a round to be visible, "thinks" for a
// bit (simulated human delay), then submits a guess — repeating until the
// player is eliminated, the game finishes, or roundsToObserve is reached.
async function playLoop(participant, getPlayerId, getOwnPlayerDoc, isGameOver) {
  const { client } = participant;

  while (!isGameOver()) {
    const roundsMap = client.collections.rounds;
    const currentRound = roundsMap ? [...roundsMap.values()][0] : null;
    const ownDoc = getOwnPlayerDoc();

    // Nothing to do yet, or already eliminated/finished — just wait.
    if (!currentRound || !ownDoc || ownDoc.eliminated || ownDoc.gameFinished) {
      await sleep(150);
      continue;
    }

    // Already completed THIS round correctly — wait for the next one rather
    // than resubmitting. Only skip if the player's own roundId matches the
    // currently-published round (guards against stale doc reads).
    if (ownDoc.roundId === currentRound._id && ownDoc.completeRound) {
      await sleep(150);
      continue;
    }

    const playerId = getPlayerId();
    if (!playerId) {
      await sleep(150);
      continue;
    }

    // simulated human delay before acting
    await sleep(randInt(CONFIG.thinkMsMin, CONFIG.thinkMsMax));

    const guessCorrectly = Math.random() < CONFIG.correctGuessRate;
    const guess =
      guessCorrectly && currentRound.sequence
        ? currentRound.sequence
        : randomSequence(currentRound.lengthOfSequence || 4);

    try {
      await client.call("players.submitSequence", [playerId, guess]);
    } catch (e) {
      // already logged in call()
    }

    // Brief pause before re-checking state, so a wrong guess (still active,
    // not yet completeRound) naturally loops back and retries the same round.
    await sleep(100);
  }
}

// Finds this participant's own player doc by matching name, once the
// `players` publication has delivered it.
function findOwnPlayerId(client, playerName) {
  const playersMap = client.collections.players;
  if (!playersMap) return null;
  for (const [docId, doc] of playersMap) {
    if (doc.name === playerName) return docId;
  }
  return null;
}

function findOwnPlayerDoc(client, playerName) {
  const playersMap = client.collections.players;
  if (!playersMap) return null;
  for (const doc of playersMap.values()) {
    if (doc.name === playerName) return doc;
  }
  return null;
}

function isPlayerDone(client, playerName) {
  const playersMap = client.collections.players;
  if (!playersMap) return false;
  for (const doc of playersMap.values()) {
    if (doc.name === playerName) return !!(doc.eliminated || doc.gameFinished);
  }
  return false;
}

// ---------- main scenario ----------

async function runScenario() {
  const host = await runHost("host", "Host");
  if (!host) {
    console.error("Host failed to connect/create room — aborting.");
    return;
  }

  const guestCount = CONFIG.totalPlayers - 1;
  const guestResults = [];
  const guestPromises = [];
  for (let i = 1; i <= guestCount; i++) {
    const delay = (i / guestCount) * CONFIG.joinWindowMs;
    guestPromises.push(
      sleep(delay)
        .then(() => runGuestJoin(`p${i}`, `Player${i}`, host.pin))
        .then((r) => {
          if (r) guestResults.push(r);
        }),
    );
  }
  await Promise.all(guestPromises);

  const participants = [host, ...guestResults];
  console.log(`Joined: ${participants.length}/${CONFIG.totalPlayers}`);

  // Everyone subscribes to `rounds` and `players` scoped to this game.
  await Promise.all(
    participants.map((p) =>
      Promise.all([
        p.client.subscribe("rounds", [host.pin]),
        p.client.subscribe("players", [host.pin]),
      ]).catch(() => {}),
    ),
  );

  // Start watching for round transitions on every client BEFORE starting
  // the game, so we don't miss the first round.
  participants.forEach(trackRoundTransitions);

  try {
    await host.client.call("rooms.start", [host.pin]);
  } catch (e) {
    console.error("rooms.start failed:", e.message);
    participants.forEach((p) => p.client.close());
    return;
  }

  const gameOver = () => roundObservations.size >= CONFIG.roundsToObserve;

  const playLoops = participants.map((p) =>
    playLoop(
      p,
      () => findOwnPlayerId(p.client, p.name),
      () => findOwnPlayerDoc(p.client, p.name),
      () => gameOver() || isPlayerDone(p.client, p.name),
    ),
  );

  const hardTimeout = sleep(CONFIG.hardTimeoutMs);
  await Promise.race([Promise.all(playLoops), hardTimeout]);

  participants.forEach((p) => p.client.close());
}

// ---------- reporting ----------

function reportRoundFanout() {
  console.log(
    "\n-- Round transition fan-out (spread across players seeing the same round) --",
  );
  const spreads = [];
  for (const [roundId, observations] of roundObservations) {
    if (observations.length < 2) continue;
    const times = observations.map((o) => o.seenAtMs);
    const spread = Math.max(...times) - Math.min(...times);
    spreads.push(spread);
    console.log(
      `  round ${roundId}: seen by ${observations.length} clients, spread=${spread}ms`,
    );
  }
  if (spreads.length) {
    console.log("\n" + summarize("Fan-out spread", spreads));
  } else {
    console.log(
      "  (not enough observations to compute spread — check subscription/method names)",
    );
  }
}

async function main() {
  console.log(`Target: ${url}`);
  console.log(
    `Players: ${CONFIG.totalPlayers} | Rounds to observe: ${CONFIG.roundsToObserve} | ` +
      `Correct-guess rate: ${CONFIG.correctGuessRate}\n`,
  );

  const start = Date.now();
  await runScenario();
  const totalMs = Date.now() - start;

  console.log("\n===== RESULTS =====");
  console.log(`Total wall time: ${totalMs}ms`);
  console.log(`Connections: ok=${stats.connectOk} failed=${stats.connectFail}`);
  console.log(summarize("Connect time", stats.connectTimesMs));

  console.log("\n-- Method latencies --");
  for (const [method, arr] of Object.entries(stats.methodLatenciesMs)) {
    const errCount = stats.methodErrors[method] || 0;
    console.log(summarize(method, arr) + `  errors=${errCount}`);
  }

  console.log("\n-- Subscription latencies --");
  for (const [name, arr] of Object.entries(stats.subLatenciesMs)) {
    const errCount = stats.subErrors[name] || 0;
    console.log(summarize(name, arr) + `  errors=${errCount}`);
  }

  reportRoundFanout();

  if (stats.errorsLog.length) {
    console.log(`\n-- First 15 errors (of ${stats.errorsLog.length}) --`);
    stats.errorsLog.slice(0, 15).forEach((e) => console.log("  " + e));
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
