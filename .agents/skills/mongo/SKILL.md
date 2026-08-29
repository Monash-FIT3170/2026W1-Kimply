---
name: mongo
description: >-
  Change Kimply's MongoDB data layer safely - document shapes, indexes, TTL,
  and the concurrency traps in the game loop. Use when adding a field, writing
  a query, adding or changing an index, touching server/indexes.js, or
  reasoning about races and Atlas capacity.
---

# MongoDB

MongoDB 7.0. Locally a container; deployed, a MongoDB Atlas **M0 free cluster per environment** with a 512 MB ceiling.

The authoritative collection and document tables are in `AGENTS.md`. Read them instead of re-deriving shapes from the code.

## Writing

Server calls are async only (see the `meteor` skill). Two rules beyond that:

- **Mutate relative values with operators, never with a value you read first.**
  `{ $inc: { lives: -1 } }`, not `{ $set: { lives: player.lives - 1 } }`. The `$set` form loses a concurrent deduction and is half of D4.
- **Make the transition itself the filter when a write must happen once.**
  `updateAsync({ _id, advanced: false }, { $set: { advanced: true } })` and then acting on `matchedCount` is what makes round advance and winner selection idempotent under two concurrent callers. A `findOne` then `update` is not.

`gameId` is the 5-character room PIN, not an ObjectId. It is the scoping key for every publication and nearly every query.

## Indexes

All indexes are declared in one place, `app/server/indexes.js`, and created by `ensureIndexes()` from `Meteor.startup`.
`createIndex` is idempotent, so it runs on every boot. A failure is logged and does **not** take the server down, because a unique index cannot build against a local database that already holds duplicates.

Adding an index is three edits in one change:

1. The `INDEXES` array in `server/indexes.js`, with a comment naming the query it serves and an explicit `name`.
2. The index table in `AGENTS.md`.
3. An entry in `docs/decision-log.md`.

Every index in that array exists for a query on the hot path - `players.submitSequence` alone performs 6-9 round trips per submission. If you add a query that runs per submission or per publication, check whether it is covered before adding another round trip.

Two indexes are load-bearing beyond performance:

- `rooms { pin: 1 } unique` closes the check-then-insert PIN collision race at the database layer. `rooms.create` still retries 10 times, but the index is what makes the guarantee.
- `playerAccounts { email: 1 } unique` is what makes the duplicate-email check in `register` real.

## TTL, and why data is allowed to expire

| Collection | TTL | Why |
|---|---|---|
| `rooms` | 24 h | Replaced the destructive startup wipe that used to delete live games on every restart (D1) |
| `rounds` | 24 h | Same |
| `leaderboard` | 7 days | Append-only, nothing deletes from it; without a TTL it grows without bound against 512 MB |

`players` and `playerAccounts` have **no** TTL. `playerAccounts` grows forever, so treat any field you add there as permanent.

MongoDB's TTL monitor runs about once a minute, so expired documents linger briefly. Do not write logic that assumes a document is gone the second it expires.

## Schema changes

There is no migration framework and no schema validation. Documents written before your change stay exactly as they were.

- A new field must have a defined meaning when absent. Read it as `doc.newField ?? default`.
- Renaming a field breaks every document already in the deployed databases. `rooms` and `rounds` self-heal within 24 h via TTL; `players`, `leaderboard`, and `playerAccounts` do not.
- Update the document shape in `AGENTS.md` in the same change.

`gamesPlayed`, `wins`, and `bestRound` on `playerAccounts` are written once at 0 and never updated by any code. They are placeholders, not live stats - do not display them as if they were.

## Looking at the data

```bash
docker compose exec mongodb mongosh kimply --eval 'db.rooms.find().limit(5)'
docker compose exec mongodb mongosh kimply --eval 'db.rounds.getIndexes()'
docker compose exec mongodb mongosh kimply --eval 'db.dropDatabase()'   # local reset
node scripts/check-mongo.mjs [path-to-env-file]                          # connectivity, never prints the URL
```

The test container uses a separate database (`kimply-test`), so dropping `kimply` does not disturb a test run.

`scripts/check-mongo.mjs` is the only safe way to verify a deployed connection string in a shared session: it reports host, database, and read/write ability without ever echoing credentials.
