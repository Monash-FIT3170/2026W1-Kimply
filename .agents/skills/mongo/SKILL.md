---
name: mongo
description: >-
  Change the MongoDB data layer safely: queries, indexes, TTL, and
  concurrency. Use when adding a field, writing a query, adding or changing
  an index, touching server/indexes.js, or reasoning about races and Atlas
  capacity.
---

# MongoDB

MongoDB 7.0. Locally a container; deployed, Atlas M0 (512 MB) per environment.

Collection names, document shapes, and the index table are in `AGENTS.md`. Read those instead of re-deriving them from the code.

## Writing

Server calls are async only (see the `meteor` skill).

- Mutate relative values with operators, not with a number you just read: `{ $inc: { n: -1 } }`, not `{ $set: { n: doc.n - 1 } }`.
- When a write must happen once, make the transition the filter: `updateAsync({ _id, flag: false }, { $set: { flag: true } })` and then look at `matchedCount`. A `findOne` then `update` is not idempotent under two callers.

## Indexes

Declared in `app/server/indexes.js`, created from `Meteor.startup`. `createIndex` is idempotent. A failure is logged and does not take the server down (a unique index cannot build against existing duplicates).

Adding an index is three edits in one change: the `INDEXES` array (named, with a comment for the query it serves), the table in `AGENTS.md`, and a `docs/decision-log.md` entry.

The TTL monitor runs about once a minute. Do not assume a document vanishes the second it expires. Which collections expire, and why, is in `AGENTS.md`.

## Schema

There is no migration framework and no schema validation. Documents written before your change stay as they were.

- A new field must have a meaning when absent: `doc.newField ?? default`.
- Renaming a field breaks every document already in deployed databases. TTL collections self-heal; the others do not.
- Update the document shape in `AGENTS.md` in the same change.

## Looking at the data

```bash
docker compose exec mongodb mongosh kimply --eval 'db.rooms.find().limit(5)'
docker compose exec mongodb mongosh kimply --eval 'db.rounds.getIndexes()'
docker compose exec mongodb mongosh kimply --eval 'db.dropDatabase()'   # local reset
node scripts/check-mongo.mjs [path-to-env-file]                          # connectivity, never prints the URL
```

The test container uses `kimply-test`, so dropping `kimply` does not disturb a test run.
