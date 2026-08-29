---
name: debug
description: >-
  Reproduce a bug end to end before changing code, then confirm the fix the
  same way. Use when investigating a bug report, a stall, a hang, a crash, or
  anything described as "not working".
---

# Debugging

Reproduce first, the way a user would. A stack trace tells you where it failed, not how they got there. Only after it reproduces do you read code, and only after it reproduces do you write the fix.

Check `docs/defect-register.md` before hunting so a known item is not treated as new.

## Reproduce

- More than one session: use a **private window or a second browser profile**, not a second tab in the same profile. Client storage is per-profile.
- Cold loads and shared links have no `location.state`. That is a real scenario, not a broken setup.
- Prefer a fresh room / document rather than one that may have expired or been left mid-flow.

## Where the evidence is

| Symptom | Look here |
|---|---|
| Server error, method throw, build failure | `docker compose logs -f backend` |
| Client error, failed method callback | Browser devtools console |
| Subscription never ready | The publication args vs what is actually on the server |
| Wrong or missing data | `docker compose exec mongodb mongosh kimply` |
| Works locally, fails deployed | `./scripts/health-check.sh <url>`, then `node loadtest/ddp-smoke.mjs wss://<host>/websocket` |

`loadtest/ddp-smoke.mjs` drives real DDP over a WebSocket with no extra dependencies. Use it when you need to separate method/publication bugs from React.

Server-side failures reach the client as `Meteor.Error`. If the UI shows nothing, the callback may be swallowing it.

## Narrow it down

1. **Client or server?** Call the method from `meteor shell` or `ddp-smoke.mjs`. If it misbehaves there, React is innocent.
2. **Publication or component?** Inspect minimongo in the browser console. Wrong documents already there means the bug is not in the component.
3. **Race?** Two sessions acting at once, or a double submit. Confirm before assuming a logic error.

## Then, and only then

Write the failing test (see the `test` skill), watch it fail, fix it, watch it pass.
Re-run the original end-to-end reproduction. A green unit test is not evidence that the user's experience changed.
