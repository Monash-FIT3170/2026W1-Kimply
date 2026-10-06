#!/usr/bin/env node
// Usage:
//   node lobbyjoin-bots.mjs <PIN> [count] [--url ws://localhost:3000] [--delay 600] [--prefix Bot]

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const VALUE_FLAGS = new Set(["--url", "--delay", "--prefix"]);
const positional = args.filter(
  (a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(args[i - 1]),
);
const pin = (positional[0] || "").toUpperCase();
const kick = args.includes("--kick");
const count = Math.min(
  Math.max(parseInt(positional[1] || "15", 10) || 15, 1),
  50,
);
const url =
  flag("url", "ws://localhost:3000").replace(/^http/, "ws").replace(/\/$/, "") +
  "/websocket";
const delay = parseInt(flag("delay", "600"), 10);
const prefix = flag("prefix", "Bot");

if (!pin) {
  console.error(
    "Usage: node kimply-bots.mjs <PIN> [count] [--url ws://localhost:3000] [--delay ms] [--prefix Bot] [--kick]",
  );
  process.exit(1);
}
let WS = process.env.FORCE_WS ? undefined : globalThis.WebSocket;
if (!WS) {
  try {
    WS = (await import("ws")).default;
  } catch {
    console.error(
      `Your Node (${process.version}) has no built-in WebSocket.\nFix: run \`npm install ws\` in the same folder as this script, then try again.\n(Or upgrade to Node 22+.)`,
    );
    process.exit(1);
  }
}

const NAMES = [
  "Ace",
  "Blaze",
  "Cosmo",
  "Dash",
  "Echo",
  "Fizz",
  "Ghost",
  "Hex",
  "Iris",
  "Jinx",
  "Kilo",
  "Luna",
  "Milo",
  "Nova",
  "Onyx",
  "Pixel",
  "Quill",
  "Riot",
  "Sage",
  "Turbo",
  "Ultra",
  "Vex",
  "Wisp",
  "Xeno",
  "Yuki",
  "Zap",
  "Bolt",
  "Cleo",
  "Dune",
  "Ember",
  "Flux",
  "Gizmo",
  "Halo",
  "Indy",
  "Juno",
  "Koda",
  "Lynx",
  "Mochi",
  "Neon",
  "Otto",
  "Pip",
  "Quest",
  "Rex",
  "Sparky",
  "Tango",
  "Umbra",
  "Volt",
  "Waffle",
  "Yeti",
  "Zephyr",
];
const botName = (i) => `${prefix}-${NAMES[i % NAMES.length]}`;

// --- minimal DDP client -------------------------------------------------
function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WS(url);
    let nextId = 1;
    const pending = new Map();
    const subs = new Map(); // collection -> Map(id -> fields)
    const listeners = [];

    const send = (o) => ws.send(JSON.stringify(o));

    ws.onerror = () =>
      reject(new Error(`Could not connect to ${url}. Is the app running?`));
    ws.onopen = () => send({ msg: "connect", version: "1", support: ["1"] });
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.msg === "connected") {
        resolve({
          call: (method, params) =>
            new Promise((res, rej) => {
              const id = String(nextId++);
              pending.set(id, { res, rej });
              send({ msg: "method", method, params, id });
            }),
          subscribe: (name, params) =>
            send({ msg: "sub", id: String(nextId++), name, params }),
          collection: (name) => subs.get(name) || new Map(),
          onChange: (fn) => listeners.push(fn),
          close: () => ws.close(),
        });
      } else if (m.msg === "ping") {
        send({ msg: "pong", ...(m.id ? { id: m.id } : {}) });
      } else if (m.msg === "result") {
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        m.error
          ? p.rej(new Error(m.error.reason || m.error.message || "error"))
          : p.res(m.result);
      } else if (
        m.msg === "added" ||
        m.msg === "changed" ||
        m.msg === "removed"
      ) {
        if (!subs.has(m.collection)) subs.set(m.collection, new Map());
        const c = subs.get(m.collection);
        if (m.msg === "added") c.set(m.id, m.fields || {});
        if (m.msg === "changed") {
          const cur = c.get(m.id) || {};
          Object.assign(cur, m.fields || {});
          (m.cleared || []).forEach((k) => delete cur[k]);
          c.set(m.id, cur);
        }
        if (m.msg === "removed") c.delete(m.id);
        listeners.forEach((fn) => fn());
      }
    };
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function joinBots() {
  console.log(`Joining room ${pin} with ${count} bots at ${url} ...`);
  let ok = 0;
  const clients = [];
  for (let i = 0; i < count; i++) {
    const name = botName(i);
    try {
      const c = await connect();
      await c.call("rooms.join", [pin, name]);
      clients.push(c);
      ok++;
      console.log(`  + ${name} joined (${ok}/${count})`);
    } catch (e) {
      console.log(`  ! ${name} failed: ${e.message}`);
      if (/not-found|Room not found|Game already started/i.test(e.message))
        break;
    }
    await sleep(delay + Math.random() * delay * 0.5);
  }
  console.log(`Done: ${ok} bots in the lobby. Run with --kick to remove them.`);
  clients.forEach((c) => c.close());
  process.exit(0);
}

async function kickBots() {
  const c = await connect();
  c.subscribe("rooms.lobby", [pin]);
  await sleep(1500);
  const room = [...c.collection("rooms").values()][0];
  if (!room) {
    console.error(`Room ${pin} not found.`);
    process.exit(1);
  }
  const bots = (room.players || []).filter((p) =>
    p.name.startsWith(`${prefix}-`),
  );
  console.log(`Kicking ${bots.length} bots from ${pin} ...`);
  for (const b of bots) {
    try {
      await c.call("rooms.kick", [pin, b.id]);
      console.log(`  - ${b.name}`);
    } catch (e) {
      console.log(`  ! ${b.name}: ${e.message}`);
    }
    await sleep(100);
  }
  c.close();
  process.exit(0);
}

(kick ? kickBots() : joinBots()).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
