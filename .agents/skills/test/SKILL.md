---
name: test
description: >-
  Write and run Meteor mocha tests the way this repo actually works. Use when
  adding a *.test.js file, running tests, coverage, or when the user mentions
  mocha, meteortesting, or docker compose test commands.
---

# Tests

Runner is `meteortesting:mocha`. Entry `app/tests/main.js` auto-loads every sibling `*.test.js` via `require.context`. Drop a new file next to the others; do not register it by hand.

There is **no** ESLint and **no** `npm run lint` / `build` / `dev` / `typecheck` / `e2e`. Do not invent those. Format with Prettier.

What a change should be tested for lives in `AGENTS.md` and the spec next to the code. This skill is only how tests are run and shaped.

## Commands

From the repo root. On Windows these run in WSL2, not PowerShell.

```bash
docker compose exec backend meteor npm test          # once
docker compose exec backend meteor npm run test-app  # watch
docker compose --profile test run test               # one-shot container
docker compose exec backend meteor npm run format
docker compose exec backend meteor npm run format:check
```

CI is `.github/workflows/test.yml` on PRs to `main` and `dev` only. Coverage is a smoke gate, not a quality gate.

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
