# AGENTS.md

Shared guidance for any coding agent working in this repository (Cursor, Claude Code, Codex, Copilot, and anything else that reads `AGENTS.md`).

`CLAUDE.md` is a symlink to this file. Do not give it separate contents.

> **Read this file instead of re-scanning `imports/api/`.**
> The tables below are the authoritative inventory of every collection, publication, method, and route.
> They are kept current deliberately so that no session has to rediscover the codebase from scratch.
> If you change any of those things, update the matching table and append a Feature Log entry before you finish.
> See [Maintaining this file](#maintaining-this-file) at the bottom.

**Last verified against the codebase:** 2026-08-29

---

## How agents are wired

One set of instructions. Every tool must see the same files.

| Path | Role |
|---|---|
| `AGENTS.md` | Canonical always-on instructions (this file) |
| `CLAUDE.md` | Symlink → `AGENTS.md` |
| `.agents/skills/` | Canonical skills (`SKILL.md` per workflow) |
| `.claude/skills` | Symlink → `.agents/skills` |
| `.cursor/skills` | Symlink → `.agents/skills` |

Add new skills **only** under `.agents/skills/<name>/SKILL.md`. Do not copy them into `.claude/` or `.cursor/` — those folders symlink the whole `skills` directory.

Local-only files stay untracked: `.claude/settings.local.json`, `.claude/worktrees/`.

On Windows the repo must live in WSL2 (already required for Docker) so Git can check out these symlinks.

## Agent operating rules

- Anonymous play is intentional. Do not add a login wall to "fix" missing `this.userId`.
- All writes go through Meteor methods. Do not add `.allow()` / `.deny()`, `autopublish`, or `insecure`.
- Do not undo the three publication properties: `isCurrent: true` on rounds, exclude `attemptedSequence` on players, scope every publication by `gameId`.
- Do not invent npm scripts. There is no `lint`, `build`, `dev`, `typecheck`, or `e2e`. Format with Prettier. There is no ESLint.
- Docker commands run from WSL2 on Windows, not PowerShell. Local compose is `docker-compose.yml`; production-shaped changes belong in `docker-compose.prod.yml`. Do not fork `deploy/`, `nginx/`, or compose files per environment.
- After changing collections, publications, methods, routes, tests, or defects, update the matching table in this file and add a Feature Log entry in the same change.

## Skills

Load the matching skill from `.agents/skills/` (or the `.claude` / `.cursor` symlink — same files) when the trigger matches.

| Skill | Use when |
|---|---|
| `git` | New branch, GitHub issue, or pull request |
| `test` | Writing or running tests |
| `ui` | UI, styling, design tokens, or client pages |
| `review` | Reviewing a PR, diff, or change set |

## Git

Full workflow lives in the `git` skill. Non-negotiable:

- Never commit or push unless the user asks.
- Never push to `main` or `dev`. Open a PR that targets `dev` unless this is a production release onto `main`.
- Every new branch is created **with** a GitHub issue. Name: `{feature,fix,bug,chore}/<issue-number>-<slug>`, cut from up-to-date `origin/dev`.
- If `gh` is not available, print the exact commands. Do not skip the issue.

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
│   ├── main.js               # Meteor startup, health, indexes
│   ├── publications.js       # scoped rounds / players / leaderboard pubs
│   ├── health.js
│   └── indexes.js
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
│       ├── Leaderboard.jsx        # per-round live leaderboard (players + rounds)
│       ├── leaderboardModels.js   # live leaderboard row helpers
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
| `ui/Leaderboard.jsx:12-13` | `players`, `rounds` | `gameId` |
| `ui/EndLeaderboard.jsx:30` | `players` | `gameId` |
| `ui/pages/PlayerLobby.jsx:366` | `rooms.lobby` | `pin` |

The `leaderboard` publication still exists and is tested, but the live UI no longer subscribes to it. `Leaderboard.jsx` builds rows from `players` + the current round via `leaderboardModels.js`. The `leaderboard` collection is still written by `players.submitSequence`.

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
On `/game` a missing `location.state.pin` renders a "no game selected" screen (`gameId` is `null`). The display name still falls back to `'Demo Player'` (`GamePage.jsx:21`). There is deliberately no `'demo'` gameId: a placeholder would subscribe to a game that does not exist and hang on LOADING.

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
| `publications.test.js` | scoped `rounds` / `players` / `leaderboard` pubs, no `attemptedSequence` |
| `leaderboardModel.test.js` | live leaderboard row helpers in `leaderboardModels.js` |

**Not covered:** any authorization case, any concurrency or race scenario, `rooms.start`, `rooms.disconnect`, `rooms.updateGameName`, `rooms.reconnect`.

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

Two deployed environments, each a single AWS EC2 instance with Nginx as the reverse proxy, Let's Encrypt TLS, and its own MongoDB Atlas Free cluster.
Images are built by CI, pushed to ECR by commit SHA, and pulled by the instance over SSM.

| | Production | Development |
|---|---|---|
| Branch | `main` | `dev` |
| URL | `https://kimply.online` | `https://dev.kimply.online` |
| Instance | `i-08184036cf37c932c` | `i-09575e88c984e1c7d` |
| Elastic IP | `15.134.53.178` | `15.134.96.122` |
| ECR repo | `kimply` | `kimply-dev` |
| OIDC roles | `GitHubActionsECRPush`, `GitHubActionsEC2Commands` | same names with a `Dev` suffix |
| Atlas cluster | `kimply-mongodb` | `kimply-dev-mongodb` |

Both are driven by the single workflow `.github/workflows/deploy.yml`, which picks its target from `github.ref_name`.
Everything else - `deploy/`, `nginx/`, `docker-compose.prod.yml`, `scripts/` - is environment-agnostic and reads its configuration from `/opt/kimply/.env` on the box.
**Do not fork any of those per environment.** If something needs to differ, it belongs in `.env`.

The two environments share no AWS resource. In particular the IAM roles are per-branch, because GitHub's OIDC subject claim names one ref, so a push to `dev` cannot obtain a credential that reaches production.

See `docs/deployment-manual.md` for the production runbook, `docs/dev-environment.md` for the development delta, and `docs/operations.md` for monitoring, backups, and cost.

Local development is unaffected and continues to use the Docker MongoDB container.
`docker-compose.yml` must stay working; deployed-environment changes belong in `docker-compose.prod.yml`.

---

## Feature Log

Newest first.
One entry per substantive change: what changed, which files, and any consequence that is not obvious from the diff.

### 2026-08-29 - Agent-agnostic skills; AGENTS.md is the single instruction file
`AGENTS.md` is now the canonical always-on file. `CLAUDE.md` is a symlink to it, so Claude Code and every other agent read the same inventory.
Skills live once under `.agents/skills/` (`git`, `test`, `ui`, `review`). `.claude/skills` and `.cursor/skills` are directory symlinks to that folder — do not copy skills into a vendor directory.
Removed the Claude-only memory-file protocol (those files were never in the repo). `.gitignore` no longer ignores all of `.claude/`, only `settings.local.json` and `worktrees/`.
Tables refreshed against `dev`: live leaderboard subscribes to `players` + `rounds` (not the `leaderboard` pub), `publications.test.js` and `leaderboardModel.test.js` exist, `GamePage` has no `'demo'` gameId.

### 2026-08-21 - A development environment that mirrors production, deployed from `dev`
`dev.kimply.online` is now a second, fully independent copy of the production stack on its own `t4g.small`, with its own Elastic IP, ECR repository, IAM roles and Atlas cluster.
Files: new `.github/workflows/deploy.yml` (replaces `docker-ecr.yml`), new `docs/dev-environment.md`; `deploy/deploy.sh`, `deploy/build-push.sh`, `deploy/init-letsencrypt.sh`, `docs/deployment-manual.md`, `docs/operations.md`, `CLAUDE.md`.
Deleted the untracked `.github/workflows/aws_push.yml` (a broken stub with no `id-token: write`, an undefined `AWS_REGION`, a role that does not exist, and a duplicate `main` trigger that would have raced the real pipeline) and `rendered.conf` (an envsubst debug artifact).

Not a line of `deploy/`, `nginx/` or `docker-compose.prod.yml` needed to change to support a second environment, which is the strongest evidence that the `.env`-driven design was right.

Seven things worth carrying forward:

- **The OIDC roles are per-branch, and that is deliberate.** GitHub's subject claim is `repo:<org>/<repo>:ref:refs/heads/<branch>`, so the existing production roles simply refused a `dev` workflow. Widening them to accept both refs was the smaller change and was rejected: separate `...Dev` roles, scoped to `repository/kimply-dev` and the dev instance ARN, make it structurally impossible for a push to `dev` to touch production. The production roles were not modified at all.
- **Separate ECR repositories are required, not tidiness.** `kimply` is `IMMUTABLE`-tagged and keeps only 10 images. Sharing it would let dev builds evict production rollback targets, and because tags are commit SHAs, a fast-forward `dev` to `main` merge would push an already-existing tag and be rejected outright.
- **`${APP_IMAGE}` has no default, so the ECR repository must be seeded before the box is configured.** `docker compose config` fails on an unset image and `deploy.sh` will not run without one. Run `ECR_REPOSITORY=kimply-dev ./deploy/build-push.sh` locally first, rather than discovering this through a failed first pipeline run.
- **`build-push.sh` had lost its buildx attestation flags, and getting that wrong poisons an immutable tag.** Commit `2b7dfa2` added `--provenance=false --sbom=false` because buildx otherwise attaches provenance and SBOM attestations, turning the result into an OCI index that ECR rejects with a bare `400 Bad Request` on the manifest PUT, after every layer has already uploaded. Main's 53-line rewrite of the script dropped them; this change restores them. The trap on top of the trap: the failed push still lands the in-toto provenance manifest **under the tag**, and because both repositories are `IMMUTABLE`, every retry then fails with the same 400 for an entirely different reason. Recovery is `aws ecr batch-delete-image` on the tag first, since immutability blocks overwrite but not delete.
- **The attestation failure is invisible in CI and only bites locally.** GitHub's runners use the classic Docker image store, where `--load` converts to Docker schema2 and the push succeeds, which is why production has been green since 2026-08-14. Docker Desktop with the containerd image store (`io.containerd.snapshotter.v1`) keeps OCI media types through `--load`, so a developer running `build-push.sh` by hand hits it and CI never does.
- **`deploy/deploy.sh` in the repo was NOT what production actually runs, and the repo copy was broken.** The production box carried a fix that no branch has: `set_app_image()` must `export APP_IMAGE="$image"` as well as rewriting `.env`, because **Docker Compose gives the shell environment precedence over `--env-file`**. `deploy.sh` does `set -a; source "$ENV_FILE"`, which exports the OLD `APP_IMAGE`; rewriting only the file then changes nothing, `compose up` decides the service is already current and prints `Container kimply-app Running` instead of `Recreated`, and the deploy silently becomes a no-op. The post-recreate image guard is what turns that into a loud failure instead of a false success, and it is the only reason this was caught. Verified empirically: `APP_IMAGE=STALE/SENTINEL:0000 docker compose --env-file .env config` resolves to the sentinel, not the file. The fix is now committed; before that, running `sync-config.sh` against **production** would have overwritten prod's working script with the broken one and quietly turned every production deploy into a no-op that reported success.
- **Production's health gate is currently vacuous.** `main` has no `app/server/health.js`, so `/health/live` and `/health/ready` both return the Meteor SPA shell with a 200 and both the Docker `HEALTHCHECK` and `deploy.sh`'s probe pass unconditionally. `main` is also missing `server/publications.js` and `server/indexes.js`, so production still runs the unscoped publications of D2. Development, built from `dev`, has all three and a genuinely working gate. This resolves when `dev` reaches `main`, which is a release decision and was left alone.

Three documentation claims were corrected against reality while doing this: the instances are `t4g.small` (2 GB) not `t4g.medium`, the swap file is 2 GB not 4 GB, and `build-push.sh` neither refuses a dirty tree nor boots the image before pushing, despite `deployment-manual.md` saying it does both.

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
| A team workflow for agents | `.agents/skills/<name>/SKILL.md` only — never copy into `.claude/` or `.cursor/` |
| Anything substantive at all | [Feature Log](#feature-log) - add a dated entry at the top |

Also bump **Last verified against the codebase** at the top when you have checked the tables against the source.

Two rules for the Feature Log: newest entry goes first, and record the non-obvious consequence rather than restating the diff.
