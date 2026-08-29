---
name: meteor
description: >-
  Meteor 3.4 conventions for this repo: async collections, method and
  publication registration, double-eval guards, packages, and the bundler.
  Use when writing or debugging methods, publications, collections, DDP,
  meteor add / meteor npm install, or anything under app/server and
  app/imports/api.
---

# Meteor 3.4

Release is pinned in `app/.meteor/release`. The bundler is Rspack (`app/rspack.config.js`), not the classic Meteor bundler. Meteor 3 removed Fibers: every server-side database call is async.

Inventory of what is registered lives in `AGENTS.md`. This skill is how to add or change things without breaking the test runner.

## Async

| Where | API |
|---|---|
| Server, one document | `findOneAsync`, `insertAsync`, `updateAsync`, `removeAsync`, `countAsync` |
| Server, many documents | `find(...)` returns a cursor; `await cursor.fetchAsync()` to read it |
| Inside `Meteor.publish` | return the `find(...)` cursor — do not await it, do not fetch it |
| Client (minimongo) | `find()` / `findOne()` stay synchronous (`useTracker`) |

A sync server-side Mongo call fails at runtime, not at build.

## Registration guards

`meteor test --full-app` evaluates the app bundle and the test bundle in one process. Meteor throws on a duplicate publication name or a second `new Mongo.Collection('same')`.

Collections use `global._<Name>Collection`. Methods, publications, and HTTP handlers use `global._<x>Initialized`. Add the same guard when you add a new one.

CI runs `meteor test --once --full-app`; local `npm test` often does not. A guard you delete can pass locally and fail in CI.

Methods are registered behind `if (Meteor.isServer && !global._<x>Initialized)`, so the client has **no stub**. There is no latency compensation. Do not write optimistic UI that expects a stub.

## Methods and publications

- All writes go through methods. Do not add `.allow()` / `.deny()`, `autopublish`, or `insecure`.
- Throw `new Meteor.Error('code', 'message')`. `check` is available but unused; do not introduce it in one method and leave the rest of the file validating by hand.
- Client: `Meteor.call(name, args, callback)`. Tests: `await Meteor.callAsync(...)`.
- Publications live in `server/publications.js`, not `server/main.js`, so specs can import them. Plain `meteor test` never loads the server entry point.
- Invalid publication args resolve to `this.ready()`, not a throw. What each publication is allowed to send is in `AGENTS.md`.

## HTTP, packages, bundler

`WebApp.connectHandlers.use('/path', handler)` is how HTTP endpoints are attached (see `server/health.js`). Keep health bodies small; they are public.

- Atmosphere: `meteor add <pkg>` edits `app/.meteor/packages` and `app/.meteor/versions`. Commit them together.
- npm: `docker compose exec backend meteor npm install <pkg>`. A host-side `npm install` writes to a directory the `backend_node_modules` volume shadows.
- `app/package.json` carries `meteor.mainModule`, `meteor.testModule` (`tests/main.js`), and `modern: true`. Keep `tests/` in the Docker build context even for a production build.

`Meteor.settings` is unread today. Adding a configuration surface is a real change — wire it and document it; do not sprinkle `Meteor.settings?.x ?? literal` through the code.
