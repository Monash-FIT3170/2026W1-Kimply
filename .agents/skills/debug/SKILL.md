---
name: debug
description: >-
  Reproduce a Kimply bug end to end before changing code, then confirm the fix
  the same way. Use when investigating a bug report, a stalled game, a hang on
  LOADING, a crash, or anything described as "not working".
---

# Debugging

Reproduce first, in a browser, as a player would. A stack trace tells you where it failed, not why the player got there.
Only after the bug reproduces do you read code, and only after it reproduces do you write the fix.

Check `docs/defect-register.md` before hunting. D3-D14 are recorded with their cause and their intended fix; rediscovering one costs a session.

## Reproduce

The game is multiplayer, and most interesting bugs need two players.

- Second player goes in a **private window or a second browser profile**, not a second tab. `reconnectData` in `localStorage` is per-profile, so two tabs in one profile fight over the same lobby identity.
- `location.state` (`pin`, `playerName`, `playerId`, `isHost`) is per history entry. Opening a URL fresh gives you none of it, which is a legitimate scenario, not a broken setup.
- Every run wants a fresh PIN. Rooms and rounds expire on a 24 h TTL, so old ones linger.

A round advances only when **every** active player has submitted. There is no deadline.
A game that sits forever after one player closed their tab is D5, not a bug you introduced.

## Where the evidence is

| Symptom | Look here |
|---|---|
| Server error, method throw, build failure | `docker compose logs -f backend` - the only place a server stack trace appears |
| Client error, failed method callback | Browser devtools console |
| "It hangs on LOADING" | The subscription. A scoped publication with a `gameId` that does not exist never becomes ready |
| Wrong or missing data | `docker compose exec mongodb mongosh kimply --eval 'db.players.find({gameId:"ABC12"})'` |
| Works locally, fails deployed | `./scripts/health-check.sh <url>`, then `node loadtest/ddp-smoke.mjs wss://<host>/websocket` |

`loadtest/ddp-smoke.mjs` drives real DDP over a WebSocket with no dependencies. It is the fastest way to prove a bug is in the methods or publications rather than in React, and it is scriptable in a way a browser is not.

Server-side failures reach the client as `Meteor.Error`. If the UI shows nothing, the callback is swallowing it - check the client before assuming the server never ran.

## Narrow it down

1. **Client or server?** Call the method from `meteor shell` or `ddp-smoke.mjs`. If it misbehaves there, React is innocent.
2. **Publication or component?** Inspect the collection in the browser console. If minimongo already has the wrong documents, the bug is in the publication or the method.
3. **Is it a race?** Two players acting at once, or one player double-submitting. Read-then-write races are D4 - reproduce with two windows clicking together before concluding it is something new.
4. **Is it state, not code?** A refresh mid-game mints a second player with fresh lives (D7). Confirm the player document you are watching is the one the browser is actually using.

## Then, and only then

Write the failing test next to the existing specs (see the `test` skill), watch it fail, fix it, watch it pass.
Re-run the original end-to-end reproduction. A green unit test is not evidence that a player's experience changed.

## Do not chase these

- The empty `position: fixed; z-index: 2147483647` div under the username field on `/play`. It is appended outside `#react-target` by a browser extension, most likely a password manager.
- `generateSequence` in `imports/api/sequence.js`. The live game uses the identical copy in `gameMethods.js`; editing `sequence.js` alone changes nothing a player can see.
- The duplicate `path="*"` in `client/main.jsx`. React Router v7 ranks by specificity, so it is dead code, not a routing bug.
