# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Kimply** is a real-time multiplayer color-sequence memory game (similar to Simon Says) built with Meteor 3.4, React 18, and MongoDB. Players join a game room via a 5-character PIN, wait in a lobby, then compete through color sequences. The game architecture is defined in `class-diagram.puml` — currently the splash, room creation, join flow, and lobby phases are implemented.

## Development Commands

**All Docker commands must be run from a WSL2 terminal on Windows** (not PowerShell). See README.md for full WSL2 setup instructions.

```bash
# Start development environment (MongoDB + Meteor on port 3000)
docker compose up

# Run tests (once)
docker compose exec backend meteor npm test

# Run tests in watch mode
docker compose exec backend meteor npm run test-app

# Add an npm package
docker compose exec backend meteor npm install <package-name>

# Restart just the Meteor app (e.g. after env var changes)
docker compose restart backend
```

## Architecture

### Tech Stack
- **Meteor 3.4** — full-stack framework (server + client bundling, reactive data)
- **React 18** + React Router v7 — UI and routing
- **MongoDB 7.0** — database (via Meteor's mongo package)
- **Tailwind CSS 3** — styling via custom design tokens (oklch color space)
- **Rspack** — Meteor's bundler (configured in `app/rspack.config.js`)

### Key Directories
```
app/
├── client/main.jsx       # React Router setup — all client routes defined here
├── server/main.js        # Meteor startup, publications, server-side methods
├── imports/
│   ├── api/rooms.js      # RoomsCollection + all Meteor methods/publications
│   └── ui/               # React components + shared design system
│       ├── design.jsx    # Design tokens, shared components (TileLattice, Wordmark, Avatar, etc.)
│       ├── styles.css    # Tailwind directives + keyframe animations
│       ├── Splash.jsx    # Screen 1 — landing page
│       ├── PlayRoute.jsx # Screen 2 — username entry + create/join cards
│       ├── JoinRoom.jsx  # Screen 3 — 5-slot room code entry
│       └── PlayerLobby.jsx # Screens 4 & 5 — host lobby + joined lobby
```

### Routing (`client/main.jsx`)
```
/           → Splash (click anywhere → /play)
/play       → PlayRoute (enter username, then Create Room or Join Room)
/play/join  → JoinRoom (5-slot code entry; reads ?code= param from invite links)
/play/:pin  → PlayerLobby (host view or joined view based on location.state.isHost)
```

### Data Flow (Meteor Pattern)
- **Collections** defined in `imports/api/` and imported on both client and server
- **Publications** (server) filter/expose data; **subscriptions** (client) reactively consume it via `useSubscribe` / `useTracker`
- **Methods** (server) handle all mutations — called from client via `Meteor.call()`

### Collections & API (`imports/api/rooms.js`)

`RoomsCollection` — fields: `pin`, `hostName`, `players[]` (`{ id, name }`), `status`, `createdAt`

| Publication | Args | Returns |
|---|---|---|
| `rooms.lobby` | `pin` | Single room by PIN (id, pin, status, hostName, players) |

| Method | Args | Description |
|---|---|---|
| `rooms.create` | `hostName` | Generates unique 5-char PIN, creates room, returns `{ pin }` |
| `rooms.join` | `pin, playerName` | Validates and adds player to room |
| `rooms.kick` | `pin, playerId` | Removes a non-host player from the room |

### Design System (`imports/ui/design.jsx`)

All colors use the oklch color space. Key tokens:

| Token | Value | Usage |
|---|---|---|
| `BG` | `oklch(0.14 0.02 270)` | Page background |
| `SURFACE` | `oklch(0.20 0.02 270)` | Cards, inputs |
| `PRIMARY` | `oklch(0.86 0.19 130)` | Lime — primary actions |
| `TILE.*` | pink / amber / teal / violet | Game tile colors |

Tailwind config (`tailwind.config.js`) exposes these as classes: `bg-bg`, `bg-surface`, `text-fg`, `text-fg3`, `border-hairline`, `font-outfit`, `font-manrope`, `font-mono`, `animate-kimply-pulse`, etc.

Inline styles are only used where Tailwind can't express the value (e.g. `color-mix()`, `oklch` in `box-shadow`, dynamic gradients).

### State Passed via React Router
Player identity and role are passed between screens via `location.state` (not persisted):
- `PlayRoute → PlayerLobby`: `{ playerName, isHost: true }`
- `PlayRoute → JoinRoom → PlayerLobby`: `{ playerName, isHost: false }`
- Kicked players are redirected to `/play` with `{ kicked: true }`
- Invite links (`/play/join?code=XXXXX`) pre-fill the code slots; JoinRoom shows a username field when no state is present

## Environment Variables

Defined in `docker-compose.yml` for dev:
- `MONGO_URL` — MongoDB connection string
- `ROOT_URL` — App root URL (http://localhost:3000)
- `PORT` — 3000
- `CHOKIDAR_USEPOLLING` / `CHOKIDAR_INTERVAL` — file watch polling (set for Windows compatibility)

Production (`docker-compose.prod.yml`) additionally requires:
- `MONGO_USER`, `MONGO_PASSWORD`, `METEOR_SETTINGS`

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

## Game Domain Model

From `class-diagram.puml` — the intended full architecture (not yet implemented beyond lobby):
- **GameSession**: status = WAITING | IN_PROGRESS | FINISHED
- **Player**: username, lives, currentLevel, status = ACTIVE | ELIMINATED
- **Sequence**: ordered list of Colors (RED, BLUE, GREEN, YELLOW)
- **Leaderboard** + **Result**: post-game rankings
