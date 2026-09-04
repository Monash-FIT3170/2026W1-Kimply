---
name: review
description: >-
  Review a pull request or diff against this repo's docs and invariants. Use
  when reviewing pull requests, examining a diff, or when the user asks for a
  code review.
---

# Review

Read before commenting:

- `AGENTS.md` — current collections, publications, methods, routes, and operating rules
- `docs/defect-register.md` — known deferred defects; do not rediscover them
- `docs/design_system.md` — if the diff touches UI
- `docs/decision-log.md` — recent intent

Product direction (what the game is allowed to be) lives in those docs, not here. If a change would move an invariant, the review question is whether the matching doc was updated in the same change.

## What to check

- The diff does not silently undo something `AGENTS.md` marks as load-bearing.
- A known defect is mentioned **only** if this diff makes it worse, and the comment cites the ID from the register.
- Invented npm scripts (`lint`, `e2e`, `typecheck`, `build`, `dev`) are rejected. Format is Prettier only.
- `deploy/`, `nginx/`, and `docker-compose.prod.yml` are not forked per environment. Local `docker-compose.yml` still boots.
- `AGENTS.md` tables and a `docs/decision-log.md` entry are updated in the same change when behaviour, inventory, or defects moved.

## Feedback format

- 🔴 **Must fix** — breaks a documented invariant, security, or shipped behaviour
- 🟡 **Should fix** — correctness or maintainability in this diff
- 🟢 **Nit** — optional

Point at a file and line. Do not re-litigate architecture this diff did not touch.
