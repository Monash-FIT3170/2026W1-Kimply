---
name: review
description: >-
  Review a Kimply PR or diff against load-bearing invariants and the known
  defect list. Use when reviewing pull requests, examining a diff, or when
  the user asks for a code review.
---

# Review

Read `AGENTS.md` tables and `docs/defect-register.md` before commenting. Anonymous play is intentional — "add login" is not a valid fix for missing `this.userId`.

A diff that touches UI is reviewed against `docs/design_system.md`. A new hue, a second lime element on one screen, a tile colour on a non-game element, or a hand-rolled component that duplicates a documented one is 🟡 with a pointer to the section it breaks.

## Block merge

- Publications: still scoped by `gameId`; `rounds` still `isCurrent: true` only; `players` still excludes `attemptedSequence`. Invalid input still `this.ready()`, not a throw.
- Methods still registered behind `if (Meteor.isServer && !global._<x>Initialized)`. Collection defs still behind `global._<Name>Collection`.
- No `.allow()` / `.deny()`, no `autopublish`, no `insecure`.
- No new `'demo'` `gameId` subscription. `GamePage` with no pin stays on the "no game selected" screen.
- Client-supplied ids (`playerId`, room membership) are not newly trusted in a way that worsens D3. Binding `this.connection.id` is the intended direction, not a login wall.
- Life changes use `$inc`, not `$set` from a stale read (D4). Round advance and winner selection stay idempotent under two concurrent callers.
- `deploy/`, `nginx/`, `docker-compose.prod.yml` are not forked per environment. Local `docker-compose.yml` still boots.
- Invented npm scripts (`lint`, `e2e`, `typecheck`, `build`, `dev`) are rejected. Format is Prettier only.
- `AGENTS.md` tables updated, and a `docs/decision-log.md` entry added, in the same change when collections, publications, methods, routes, tests, or defects moved.

## Call out, do not rediscover

These are recorded and deferred. Mention them only if the diff makes them worse, and cite the ID:

| ID | Trap |
|---|---|
| D3 | `players.submitSequence` trusts client `playerId` |
| D4 | Read-then-write races on advance / winner / lives |
| D5 | No round deadline; one leaver stalls the game |
| D6 | `hostId` never persisted; reconnect `isHost` is always false |
| D7 | Refresh mints a second in-game player |
| D8 | Weak password hashing / enumeration |
| D11 | Root `package-lock.json` vs empty root `package.json` |
| D12 | New `AudioContext` per tile click |
| D14 | `format:check` dirty on main |

The empty high-z-index overlay on `/play` is a browser extension, not a defect.

## Feedback format

- 🔴 **Must fix** — breaks a load-bearing invariant, security, or the game loop
- 🟡 **Should fix** — correctness or maintainability in this diff
- 🟢 **Nit** — optional

Point at a file and line. Do not re-litigate architecture that this diff did not touch.
