---
name: meteor
description: >-
  Meteor 3.4 rules for this app - async-only server collections, method and
  publication registration, double-eval guards, packages, and the bundler.
  Use when writing or debugging Meteor methods, publications, collections, DDP,
  meteor add / meteor npm install, or anything under app/server and
  app/imports/api.
---

# Meteor 3.4

Release is pinned in `app/.meteor/release`. The bundler is Rspack (`rspack@1.0.0`), not the classic Meteor bundler.

Meteor 3 removed Fibers.
Every server-side database call is async, and there is no `Meteor.wrapAsync` rescue.

## The async rule

| Where | API |
|---|---|
| Server, one document | `findOneAsync`, `insertAsync`, `updateAsync`, `removeAsync`, `countAsync` |
| Server, many documents | `find(...)` returns a cursor synchronously; `await cursor.fetchAsync()` to read it |
| Inside `Meteor.publish` | return the `find(...)` cursor - do not await it, do not fetch it |
| Client (minimongo) | `find()` and `findOne()` stay synchronous. That is what `useTracker` reads |

Every method under `imports/api/` is declared `async 'name'(args)`. Keep it that way.
A sync server-side Mongo call fails at runtime, not at build, so the bundler will not catch it for you.

The only non-Mongo `.update(` in the API layer is `createHash(...).update(...)` in `playerAccounts.js:21`. Do not "fix" it.

## Registration guards - do not remove

Collections are wrapped in `global._<Name>Collection`. Server side-effects are wrapped in `global._<x>Initialized`:

| File | Guard |
|---|---|
| `imports/api/rooms.js` | `_RoomsCollection`, `_roomsServerInitialized` |
| `imports/api/rounds.js` | `_RoundsCollection` |
| `imports/api/players.js` | `_PlayersCollection` |
| `imports/api/leaderboard.js` | `_LeaderboardCollection` |
| `imports/api/playerAccounts.js` | `_PlayerAccountsCollection`, `_playerAccountsServerInitialized` |
| `imports/api/gameMethods.js` | `_gameMethodsInitialized` |
| `server/publications.js` | `_publicationsInitialized` |
| `server/health.js` | `_healthEndpointsInitialized` |

`meteor test --full-app` evaluates the app bundle and the test bundle in one process, and Meteor throws on a duplicate publication name or a second `new Mongo.Collection('rooms')`.

CI runs `meteor test --once --full-app`; plain `npm test` does **not** pass `--full-app`.
A guard you delete therefore passes locally and fails in CI. Add the guard when you add a new collection, publication, or HTTP handler.

## Methods

Registered inside `if (Meteor.isServer && !global._<x>Initialized)`.
That means the client has **no stub**, so there is no latency compensation: every call is a full round trip and the UI owns its own pending state. Do not write optimistic UI that expects a stub to run.

- Validate by hand and throw `new Meteor.Error('invalid', 'message')`. That is the existing convention.
- `check@1.5.0` is in `.meteor/versions` but is imported nowhere. If you introduce `check`, convert a whole file and record it in `AGENTS.md` - do not leave two validation conventions in one file.
- Client calls `Meteor.call(name, args, callback)`. Tests call `await Meteor.callAsync(...)`.
- All writes go through methods. Never add `.allow()` / `.deny()`, `autopublish`, or `insecure`.

## Identity

`Meteor.userId()` and `this.userId` appear nowhere in the repo, and `accounts-base` / `accounts-password` are not installed.
The server cannot identify the caller of any method. This is the root of D3.

The intended fix is binding `this.connection.id` at `players.join` and checking it in `players.submitSequence`.
Installing the accounts packages or gating play behind a login is **not** the fix - anonymous play is a product decision.

## Publications

They live in `server/publications.js`, not `server/main.js`, because plain `meteor test` never loads the server entry point and publications defined there would be untestable.

Invalid arguments resolve to `this.ready()` rather than throwing, matching `rooms.lobby`.
Scope every publication by `gameId`, keep `isCurrent: true` on `rounds`, and keep `attemptedSequence` out of the `players` projection.

## HTTP endpoints

`WebApp.connectHandlers.use('/path', handler)` - see `server/health.js`.
`/health/live` must not touch MongoDB (Docker restarts the container when it fails, and an Atlas blip must not cause a restart loop). `/health/ready` pings Mongo behind a 5 s cache.
Both are publicly reachable through nginx, so their bodies stay fixed and leak no version, host, or connection count.

## Packages

- Atmosphere: `meteor add <pkg>` edits `app/.meteor/packages` and `app/.meteor/versions`. Both are committed - commit them together.
- npm: `docker compose exec backend meteor npm install <pkg>`. Use Meteor's node, inside the container. A host-side `npm install` writes to a directory that the `backend_node_modules` named volume shadows.
- `app/package.json` carries `meteor.mainModule` (client + server), `meteor.testModule` (`tests/main.js`), and `modern: true`. `meteor build` resolves `testModule`, so `tests/` must stay in the Docker build context even for a production build.

## Bundler and dev server

`app/rspack.config.js` registers exactly two rules: postcss for `.css`, and Istanbul instrumentation of `imports/**` outside production (V8 coverage env vars do not reach the Meteor app server process). A new loader belongs there.

`app/entrypoint.sh` starts `meteor --port 3000 --exclude-archs web.browser.legacy,web.cordova`, so the legacy browser bundle is not built in development. `hot-module-replacement` is installed.

## Settings

`Meteor.settings` is read nowhere. `METEOR_SETTINGS` is passed by `docker-compose.prod.yml` and lands unread.
Starting lives (3), initial sequence length (4), PIN length (5), and minimum password length (8) are hardcoded literals.

Adding a configuration surface is a real change: wire it deliberately and document it. Do not sprinkle `Meteor.settings?.x ?? literal` through the code.
