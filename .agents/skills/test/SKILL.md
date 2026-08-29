---
name: test
description: >-
  Write and run Kimply Meteor mocha tests the way this repo actually works.
  Use when adding a *.test.js file, running tests, coverage, or when the user
  mentions mocha, meteortesting, docker compose exec backend meteor npm test.
---

# Tests

Runner is `meteortesting:mocha`. Entry `app/tests/main.js` auto-loads every sibling `*.test.js` via `require.context`. Drop a new file next to the others; do not register it by hand.

There is **no** ESLint, **no** `npm run lint` / `build` / `dev` / `typecheck` / `e2e`. Do not invent those. Format with Prettier.

## Commands

From the repo root. On Windows these run in WSL2, not PowerShell.

```bash
docker compose exec backend meteor npm test          # once
docker compose exec backend meteor npm run test-app  # watch
docker compose --profile test run test               # one-shot container
docker compose exec backend meteor npm run format
docker compose exec backend meteor npm run format:check
```

CI is `.github/workflows/test.yml` on PRs to `main` and `dev` only. Coverage is a smoke gate (branches 10 / lines 10 / functions 7 / statements 10), not a quality gate.

## File shape

```js
import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import { PlayersCollection } from '../imports/api/players';
import '../imports/api/gameMethods.js'; // only if you call those methods

if (Meteor.isServer) {
  describe('players.submitSequence', function () {
    beforeEach(async function () {
      await PlayersCollection.removeAsync({});
      await RoundsCollection.removeAsync({});
    });

    it('deducts a life on a wrong guess', async function () {
      // insert fixtures, then:
      await Meteor.callAsync('players.submitSequence', playerId, wrongSequence);
      const player = await PlayersCollection.findOneAsync(playerId);
      assert.strictEqual(player.lives, 2);
    });
  });
}
```

- Wrap method/publication specs in `if (Meteor.isServer)`.
- `beforeEach` must empty the collections you touch. Tests share one Mongo.
- Call methods with `Meteor.callAsync`, not `Meteor.call`.
- Assert Meteor errors with `assert.rejects(..., (err) => err.error === 'invalid')`.
- Import collections from `imports/api/*`. They are wrapped in `global._<Name>Collection` guards so double-eval under `--full-app` is safe; do not remove those guards.

## Publications

Plain `meteor test` does **not** load `server/main.js`. Import `../server/publications.js` in the spec (see `publications.test.js`). Invalid args must resolve to `this.ready()`, not a throw.

Do not assert on `attemptedSequence` in a publication result — the `players` publication excludes it on purpose.

## Traps

- `generateSequence` in `imports/api/sequence.js` is **not** the live path. The game uses the copy in `gameMethods.js`. `sequence.test.js` covers the unused copy; do not "fix" the game by editing `sequence.js` alone.
- `tests/` must stay in the Docker build context (`meteor.testModule` points at `tests/main.js`).
- Do not subscribe to a `'demo'` `gameId` in tests or UI. Scoped publications would hang on a game that does not exist.
