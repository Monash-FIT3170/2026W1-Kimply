---
name: test
description: >-
  Write and run Meteor mocha tests the way this repo actually works. Use when
  adding a *.test.js file, running tests, coverage, or when the user mentions
  mocha, meteortesting, or docker compose test commands.
---

# Tests

Runner is `meteortesting:mocha`. Entry `app/tests/main.js` auto-loads every sibling `*.test.js` via `require.context`. Drop a new file next to the others; do not register it by hand.

In `app/`, there is **no** ESLint and **no** `npm run lint` / `build` / `dev` / `typecheck` / `e2e`.
Do not invent those.
Format with Prettier.

What a change should be tested for lives in `AGENTS.md` and the spec next to the code. This skill is only how tests are run and shaped.

## Commands

From the repo root. On Windows these run in WSL2, not PowerShell.

```bash
docker compose --profile test run --build --rm test  # once, in the one-shot test container
docker compose exec backend meteor npm run format
docker compose exec backend meteor npm run format:check
```

`meteor npm test` and `meteor npm run test-app` inside the backend container only work with the dev app stopped, because they need port 3000.

CI is `.github/workflows/test.yml` on PRs to `main` and `dev` only. Coverage is a smoke gate, not a quality gate.

**CI runs `meteor test --full-app`, and `npm test` does not.** Under `--full-app` every module is evaluated twice (app bundle and test bundle), and methods are registered by whichever copy loads first.
Any module-level state a test changes, such as a stub or a test seam, must live on `global` (like the `global._<Name>Collection` guards), or the test changes its own copy while the method runs the other.
Before pushing anything that adds such state, reproduce CI locally:

```bash
docker compose --profile test run --build --rm test meteor test --once --full-app --driver-package meteortesting:mocha
```

`--build` matters for both one-shot commands: the test image copies the source at build time, so without it you test stale code.
`docker compose exec backend meteor npm test` fails with "Can't listen on port 3000" while the dev app is running; use the one-shot container instead.

## File shape

```js
import assert from 'assert';
import { Meteor } from 'meteor/meteor';

if (Meteor.isServer) {
  describe('the method under test', function () {
    beforeEach(async function () {
      await SomeCollection.removeAsync({});
    });

    it('does the thing', async function () {
      const id = await Meteor.callAsync('some.method', arg);
      const doc = await SomeCollection.findOneAsync(id);
      assert.ok(doc);
    });
  });
}
```

- Wrap method and publication specs in `if (Meteor.isServer)`.
- `beforeEach` must empty the collections you touch. Tests share one Mongo.
- Call methods with `Meteor.callAsync`, not `Meteor.call`.
- Assert Meteor errors with `assert.rejects(..., (err) => err.error === 'invalid')`.
- Collection modules use `global._<Name>Collection` guards so double-eval under `--full-app` is safe. Do not remove those guards.

## Loading the server

Plain `meteor test` does **not** load `server/main.js`. If a spec needs publications (or anything else registered only from the server entry), import that module in the spec.

`tests/` must stay in the Docker build context: `meteor.testModule` in `package.json` points at `tests/main.js`, and `meteor build` resolves it even for a production image.

## Playwright end-to-end suite

`e2e/` is its own package; never install Playwright in `app/`.
Start the app and MongoDB, keep bot detection enabled, then run:

```bash
cd e2e
npm ci
npx playwright install chromium
npm test
npm test -- --project=rules
npm test -- --project=ui
```

Use `E2E_BASE_URL` and `E2E_MONGO_URL` for an isolated stack in another worktree.
`e2e/compose.dev.yml` isolates the app, MongoDB and Rspack HMR ports; its internal HMR port must match its published port.
See `e2e/README.md` for the production-image commands used by CI.
One-second Meteor polling lets seeded cards reach the UI before the 20-second draft closes.

Add rules scenarios for game state, every method's observable result, card resolution, ownership and timing.
Add browser scenarios for navigation, keyboard and touch controls, copy, replay, layout and reconnect rendering.
Import `test` from `e2e/lib/fixtures.js` or `e2e/lib/game.js`, so per-test teardown also runs on failure.
Never wipe a collection globally; each test owns a room and cleans its own records.
Seed account sessions with `seedAccount`, never type passwords.
Use `Player.answer` or the browser `answer` helper for real elapsed human gaps, and preserve 43-character base64url reconnect tokens.
For seeded DDP changes, wait for the published state before acting.

CI is `.github/workflows/e2e.yml`, separate from the Meteor unit and integration workflow.
Failures retain an HTML report, traces, videos and the app log.
Before shipping new regressions, demonstrate that intentionally undoing the relevant fix makes its test fail.
Format with `app/node_modules/.bin/prettier --write e2e` from the root.
