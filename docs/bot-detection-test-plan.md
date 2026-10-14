# Bot detection: what is left to test

**Verification update 2026-10-12:** [Executed results and remaining failures](bot-detection-test-results.md).
D44 and D45 prevent sign-off; the server suites and formatting check pass.

For the next session. The branch is `142-bot-detector`. The worktree is `.claude/worktrees/142-bot-detection`. The main checkout is on another branch and is serving port 3000. Do not edit it, and do not start a second compose project on ports 3000 or 27017.

Issue: #142. Detection is built on the round-abilities player (`players.secret.sequence`, drafts, `players.rebind`). Pull request #141 is the abilities review. This branch contains that work too, because detection cannot run on `origin/dev` without it.

## Already run on 2026-10-12

From this worktree, against an isolated Mongo on the `kimply142` compose network:

- `meteor npm test` — 200 passing
- `meteor test --once --full-app --driver-package meteortesting:mocha` — 200 passing
- A raw DDP host plus `app/tests/manual/ddpBot.mjs` on port 3142. The host's slow wrong attempt was graded. The bot's first two fast attempts were graded wrong. The third was rejected with `removed-automation`.

Meteor's mocha driver did not run the client tests. Nothing in a browser has been confirmed past the play page rendering. A spoofed `X-Forwarded-For` header has not been checked through Nginx or the ALB.

## How to start this worktree

The app image already used for the tests is `2026w1-kimply-test`. Mongo for this branch is the `kimply142` project, published on host port 27099. If `kimply142-app` is still running, it is the Meteor process on http://localhost:3142 and the DDP socket is `ws://localhost:3142/websocket`.

If it is not running, start Mongo with a compose override that publishes `27099:27017`, then run Meteor from `2026w1-kimply-test` with the worktree's `app/` mounted, separate volumes for `node_modules` and `.meteor/local`, and:

- `MONGO_URL=mongodb://mongodb:27017/kimply142`
- `ROOT_URL=http://localhost:3142`
- `PORT=3000` inside the container, published as `3142:3000`
- `HTTP_FORWARDED_COUNT=0`
- `BOT_DETECTION_ENABLED` unset or `true`

`meteor test` runs with `Meteor.isDevelopment` true, so `BOT_DETECTION_ENABLED=false` turns detection off and the new tests fail for that reason. Do not set it on the test service.

`ws` is a devDependency. `node app/tests/manual/ddpBot.mjs` needs it installed in this worktree, or run the script in a container that mounts the `kimply142` `node_modules` volume.

## Browser session to run

Use two browsers, or one browser and one private window. Detection is on.

1. Create a room as a person. Join as a second person. Start the game. Both should get a browser session in `localStorage['kimply.browser']` without signing in.
2. Play round 1 with the mouse, then the next attempt with the keyboard. A normal pace must be graded. Undo, clear, and replay must not leave the next submit as `stale-attempt` or `duplicate-attempt`.
3. From round 2, with abilities on, trying to play while the draft is open must not submit. After a pick or skip, a normal attempt must still grade.
4. In a second terminal, while the room is still a lobby, run:

   ```bash
   node app/tests/manual/ddpBot.mjs --url ws://localhost:3142/websocket --pin <PIN> --name Bot
   ```

   The host starts after the bot has joined. Expect the bot's third attempt to log `removed-automation`. The bot must not gain a leaderboard result for that attempt, and the remaining people must be able to finish or win without waiting out the disconnect grace.
5. The bot has no browser, so the removal screen has to be checked with a person who has been removed, or by pointing a real browser tab at a client that submits three fast attempts. The removed player should see `RemovedScreen`, not the live board. "Back to play" leaves the room.
6. That same browser, with the same `kimply.browser` value, cannot rejoin the room. The message is that the browser is blocked for the life of the room.
7. A new browser profile on the same machine (same address, empty `kimply.browser`) cannot join that room for 15 minutes. The join or reconnect error names the network and the expiry time. Creating or joining a different room still works. Joining from another network works as soon as the room is a lobby again.
8. Two people already playing from one shared address: remove only one. The other stays in the round and can submit. Disconnect that second person and they must not be able to rebind or reconnect until the ban's `expiresAt`.
9. Refresh mid-round on an unbanned player. `players.rebind` should keep the same player document. A second player with fresh lives is the old D7 bug, not this change.
10. Local only: `node app/tests/manual/ddpBot.mjs --xff 198.51.100.20 ...` with `HTTP_FORWARDED_COUNT=0`. The ban, if the bot is removed, must store the socket address, not `198.51.100.20`. The count-1 case behind Nginx or the ALB is not set up locally. Do not treat it as done unless a proxy that appends the peer is actually in front of Meteor.

## If you change code

Re-run `meteor npm test` and `meteor test --once --full-app` from this worktree, not from the main checkout. Format only the files you touched. `npm run format:check` already fails on the repo (D14).

Do not apply the Terraform ALB change. Do not deploy.
