const WebSocket = require('ws');
const crypto = require('node:crypto');
const scope = require('./scope');
const { sleep, waitUntil } = require('./wait');
const websocketURL = new URL('/websocket', process.env.E2E_BASE_URL || 'http://localhost:3000');
websocketURL.protocol = websocketURL.protocol === 'https:' ? 'wss:' : 'ws:';
class Player {
  constructor(name) {
    scope.current().people.add(this);
    this.name = name;
    this.store = {}; // collection -> Map(id -> doc)
    this.pending = new Map();
    this.nextId = 1;
    this.subs = new Set();
    this.token = crypto.randomBytes(32).toString('base64url');
  }

  connect(browserToken = null) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(websocketURL);
      this.ws.on('error', reject);
      this.ws.on('close', () => {
        for (const w of this.pending.values()) w.reject(new Error('DDP disconnected'));
        this.pending.clear();
      });
      this.ws.on('open', () => this.send({ msg: 'connect', version: '1', support: ['1'] }));
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.msg === 'connected') {
          this.call('browserSessions.resume', browserToken).then((r) => {
            this.browserToken = r.token;
            resolve(r);
          }, reject);
          return;
        }
        this.onMessage(m);
      });
    });
  }

  send(m) {
    if (this.ws.readyState !== WebSocket.OPEN) throw new Error('DDP socket is closed');
    this.ws.send(JSON.stringify(m));
  }

  onMessage(m) {
    if (m.msg === 'ping') {
      if (this.ws.readyState === WebSocket.OPEN) this.send({ msg: 'pong' });
      return;
    }
    if (m.msg === 'result') {
      const w = this.pending.get(m.id);
      if (!w) return;
      w.result = m.result;
      w.error = m.error;
      w.received = true;
      if (w.updated) this.finish(m.id);
    }
    if (m.msg === 'updated') {
      for (const id of m.methods) {
        const w = this.pending.get(id);
        if (!w) continue;
        w.updated = true;
        if (w.received) this.finish(id);
      }
    }
    if (m.collection) {
      const coll = (this.store[m.collection] ||= new Map());
      if (m.msg === 'removed') return coll.delete(m.id);
      const doc = { _id: m.id, ...(coll.get(m.id) || {}) };
      for (const [k, v] of Object.entries(m.fields || {})) {
        doc[k] = v; // DDP always sends a top-level field whole
      }
      for (const k of m.cleared || []) delete doc[k];
      coll.set(m.id, doc);
    }
  }

  finish(id) {
    const w = this.pending.get(id);
    this.pending.delete(id);
    if (w.error) w.reject(w.error);
    else w.resolve(w.result);
  }

  call(method, ...params) {
    const id = String(this.nextId++);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`DDP method timed out: ${method}`));
      }, 20000);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.send({ msg: 'method', id, method, params });
    });
  }

  sub(name, ...params) {
    const key = `${name}:${JSON.stringify(params)}`;
    if (this.subs.has(key)) return;
    this.subs.add(key);
    this.send({ msg: 'sub', id: key, name, params });
  }

  docs(collection) {
    return [...(this.store[collection]?.values() || [])];
  }

  // ---- lobby ----
  async create(mode = 'default', { abilities = true, settings = null, accountId = null } = {}) {
    const res = await this.call('rooms.create', this.name, accountId);
    this.pin = res.pin;
    scope.current().pins.add(res.pin);
    this.lobbyId = res.hostId;
    this.accountId = accountId;
    if (mode !== 'default') await this.call('rooms.setGameMode', this.pin, mode);
    if (settings) await this.call('rooms.updateSettings', this.pin, settings);
    if (!abilities) await this.call('rooms.setAbilities', this.pin, false);
    this.sub('rooms.lobby', this.pin);
    return this.pin;
  }

  async join(pin, { accountId = null } = {}) {
    const res = await this.call('rooms.join', pin, this.name, accountId);
    this.pin = pin;
    this.lobbyId = res.playerId;
    this.accountId = accountId;
    this.sub('rooms.lobby', pin);
    return res;
  }

  // ---- game ----
  currentRound() {
    return this.docs('rounds').find((r) => r.isCurrent && !r.advanced);
  }

  async enter(isBattleRoyale = false) {
    this.sub('rounds', this.pin);
    const round = await waitUntil(() => this.currentRound() || this.docs('rounds')[0], 10000, `${this.name} round`);
    this.playerId = await this.call(
      'players.join',
      round._id,
      this.name,
      this.pin,
      this.lobbyId,
      isBattleRoyale,
      this.accountId,
      this.token
    );
    this.sub('players', this.pin);
    this.sub('players.secret', this.pin);
    this.sub('gameFeed', this.pin);
    await waitUntil(
      () => this.me()?.secret?.sequence && typeof this.me()?.lives === 'number',
      10000,
      `${this.name} secret`
    );
    return this.playerId;
  }

  me() {
    return this.store.players?.get(this.playerId);
  }

  round() {
    const me = this.me();
    return me && this.store.rounds?.get(me.roundId);
  }

  // Wait until this player can answer: their sequence is for their round and any draft has resolved.
  async ready(timeoutMs = 30000) {
    return waitUntil(
      () => {
        const me = this.me();
        const r = this.round();
        if (!me || !r || me.eliminated || me.completeRound) return false;
        if (r.draft && !r.draft.resolved) return false;
        if (me.secret?.draft?.roundId === me.roundId && me.secret.draft.status === 'open') return false;
        return me.secret?.sequence?.roundId === me.roundId;
      },
      timeoutMs,
      `${this.name} ready`
    );
  }

  // Answer like a person: gaps of 90-200 ms, and really wait them out.
  async answer(correct = true) {
    await this.ready();
    const me = this.me();
    const roundId = me.roundId;
    const expected = me.secret.sequence.colours;
    const colours = correct ? expected : expected.map((c) => (c === 'red' ? 'blue' : 'red'));
    const { attemptId } = await this.call('players.startAttempt', this.playerId, roundId);
    const offsets = [];
    let t = 0;
    for (let i = 0; i < colours.length; i++) {
      t += 90 + Math.floor(Math.random() * 110);
      offsets.push(t);
    }
    await sleep(t);
    return this.call('players.submitSequence', this.playerId, colours, {
      attemptId,
      roundId,
      offsets,
    });
  }

  close() {
    try {
      this.ws?.close();
    } catch {}
  }
}

async function startGame(host, players, { isBattleRoyale = false } = {}) {
  await host.call('rooms.start', host.pin);
  for (const p of [host, ...players]) await p.enter(isBattleRoyale);
}

module.exports = { Player, startGame };
