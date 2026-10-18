# AGENTS.md

Shared guidance for any coding agent working in this repository (Cursor, Claude Code, Codex, Copilot, and anything else that reads `AGENTS.md`).

`CLAUDE.md` is a symlink to this file. Do not give it separate contents.

> **Read this file instead of re-scanning `imports/api/`.**
> The tables below are the authoritative inventory of every collection, publication, method, and route.
> They are kept current deliberately so that no session has to rediscover the codebase from scratch.
> If you change any of those things, update the matching table before you finish, and add an entry to [docs/decision-log.md](docs/decision-log.md) in the same change.
> See [Maintaining this file](#maintaining-this-file) at the bottom.

**Last verified against the codebase:** 2026-10-15

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
| [`docs/ecs-target-architecture.md`](docs/ecs-target-architecture.md) | Target production design on ECS Fargate: decisions, risks, migration order. In progress, not yet serving traffic |
| [`docs/google-sign-in.md`](docs/google-sign-in.md) | Google sign-in: the OAuth client, its origins, and where `GOOGLE_CLIENT_ID` lives in each environment |
| [`infra/terraform/README.md`](infra/terraform/README.md) | How to build and operate the ECS stack with Terraform |
| [`infra/docs/architecture.md`](infra/docs/architecture.md) | Mermaid diagrams of the ECS stack: runtime traffic, which Terraform file builds what, a deploy |
| [`README.md`](README.md) | WSL2 and Docker setup, and the full local command list |
| `.agents/skills/<name>/SKILL.md` | How to do a kind of work in this repo (git, tests, Docker). Not product rules |

## Agent operating rules

- Anonymous play is intentional. Do not add a login wall to "fix" missing `this.userId`.
- All writes go through Meteor methods. Do not add `.allow()` / `.deny()`, `autopublish`, or `insecure`.
- Do not undo the publication properties: `rounds` never carries `sequence`, `players` and `eliminations` exclude `attemptedSequence`, `secret`, and `reconnectTokenHash`, `players.secret` is keyed on the caller's connection, and every publication is scoped by `gameId`.
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
- Optional player accounts (register, sign in with a password or Google, sign out), with a session that survives reloads, new tabs, and the end of a game
- A lobby-only reconnect prompt backed by `localStorage`
- The last username used is remembered in `localStorage` and prefilled on `/play` and `/play/join`

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
│   │   ├── gameEngine.js     # Server helpers shared by the game and ability methods (winner, advance, lives)
│   │   ├── abilities.js      # abilities.* methods (connection-bound)
│   │   ├── abilityEngine.js  # Dealing, resolving and playing ability cards (server)
│   │   ├── abilityRules.js   # Pure card catalogue and rules (incl. playback effects), shared with the client
│   │   ├── playerAccounts.js # PlayerAccountsCollection + register/signIn/googleSignIn/resume/signOut
│   │   ├── googleAuth.js     # GOOGLE_CLIENT_ID + Google ID-token verification (server use only)
│   │   └── sequence.js       # COLOURS + generateSequence
│   └── ui/
│       ├── pages/            # Splash, PlayRoute, JoinRoom, PlayerLobby, GamePage, Account
│       ├── abilities/        # Draft overlay, hand dialog, target picker, feed toggle, lobby switch
│       ├── components/       # design.jsx, ConfirmationPopup.jsx, ReconnectPopup.jsx
│       ├── Header.jsx
│       ├── Leaderboard.jsx        # per-round live leaderboard (players + rounds)
│       ├── leaderboardModels.js   # live leaderboard row helpers
│       ├── EndLeaderboard.jsx     # end-of-game ranking
│       ├── ColourSequence.jsx     # sequence playback + tile input
│       ├── roomCode.js            # pure helpers for the 5-slot code entry
│       ├── keyboard.js            # pure key handlers
│       ├── accountSession.js      # signed-in account: session token, resume, useSignedInAccount
│       ├── savedUsername.js       # remembers the last username in localStorage
│       └── styles.css             # Tailwind directives + keyframes
└── tests/                    # meteortesting:mocha specs, see Testing below
```

Note the design system lives at `imports/ui/components/design.jsx`, **not** `imports/ui/design.jsx`.

`generateSequence` lives only in `imports/api/sequence.js`; the game imports it through `gameEngine.js`.

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
| `/account` | `Account` | register / sign in, with a Google button when `GOOGLE_CLIENT_ID` is set |
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
| `BrowserSessionsCollection` | `browserSessions` | `imports/api/browserSessions.js` |
| `GameEventsCollection` | `gameEvents` | `imports/api/gameEvents.js:6` |

Each definition is wrapped in a `global._<Name>Collection` guard so it survives double evaluation under `meteor test --full-app`.

### Document shapes

**`rooms`** (written by `rooms.create`, `rooms.js:46-53`)
```js
{ pin, hostName, gameName: `Game${pin}`, status: 'lobby' | 'in_progress',
  players: [{ id, name, browserSessionId }], createdAt, abilitiesEnabled: true,
  security?: { blockedSessionIds: [], ipBans: [{ address, expiresAt, createdAt }] } }
```
`abilitiesEnabled` is set by `rooms.create` and `rooms.setAbilities`. The server treats a missing value as off, so rooms from before abilities existed play without them.
`hostId` is returned to the client by `rooms.create` but is **never persisted on the document**.
`security` is private. Session blocks last until the room's TTL. Each IP ban stops applying at `expiresAt` without waiting for a cleanup. `rooms.lobby` is a field whitelist, so neither `security` nor `players.browserSessionId` is published.

**`rounds`** (written by `rounds.generate` and `rounds.advance`)
```js
{ gameId, lengthOfSequence, sequence: ['red'|'blue'|'green'|'yellow', ...],
  createdAt, advanced: bool, isCurrent: bool,
  draft?: { endsAt, resolved, resolvedAt? },
  deadlineAt?: Date | null, expiredAt?: Date, expiringUntil?: Date }
```
`draft` exists on standard rounds from round 2 when abilities are on. Playback and the round timer wait for `resolved`.
`deadlineAt` is the server's round deadline (`ROUND_TIMER_SECONDS` after the clock starts) and exists on every standard round, never on Battle Royale. It is `null` until the clock starts: round 1 starts it when the last lobby member has joined (`players.join`) or `ROUND_START_FALLBACK_MS` after the round is created, whichever is first; a round with a draft starts it in the write that sets `draft.resolved`; any other round has it from `rounds.advance`. Clients count down to it on the server's clock (`time.now`).
`expiredAt` marks a round whose deadline has been enforced. `expiringUntil` is the lease one `expireRound` call holds while it works, so a call that dies is retried.
`sequence` is the server's copy only: the `rounds` publication never sends it. Each player receives theirs in `players.secret.sequence`.

**`players`** (written by `players.join` in `gameMethods.js`)
```js
{ gameId, roundId, name, lives: 3, attemptedSequence: [], currentStreak: 0,
  longestStreak: 0, totalGuesses: 0, correctGuesses: 0, eliminatedRound: null,
  eliminated: false, winner: false, completeRound: false,
  roundStatus: 'Playing' | 'Correct' | 'Passed' | 'Eliminated', gameFinished: false,
  connectionId, connected, reconnectTokenHash?,
  guard: { browserSessionId, boundAt, botStrikes, attempt },
  secret: {
    sequence: { roundId, colours, version },   // what this player must repeat
    draft?: { roundId, offered: [3 types], endsAt, status: 'open'|'picked'|'skipped'|'expired', pick },
    hand: [{ id, type, roundId }],              // held cards; Free Pass and Jump outlive their round
    shieldRoundId?,                             // shielded while it equals roundId
    playback?: {                                // Slo-Mo / 2x Speed / Lights Out aimed at this player
      speed?: { roundId, value: 'slow'|'fast', by },
      lightsOut?: { roundId, by },
    },
  } }
```
`reconnectTokenHash` is a server-only SHA-256 hash of the per-tab reconnect credential.
It is excluded from every player publication.
`secret` is hidden state. It is excluded from `players` and `eliminations` and reaches only its owner, through `players.secret`.
`guard` holds the open attempt, the strike count, and which browser session owns the player. It is excluded from `players` and `eliminations` and is never published.
`'Passed'` means the round was cleared with a Free Pass.
A `playback` effect holds while its `roundId` equals the player's `roundId`, so it lapses on its own. `roundId: null` is a Battle Royale effect waiting for the target's next level; `moveToLevel` binds it.
`roundStatus` is public, summary-only state for the live round UI. It must never
contain a sequence, attempted colour, or answer detail.

**`browserSessions`** (written by `browserSessions.resume`)
```js
{ tokenHash, createdAt, lastSeenAt }
```
The token itself stays in `localStorage['kimply.browser']`. The collection is never published. `lastSeenAt` has a 30-day TTL.

**`leaderboard`** (written by `clearRound` in `gameEngine.js`, append-only)
```js
{ gameId, playerId, name, lives, roundId, completedAt }
```

**`playerAccounts`** (written by `playerAccounts.register`, `:144-155`, and by `playerAccounts.googleSignIn` through `findOrCreateGoogleAccount`)
```js
{ displayName, email, passwordSalt?, passwordHash?, googleSub?,
  gamesPlayed: 0, wins: 0, bestRound: 0,
  sessions: [{ hash, createdAt, expiresAt }], createdAt, updatedAt }
```
An account has either a password or a `googleSub`, never both. One created by Google sign-in has no password fields. A password account that its owner signs in to with Google, using the same verified email, gains `googleSub` and **loses its password and sessions**, because registration never proved who owned that email.
`gamesPlayed` and `wins` are incremented by `recordGlobalResult` in `gameMethods.js` when a game with a linked account ends.
`sessions` holds the SHA-256 of each live session token, never the token itself. Sessions last 30 days, and expired ones are pruned whenever a new one is issued.

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
| `playerAccounts` | `{ 'sessions.hash': 1 }` | |
| `playerAccounts` | `{ googleSub: 1 }` | unique, sparse |
| `browserSessions` | `{ tokenHash: 1 }` | unique |
| `browserSessions` | `{ lastSeenAt: 1 }` | TTL 30 days |

The TTL indexes on `rooms` and `rounds` are what replaced the old destructive startup wipe: data expires on a timer instead of being deleted out from under live games on every restart.
`leaderboard` is append-only and nothing deletes from it, so its TTL is what keeps it inside the 512 MB Atlas free-tier allowance.

---

## Publications

All publications are **scoped to a single game**. `gameId` is the 5-character room PIN.

| Name | Defined at | Args | Selector | Projection |
|---|---|---|---|---|
| `rounds` | `server/publications.js:16` | `gameId` | `{ gameId, advanced: false }` | excludes `sequence` |
| `players` | `server/publications.js:23` | `gameId` | `{ gameId }` | excludes `attemptedSequence`, `secret`, `guard`, `reconnectTokenHash` |
| `players.secret` | `server/publications.js:31` | `gameId` | `{ gameId, connectionId: this.connection.id }` | `secret` only |
| `leaderboard` | `server/publications.js:36` | `gameId` | `{ gameId }` | none |
| `eliminations` | `server/publications.js:41` | `gameId` | eliminated players in game | excludes `attemptedSequence`, `secret`, `guard`, `reconnectTokenHash`, newest 20 |
| `gameFeed` | `server/publications.js:52` | `gameId` | `{ gameId, type: 'ability' }` | newest `FEED_EVENT_LIMIT` (500) |
| `rooms.lobby` | `imports/api/rooms.js:23` | `pin` | `{ pin }` | `_id, pin, status, gameName, hostName, customSettings, gameMode, abilitiesEnabled, players.name, players.id, players.connected` |

These properties are load-bearing and must not be undone:

- `rounds` never carries `sequence`. Battle Royale level rounds are never marked `advanced`, so the old `advanced: false` selector alone sent every level's answer to every client (D20).
- Excluding `attemptedSequence` on `players` matters because that field holds the answer a player submitted. Publishing it handed the correct sequence to everyone who had not played the round yet.
- Excluding `secret` on `players` and `eliminations` keeps sequences, drafts, picks and hands private. `players.secret` selects by the caller's connection, not by an argument, so nobody can ask for another player's.
- Scoping by `gameId` is what keeps DDP fan-out proportional to room size rather than to the whole deployment.

Invalid input resolves to `this.ready()` rather than throwing, matching the `rooms.lobby` convention.

Publications live in `server/publications.js`, **not** `server/main.js`, so that tests can import them.
Plain `meteor test` does not load the server entry point; only `meteor test --full-app` does.
The module carries a `global._publicationsInitialized` guard because under `--full-app` it is evaluated twice and Meteor throws on duplicate publication names.

### Client subscriptions

| File:line | Publication | Args |
|---|---|---|
| `ui/pages/GamePage.jsx` | `rounds`, `players`, `players.secret`, `rooms.lobby` | `gameId` |
| `ui/abilities/LiveFeed.jsx` | `gameFeed` | `gameId` |
| `ui/Leaderboard.jsx:12-13` | `players`, `rounds` | `gameId` |
| `ui/EndLeaderboard.jsx:30` | `players` | `gameId` |
| `ui/EliminationFeed.jsx` | `eliminations` | `gameId` |
| `ui/pages/PlayerLobby.jsx:366` | `rooms.lobby` | `pin` |

The `leaderboard` publication still exists and is tested, but the live UI no longer subscribes to it. `Leaderboard.jsx` builds rows from `players` + the current round via `leaderboardModels.js`. The `leaderboard` collection is still written by `players.submitSequence`.

`GamePage` derives `gameId` from `location.state.pin` and renders a "no game selected" screen when it is absent. A player who has completed the current round or been eliminated enters a spectator view that renders only the live leaderboard; it does not render the active round's sequence or colour controls.
There is deliberately no `'demo'` placeholder: with scoped publications it would subscribe to a game that does not exist and hang on LOADING forever.

---

## Methods

All methods are registered inside `if (Meteor.isServer && !global._<x>Initialized)` guards.
**None of them validate arguments with `check()` or `Match`.**
`abilities.*` methods require the owning connection.
`players.rebind` and the existing-player branch of `players.join` require a private reconnect credential; a first client join checks lobby connection ownership and that the round belongs to the game.
D3 remains open for the other game and room mutations.
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
| `rooms.setAbilities` | 104 | `pin, enabled` | Lobby only. Turns the ability draft on or off |

PIN alphabet is `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (`rooms.js:12`), generated with `Math.random()` (`rooms.js:15`), retried up to 10 times against a `findOne` collision check.

### Game loop (`imports/api/gameMethods.js`)

| Method | Line | Args | Description |
|---|---|---|---|
| `rounds.generate` | 232 | `gameId = null` | Inserts a new `isCurrent` round. A standard round starts with `deadlineAt: null` and arms the `ROUND_START_FALLBACK_MS` timer |
| `players.join` | 264 | `roundId, playerName, gameId, lobbyPlayerId, isBattleRoyale, accountId, reconnectToken` | Inserts a player with the room's starting lives and their own copy of the round's sequence, or rebinds an existing one |
| `players.rebind` | 347 | `playerId, reconnectToken` | Verifies the private credential before binding the caller's connection after a DDP reconnect (D21, D24). Refused while that browser or address is banned from the room |
| `players.startAttempt` | 364 | `playerId, roundId` | Opens one attempt for the caller's player once the draft has resolved. Returns `{ attemptId }` |
| `players.submitSequence` | 401 | `playerId, attemptedSequence, attempt?` | Grades against `secret.sequence`. A connected caller, with detection on, must send `{ attemptId, roundId, offsets }` from `players.startAttempt`. Lives move with `$inc` |
| `browserSessions.resume` | | `token` | Binds this DDP connection to an anonymous browser session. Returns the token. Only the hash is stored |
| `players.timeoutTurn` | 412 | `playerId` | Deducts a life and updates the public round status |
| `players.timeoutRound` | 454 | `playerId, timeoutRoundId` | Eliminates the caller's own player at once. The client no longer calls it: the server's round deadline (`rounds.expire`) does this for everyone |
| `players.leaveGame` | 490 | `playerId` | Marks a spectator eliminated while retaining their result, then rechecks the winner and round progress |
| `rounds.advance` | 515 | `currentRoundId` | Marks the round advanced, inserts the next one (with a draft when abilities are on, and its `deadlineAt` unless a draft is holding the clock), moves active players onto it with their new `secret.sequence` |
| `rounds.expire` | 591 | `roundId` | Enforces a round's deadline: past `deadlineAt` + `ROUND_EXPIRE_GRACE_MS` it eliminates every player who has not cleared the round (and removes any whose connection has closed, as the disconnect cleanup does), drops lobby members who never joined, then declares a winner or advances. Any client may call it; the server checks the deadline. Returns whether it ran |
| `time.now` | 597 | none | The server's clock in ms, so the client counts down to `deadlineAt` on the server's time |

Shared helpers live in `gameEngine.js`: `checkWinner`, `advanceRoundIfReady`, `getOrCreateRound`, `loseLife`, `clearRound`, `moveToLevel`, `recordGlobalResult`, `removePlayerFromGame` (player, leaderboard rows and lobby seat; used by the disconnect cleanup and `expireRound`), and the round clock: `startRoundClock`, `startClockIfEveryoneJoined`, `armRoundTimer`, `armRoundStartFallback`, `expireRound`, `assertRoundOpen`, `sweepRoundDeadlines`.

### Abilities (`imports/api/abilities.js`)

From round 2 of a standard game, each surviving player is dealt 3 of Steal, Strike, Shield, Slo-Mo, 2x Speed, Lights Out, Free Pass, Reroll and Scramble, and picks 1 or skips within `DRAFT_SECONDS`.
Battle Royale players draft on every level-up instead, Jump is added, and Steal is only dealt when the room starts players on more than 1 life.
Steal, Strike, Shield and the playback cards resolve when the draft closes (all at once: Steals, then Strikes, then playback cards; Shields block all of them, and Scramble). In Battle Royale they resolve on pick, and a playback card waits for the target's next level.
Slo-Mo and 2x Speed halve or double the target's playback speed for the round, replays included; Lights Out darkens a third of the target's flashes, rounded down and never the first, with a fresh pick on every replay. A target takes at most one speed change and one Lights Out per round: the first to land wins and a second misses.
Free Pass and Jump stay in the hand until played; Reroll and Scramble expire with their round.
The rules and copy live in `abilityRules.js`; the server work in `abilityEngine.js`.
The lobby's `SEE THE CARDS` guide (`ui/abilities/LobbyAbilities.jsx`, built by `abilityGuide` in `abilityFeed.js`) lists every card the room can deal, from the same `eligibleAbilities` the server deals with, so it cannot drift from the draft.

| Method | Line | Args | Description |
|---|---|---|---|
| `abilities.pick` | 20 | `playerId, type, targetId?` | Takes a dealt card. Closes the round's draft early once everyone has chosen |
| `abilities.skip` | 27 | `playerId` | Passes on the draft |
| `abilities.use` | 34 | `playerId, cardId, targetId?` | Plays a held card: Free Pass, Reroll, Scramble, Jump. Refused while the round's draft is open |
| `abilities.closeDraft` | 41 | `roundId` | Client fallback for the server's draft timer. Resolves only past `endsAt` or once everyone has chosen, and only once |

Ability outcomes are written to `gameEvents` as `{ type: 'ability', ability, outcome: 'hit'|'blocked'|'failed'|'eliminated'|'used', playerId, playerName, targetId, targetName, round }`.
The game screen's live feed (`ui/abilities/LiveFeed.jsx`) lists all of them for the whole game, merged with eliminations from `players`.
Ability events are the only thing written to `gameEvents`; the old `level-up` and `correct-submission` events and the `gameEvents` publication were removed with the toasts they fed.

A round advances only when **every** active player has submitted (`:79-81` and `:206-208`).
The server enforces a deadline (`deadlineAt`, see `rounds`), so a player who stops responding cannot hold a round (D5, fixed 2026-10-18). `expireRound` runs from three places: a `Meteor.setTimeout` armed when the clock starts, the sweep in `server/main.js` every `ROUND_SWEEP_INTERVAL_MS` (a restart loses the timers), and any client whose countdown reached zero (`rounds.expire`). It is idempotent and safe on every replica.
Answers are accepted until `ROUND_EXPIRE_GRACE_MS` after `deadlineAt`. After that `players.startAttempt`, `players.submitSequence` and `playCard` throw `round-expired` and eliminate the player, so a phone that comes back late cannot answer its way back into the game.

### Accounts (`imports/api/playerAccounts.js`)

| Method | Line | Args | Description |
|---|---|---|---|
| `playerAccounts.register` | 120 | `{ displayName, email, password }` | Salted SHA-256, min 8-char password. Returns `{ _id, displayName, email, sessionToken }` |
| `playerAccounts.signIn` | 160 | `{ email, password }` | Returns `{ _id, displayName, email, sessionToken }`. Each sign-in is its own session. Throws `use-google` for a Google-only account |
| `playerAccounts.googleClientId` | 190 | none | The public OAuth client ID, or `null` when Google sign-in is off |
| `playerAccounts.googleSignIn` | 194 | `idToken` | Verifies a Google ID token (audience, signature, `email_verified`), then finds by `googleSub`, links by email (removing that account's password and sessions), or creates. Returns the same shape as `signIn` |
| `playerAccounts.resume` | 222 | `token` | Returns `{ _id, displayName, email }` for a live session, else throws `invalid-session` |
| `playerAccounts.signOut` | 230 | `token` | Deletes that one session. Unknown tokens are a no-op |

`PlayerAccountsCollection` is never published, so hashes and salts stay server-side.
Meteor's `accounts-base` / `accounts-password` / `accounts-google` packages are **not** installed; this is a hand-rolled implementation.
Google sign-in uses Google Identity Services in the browser and `google-auth-library` on the server, loaded lazily from `imports/api/googleAuth.js`.
That module reaches the client bundle through `playerAccounts.js`, so `app/rspack.config.js` aliases `google-auth-library` to nothing for the client build.

---

## Identity and State

There are four unrelated identity mechanisms, none of them Meteor's.
`Meteor.userId()` and `this.userId` are used nowhere in the repository, so **the server cannot identify the caller of any method**.

1. **Lobby identity** - a server-minted `Random.id()` (`rooms.js:50` for the host, `:116` for joiners).
   Joiners persist it to `localStorage.reconnectData` at `JoinRoom.jsx:53-58`.
   The host branch that would persist it is commented out at `PlayRoute.jsx:144-150`, so a host who reloads has no reconnect path.
2. **In-game identity** - the `_id` of a `players` document, held in React state by `GamePage.jsx`.
   The player ID is also saved in `localStorage`, and lobby joins resume the same player on refresh.
   A random reconnect credential is kept in `sessionStorage` per game and lobby player, with an in-memory fallback when storage is blocked.
   The server stores only its hash and checks it before rebinding; public player IDs and lobby IDs are insufficient.
   Legacy players without a hash can enroll a credential only while their original connection still owns them.
   The player document also records the owning DDP `connectionId` (set by `players.join`, refreshed by `players.rebind` after a reconnect).
   `players.secret`, first joins, legacy credential enrollment and the `abilities.*` methods rely on it.
3. **Browser session** - a random token from `browserSessions.resume`, kept in `localStorage['kimply.browser']` and bound to the DDP connection on startup and on reconnect. Gameplay mutations check the connection that owns the player. A room can block that session for its own lifetime.
4. **Account identity** - a session token from `register` / `signIn`, kept in `localStorage['kimply.session']` and resumed at startup by `imports/ui/accountSession.js`.
   Pages read the account with `useSignedInAccount()`; it is never passed through router state.
   The token is not bound to the DDP connection, and methods such as `rooms.join` and `players.join` still accept a client-supplied `accountId`.

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
| `playerAccounts.test.js` | register and signIn validation, hashing, normalisation; session issue, resume, expiry, sign-out; Google sign-in create, link, reject (verifier stubbed) |
| `roundAdvance.test.js` | `rounds.advance` increments, player migration, idempotency, concurrent advances create one round |
| `roundDeadline.test.js` | The round clock: when it starts (round 1 on the last join or the fallback, draft rounds on resolve), `expireRound` eliminations, idempotency and lease, late answers rejected, the sweep |
| `lifeDeduction.test.js` | life loss on wrong guess, streak reset |
| `streak.test.js` | current vs longest streak |
| `accuracy.test.js` | `totalGuesses` / `correctGuesses` |
| `updateWinner.test.js` | last-one-standing winner selection |
| `uiHelpers.test.js` | `roomCode.js`, `keyboard.js`, and `savedUsername.js` pure helpers |
| `sequence.test.js` | `imports/api/sequence.js` |
| `publications.test.js` | scoped pubs; no `sequence` on `rounds`; no `attemptedSequence` or `secret` on `players` / `eliminations`; `players.secret` is connection-bound; `gameFeed` |
| `playerReconnect.test.js` | Rebind and join ownership, valid reconnects, legacy enrollment, lobby and round checks, credential publication exclusion |
| `abilityRules.test.js` | dealing, eligibility, Shield, hand expiry, caller binding, `playbackFor` and `playbackTiming` |
| `abilities.test.js` | draft dealing, resolution order, Shield, Steal and Strike outcomes, Slo-Mo / 2x Speed / Lights Out landing, stacking, lapsing and Battle Royale pending, Free Pass, Reroll, Scramble, Jump, `rooms.setAbilities` |
| `abilityFeed.test.js` | feed rows, scope filtering and the wording of ability notices, playback cards included; the lobby card guide per mode and starting lives |
| `leaderboardModel.test.js` | live leaderboard row helpers in `leaderboardModels.js`; independent Battle Royale levels, recorded elimination levels, and shared standard-round levels |
| `botDetection.test.js` | timing thresholds and the development-only kill switch |
| `clientAddress.test.js` | IPv4 and IPv6 normalisation; addresses come only from `connection.clientAddress` |
| `browserSessions.test.js` | create, resume, hash-only storage, and clearing the connection binding |
| `roomBans.test.js` | attempt validation, third-strike removal, session and 15-minute IP bans |
| `leaveGame.test.js` | spectator departure retains their result and allows the game to finish |

**Not covered:** authorization on the older game and room mutations, most concurrency or race scenarios, `rooms.start`, `rooms.disconnect`, `rooms.updateGameName`, `rooms.reconnect`.

CI (`.github/workflows/test.yml`) runs on pull requests to `main` and `dev` only, never on merge, behind a coverage smoke gate.

---

## Known defects

One line each, so a review can cite an ID without opening anything.
**[docs/defect-register.md](docs/defect-register.md) holds the detail**: how each one actually fails, what the fix is, and the resolved ones kept for history. Do not restate that here.

| ID | Where | Issue |
|---|---|---|
| D3 | `rooms.js` host methods | Gameplay mutations now require the owning connection. Room host actions (`rooms.start`, `rooms.kick`, `rooms.disconnect`) still trust a client-supplied id. Fix is binding the connection, **not** a login wall |
| D4 | `gameEngine.js` `checkWinner` | Read-then-write race: double winner. Life changes now use `$inc` and `rounds.advance` claims the round atomically |
| D5 | `gameEngine.js` `expireRound` | **Fixed 2026-10-18.** Round deadline is now server-owned (`rounds.deadlineAt`); a player who froze or left can no longer stall a game or answer late |
| D6 | `rooms.js:172` | `hostId` is never persisted, so `rooms.reconnect` always reports `isHost: false` |
| D7 | `GamePage.jsx:43-53` | `playerId` lives only in React state, so a refresh mints a second player with fresh lives |
| D8 | `playerAccounts.js:22-24` | Unstretched SHA-256, non-constant-time compare, no rate limiting, enumeration oracle |
| D11 | root `package-lock.json` | Desynced against an empty root `package.json`, so `npm ci` at the repo root fails |
| D12 | `ColourSequence.jsx:80-92` | A new `AudioContext` per tile click, never closed |
| D14 | repo-wide | `npm run format:check` fails on `main`. Needs one dedicated formatting commit before it can gate CI |
| D23 | `docker-compose.yml` | Fixed 2026-10-12: local Rspack hot reload needs the backend's published port 8080 alongside the app on 3000 |
| D44 | `roomBans.js`, trusted proxy handling | Spoofed forwarded headers yield no client address, so removal writes no IP ban and a fresh session bypasses it |
| D45 | Production-mode Rspack CSS serving | Local `meteor run --production` returns HTTP 500 for the main CSS chunk, leaving the browser unstyled |

Fixed and kept for history in the register: D1, D2, D9, D10, D15, D16, D17, D18, D19, D20, D21, D22, D23, D24, D25, D43.

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
- `GOOGLE_CLIENT_ID` - optional. Empty turns Google sign-in off, which is the default everywhere until an OAuth client exists
- `HTTP_FORWARDED_COUNT` - `0` on the local direct connection, `1` behind the single Nginx or ALB hop. Meteor then uses `connection.clientAddress` from that hop. See [Meteor's proxy configuration](https://docs.meteor.com/cli/environment-variables#http-forwarded-count)
- `BOT_DETECTION_ENABLED` - default on. `false` is honoured only when `Meteor.isDevelopment` is true, and then detection and room bans are both off so a local agent can play

`GOOGLE_CLIENT_ID` is the only app-level setting with an environment-specific value, and each stack carries it differently:
`docker-compose.yml` locally (from the root `.env`), plain `environment` in `infra/ecs/task-definition.{dev,prod}.json` on ECS, and `/opt/kimply/.env` on the legacy EC2 instances.
It is a public value, not a secret, so it is not in Secrets Manager. Setup is [`docs/google-sign-in.md`](docs/google-sign-in.md).

`METEOR_SETTINGS` is not passed by either compose file, and **`Meteor.settings` is never read anywhere in the codebase**.
Apart from `GOOGLE_CLIENT_ID`, there is no configuration surface: starting lives (3), initial sequence length (4), PIN length (5), and minimum password length (8) are all hardcoded literals.

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

**Production is migrating to ECS on Fargate** (issue #1), designed in [`docs/ecs-target-architecture.md`](docs/ecs-target-architecture.md) and built from `infra/terraform/` and `infra/ecs/task-definition.prod.json`.
Until the cutover step in that document, the EC2 stack above is still what serves `kimply.online`.
The pipeline now deploys **only** to ECS: `main` to the `kimply-prod` cluster (serving `www.kimply.online`, with the apex forwarded to it) and `dev` to `kimply-dev` (serving `dev.kimply.online`), both through `deploy/ecs-deploy.sh`.
Both also answer on `ecs.kimply.online` / `ecs-dev.kimply.online`, which bypass the apex redirect.
The EC2 instances therefore keep serving whatever they last received until each cutover. To ship to one in the meantime, run `deploy/deploy.sh <sha>` on that instance by hand.

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
