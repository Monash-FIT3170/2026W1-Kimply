#!/usr/bin/env node

import WebSocket from "ws";

/**
 * DDP load test: Simulating defined concurrent players via DDP
 *
 * Reuses same client-side DDP logic as ddp-smoke.mjs, but spins many instances and collects
 * latency statistics
 *
 * Usage:
 *    node ddp-load-test.mjs wss://localhost/websocket --insecure
 *
 * config (env vars):
 *    PLAYERS = 100                   total simulated players
 *    RAMP_UP_MS = 5000               spread room/client startup over this duration
 *    SESSION_MS = 15000              how long each client is connected for
 */

const url = process.argv[2] || "wss://localhost/websocket";
const insecure = process.argv.includes("--insecure");
if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const CONFIG = {
  totalPlayers: Number(process.env.PLAYERS || 100),
  joinWindowMs: Number(process.env.JOIN_WINDOW_MS || 500),
  sessionMs: Number(process.env.SESSION_MS || 15000),
  connectTimeoutMs: 10000,
};

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

      this.ws.addEventListener("open", () => {
        this.send({ msg: "connect", version: "1", support: ["1"] });
      });

      this.ws.addEventListener("error", (e) => {
        clearTimeout(to);
        reject(new Error(e.message || "ws error"));
      });

      this.ws.addEventListener("close", () => {});

      // NOTE: this was missing in the previous version — without it the
      // client never processes any server message (connected/result/sub/etc)
      // and every call() or subscribe() would hang until connectTimeoutMs.
      this.ws.addEventListener("message", (event) => this._onMessage(event));

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
    // Sends a method call, resolves/rejects the promise when the server
    // responds, and records latency between send and response.
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
    // Sends a subscription request, resolves once `ready` is received for
    // this sub id, and records latency between send and ready.
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

// ---------- simulated players ----------
// Adjust the method/publication names below to match your app.

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
    return { client, pin: created.pin };
  } catch (e) {
    client.close();
    return null;
  }
}

async function runGuest(playerId, playerName, pin) {
  const client = await connectClient(playerId);
  if (!client) return;
  try {
    await client.call("rooms.join", [pin, playerName]);
    await client.subscribe("rooms.lobby", [pin]);
  } catch (e) {
    // already logged in call()/subscribe()
  }
  await sleep(CONFIG.sessionMs);
  client.close();
}

async function runSingleRoom() {
  const host = await runHost("host", "Host");
  if (!host) {
    console.error("Host failed to connect/create room — aborting.");
    return;
  }

  const guestCount = CONFIG.totalPlayers - 1;
  const guestPromises = [];
  for (let i = 1; i <= guestCount; i++) {
    // stagger guest joins across JOIN_WINDOW_MS so they don't all hit the
    // server in the same tick, while still simulating a realistic burst
    const delay = (i / guestCount) * CONFIG.joinWindowMs;
    guestPromises.push(
      sleep(delay).then(() => runGuest(`p${i}`, `Player${i}`, host.pin)),
    );
  }
  await Promise.all(guestPromises);

  try {
    await sleep(300); // let joins settle before starting the game
    await host.client.call("rooms.start", [host.pin]);
    await host.client.subscribe("rounds", [host.pin]);
  } catch (e) {
    // logged already
  }

  await sleep(CONFIG.sessionMs);
  host.client.close();
}

// ---------- main ----------

async function main() {
  console.log(`Target: ${url}`);
  console.log(
    `Players: ${CONFIG.totalPlayers} (1 room) | Join window: ${CONFIG.joinWindowMs}ms | ` +
      `Session: ${CONFIG.sessionMs}ms\n`,
  );

  const start = Date.now();
  await runSingleRoom();
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

  if (stats.errorsLog.length) {
    console.log(`\n-- First 10 errors (of ${stats.errorsLog.length}) --`);
    stats.errorsLog.slice(0, 10).forEach((e) => console.log("  " + e));
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
