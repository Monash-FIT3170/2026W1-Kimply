# Load test results

Measured capacity of the production stack, newest run last.
Raw output of every run is appended to `logs/ddp-roomLoad-results.log`.

## Summary

100 players in one room, 5 rounds:

|                                    | A: 1 × 0.5 vCPU, polling | B: 2 × 1 vCPU, polling | C: 2 × 1 vCPU, oplog |
| ---------------------------------- | ------------------------ | ---------------------- | -------------------- |
| Answer graded, p50 / p95           | 17.3 s / 18.5 s          | 661 ms / 3.3 s         | **127 ms / 394 ms**  |
| Opening an attempt, p50            | 2.6 s                    | 133 ms                 | 40 ms                |
| Entering the game, p50             | 2.5 s                    | 377 ms                 | 844 ms               |
| Draft pick or skip, p50            | 1.3 s                    | 167 ms                 | 38 ms                |
| Draft choices too late             | 251                      | 0                      | 0                    |
| New round reaching all players     | under 70 ms (one task)   | 2.1 to 2.4 s           | **3 to 19 ms**       |
| Busiest task CPU / service average | 100% / 100%              | 84% / 47%              | 66% / 19%            |
| Wall time for 5 rounds             | 435 s                    | 153 s                  | 95 s                 |

Production runs C's setup from 2026-10-19 (#166).

## How the runs are made

`ddp-roomLoadTest.mjs` puts N players in **one room**, like a class all playing the same game, and plays real rounds:

- each player reads its own sequence from `players.secret`, opens an attempt with `players.startAttempt`, and submits with human-paced offsets (90 to 200 ms between colours), so bot detection stays on and stays quiet;
- players "think" 1.5 to 6 s before answering and 1 to 5 s before picking in a draft;
- 92% of answers are correct;
- from round 2, about half skip the draft and half raise a Shield.

It reports method latency (p50, p95, p99, max) and the **round fan-out**: the gap between the first and the last player seeing a new round.
With one task, the fan-out is a few milliseconds.
With several tasks and no oplog, it grows to as much as `METEOR_POLLING_INTERVAL_MS`, because a task only sees another task's writes on its next poll.

CPU and memory come from CloudWatch (`AWS/ECS`, cluster and service `kimply-prod`, 1-minute maximum and average) for the run's window.

```bash
PLAYERS=100 ROUNDS=5 LABEL="<setup>" node loadtest/ddp-roomLoadTest.mjs wss://www.kimply.online/websocket
```

The older `ddp-gameplayLoadTest.mjs` predates `players.startAttempt` and private sequences, so on the current server every one of its answers is refused; do not compare its numbers with these.

## Runs

| Run | Date (UTC)       | Setup                                    | Database                                | Players | Rounds |
| --- | ---------------- | ---------------------------------------- | --------------------------------------- | ------- | ------ |
| A   | 2026-10-19 11:19 | 1 task, 0.5 vCPU / 1 GB, image `ac88e07` | Atlas M10, no oplog (polling every 3 s) | 100     | 5      |
| B   | 2026-10-19 12:10 | 2 tasks, 1 vCPU / 2 GB, image `ac88e07`  | Atlas M10, no oplog (polling every 3 s) | 100     | 5      |
| C   | 2026-10-19 13:03 | 2 tasks, 1 vCPU / 2 GB, image `ac88e07`  | Atlas M10, oplog (`MONGO_OPLOG_URL`)    | 100     | 5      |
| D   | 2026-10-19 14:07 | 2 tasks, 1 vCPU / 2 GB, image `57765c7`  | Atlas M10, oplog (`MONGO_OPLOG_URL`)    | 100     | 5      |

### A: one 0.5 vCPU task (production as it was)

| Measure                  | p50                             | p95    | p99    | max    |
| ------------------------ | ------------------------------- | ------ | ------ | ------ |
| `rooms.join`             | 328 ms                          | 568 ms | 981 ms | 981 ms |
| `players.join`           | 2.5 s                           | 4.2 s  | 5.6 s  | 5.6 s  |
| `players.startAttempt`   | 2.6 s                           | 3.8 s  | 4.0 s  | 4.6 s  |
| `players.submitSequence` | 17.3 s                          | 18.5 s | 18.8 s | 49.6 s |
| Draft pick or skip       | 1.3 s                           | 3.1 s  | 3.3 s  | 3.7 s  |
| Round fan-out            | 5 to 69 ms across rounds 2 to 6 |        |        |        |

- **CPU: 100%** (1-minute average 87 to 100%) for the whole game, from the moment the players joined.
- **Memory: 32%** at most.
- **No game errors.** All 100 players joined and entered, and the game played 5 rounds.
- **251 draft choices arrived late:** they reached the server after the draft had closed (`draft-closed`). Players on this setup would miss their ability picks.
- **Slow rounds:** each round took about 87 s, mostly waiting on the server.
- **Autoscaling came too late to help.** It added a second task at 11:24:42 UTC, after about 5½ minutes at 100% CPU, and the task took traffic from 11:25:20. That was under a minute before the run ended, and it carried none of the game: a DDP connection stays on the task it joined, so the 100 players never moved. A session's capacity has to be running before people join.

