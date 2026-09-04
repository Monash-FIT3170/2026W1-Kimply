# AGENTS.md

Shared guidance for any coding agent working in this repository (Cursor, Claude Code, Codex, Copilot, and anything else that reads `AGENTS.md`).

`CLAUDE.md` is a symlink to this file. Do not give it separate contents.

> **Read this file instead of re-scanning `imports/api/`.**
> The tables below are the authoritative inventory of every collection, publication, method, and route.
> They are kept current deliberately so that no session has to rediscover the codebase from scratch.
> If you change any of those things, update the matching table before you finish, and add an entry to [docs/decision-log.md](docs/decision-log.md) in the same change.
> See [Maintaining this file](#maintaining-this-file) at the bottom.

**Last verified against the codebase:** 2026-08-29

---

## How agents are wired

One set of instructions. Every tool must see the same files.

| Path | Role |
|---|---|
| `AGENTS.md` | Canonical always-on instructions (this file) |
| `CLAUDE.md` | Symlink → `AGENTS.md` |
| `.agents/skills/` | Canonical skills (`SKILL.md` per skill) |
| `.claude/skills` | Symlink → `.agents/skills` |
| `.cursor/skills` | Symlink → `.agents/skills` |

Add new skills **only** under `.agents/skills/<name>/SKILL.md`. Do not copy them into `.claude/` or `.cursor/` — those folders symlink the whole `skills` directory.

Local-only files stay untracked: `.claude/settings.local.json`, `.claude/worktrees/`.

On Windows the repo must live in WSL2 (already required for Docker) so Git can check out these symlinks.

## Where things live

This file is the inventory of the running system: collections, publications, methods, routes, and the invariants that hold them together.
Everything below has a home of its own. Read the home file rather than expecting a copy here, and put new detail there rather than growing this one.

| Document | Holds |
|---|---|
| [`docs/design_system.md`](docs/design_system.md) | Colour, type, spacing, radii, motion, components, patterns, voice. The design source of truth |
| [`docs/defect-register.md`](docs/defect-register.md) | Every known defect: how it actually fails and what the fix is |
| [`docs/quality-assurance-plan-submission.md`](docs/quality-assurance-plan-submission.md) | How quality is defined and enforced: testing plan, git gates, NFRs with measurements, accessibility posture |
| [`docs/decision-log.md`](docs/decision-log.md) | Dated record of what changed and why, newest first |
| [`docs/deployment-manual.md`](docs/deployment-manual.md) | Production runbook, from empty AWS account to serving traffic |
| [`docs/dev-environment.md`](docs/dev-environment.md) | How the development stack differs from production |
| [`docs/operations.md`](docs/operations.md) | Monitoring, backups, incident runbook, cost |
| [`README.md`](README.md) | WSL2 and Docker setup, and the full local command list |
| `.agents/skills/<name>/SKILL.md` | How to do a kind of work in this repo (git, tests, Docker). Not product rules |

## Agent operating rules

- Anonymous play is intentional. Do not add a login wall to "fix" missing `this.userId`.
- All writes go through Meteor methods. Do not add `.allow()` / `.deny()`, `autopublish`, or `insecure`.
- Do not undo the three publication properties: `isCurrent: true` on rounds, exclude `attemptedSequence` on players, scope every publication by `gameId`.
- Do not invent npm scripts. There is no `lint`, `build`, `dev`, `typecheck`, or `e2e`. Format with Prettier. There is no ESLint.
- Docker commands run from WSL2 on Windows, not PowerShell. Local compose is `docker-compose.yml`; production-shaped changes belong in `docker-compose.prod.yml`. Do not fork `deploy/`, `nginx/`, or compose files per environment.
- After changing collections, publications, methods, routes, tests, or defects, update the matching table in this file and add an entry to `docs/decision-log.md` in the same change.

## Skills

Load the matching skill from `.agents/skills/` (or the `.claude` / `.cursor` symlink — same files) when the trigger matches.
Skills are workflows and stack mechanics. Game rules, invariants, and "where we are headed" live in this file and `docs/`.

**Workflow**

| Skill | Use when |
|---|---|
| `git` | New branch, GitHub issue, or pull request |
| `test` | Writing or running tests |
| `ui` | UI, styling, or client pages |
| `review` | Reviewing a PR or diff |
| `debug` | Investigating a bug or "it is not working" |

**Stack**

| Skill | Use when |
|---|---|
| `meteor` | Methods, publications, collections, DDP, packages, `server/` or `imports/api/` |
| `react` | Components, subscriptions, calling methods from the client, routes, hooks |
| `mongo` | Queries, indexes, TTL, races, looking at local data |
| `docker` | Local compose, volumes, images, "it will not start" |
| `deploy` | `deploy/`, `nginx/`, `docker-compose.prod.yml`, releases, rollbacks, incidents |

## Git

Full workflow lives in the `git` skill. Non-negotiable:

- Never commit or push unless the user asks.
- Never push to `main` or `dev`. Open a PR that targets `dev` unless this is a production release onto `main`.
- Every new branch is created **with** a GitHub issue. Name: `{feature,fix,bug,chore}/<issue-number>-<slug>`, cut from up-to-date `origin/dev` via `gh issue develop` so the branch appears on the issue.
- The PR body must contain a standalone `Closes #<n>` so GitHub records "linked a pull request that will close this issue". Do not paste branch/PR URLs into the issue body.
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

**All Docker commands run from a WSL2 terminal on Windows**, not PowerShell.
Setup, the full command list, and troubleshooting are in [README.md](README.md). The `docker` and `test` skills cover the rest.

```bash
docker compose up                                  # MongoDB + Meteor on :3000
docker compose exec backend meteor npm test        # tests, once
docker compose exec backend meteor npm run format  # Prettier, the only style gate
```

**Scripts that do NOT exist** (do not invent them in CI or docs): `npm run lint`, `npm run build`, `npm run dev`, `npm run typecheck`, `npm run e2e`.
The only production build path is the `meteor build` invoked inside `app/Dockerfile`.

---

## Architecture

### Tech Stack

| | | Skill |
|---|---|---|
| **Meteor 3.4** | Full-stack framework: bundling, methods, reactive data over DDP | `meteor` |
| **React 18** + Router v7 | UI and routing | `react` |
| **MongoDB 7.0** | Database, via Meteor's `mongo` package | `mongo` |
| **Tailwind CSS 3** | Styling from the design tokens (oklch) | `ui` |
| **Rspack** | Meteor's bundler, configured in `app/rspack.config.js` | `meteor` |
| **Docker** | Local environment, and the production image | `docker`, `deploy` |

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

## Design System

**[docs/design_system.md](docs/design_system.md)** is the source of truth for colour, typography, spacing, radii, elevation, motion, components, patterns, and voice.
Read it before designing or building any screen. The `ui` skill turns it into working rules.

Only what the design document deliberately does not cover, because it is about the code:

- Tokens are implemented in `app/tailwind.config.js` as classes and in `app/imports/ui/components/design.jsx` as JS constants for values Tailwind cannot express. The app defines **no** `:root` custom properties, so the CSS block in the design document is a specification, not something to paste in.
- `design.jsx` has drifted from the system. `SURFACE` is `oklch(0.18 …)` against the documented `0.20`, `FG` and `FG3` also differ, and `DANGER` / `ACCENT` are undocumented. Prefer the Tailwind classes, which match the document exactly.
- Tailwind `content` globs cover `./imports/**` and `./client/**` only, so a class generated anywhere else is purged in production.
- Inline styles are widespread, so **a strict Content-Security-Policy breaks the app** without `style-src 'unsafe-inline'`.

---

## Testing

How to write and run them is the `test` skill. What exists today:

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

CI (`.github/workflows/test.yml`) runs on pull requests to `main` and `dev` only, never on merge, behind a coverage smoke gate.

---

## Known defects

One line each, so a review can cite an ID without opening anything.
**[docs/defect-register.md](docs/defect-register.md) holds the detail**: how each one actually fails, what the fix is, and the resolved ones kept for history. Do not restate that here.

| ID | Where | Issue |
|---|---|---|
| D3 | `gameMethods.js:122` | `players.submitSequence` trusts a client-supplied `playerId`. Fix is binding `this.connection.id`, **not** a login wall |
| D4 | `gameMethods.js:14-22`, `:162-171`, `:220-230` | Read-then-write races: double advance, double winner, `$set` life deduction from a stale read |
| D5 | `gameMethods.js:79-81` | No round deadline. One player leaving mid-round stalls that game forever |
| D6 | `rooms.js:172` | `hostId` is never persisted, so `rooms.reconnect` always reports `isHost: false` |
| D7 | `GamePage.jsx:43-53` | `playerId` lives only in React state, so a refresh mints a second player with fresh lives |
| D8 | `playerAccounts.js:20-22` | Unstretched SHA-256, non-constant-time compare, no rate limiting, enumeration oracle |
| D11 | root `package-lock.json` | Desynced against an empty root `package.json`, so `npm ci` at the repo root fails |
| D12 | `ColourSequence.jsx:80-92` | A new `AudioContext` per tile click, never closed |
| D14 | repo-wide | `npm run format:check` fails on `main`. Needs one dedicated formatting commit before it can gate CI |

Fixed and kept for history in the register: D1, D2, D9, D10, D15, D16, D17, D18, D19.

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

Two independent stacks, each a single arm64 EC2 instance behind Nginx with Let's Encrypt TLS and its own MongoDB Atlas free cluster.
Images are built by CI, pushed to ECR by commit SHA, and pulled by the instance over SSM.
Runbooks are [`docs/deployment-manual.md`](docs/deployment-manual.md), [`docs/dev-environment.md`](docs/dev-environment.md), and [`docs/operations.md`](docs/operations.md). Shipping, rolling back, and the traps are the `deploy` skill.

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
The two share no AWS resource: the IAM roles are per-branch, because GitHub's OIDC subject claim names one ref, so a push to `dev` cannot obtain a credential that reaches production.

Everything else - `deploy/`, `nginx/`, `docker-compose.prod.yml`, `scripts/` - is environment-agnostic and reads its configuration from `/opt/kimply/.env` on the box.
**Do not fork any of those per environment.** If something must differ, it belongs in `.env`.
`docker-compose.yml` is development only and must stay working.

---

## Decision log

The dated record of every substantive change lives in **[docs/decision-log.md](docs/decision-log.md)**, not in this file.

This file describes how the system is now.
The decision log describes why it got that way, newest entry first.
Add an entry there in the same change that alters the behaviour.

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
| Anything that fixes or introduces a defect | [`docs/defect-register.md`](docs/defect-register.md) first, then the one-line row in [Known defects](#known-defects) |
| A colour, type, spacing, motion or component decision | [`docs/design_system.md`](docs/design_system.md) - not this file |
| A team workflow for agents | `.agents/skills/<name>/SKILL.md` only — never copy into `.claude/` or `.cursor/` |
| Anything substantive at all | [docs/decision-log.md](docs/decision-log.md) - add a dated entry at the top |

Also bump **Last verified against the codebase** at the top when you have checked the tables against the source.

Two rules for the decision log: newest entry goes first, and record the non-obvious consequence rather than restating the diff.
