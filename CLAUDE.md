# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Kimply** is a real time multiplayer color-sequence memory game (similar to Simon Says) built with Meteor 3.4, React 18, and MongoDB. Players join a game room via PIN, wait in a lobby, then compete through color sequences. The game architecture is defined in `class-diagram.puml` — currently only the join/lobby phase is implemented.

## Development Commands

All development happens inside Docker. From the repo root:

```bash
# Start development environment (MongoDB + Meteor on port 3000)
docker-compose up

# Run tests (once)
docker-compose exec meteor npm test

# Run tests in watch mode
docker-compose exec meteor npm run test-app
```

To run Meteor directly (inside the container or with Meteor installed locally):
```bash
cd app
meteor run          # start dev server
meteor test --once --driver-package meteortesting:mocha   # run tests once
```

## Architecture

### Tech Stack
- **Meteor 3.4** — full-stack framework (server + client bundling, reactive data)
- **React 18** + React Router v7 — UI and routing
- **MongoDB 7.0** — database (via Meteor's mongo package)
- **Tailwind CSS 3** + custom CSS variables — styling (dark theme)
- **Rspack** — Meteor's bundler (configured in `app/rspack.config.js`)

### Key Directories
```
app/
├── client/main.jsx       # React Router setup — all client routes defined here
├── server/main.js        # Meteor startup, publications, server-side methods
├── imports/
│   ├── api/              # MongoDB collections + Meteor methods/publications
│   └── ui/               # React components
```

### Data Flow (Meteor Pattern)
- **Collections** are defined in `imports/api/` and imported on both client and server
- **Publications** (server) filter/expose data; **subscriptions** (client) reactively consume it
- **Methods** (server) handle mutations — called from client via `Meteor.call()`
- `react-meteor-data` hooks (`useTracker`, `useSubscribe`) connect Meteor reactivity to React

### Current Collections
- `RoomsCollection` (`imports/api/rooms.js`) — game rooms with `pin`, `players[]`, `status`
  - Publication: `rooms.lobby` — publishes a single room by PIN
  - Method: `rooms.join(pin, playerName)` — validates PIN and adds player

### Routing (client/main.jsx)
```
/        → redirect to /play
/play    → JoinRoom (enter PIN + player name)
/play/:pin → PlayerLobby (waiting room showing connected players)
```

### Styling
- Global CSS variables (colors, shadows) defined in `imports/ui/styles.css`
- Tailwind utility classes for layout/spacing
- Dark theme palette: background `#0d1b2a`, surface `#1a2a3a`

## Environment Variables

Defined in `docker-compose.yml` for dev:
- `MONGO_URL` — MongoDB connection string
- `ROOT_URL` — App root URL (http://localhost:3000)
- `PORT` — App port (3000)

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

From `class-diagram.puml` — the intended full architecture:
- **GameSession**: status = WAITING | IN_PROGRESS | FINISHED
- **Player**: username, lives, currentLevel, status = ACTIVE | ELIMINATED
- **Sequence**: ordered list of Colors (RED, BLUE, GREEN, YELLOW)
- **Leaderboard** + **Result**: post-game rankings

Most of this is not yet implemented — current code only handles room creation and the player lobby.