**Reading:** the task is CPU-bound. Every method queues behind a saturated single thread, which is throttled to half a vCPU, so an answer takes 17 s to be graded.
Memory and the database are not the constraint.
The fan-out is tiny only because there is one task.

### B: two 1 vCPU tasks (#166)

| Measure                  | p50                               | p95    | p99    | max    |
| ------------------------ | --------------------------------- | ------ | ------ | ------ |
| `rooms.join`             | 30 ms                             | 109 ms | 127 ms | 127 ms |
| `players.join`           | 377 ms                            | 845 ms | 1.1 s  | 1.1 s  |
| `players.startAttempt`   | 133 ms                            | 784 ms | 845 ms | 869 ms |
| `players.submitSequence` | 661 ms                            | 3.3 s  | 3.5 s  | 13.2 s |
| Draft pick or skip       | 167 ms                            | 936 ms | 1.1 s  | 1.2 s  |
| Round fan-out            | 2.1 to 2.4 s across rounds 2 to 5 |        |        |        |

- **CPU:** 80–84% at the busiest task's peak, while the service average was 46–47%. The two tasks did not share the work evenly.
- **Memory:** 15% at most.
- **No errors:** no late draft choices and no server exceptions. Autoscaling did not need to add a task (its target is a 60% average).
- **Fast rounds:** the 5 rounds took 153 s in all, against 435 s for A.

**Reading:** compared with A, the typical answer is graded 26 times faster (661 ms against 17.3 s), and every draft choice now lands in time.
The cost is the cross-task fan-out: players on the other task see a new round 2.1 to 2.4 s later, which is the 3 s poll between tasks.
The answer tail (p95 3.3 s, one at 13 s) and the busiest task at 84% CPU show the headroom is real but not large.

### C: two 1 vCPU tasks following the oplog (#166)

| Measure                  | p50                             | p95    | p99    | max    |
| ------------------------ | ------------------------------- | ------ | ------ | ------ |
| `rooms.join`             | 47 ms                           | 150 ms | 258 ms | 258 ms |
| `players.join`           | 844 ms                          | 1.1 s  | 1.3 s  | 1.3 s  |
| `players.startAttempt`   | 40 ms                           | 136 ms | 256 ms | 421 ms |
| `players.submitSequence` | 127 ms                          | 394 ms | 583 ms | 793 ms |
| Draft pick or skip       | 38 ms                           | 121 ms | 134 ms | 146 ms |
| Round fan-out            | 3 to 19 ms across rounds 2 to 6 |        |        |        |

- **CPU:** 66% at the busiest task's peak, against a service average of 19%.
- **Memory:** 10% at most.
- **Errors:** none in the game and none in the server log.
- **Wall time:** the 5 rounds took 95 s.

**Reading:** with each task following the oplog, a write on one task reaches the other's players in milliseconds, so the cross-task lag of B is gone.
It also took load off the CPU, because the tasks stopped re-running every live query every 3 s: the busiest task fell from 84% to 66%, the service average from 47% to 19%, and the worst answer from 13.2 s to 793 ms.
Entering the game is the one measure that rose, from 377 to 844 ms at p50, still well under a second. All 100 players enter at the same instant, so it is the most bunched call; why it rose was not investigated.

### D: C's setup on the next release (`57765c7`)

A repeat of C after `main` moved on, to confirm the session setup holds on the code being presented.

| Measure                  | p50                             | p95    | p99    | max    |
| ------------------------ | ------------------------------- | ------ | ------ | ------ |
| `rooms.join`             | 52 ms                           | 134 ms | 184 ms | 184 ms |
| `players.join`           | 784 ms                          | 1.2 s  | 1.3 s  | 1.3 s  |
| `players.startAttempt`   | 44 ms                           | 122 ms | 159 ms | 207 ms |
| `players.submitSequence` | 114 ms                          | 253 ms | 382 ms | 868 ms |
| Draft pick or skip       | 44 ms                           | 123 ms | 133 ms | 153 ms |
| Round fan-out            | 2 to 10 ms across rounds 2 to 6 |        |        |        |

- **CPU:** 30% at the busiest task's peak, against a service average of 23%.
- **Memory:** 12% at most.
- **Errors:** none in the game and none in the server log.
- **Wall time:** the 5 rounds took 97 s.

**Reading:** the same as C, within noise, so the release changed nothing that matters here.
CPU was lower than in C (30% against 66% at peak). C's whole run fell in one 1-minute sample, entry burst included, while D's spread over two, which probably explains most of the gap; the two are not a precise comparison.
