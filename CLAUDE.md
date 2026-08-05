# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Read this file instead of re-scanning `imports/api/`.**
> The tables below are the authoritative inventory of every collection, publication, method, and route.
> They are kept current deliberately so that no session has to rediscover the codebase from scratch.
> If you change any of those things, update the matching table and append a Feature Log entry before you finish.
> See [Maintaining this file](#maintaining-this-file) at the bottom.

**Last verified against the codebase:** 2026-08-04

---

## Project Overview

**Kimply** is a real-time multiplayer colour-sequence memory game (similar to Simon Says) built with Meteor 3.4, React 18, and MongoDB.
Players join a game room via a 5-character PIN, wait in a lobby, then compete through progressively longer colour sequences until one player remains.

The game is **open to anyone and requires no account to play**.
Accounts exist only so a player can have their history stored against them; they are never a prerequisite for joining a room or playing a round.
Anonymous play is a deliberate design choice, not an oversight.

`class-diagram.puml` describes the originally intended architecture.
The implementation has since moved past it, so treat the tables in this file as the source of truth rather than the diagram.

### What is implemented

The full loop is built end to end:

- Splash, username entry, room creation and joining by PIN or invite link
- Host and player lobbies, with kick, rename, and start
- The game itself: sequence playback, tile input, life deduction, streaks, accuracy tracking
- Round advancement, elimination, and winner detection
- A live per-round leaderboard and an end-of-game ranking screen
- Optional player accounts (register and sign in)
- A lobby-only reconnect prompt backed by `localStorage`

---

## Development Commands

**All Docker commands must be run from a WSL2 terminal on Windows** (not PowerShell).
See README.md for full WSL2 setup instructions.

```bash
# Start development environment (MongoDB + Meteor on port 3000)
docker compose up

# Run tests (once)
docker compose exec backend meteor npm test

# Run tests in watch mode
docker compose exec backend meteor npm run test-app

# Run the one-shot test container instead
docker compose --profile test run test

# Formatting (this is the only style gate; there is NO ESLint in this repo)
docker compose exec backend meteor npm run format
docker compose exec backend meteor npm run format:check

# Add an npm package
docker compose exec backend meteor npm install <package-name>

# Restart just the Meteor app (e.g. after env var changes)
docker compose restart backend
```

**Scripts that do NOT exist** (do not invent them in CI or docs): `npm run lint`, `npm run build`, `npm run dev`, `npm run typecheck`, `npm run e2e`.
The only production build path is the `meteor build` invoked inside `app/Dockerfile`.

---

## Architecture

### Tech Stack

- **Meteor 3.4** - full-stack framework (server + client bundling, reactive data over DDP)
- **React 18** + React Router v7 - UI and routing
- **MongoDB 7.0** - database, via Meteor's `mongo` package
- **Tailwind CSS 3** - styling via custom design tokens (oklch colour space)
- **Rspack** - Meteor's bundler, configured in `app/rspack.config.js`

`autopublish` and `insecure` are **not** installed, and there are no `.allow()` / `.deny()` rules.
All writes go through Meteor methods.

### Key Directories

```
app/
├── client/
│   ├── main.jsx              # React Router setup - all client routes
│   └── main.html             # HTML entry (#react-target, Google Fonts preconnect)
├── server/
│   └── main.js               # Meteor startup + the three global publications
├── imports/
│   ├── api/
│   │   ├── rooms.js          # RoomsCollection + rooms.* methods + rooms.lobby publication
│   │   ├── rounds.js         # RoundsCollection (definition only)
│   │   ├── players.js        # PlayersCollection (definition only)
│   │   ├── leaderboard.js    # LeaderboardCollection (definition only)
│   │   ├── gameMethods.js    # The game loop: rounds.*, players.* methods
│   │   ├── playerAccounts.js # PlayerAccountsCollection + register/signIn
│   │   └── sequence.js       # COLOURS + generateSequence (see note below)
│   └── ui/
│       ├── pages/            # Splash, PlayRoute, JoinRoom, PlayerLobby, GamePage, Account
│       ├── components/       # design.jsx, ConfirmationPopup.jsx, ReconnectPopup.jsx
│       ├── Header.jsx
│       ├── Leaderboard.jsx        # per-round live leaderboard
│       ├── EndLeaderboard.jsx     # end-of-game ranking
│       ├── ColourSequence.jsx     # sequence playback + tile input
│       ├── roomCode.js            # pure helpers for the 5-slot code entry
│       ├── keyboard.js            # pure key handlers
│       └── styles.css             # Tailwind directives + keyframes
└── tests/                    # meteortesting:mocha specs, see Testing below
```

Note the design system lives at `imports/ui/components/design.jsx`, **not** `imports/ui/design.jsx`.

**Duplicated code worth knowing about:** `generateSequence` exists twice, identically, in `imports/api/sequence.js:9` and `imports/api/gameMethods.js:9`.
The live game path uses the `gameMethods.js` copy.
`tests/sequence.test.js` covers the `sequence.js` copy, which the game never calls.

### Routing (`app/client/main.jsx`)

Uses `BrowserRouter`, so deep links require the server to serve `index.html` for unknown paths.
Meteor's connect handler does this by default when the whole app is proxied.

| Path | Component | Notes |
|---|---|---|
| `/` | `Splash` | click anywhere goes to `/play` |
| `/game` | `GamePage` | the game loop |
| `/play` | `PlayRoute` | username entry, then Create Room or Join Room |
| `/play/join` | `JoinRoom` | 5-slot code entry; reads `?code=` from invite links |
| `/play/:pin` | `PlayerLobby` | host view or joined view based on `location.state.isHost` |
| `/account` | `Account` | register / sign in |
| `*` | `Navigate to="/"` | catch-all |

`main.jsx:24` and `:26` declare **two identical `path="*"` routes**.
React Router v7 ranks by specificity rather than declaration order, so `/account` still matches, but the duplication is dead code.

---

## Data Model

### Collections

| Variable | Mongo collection | Defined at |
|---|---|---|
| `RoomsCollection` | `rooms` | `imports/api/rooms.js:8` |
| `RoundsCollection` | `rounds` | `imports/api/rounds.js:6` |
| `PlayersCollection` | `players` | `imports/api/players.js:6` |
| `LeaderboardCollection` | `leaderboard` | `imports/api/leaderboard.js:6` |
| `PlayerAccountsCollection` | `playerAccounts` | `imports/api/playerAccounts.js:8` |

Each definition is wrapped in a `global._<Name>Collection` guard so it survives double evaluation under `meteor test --full-app`.

### Document shapes

**`rooms`** (written by `rooms.create`, `rooms.js:46-53`)
```js
{ pin, hostName, gameName: `Game${pin}`, status: 'lobby' | 'in_progress',
  players: [{ id, name }], createdAt }
```
`hostId` is returned to the client by `rooms.create` but is **never persisted on the document**.

**`rounds`** (written by `rounds.generate` and `rounds.advance`)
```js
{ gameId, lengthOfSequence, sequence: ['red'|'blue'|'green'|'yellow', ...],
  createdAt, advanced: bool, isCurrent: bool }
```

**`players`** (written by `players.join`, `gameMethods.js:103-118`)
```js
{ gameId, roundId, name, lives: 3, attemptedSequence: [], currentStreak: 0,
  longestStreak: 0, totalGuesses: 0, correctGuesses: 0, eliminatedRound: null,
  eliminated: false, winner: false, completeRound: false, gameFinished: false }
```

**`leaderboard`** (written by `gameMethods.js:152-159`, append-only)
```js
{ gameId, playerId, name, lives, roundId, completedAt }
```

**`playerAccounts`** (written by `playerAccounts.register`, `:55-64`)
```js
{ displayName, email, passwordSalt, passwordHash,
  gamesPlayed: 0, wins: 0, bestRound: 0, createdAt }
```
`gamesPlayed`, `wins`, and `bestRound` are written once at 0 and never updated by any code.

### Indexes

Created idempotently on startup by `server/indexes.js`, called from `Meteor.startup`.
A failure is logged and does not take the server down, because a unique index cannot build against a local database that already holds duplicates.

| Collection | Index | Options |
|---|---|---|
| `rooms` | `{ pin: 1 }` | unique |
| `rooms` | `{ createdAt: 1 }` | TTL 24 h |
| `rounds` | `{ gameId: 1, isCurrent: 1 }` | |
| `rounds` | `{ gameId: 1, advanced: 1 }` | |
| `rounds` | `{ createdAt: 1 }` | TTL 24 h |
| `players` | `{ roundId: 1 }` | |
| `players` | `{ gameId: 1 }` | |
| `players` | `{ gameId: 1, winner: 1 }` | |
| `leaderboard` | `{ gameId: 1, roundId: 1 }` | |
| `leaderboard` | `{ completedAt: 1 }` | TTL 7 days |
| `playerAccounts` | `{ email: 1 }` | unique |

The TTL indexes on `rooms` and `rounds` are what replaced the old destructive startup wipe: data expires on a timer instead of being deleted out from under live games on every restart.
`leaderboard` is append-only and nothing deletes from it, so its TTL is what keeps it inside the 512 MB Atlas free-tier allowance.

---

## Publications

All publications are **scoped to a single game**. `gameId` is the 5-character room PIN.

| Name | Defined at | Args | Selector | Projection |
|---|---|---|---|---|
| `rounds` | `server/publications.js:28` | `gameId` | `{ gameId, isCurrent: true }` | none |
| `players` | `server/publications.js:35` | `gameId` | `{ gameId }` | excludes `attemptedSequence` |
| `leaderboard` | `server/publications.js:40` | `gameId` | `{ gameId }` | none |
| `rooms.lobby` | `imports/api/rooms.js:20` | `pin` | `{ pin }` | `_id, pin, status, gameName, hostName, players.name, players.id` |

Three properties are load-bearing and must not be undone:

- `isCurrent: true` on `rounds` means past rounds' sequences are never sent to a client.
- Excluding `attemptedSequence` on `players` matters because that field holds the answer a player submitted. Publishing it handed the correct sequence to everyone who had not played the round yet.
- Scoping by `gameId` is what keeps DDP fan-out proportional to room size rather than to the whole deployment.

Invalid input resolves to `this.ready()` rather than throwing, matching the `rooms.lobby` convention.

Publications live in `server/publications.js`, **not** `server/main.js`, so that tests can import them.
Plain `meteor test` does not load the server entry point; only `meteor test --full-app` does.
The module carries a `global._publicationsInitialized` guard because under `--full-app` it is evaluated twice and Meteor throws on duplicate publication names.

### Client subscriptions

| File:line | Publication | Args |
|---|---|---|
| `ui/pages/GamePage.jsx:28` | `rounds` | `gameId` |
| `ui/pages/GamePage.jsx:29` | `players` | `gameId` |
| `ui/Leaderboard.jsx:10` | `leaderboard` | `gameId` |
| `ui/EndLeaderboard.jsx:30` | `players` | `gameId` |
| `ui/pages/PlayerLobby.jsx:366` | `rooms.lobby` | `pin` |

`GamePage` derives `gameId` from `location.state.pin` and renders a "no game selected" screen when it is absent.
There is deliberately no `'demo'` placeholder: with scoped publications it would subscribe to a game that does not exist and hang on LOADING forever.

---

## Methods

All methods are registered inside `if (Meteor.isServer && !global._<x>Initialized)` guards.
**None of them validate arguments with `check()` or `Match`**, and none check caller identity.
`check@1.5.0` is available in `.meteor/versions` but is never imported.

### Rooms (`imports/api/rooms.js`)

| Method | Line | Args | Description |
|---|---|---|---|
| `rooms.create` | 29 | `hostName` | Generates a unique 5-char PIN, inserts the room, returns `{ pin, hostId }` |
| `rooms.start` | 58 | `pin` | Sets `status: 'in_progress'`, then calls `rounds.generate` |
| `rooms.kick` | 69 | `pin, playerId` | `$pull`s a non-host player. Refuses to kick the host |
| `rooms.disconnect` | 82 | `pin, playerId` | If the id is the host's, **deletes the whole room**; otherwise `$pull`s the player |
| `rooms.join` | 102 | `pin, playerName` | Validates and `$push`es `{ id, name }`. Rejects duplicate names case-insensitively |
| `rooms.updateGameName` | 126 | `pin, gameName` | Renames the lobby |
| `rooms.reconnect` | 149 | `pin, playerId` | Lobby only. Returns the player's name. `isHost` is always `false` (see D6) |

PIN alphabet is `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (`rooms.js:12`), generated with `Math.random()` (`rooms.js:15`), retried up to 10 times against a `findOne` collision check.

### Game loop (`imports/api/gameMethods.js`)

| Method | Line | Args | Description |
|---|---|---|---|
| `rounds.generate` | 88 | `length = 4, gameId = null` | Inserts a new `isCurrent` round |
| `players.join` | 102 | `roundId, playerName, gameId = null` | Inserts a player with 3 lives |
| `players.submitSequence` | 122 | `playerId, attemptedSequence` | Grades the attempt. 6-9 DB round-trips, plus 4 more if it triggers a round advance |
| `rounds.advance` | 218 | `currentRoundId` | Marks the round advanced, inserts the next one, moves active players onto it |

Private helpers: `checkWinner(gameId)` at `:13`, `advanceRoundIfReady(round)` at `:67`.

A round advances only when **every** active player has submitted (`:79-81` and `:206-208`).
There is no timer or deadline, so one player leaving mid-round stalls that game permanently (see D5).

### Accounts (`imports/api/playerAccounts.js`)

| Method | Line | Args | Description |
|---|---|---|---|
| `playerAccounts.register` | 31 | `{ displayName, email, password }` | Salted SHA-256, min 8-char password |
| `playerAccounts.signIn` | 69 | `{ email, password }` | Returns `{ displayName, email }`. **Issues no session token** |

`PlayerAccountsCollection` is never published, so hashes and salts stay server-side.
Meteor's `accounts-base` / `accounts-password` packages are **not** installed; this is a hand-rolled implementation.

---

## Identity and State

There are three unrelated identity mechanisms, none of them Meteor's.
`Meteor.userId()` and `this.userId` are used nowhere in the repository, so **the server cannot identify the caller of any method**.

1. **Lobby identity** - a server-minted `Random.id()` (`rooms.js:50` for the host, `:116` for joiners).
   Joiners persist it to `localStorage.reconnectData` at `JoinRoom.jsx:53-58`.
   The host branch that would persist it is commented out at `PlayRoute.jsx:144-150`, so a host who reloads has no reconnect path.
2. **In-game identity** - the `_id` of a `players` document, held only in React state at `GamePage.jsx:12`.
   Not persisted, so it is lost on refresh (see D7).
3. **Account identity** - passed via `location.state.playerAccount`, with no token and no DDP session binding.

`location.state` is stored in `window.history.state.usr`, so it survives F5 on the same history entry but **not** a new tab or a shared link.
On `/game` a fresh load with no state falls back to `'Demo Player'` and `gameId = 'demo'` (`GamePage.jsx:21-23`), which matches no real round.

---

## Design System (`imports/ui/components/design.jsx`)

All colours use the oklch colour space.

| Token | Value | Usage |
|---|---|---|
| `BG` | `oklch(0.14 0.02 270)` | Page background |
| `SURFACE` | `oklch(0.20 0.02 270)` | Cards, inputs |
| `PRIMARY` | `oklch(0.86 0.19 130)` | Lime, primary actions |
| `TILE.*` | pink / amber / teal / violet | Game tile colours |

`tailwind.config.js` exposes these as classes: `bg-bg`, `bg-surface`, `text-fg`, `text-fg3`, `border-hairline`, `font-outfit`, `font-manrope`, `font-mono`, `animate-kimply-pulse`.
Tailwind `content` globs cover `./imports/**` and `./client/**` only, so classes generated elsewhere are purged in production.

Inline styles are used only where Tailwind cannot express the value (`color-mix()`, `oklch` in `box-shadow`, dynamic gradients).
Because inline styles are widespread, **a strict Content-Security-Policy will break the app** without `style-src 'unsafe-inline'`.

---

## Testing

Runner is `meteortesting:mocha`. Entry point `tests/main.js` auto-loads every sibling `*.test.js` via `require.context`.

| File | Covers |
|---|---|
| `rooms.test.js` | `rooms.create`, `rooms.join`, `rooms.kick` |
| `playerAccounts.test.js` | register and signIn validation, hashing, normalisation |
| `roundAdvance.test.js` | `rounds.advance` increments, player migration, idempotency |
| `lifeDeduction.test.js` | life loss on wrong guess, streak reset |
| `streak.test.js` | current vs longest streak |
| `accuracy.test.js` | `totalGuesses` / `correctGuesses` |
| `updateWinner.test.js` | last-one-standing winner selection |
| `uiHelpers.test.js` | `roomCode.js` and `keyboard.js` pure helpers |
| `sequence.test.js` | `imports/api/sequence.js` (the copy the game does not use) |

**Not covered:** any publication, any authorization case, any concurrency or race scenario, `rooms.start`, `rooms.disconnect`, `rooms.updateGameName`, `rooms.reconnect`.

CI is `.github/workflows/test.yml`, triggering on `pull_request` to `main` and `dev` only.
Nothing runs on merge.
Coverage thresholds are branches 10 / lines 10 / functions 7 / statements 10, which is a smoke gate rather than a quality gate.

---

## Known defects

Recorded so they are not rediscovered each session.
Detail lives in `docs/defect-register.md` once Phase 1 lands.

### Fixed

| ID | Where | Resolution |
|---|---|---|
| D1 | `server/main.js:13` | The startup wipe of `RoundsCollection` and its orphaned demo seed are gone. Rounds now expire via a TTL index |
| D2 | `server/main.js:28-30` | Publications moved to `server/publications.js`, scoped by `gameId`, and `attemptedSequence` excluded |
| D9 | `PlayerLobby.jsx:376-379` | The dead `useEffect` after the early return was deleted, so no hook follows the conditional return |
| D10 | `PlayerLobby.jsx:419` | `navigate` is now passed to `<HostView>`. This was throwing `TypeError: navigate is not a function` on **every** game start |

### Outstanding

Full detail, including the fix for each, is in [docs/defect-register.md](docs/defect-register.md).

| ID | Where | Issue |
|---|---|---|
| D3 | `gameMethods.js:122` | `players.submitSequence` trusts a client-supplied `playerId`, so any browser can drain another player's lives. The fix is binding `this.connection.id` at `players.join`, **not** a login wall - anonymous play is intended |
| D4 | `gameMethods.js:220-230`, `:14-22`, `:162-171` | Read-then-write races: double round advance, double winner, and `$set` life deduction from a stale read instead of `$inc`. The PIN-collision race is now closed by the unique index |
| D5 | `gameMethods.js:79-81` | No server-side round deadline. One player leaving mid-round stalls that game forever |
| D6 | `rooms.js:172` | `rooms.reconnect` returns `isHost: room.hostId === playerId`, but `hostId` is never persisted, so it is always `false` |
| D7 | `GamePage.jsx:43-53` | `playerId` lives only in React state, so a refresh re-fires `players.join` and mints a second player with fresh lives |
| D8 | `playerAccounts.js:20-22` | Single unstretched SHA-256, non-constant-time comparison, no rate limiting, and an account-enumeration oracle at `:83` vs `:88` |
| D11 | root `package-lock.json` | Declares `@meteorjs/rspack@^2.0.1` while root `package.json` has no dependencies, so `npm ci` at the repo root fails |
| D12 | `ColourSequence.jsx:80-92` | A new `AudioContext` is created on every tile click and never closed |
| D14 | repo-wide | `npm run format:check` **fails on main**: 12 files are prettier-dirty, predating any deployment work. Needs one dedicated formatting commit before formatting can be a CI gate |

### Not a defect, so nobody chases it again

An empty `position: fixed`, `z-index: 2147483647` div sometimes appears under the username field on `/play`.
It is appended as the last child of `<body>`, **outside `#react-target`**, so it is a browser-extension overlay (most likely a password manager reacting to the username input), not app markup.

---

## Environment Variables

Dev, from `docker-compose.yml`:

- `MONGO_URL` - MongoDB connection string
- `ROOT_URL` - app root URL (`http://localhost:3000`)
- `PORT` - 3000
- `CHOKIDAR_USEPOLLING` / `CHOKIDAR_INTERVAL` - file watch polling, for Windows

`METEOR_SETTINGS` is passed by `docker-compose.prod.yml` but **`Meteor.settings` is never read anywhere in the codebase**.
There is no configuration surface: starting lives (3), initial sequence length (4), PIN length (5), and minimum password length (8) are all hardcoded literals.

---

## Deployment

Production runs on a single AWS EC2 instance with Nginx as the reverse proxy, Let's Encrypt TLS, and MongoDB Atlas Free.
Images are built locally, pushed to ECR by commit SHA, and pulled by the instance.

See `docs/deployment-manual.md` for the runbook and `docs/operations.md` for monitoring, backups, and rollback.

Local development is unaffected and continues to use the Docker MongoDB container.
`docker-compose.yml` must stay working; production changes belong in `docker-compose.prod.yml`.

---

## Memory Update Protocol

Keep memory files updated throughout the session, not only at the end.
When new durable information is learned, update the relevant memory file immediately after that step.

### Update Triggers

| Trigger | File | Action |
|---|---|---|
| User shares durable facts about themselves, role, projects, tools, environment, or constraints | `memory-profile.md` | Add or update the fact |
| User states a lasting preference about workflow, coding style, explanations, formatting, or tools | `memory-preferences.md` | Add or update the preference |
| A technical/design/project decision is made | `memory-decisions.md` | Add the decision with today's date and brief rationale |
| A substantive task is completed or meaningful progress is made | `memory-sessions.md` | Add a short session log with outcome, files touched, and next steps |

### Skip Updating Memory For
- Quick factual questions
- One-off commands or trivial fixes
- Temporary debugging output
- Information that is uncertain or contradicted
- Sensitive personal information unless the user explicitly asks for it to be saved
- Repeated information already captured

### Rules
- Update memory as soon as the relevant information is learned.
- Do not wait until the end of the session.
- Do not ask for confirmation unless the information is ambiguous or sensitive.
- Keep entries concise, factual, and useful for future work.
- Prefer updating an existing entry over duplicating similar information.
- Include dates for decisions and session logs.

---

## Feature Log

Newest first.
One entry per substantive change: what changed, which files, and any consequence that is not obvious from the diff.

### 2026-08-05 - Production image and proxy validated end to end
The production stack now runs locally and is verified: arm64 image builds, boots in ~7s, and serves through nginx over TLS.

Measured and confirmed rather than assumed:
- **The bundle asks for Node 22.22.0.** The Dockerfile now reads `star.json` at build time and fails the build on a major-version mismatch with the runner, turning the classic "builds fine, dies on boot" failure into a build error.
- **WebSocket upgrade returns `101` through nginx.** Without this, DDP silently falls back to SockJS long-polling: everything still works, but connection count and latency balloon. Always verify the 101, never just that the app loads.
- Image runs as `node` (uid 1000), carries no Meteor CLI, no `.meteor`, no raw source and no secrets in any layer.
- `kimply-app` publishes no host ports (`{"3000/tcp":null}`); only nginx binds 80 and 443.

New: `loadtest/ddp-smoke.mjs` drives real DDP over a WebSocket using Node's built-in `WebSocket`, with no dependencies.
It asserts room creation, reactive lobby updates, scoped `rounds`, **zero leakage for a foreign gameId**, and **no `attemptedSequence`** on any published player document.
This is scriptable in a way a browser test is not, and it is the foundation for the Phase 7 load harness.

One production bug found by running it: the nginx base image ships `/etc/nginx/conf.d/default.conf`, and conf.d loads alphabetically, so that stock server block became the **default server for port 80**. Any request with an unmatched Host header - a bare hit on the Elastic IP, a scanner - would have received the nginx welcome page instead of the HTTPS redirect. Fixed by mounting `nginx/disable-default.conf` over it and marking our own listeners `default_server`.

### 2026-08-05 - Production deployment configuration (Nginx, Compose, ECR, runbooks)
Added the full manual-deployment stack for a single arm64 EC2 instance.
Files: rewritten `app/Dockerfile` and `docker-compose.prod.yml`; new `nginx/nginx.conf`, `nginx/templates/kimply.conf.template`, `.env.production.example`, root `.dockerignore`; new `deploy/{bootstrap-ec2,init-letsencrypt,build-push,deploy}.sh`, `scripts/health-check.sh`; new `docs/deployment-manual.md` and `docs/operations.md`.

`docker-compose.yml` (development) is untouched and must stay that way.

Three things the production build taught us, all of which would otherwise have failed on a real deploy:
- **`meteor` is not on PATH after `npm install -g meteor`.** The npm package unpacks the toolchain into `$HOME/.meteor` and symlinks there, adding no shim to the global npm bin. Without `ENV PATH="/root/.meteor:$PATH"` every `meteor` call exits 127.
- **`tests/` must stay in the Docker build context.** `meteor.testModule` in `package.json` points at `tests/main.js`, and `meteor build` resolves that path even for a production build. Excluding it fails with `Could not resolve meteor.mainModule "tests/main.js"`.
- **`npm ci` cannot be used inside the bundle.** Meteor 3.4 emits no lockfile into `programs/server`, so `npm ci` fails with npm's usage dump (easy to misread as a bad flag). Use `npm install --omit=dev`, which is Meteor's documented step.

Other non-obvious decisions:
- Nginx config is a **template**, rendered by the official image's entrypoint. `NGINX_ENVSUBST_FILTER=^DOMAIN$` is load-bearing: without it envsubst also replaces nginx's own `$host`, `$remote_addr` and `$http_upgrade`, silently producing a broken config.
- TLS bootstrap uses a **self-signed placeholder certificate** rather than a second HTTP-only config, so there is one nginx config for every environment and local validation exercises the exact production file.
- **No separate rollback script.** Rollback is `deploy.sh <older-sha>` through the same health-gated path, because a rollback runs during an incident and should not be the least-tested code path.

### 2026-08-04 - Production readiness: scoped publications, health endpoints, indexes
Removed the `RoundsCollection.removeAsync({})` startup wipe that destroyed every in-flight game on each restart (D1), and scoped the three global publications by `gameId` while excluding `attemptedSequence` (D2).
Added `/health/live` and `/health/ready` and 11 MongoDB indexes.
Files: `server/main.js`, new `server/publications.js`, `server/health.js`, `server/indexes.js`; `ui/pages/GamePage.jsx`, `ui/Leaderboard.jsx`, `ui/EndLeaderboard.jsx`; new `tests/publications.test.js`; `package.json`.

Consequences worth knowing:
- **Publications moved out of `server/main.js`.** Plain `meteor test` never loads the server entry point, so publications defined there are untestable. They now live in `server/publications.js` behind a double-eval guard.
- **`GamePage` no longer has a `'demo'` gameId fallback.** With scoped publications a placeholder subscribes to a nonexistent game and hangs on LOADING, so it now renders a "no game selected" screen instead.
- **Readiness caches its Mongo ping for 5 s** so that health polling does not become steady load against the Atlas free tier.
- Verified end to end in a browser: with a second game injected directly into Mongo, the client saw 1 round and 1 player instead of the server's 2 and 9, and no `attemptedSequence` on any document.

Also fixed two defects found while testing: `<HostView>` was missing its `navigate` prop and threw on **every** game start (D10), and a dead `useEffect` sitting after an early return violated the rules of hooks (D9).

### 2026-08-04 - CLAUDE.md rebuilt as the project's durable record
The previous version claimed only the splash, room creation, join flow, and lobby were implemented.
In reality the full game loop, leaderboards, end-of-game rankings, player accounts, and lobby reconnect were all already built, which forced a full re-inspection of the codebase.
Replaced with complete collection, publication, method, route, and defect tables plus this log.
Files: `CLAUDE.md`.
Consequence: future sessions should read this file rather than re-scanning `imports/api/`, and must keep the tables current.

### Earlier work (reconstructed from git history, not exhaustive)
- Favicons added in several sizes (`4f85847`)
- Accuracy tracking per player (`5ad5790`)
- Current player highlighted in the final leaderboard (`3e05f3e`)
- Placement message at end of game (`ae9eb5a`)
- Account creation bug fixed (`9922153`)
- Game session reconnect (`8584099`)
- Incorrect-guess life deduction (`4639339`)

---

## Maintaining this file

This file exists to stop every session paying the cost of rediscovering the codebase.
That only works if it stays true.

**Update it in the same change that alters the behaviour, not afterwards.**

| If you change | Update |
|---|---|
| A collection or document shape | [Data Model](#data-model) |
| A publication, its args, selector, or projection | [Publications](#publications) |
| A Meteor method or its arguments | [Methods](#methods) |
| A route in `client/main.jsx` | [Routing](#routing-appclientmainjsx) |
| A test file | [Testing](#testing) |
| Anything that fixes or introduces a defect | [Known defects](#known-defects) |
| Anything substantive at all | [Feature Log](#feature-log) - add a dated entry at the top |

Also bump **Last verified against the codebase** at the top when you have checked the tables against the source.

Two rules for the Feature Log: newest entry goes first, and record the non-obvious consequence rather than restating the diff.
