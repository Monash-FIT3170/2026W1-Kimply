# Kimply end-to-end tests

This package tests the running application through real DDP and Chromium.
It is independent of `app/`; Playwright and its browsers never enter the Meteor image.

## Local development

Start the app with `docker compose up`, with bot detection enabled, then:

```bash
cd e2e
npm ci
npx playwright install chromium
npm test
```

The defaults are `E2E_BASE_URL=http://localhost:3000` and `E2E_MONGO_URL=mongodb://localhost:27017/?directConnection=true`, database `kimply`.
Use both variables when testing another worktree on separate ports.
The supplied override isolates MongoDB, the app and Rspack's HMR port:

```bash
docker compose -p kimply-e2e-dev -f docker-compose.yml -f e2e/compose.dev.yml up --build
```

Run that command from the repository root.
It defaults to app port 3100, MongoDB port 27118 and HMR port 8180; override them with `E2E_APP_PORT`, `E2E_MONGO_PORT` and `E2E_HMR_PORT`.
Set Rspack's internal port as well as its host mapping, or the browser can connect to another worktree's HMR server and reload continuously.
Local compose uses one-second Meteor polling so seeded cards arrive before a draft expires.

```bash
E2E_BASE_URL=http://localhost:3100 E2E_MONGO_URL='mongodb://localhost:27118/?directConnection=true' npm test
npm test -- --project=rules
npm test -- --project=ui
npx playwright show-report
```

## Production image

CI builds the same Dockerfile as ECS, on the runner's native architecture, with MongoDB 7 and bot detection enabled.
These equivalent commands use separate names and ports so they can run alongside the dev stack:

```bash
docker network create kimply-e2e
docker run -d --name kimply-e2e-mongo --network kimply-e2e -p 27117:27017 mongo:7.0
docker build -t kimply-e2e:local app
docker run -d --name kimply-e2e-app --network kimply-e2e -p 3101:3000 \
  -e MONGO_URL=mongodb://kimply-e2e-mongo:27017/kimply \
  -e ROOT_URL=http://localhost:3101 -e PORT=3000 -e HTTP_FORWARDED_COUNT=0 \
  -e METEOR_POLLING_INTERVAL_MS=1000 kimply-e2e:local
curl --fail http://localhost:3101/health/ready
cd e2e
E2E_BASE_URL=http://localhost:3101 E2E_MONGO_URL='mongodb://localhost:27117/?directConnection=true' npm test
```

Wait for `/health/ready` to return 200 before starting the tests.
Remove only these named containers and their network when finished; do not remove another worktree's data.

## Coverage and helpers

| Location          | Purpose                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rules/`          | No browser: presets, lives, streaks, all ability cards, Battle Royale, lobby validation, privacy, ownership, bot removal, disconnect grace and the real deadline |
| `ui/`             | Chromium: desktop and phone navigation, predictive input, lobby, controls, refresh, draft clock, targeting, abilities, deadlines and final/global rankings       |
| `lib/ddp.js`      | Connection-bound scripted players, browser sessions, 43-character reconnect credentials and actual 90-200ms answer gaps                                          |
| `lib/db.js`       | Scoped Mongo reads, deterministic cards and hashed account sessions                                                                                              |
| `lib/game.js`     | UI room creation, bots, human keyboard/tile answers and viewport checks                                                                                          |
| `lib/fixtures.js` | Per-test ownership and teardown, including failure paths                                                                                                         |

Every test creates its own rooms and removes only its own rooms, rounds, players, feed, leaderboard records, accounts and sessions.
The browser fixture captures every `browserSessions.resume` response over DDP, including concurrent startup calls, and closes its page before data teardown.
Never clear whole collections, disable bot detection, type a password, or make tests depend on execution order.
A seeded session in `localStorage['kimply.session']` signs in the browser.
DDP updates replace whole top-level fields, including `secret`; do not deep-merge them.
Seed drafts early and wait for their publication before choosing a card.
Navigate through the UI when router state is required, and use reload for refresh tests.
Overflow checks inspect layout containers; intentional ellipsis on leaf text, such as an invite URL, does not represent a clipped child layout.

## CI and regression checks

`.github/workflows/e2e.yml` runs both projects on every pull request push to `dev` and `main`.
New pushes cancel older runs for the same PR.
The workflow caches production-image layers and uploads the HTML report, traces, videos and app log on failure.
Four workers run in CI, two locally, with 180-second test timeouts for the real 50-second round clock.
Local retries are disabled; CI permits one retry and reports flakes.

Before opening a PR, run the full suite three consecutive times and the existing Meteor tests.
Temporarily undo each relevant fix and confirm its regression fails, then restore the fix:

| Fix                                           | Regression                                                   |
| --------------------------------------------- | ------------------------------------------------------------ |
| Draft readout uses server `endsAt`            | `ui/abilities.spec.js`, reload after 6.5 seconds             |
| `timedOutWhileAway` retains returning players | `rules/reconnect-deadline.spec.js` and `ui/deadline.spec.js` |
| `hostId` identifies the host                  | `rules/lobby.spec.js` and `ui/lobby.spec.js`                 |
| TileLattice owns a clip wrapper               | `ui/navigation.spec.js` at desktop and phone widths          |
