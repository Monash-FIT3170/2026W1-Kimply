# Decision log

Every substantive change to Kimply, newest first.
One entry per change: what changed, which files, and any consequence that is not obvious from the diff.

This was the "Feature Log" section of `AGENTS.md` until 2026-08-29.
It moved out so that `AGENTS.md` stays a description of how the system is *now*, while the record of how it got that way can grow here without pushing the inventory tables further down a file every agent reads in full.

`AGENTS.md` remains the source of truth for the current state: collections, publications, methods, routes, tests, defects.
This file is the source of truth for **why** any of that is the way it is.

## Adding an entry

- Newest entry goes directly below this section, above the previous one.
- Heading is `## YYYY-MM-DD - <what changed>`.
- Record the consequence that is not obvious from the diff. If reading the diff would tell you, leave it out.
- Name the files that moved.
- Write it in the same change that alters the behaviour, not afterwards.
- Never rewrite an older entry. If it turned out to be wrong, say so in the new one.

---

## 2026-10-18 - Room code letters no longer duplicate on Android keyboards with predictive text

The join page captured the code in a hidden `<input>` that it emptied after every keystroke, adding each input event's text to the code. A keyboard with predictive text keeps the word it is composing in its own buffer and re-sends it as the user types, so after the field was emptied behind its back the next event carried letters already typed, and they were added twice. It affected only players whose keyboard composes (Gboard with suggestions on); a keyboard that commits one character at a time never showed it. Suggestions off made it stop, which is how it was narrowed down.

The hidden input now holds the whole code and is never cleared; the code is `normalizeRoomCode(input.value)` on every input event, so nothing is ever added up. While the keyboard is composing (`compositionstart` to `compositionend`) the field is not written to, since that also makes it resend, and it is tidied (case, stray spaces, extra characters) when composing ends (`roomCodeInputWriteBack`). Backspace is now the input's own; the old handler waited for `event.key === 'Backspace'`, which Android keyboards report as `Unidentified`, so deleting a letter probably did not work there either.

- **Not tested on a device:** there is no Android device or browser here. `uiHelpers.test.js` covers the helpers and the shape of what a composing keyboard sends, not the page.
- **Removed:** `appendRoomCodeInput` and `clearCapturedInput`, the approach that caused it, and their tests. `removeOnBackspace` and `combineKeyHandlers` in `keyboard.js` are no longer used by the app; they were left in place.

Files: `ui/pages/JoinRoom.jsx`, `ui/roomCode.js`, `tests/uiHelpers.test.js`.

## 2026-10-18 - The sequence no longer replays after a refresh

A player who refreshed after the sequence had finished saw it play again. The tab remembers watched sequences in `sessionStorage`, but `ColourSequence` honoured that only on its first effect run, while `GamePage` bumped `replayKey` afterwards. When the board mounted with the sequence already present, which depends on whether `rounds` or `players.secret` arrives first, the first run was spent on the skip and the bump then played the whole pattern. A reconnect re-publishing `players.secret` did the same without a refresh.

The decision is now made on every run, in `playbackDecision` (`ui/sequencePlayback.js`): a changed `replayKey` is a request to play (Replay, a wrong answer, a new round or version) and always plays; any other run, such as the sequence turning up or being re-published, skips if the sequence was already watched. `GamePage` no longer bumps `replayKey` for a watched sequence. The watched-sequence helpers moved out of `GamePage.jsx` into the same file so they can be tested.

- **Not browser-tested:** the repo has no DOM test tooling, so `sequencePlayback.test.js` covers the decision and the storage helpers, not the component. The ordering race itself was found by reading the code.
- **Unchanged:** a refresh *during* the pattern still replays it, since a sequence is marked watched only once playback completes.

Files: `ui/ColourSequence.jsx`, `ui/pages/GamePage.jsx`, `ui/sequencePlayback.js`, `tests/sequencePlayback.test.js`.

## 2026-10-18 - A player who disconnects before the deadline is removed again, not eliminated

After the round deadline moved to the server, a phone that locked shortly before the deadline stopped being kicked out. `expireRound` eliminated it first, and the disconnect cleanup in `gameMethods.js` only removes players with `eliminated: false`, so the player stayed in the game as a spectator for good. Before the deadline existed, the same player waited out the 15 s grace and was removed. Reproduced live: socket closed at 45 s into a round, player still present with `eliminated: true, connected: false` at 85 s.

`expireRound` now removes a straggler whose `connected` is `false` instead of eliminating it, through the new `removePlayerFromGame` in `gameEngine.js`, which the disconnect cleanup also uses so the two cannot drift apart. A straggler who is still connected is eliminated as before and stays on the leaderboard.

- **Frozen but still connected:** a phone that freezes without closing its socket still looks connected to the server at the deadline, so it is eliminated, not removed. Removing every eliminated player who later disconnects would erase ordinary spectators from the end leaderboard and the global results, so the cleanup still skips them.
- **Bot removal is unchanged:** three machine-speed attempts still end in `removed-automation` and a deleted player, checked against the dev server after the deadline work.

Files: `api/gameEngine.js`, `api/gameMethods.js`, `tests/roundDeadline.test.js`.

## 2026-10-18 - Server-owned round deadline (D5, #107)

A player stuck on the loading screen after round 1, or everyone else stuck on "Time left: 0s", came from the round timer living only in each browser. A phone that left the browser before 0 and returned after it was never eliminated, and the server accepted its late correct answer. The likely cause of the missed elimination is the timeout call racing `players.rebind` and being refused with `not-yours`; that is read from the code, not reproduced on a phone.

Rounds now carry `deadlineAt`, and the server enforces it: `expireRound` (`gameEngine.js`) eliminates every player who has not cleared the round, drops lobby members who never joined, then declares a winner or advances. It runs from a timer, from `sweepRoundDeadlines` every 5 s (started in `server/main.js`; a restart loses the timers), and from the new `rounds.expire`, which any client calls when its countdown hits 0. The check lives in the server, so a client can only ask, never decide.

- **Round 1 clock:** starts when the last lobby member's `players.join` lands, or 5 s after `rounds.generate`, whichever is first. Both go through one conditional update on `deadlineAt: null`, so it starts once.
- **Draft rounds:** the clock starts in the same write that sets `draft.resolved`, so a client never sees the round open without a deadline.
- **Grace:** answers are accepted `ROUND_EXPIRE_GRACE_MS` (2 s) after `deadlineAt`, and `expireRound` waits the same time, so the two cannot disagree. Past it, `startAttempt`, `submitSequence` and `playCard` throw `round-expired`. `applySubmission` also refuses an already-eliminated player.
- **Lease, not a flag:** `expireRound` holds `expiringUntil` for 10 s while it works and writes `expiredAt` last. `resolveRoundDraft` claims with a permanent `resolving` flag, so one error leaves a draft unresolvable forever; this does not copy that.
- **Client:** `GamePage.jsx` counts down to `round.deadlineAt` on the server's clock (`ui/serverClock.js`, `time.now`) instead of starting its own 50 s timer, and no tile is live once it reaches zero, however input was re-enabled. `players.timeoutRound` still exists but the client no longer calls it.
- **Not covered:** Battle Royale has no timer. A round created before this deploy has no `deadlineAt` and keeps no clock; rounds expire after 24 h, so only a game in flight during the deploy is affected.

Files: `constants.js`, `api/gameEngine.js`, `api/gameMethods.js`, `api/abilityEngine.js`, `server/main.js`, `server/indexes.js`, `ui/pages/GamePage.jsx`, `ui/serverClock.js`, `tests/roundDeadline.test.js`.

## 2026-10-15 - Patch 2.0: Lights Out nerf, replay streak, longer round, invite link for everyone

Lights Out kept the board fading on a 2.6 s loop for the whole round, playback and input alike, and playtesters called it broken (#154).
It now hides `floor(n / 3)` of the target's `n` flashes and nothing else: a 4-colour sequence loses one flash, a 6-colour sequence two.
`lightsOutFlashes` in `abilityRules.js` picks them, never the first, so the player always sees where the sequence starts.
`ColourSequence` draws a new pick for every playback, so a replay recovers what the first watch lost, and it reads the effect during playback, so one that reaches the client a beat late still applies.
The board fades to dark within the gap before a hidden flash and back within the gap after it, over the shorter of that gap and `LIGHTS_OUT_FADE_MS` (150 ms), so a hidden flash is covered from its first frame. The `lightsOut` keyframes and `LIGHTS_OUT_CYCLE_MS` are gone.
`REPLAY_BONUS_STREAK` is 2, so a replay is earned every second correct round in a row rather than every one.
`ROUND_TIMER_SECONDS` is 50, up from 45; only the client counts it down, and `players.timeoutRound` still decides elimination.
Joined players get the host's invite link and Copy button in the lobby.
Lobby player tiles now start at 15rem instead of 12rem: the READY chip left a 12rem tile about 45px for the name, so even "GuestT" truncated to "Gue...".
Files: `app/imports/constants.js`, `app/imports/api/abilityRules.js`, `app/imports/ui/ColourSequence.jsx`, `app/imports/ui/styles.css`, `app/imports/ui/pages/PlayerLobby.jsx`, `app/tests/abilityRules.test.js`, `docs/design_system.md`, `AGENTS.md`.

---

## 2026-10-14 - Bot detection merged with reconnect credentials

Bot detection (#142) and reconnect ownership (#150) were built in parallel, and both changed `players.join` and `players.rebind`.
The merge keeps both checks rather than choosing one: a rebind must come from the browser session that owns the player, from an address the room has not banned, and with the per-tab reconnect credential.
The bot guard's fields (`guard.browserSessionId`, `boundAt`, `botStrikes`) are written by `rebindPlayer` in the same credential-guarded update, so a refused credential never moves the guard.
`players` and `eliminations` exclude both `guard` and `reconnectTokenHash`.
A banned or removed player who resumes a saved game after a refresh now sees the removal screen, as on a DDP reconnect, instead of a generic reconnect error.

The bot branch had recorded its defect as D22, which `dev` had already given to the Battle Royale leaderboard.
It is D43 now: D26 to D42 are the ECS architecture decisions in [ecs-target-architecture.md](ecs-target-architecture.md), so D43 is the first ID neither list uses.
Anything citing "D22" for machine-speed play means D43.

---

## 2026-10-13 - Reconnect ownership and ability-dialog keyboard focus

PR #141 review reproduced a guest rebinding the host's public player ID, receiving the host's private sequence and picking the host's card (D24).
The game now supplies a random per-tab credential to `players.join` and `players.rebind`, with only its SHA-256 hash stored on the server and excluded from publications.
Both rebinding paths verify that credential.
A first client join checks lobby connection ownership and round membership; omitting the lobby ID derives only the caller's own membership.
Anonymous play is preserved.
Session storage survives refresh; an in-memory fallback still handles network reconnects when storage is blocked.
Legacy players without a hash can enroll only on the original owning connection; a legacy session that already lost that connection must join a new game.
The gameplay load harness supplies the new credential while retaining the string player-ID return value.

Three Tab presses in the held-card dialog reached the obscured Feed button (D25).
The shared ability shell now uses a native modal `dialog`, which makes the background inert and contains keyboard focus.
The draft and hand keep their existing Escape behavior, and focus returns to the opener on close when it remains mounted.

Validation: the original ownership regressions failed before the fix, and all 204 server tests passed in full-app mode afterward.
Two real DDP connections verified rejected takeover attempts and a valid reconnect surviving the disconnect grace period.
Browser checks verified anonymous entry, refresh preserving the player, modal focus cycling, Escape restoration, and a 375px layout.

Files: `app/imports/api/gameMethods.js`, `app/server/publications.js`, `app/imports/ui/gameReconnect.js`, `app/imports/ui/pages/GamePage.jsx`, `app/imports/ui/abilities/AbilityDialog.jsx`, `app/tests/playerReconnect.test.js`, `loadtest/ddp-gameplayLoadTest.mjs`, `AGENTS.md`, `docs/defect-register.md`, `docs/design_system.md`.

---

## 2026-10-13 - Ability guide in the lobby

Players were reading cards for the first time inside a 20-second draft (#148).
Both lobby views now carry a `SEE THE CARDS` button, shown while abilities are on, that opens every card the room can deal, grouped into before-the-round and during-the-round cards, with one line on how the draft deals.
The list comes from `eligibleAbilities` with the room's mode and starting lives, the same call the server deals from, so Jump appears only in Battle Royale and Steal disappears whenever players start on 1 life (Hard and Battle Royale), with a line saying why.
The draft-order note names only the cards that are dealt, so a 1-life room does not promise Steals first.
`AbilityCard` renders a read-only `div` when it has no `onClick`, so the guide reuses the draft's card instead of a copy.
The joined view's button draws a 36px pill inside its 44px hit target to sit level with the mode and abilities chips.
In the same lobby, a player row truncated a short name like "Guest" to "Gue..." to keep the "· you" suffix; the suffix now gives way first, since the tinted row already marks you.
Files: `app/imports/ui/abilities/LobbyAbilities.jsx`, `app/imports/ui/abilities/abilityFeed.js`, `app/imports/ui/abilities/AbilityDialog.jsx`, `app/imports/ui/pages/PlayerLobby.jsx`, `app/tests/abilityFeed.test.js`, `docs/design_system.md`, `AGENTS.md`.

---

## 2026-10-13 - ECS deploys wait out the canary alarm bake

Every `dev` deploy since 2026-10-06 failed in **Deploy to ECS** with `rollout still IN_PROGRESS after 1800s`, although each release went live and ECS later marked it `COMPLETED` (#146).
With alarm-based rollback (D31 in [ecs-target-architecture.md](ecs-target-architecture.md)), ECS keeps a rolling deployment `IN_PROGRESS` until it has watched the canary alarm for its period x evaluation periods after the new tasks are healthy.
The canary runs every 15 minutes and the alarm needs 2 periods, so that is 30 minutes, and the seven rollouts measured completed 32m15s to 32m35s after their task started, today's 2m48s after the script gave up.
`ROLLOUT_TIMEOUT` in `deploy/ecs-deploy.sh` was 1800 from `update-service`, so the script could never see the outcome. It is now 2700.
The ceiling is the GitHub OIDC session: both `*-github-deploy` roles allow 1 hour, and the readiness probe and failure diagnostics still have to run after the wait.
A green deploy job therefore now takes about 35 minutes. That is the price of the bake: returning before `COMPLETED` would report success for a release the alarm can still roll back.
Changing `canary_rate_minutes` moves the bake with it. The canary alarm in `infra/terraform/modules/kimply-ecs/monitoring.tf` now says so.

---

## 2026-10-12 - Chrome automation remains below the timing detector threshold

Ran three real point-and-click attempts in a fresh Chrome Incognito session with detection enabled.
The Chrome agent retained five of eight fixture lives, accumulated zero bot strikes, and stayed connected.
A machine-speed DDP control against the same app was removed on its third attempt.
Recorded the comparison and screenshot in `docs/bot-detection-test-results.md` and `docs/test-evidence/bot-detection/chrome-agent-gameplay.png`.
This verifies a limitation of the chosen heuristic, not coverage of the Claude Chrome extension itself.

## 2026-10-12 - Bot-detection verification finds IP-ban and CSS blockers

Executed the worktree's test plan with isolated MongoDB, real DDP clients, a local Nginx proxy, and browser interaction.
Both Meteor server test modes pass 200 tests and the worktree's formatting check passes.
A spoofed forwarding header makes removal omit the IP ban; a fresh browser session can then evade it (D44).
The local production simulation returns HTTP 500 for its main CSS chunk and renders unstyled (D45).
Recorded evidence and explicit coverage limits in `docs/bot-detection-test-results.md`, linked it from the test plan, and synchronized the defect register and AGENTS.md.
No application or deployment source was changed, and no deployment was performed.

---

## 2026-10-12 - Bot detection blocks a browser session and a room's address

Three consecutive machine-speed attempts remove that player before the attempt is graded (#142).
The browser session is blocked for the life of the room, and the connection's address is banned from that room for 15 minutes. Both are stored on `rooms.security`, so they disappear with the room's existing 24-hour TTL and are never published.

Things that are not obvious from the diff:

- **A shared address does not drop the other people already in the room.** Their current connection keeps playing. Joining, reconnecting, or rebinding from that address is refused until the ban's `expiresAt`, including a brand-new browser session.
- **A missing address stores a session block and no placeholder ban.** One connection without `clientAddress` cannot lock every other anonymous player out of the room.
- **`HTTP_FORWARDED_COUNT` is 1 behind Nginx and the ALB, and 0 on the local direct connection.** Meteor's own proxy handling picks the address. A spoofed `X-Forwarded-For` prefix is not what `connection.clientAddress` returns.
- **`BOT_DETECTION_ENABLED=false` works only in development.** In production the flag is logged once and ignored, so a deployed environment cannot turn detection off by setting it.
- **Detection is built on the ability-system player.** The sequence being graded is `players.secret.sequence`, and an attempt cannot start while that round's draft is still open.

---

## 2026-10-12 - Slo-Mo, 2x Speed and Lights Out abilities; round-6 Slow Motion removed

Three hostile pre-round cards change how another player's sequence plays back: Slo-Mo (half speed), 2x Speed (double speed, floored at `MIN_FLASH_MS` / `MIN_GAP_MS` so a fast room stays watchable) and Lights Out (the board fades to dark and back all round).
They are picked in the draft like Strike, so they land before the target's first watch and last for every replay that round. Shield blocks them.
The effect lives in `players.secret.playback`, keyed by `roundId` like `shieldRoundId`, so nothing has to clear it: a new round or level makes it stale.
A target takes one speed change and one Lights Out per round. The guard is in the update filter, not a read-then-write, so racing Battle Royale picks can not both land.
In a standard draft playback cards resolve after Steals and Strikes, so one aimed at a player struck out in the same draft misses.
In Battle Royale a pick resolves immediately but the target's current level is already playing, so it is stored with `roundId: null` and `moveToLevel` binds it to their next level in the same write that moves them.
`ColourSequence` reads its timing on every flash, because the effect reaches the client on `players.secret` and can arrive a beat after `rounds.draft.resolved` opens playback.
Lights Out's period (2600ms) is deliberately not a multiple of any flash and gap, so a replay loses different flashes to the dark and replays stay worth using.

The hidden round-6 Slow Motion powerup (`slowMotionActive`, set for everyone by `rounds.advance` and shown as a raw blue popup) is gone, so "slow" only ever means someone played Slo-Mo on you.

Files: `app/imports/api/abilityRules.js`, `abilityEngine.js`, `gameEngine.js`, `gameMethods.js`, `app/imports/constants.js`, `app/imports/ui/ColourSequence.jsx`, `pages/GamePage.jsx`, `abilities/abilityFeed.js`, `styles.css`, and their tests. `docs/design_system.md` v0.5 adds the `lightsOut` animation and the playback effect chip.

## 2026-10-12 - Local Docker hot reload exposes Rspack's development port

`docker-compose.yml` now publishes backend port 8080 alongside Meteor's app port 3000 (D23).
Rspack was already listening on all container interfaces at port 8080, but the browser's separate hot reload WebSocket could not reach it through Docker.
Reproduced during browser playtesting: the game loaded while the browser logged repeated WebSocket connection failures, and a host request to port 8080 failed.
The mapping requires backend recreation rather than a container restart; it does not change production networking.
`docs/dev-environment.md` records the local ports and verification procedure, and `AGENTS.md` and `docs/defect-register.md` record the resolved defect.

## 2026-10-12 - Battle Royale leaderboard follows each player's level

The live leaderboard in `app/imports/ui/leaderboardModels.js` now derives each active Battle Royale player's displayed level from their own `currentLevel`.
The shared initial round remains current while those players advance independently, so using its `roundNumber` left every active row at level 1 (D22).
The internal sequence length 4 maps to displayed level 1; `eliminatedRound` already stores a displayed level and must not be converted again.
Standard modes retain the shared round's level, including Easy mode.

Reproduced in a browser with three real DDP bot players advancing while the browser player remained on the initial level.
`app/tests/leaderboardModel.test.js` adds regressions for independent levels, recorded elimination levels, and standard players with stale `currentLevel`.
The independent-level regression failed against the original model and passed after the fix.
`AGENTS.md` and `docs/defect-register.md` record the coverage and resolved defect.

## 2026-10-11 - Host lobby: only the player list scrolls

The host lobby in `app/imports/ui/pages/PlayerLobby.jsx` now keeps the room panel and the Start button at full size and scrolls only the player list (#143).
The panel is also more compact: the game mode badge and the abilities switch share a row, the room code tiles are smaller, and the game name and invite link are single rows on phones.

Things that are not obvious from the diff:

- **Centring uses auto margins, not `justify-center`.** In a scrolling flex column, `justify-center` pushes overflow above the top edge where it cannot be scrolled to. That is what squashed the panel and hid the invite link once a few players joined.
- **The player section has an explicit minimum (heading plus one row).** Its automatic minimum would be the whole list, so the list would never shrink. On a screen too short for the panel plus one row, the page itself scrolls as a fallback.
- **Player rows lost their "Player" sub-label and have a fixed height**, in both the host and joined views, so a row with a kick button matches the host's own row.
- **From `lg` up both lobby views go full screen.** The host view becomes a grid: panel and Start in a fixed 26rem left column, players filling the rest as cards (at least 12rem wide). The joined view drops its `max-w-2xl` cap. In both, only the player grid scrolls, so a big lobby never pushes the panel, title or waiting line away.
- **Your own row is tinted with the primary colour**, matching the leaderboards, because in a narrow grid card the "· you" suffix truncates away.
- **The abilities switch hides its one-line description below `xs`** so it fits beside the mode badge on a phone. The badge shows the short mode name ("Battle Royale") for the same reason.

## 2026-10-11 - Round abilities: a pick-1-of-3 draft, and private per-player sequences

Players now draft an ability before each round (#140).
From round 2 of a standard game every surviving player is dealt 3 of Steal, Strike, Shield, Free Pass, Reroll and Scramble, and picks 1 or skips within `DRAFT_SECONDS` (20 seconds).
Battle Royale players draft on each level-up, where Jump (move to a random other player's level) joins the pool.
The host can turn abilities off in the lobby; they are on by default for new rooms.
A persistent live feed lists every ability event and elimination; its Me / All toggle defaults to Me because a full room produces more events than anyone can read.

New files: `app/imports/api/abilities.js`, `abilityEngine.js`, `abilityRules.js`, `gameEngine.js`, and `app/imports/ui/abilities/`.
`gameMethods.js` now holds only method definitions; its helpers moved to `gameEngine.js` so the ability code can share them without a circular import.

Things that are not obvious from the diff:

- **Every player's sequence is now private, in every mode.** Reroll and Scramble give one player a different sequence from the rest of the room, so the sequence moved from the shared round to `players.secret.sequence`, which only its owner receives (`players.secret`, keyed on the connection). The `rounds` publication stops sending `sequence` altogether. This also closes a leak: Battle Royale level rounds are never marked `advanced`, so every level's answer was reaching every client (D20).
- **`players.secret` depends on the connection binding being current.** A DDP reconnect opens a new connection, so `GamePage` now calls the new `players.rebind` when the connection comes back. Without it the player stops receiving their sequence, and the server removes them after the 15-second disconnect grace period anyway (D21, which predates this change).
- **Drafts are resolved on the server, once.** `rounds.advance` puts `draft` on the new round at insert time, so no client starts playback before it sees the draft. A server timer closes it; clients ask again through `abilities.closeDraft` if their own countdown runs out first, in case a restart lost the timer. Whoever flips `draft.resolved` does the work, so the timer, the fallback and an early close (everyone has chosen) can race safely.
- **Resolution order is a rule, not an accident.** Every Steal lands before any Strike, each in pick order, so a Steal is judged on the lives a player went into the round with. A player struck out in the same resolution still lands their own card.
- **Ability methods are the first ones bound to the caller's connection.** They can hurt other players, so they apply the D3 fix to themselves only. Every older method still trusts the `playerId` it is given.
- **Lives now move with `$inc` everywhere.** A Battle Royale Strike can land while its target submits, so wrong answers, timeouts and Steals no longer write lives computed from an earlier read. That closes the life-deduction part of D4.
- **Steal is only dealt when the room starts players on more than 1 life**, because it never takes a last life. Battle Royale now starts on 1 life (#116), so it is not dealt there; a Battle Royale streak can still bank extra lives, which a Strike can then take.
- **Lives can exceed the starting count through Steal**, which the heart row from #116 already handles by drawing `max(startingLives, lives)` hearts. The #116 streak life moved into the shared `clearRound` with the rest of the correct-answer path, and a Free Pass does not count towards a streak.
- **Rooms created before this change have no `abilitiesEnabled` and play without abilities**, so a deploy mid-game does not start dealing cards into it.

Changed after playtesting with bot players (same day):

- **The draft is 20 seconds, not 10.** Reading three cards and finding a target took longer than 10 seconds in practice.
- **Ability events live in a persistent, scrollable live feed** instead of vanishing toasts, so a player can see who came for them and answer back. It keeps every ability event (`gameFeed`, capped at `FEED_EVENT_LIMIT`) and every elimination for the whole game. Me shows only rows involving you; All shows everything with yours highlighted and the ones aimed at you edged in pink. The feed is open by default only from 1280px, where it fits beside the play area; narrower screens open it from a Feed button that badges unread rows (pink when one was aimed at you). On phones the feed and the leaderboard are bottom sheets in the same place, so opening one closes the other.
- **Toasts only carry things about you**: cards played on or by you, life awards and the replay bonus, so an attack is still noticed with the feed closed. Toasts about other players' progress ("X has reached level 8", "X has submitted the correct sequence") are gone; the server no longer writes `level-up` or `correct-submission` events (about one per player per round), and the `gameEvents` publication that fed them was removed, so `gameEvents` holds ability events only. In-game elimination toasts went too, since eliminations are in the feed.
- **A draft is marked resolved only after its effects have landed.** It used to flip `draft.resolved` first, so for a few hundred milliseconds clients could see the round open while lives and feed rows were still changing. A separate `draft.resolving` claim keeps the server timer, client fallbacks and an early close from resolving twice.
- **Two final answers arriving together no longer create two next rounds** (D4). Seen live: round 5's last two answers landed 3ms apart and produced two round-6 documents, the orphan left `isCurrent`.
- **"Already watched this sequence" is per tab** (`sessionStorage`), not per browser. It only exists so a refresh skips the replay, and two players in one browser were skipping each other's sequences.
- **The play column centres with an auto margin, not `justify-content: center`.** A held card adds a row; centring pushed the overflow off the top of the screen, where it could not be scrolled to, and the hearts disappeared.
- **A submit's result is ignored for round state once the round has moved on.** The last answer is what advances the round, so its result arrives after the next round has started and used to write "please wait for other players" and a stale submitted flag into it.
- **A refresh no longer awards a replay.** The replay bonus compared the streak with 0 on load, so any page load mid-streak counted as a new streak and gave a free replay with a toast.
- **The "FINAL LIFE" banner is gone**, as it duplicated the hearts.

## 2026-10-11 - A life for every streak of correct rounds

Every `STREAK_BONUS_LIFE_THRESHOLD` (3) correct rounds in a row now earns a life, granted by `players.submitSequence` in `app/imports/api/gameMethods.js` and returned to the submitter as `lifeAward` (#116).
`GamePage` shows it as a toast and a flash on the newest heart.

Things that are not obvious from the diff:

- **The cap depends on the mode.** Outside battle royale a streak only tops a player back up to the room's starting lives (`customSettings.startingLives`, else `DEFAULT_STARTING_LIVES`), so a player at full lives earns nothing and the next chance is the next multiple of the threshold. Battle royale has no cap, so a streak there banks lives above the start.
- **Battle royale now starts on 1 life.** `GAME_MODE_PRESETS.battle_royale.startingLives` drops from 3 to 1, so a streak is the only way to gain a cushion there. The in-game banner loses its "1 LIFE ONLY" suffix, which had been wrong while the preset was 3 and would be wrong again as soon as a streak adds a life.
- **The hearts row grows past the starting count.** It draws `max(startingLives, lives)` hearts and wraps, because a battle royale streak (and the round 7 bonus, which was never capped) can exceed the start.
- **The streak earns a replay too.** With `REPLAY_BONUS_STREAK` at 1, the third correct round in a row pays out a replay and a life, each with its own toast.

## 2026-10-10 - Replay tunables moved to constants, bonus every correct round

The replay button's two numbers now live in `app/imports/constants.js` next to the other gameplay tunables: `STARTING_REPLAYS` (1) and `REPLAY_BONUS_STREAK`, which drops from 3 to 1.
A player now earns an extra replay on every correct round instead of every third one in a row.

Things that are not obvious from the diff:

- **Replays are client state only.** `replaysRemaining` lives in `GamePage` React state, so a refresh resets it to `STARTING_REPLAYS`, the same way D7 loses `playerId`.
- **The bonus toast's wording depends on the threshold.** At 1 it reads "Correct! Extra replay earned", because "1 correct in a row" reads badly.

## 2026-10-09 - Keyboard hints on the game controls, and an Undo button

The game screen now has three controls, each showing the key that triggers it: CLEAR (Space), UNDO (Backspace), and SUBMIT (Enter), matching the W/A/S/D letters on the tiles (#115).
UNDO is new as a button; Backspace already removed the last tile, so mouse and touch players now get the same action.
All three share one `ControlButton` in `app/imports/ui/pages/GamePage.jsx`, and the keyboard and the button both call `handleUndo`.

Things that are not obvious from the diff:

- **The window-level Enter handler calls `preventDefault()`.**
  After a mouse click, that button keeps focus, and the browser turns Enter into a click on it.
  Without this, pressing Enter after clicking UNDO would remove a second tile, and after a full sequence it would submit and then undo.
- **Each button has an `aria-label`**, so screen readers announce "UNDO" rather than "UNDOBACKSPACE". The key is announced through `aria-keyshortcuts` instead.

## 2026-10-06 - Spectators can leave a live game without blocking it

The spectator view now offers a confirmed **Leave game** action. It marks the
player eliminated, retains their game and leaderboard records, and then
rechecks the winner and whether the current round can advance before returning
them to the play screen.

Navigating alone would have left an active player document behind because the
DDP connection remains open; that could keep other players waiting
indefinitely. Marking the player eliminated removes them from active-round
calculations while preserving their final score for the end leaderboard.

Files: `app/imports/ui/pages/GamePage.jsx`, `app/imports/api/gameMethods.js`,
`app/tests/leaveGame.test.js`, `AGENTS.md`.

## 2026-09-22 - Google sign-in

Players can sign up and sign in with Google from `/account` (#105).
It is off unless `GOOGLE_CLIENT_ID` is set, and when it is off the Account page looks exactly as it did before.

Things that are not obvious from the diff:

- **It plugs into the hand-rolled accounts rather than replacing them with `accounts-google`.**
  Meteor's package would have meant `accounts-base`, `Meteor.userId()`, and a migration of every existing account for one button.
  Instead the browser gets a signed ID token from Google Identity Services, `playerAccounts.googleSignIn` verifies it with `google-auth-library`, and the result is a normal session from #108.
- **Linking by email is only done for a Google-verified email.**
  A Google identity whose email matches an existing password account is linked to it, so the same player keeps one account and one history.
  That is safe only because Google has proven the address; `email_verified: false` is refused outright.
  An email already linked to a different Google subject is refused rather than silently re-linked.
- **Linking removes the account's password and ends its sessions.**
  Registration never proves who owns an email, so anyone can register a password account for someone else's address before they sign up.
  If linking kept that password, whoever set it would share the real owner's account once the owner signed in with Google.
  The cost is that a genuine owner who registered with a password signs in with Google from then on; `signIn` tells them so with `use-google`.
- **The client ID comes from an environment variable, not `METEOR_SETTINGS`.**
  `Meteor.settings` is read nowhere in the codebase, so `GOOGLE_CLIENT_ID` follows whatever path each stack already uses for configuration: plain `environment` in `infra/ecs/task-definition.{dev,prod}.json` on ECS, the root `.env` locally, and `/opt/kimply/.env` on the legacy instances.
  It is public, unlike `MONGO_URL`, so it is not in Secrets Manager: it ships in the task definition and is visible in the page source anyway.
  The browser reads it through `playerAccounts.googleClientId`, so a change is a task definition revision, not an image rebuild.
- **`google-auth-library` is aliased away from the client build.**
  `googleAuth.js` is imported by `playerAccounts.js`, which the client bundle includes through `globalLeaderboard.js`.
  A dynamic import alone is not enough: Rspack still tries to bundle the Node-only library for the browser and fails with 14 errors, so `rspack.config.js` resolves it to nothing for the client.
- **The verifier has a test seam**, `setGoogleVerifierForTests`, so the tests cover create, link, and refusal paths without a network call or a real Google token.
  The override is stored on `global`, not in a module variable, because CI's `meteor test --full-app` evaluates the module twice and registers the methods from the other copy. A module variable passed locally under `npm test` and failed all six stubbed tests in CI.
  The real verification path was exercised against the running dev server: a malformed token reaches `google-auth-library` and is rejected with its own error, which is logged server-side.

Setup is in [`docs/google-sign-in.md`](google-sign-in.md): one OAuth client, its origins, and where the value lives in each stack. The new UI pattern is in `docs/design_system.md` under Third-party sign-in.

Files: `app/imports/api/googleAuth.js` (new), `app/imports/api/playerAccounts.js`, `app/server/indexes.js`, `app/imports/ui/pages/Account.jsx`, `app/rspack.config.js`, `app/package.json`, `app/package-lock.json`, `app/tests/playerAccounts.test.js`, `infra/ecs/task-definition.dev.json`, `infra/ecs/task-definition.prod.json`, `docker-compose.yml`, `docker-compose.prod.yml`, `.env.production.example`, `docs/google-sign-in.md` (new), `docs/deployment-manual.md`, `docs/design_system.md`, `AGENTS.md`.

## 2026-09-21 - Phones get a 24px screen-edge gutter and 44px touch targets

Phone screens were cramped in two different ways and the fix is different for each.
The game screen had no horizontal gutter at all and sized its gaps in `vw`, so the hearts, the progress dots and the Clear / Submit buttons all collapsed towards each other as the viewport narrowed.
The room-code slots were the opposite problem: fixed at 76px and 56px, five of them plus gaps overflowed every phone width and flexbox squeezed them back down to something narrower than the design system allows.

`docs/design_system.md` only ever named a *desktop* screen-edge value, so the phone gutter was whatever each screen happened to use. It is now `--s-5` (24px), recorded in the spacing table and the breakpoint table, and applied on every route. That is the value `Splash.jsx` already used, so this standardises on existing precedent rather than inventing a number.

Three things that are not obvious from the diff:

- **The 480px boundary is a real Tailwind screen now, not an arbitrary variant.**
  `tailwind.config.js` declares the full `screens` object with `xs: '481px'` ahead of Tailwind's untouched defaults. The explicit object is there for ordering: `theme.extend.screens` would have appended `xs` after `2xl`, and the resulting CSS would let `xs:` beat `sm:` on the same property. Phone styles are the unprefixed base and `xs:` is everything above, so `sm:` (640px) must not be used to mean "not a phone" - that would leave 481-639px on the phone treatment.
- **`ColourSequence`'s `--tile-grid` still hard-codes the page gutter, and has to.**
  It is `min(360px, calc(100vw - 48px), 38dvh)`, where 48px is GamePage's 24px gutter doubled, so the two have to be changed together. The obvious cleanup - swapping the viewport term for `100%` so the grid just tracks its container - does not work and was reverted after it shipped flat tiles to the phone layout. The same variable is consumed on both axes (`width` and `height` on every tile), and in the height context a percentage resolves against the grid's own indefinite height, so the whole `min()` collapses to `auto` and each tile falls back to its content height. Any replacement has to stay percentage-free; `100cqw` with `container-type: inline-size` would work, but was not taken because it is untested here.
- **The live leaderboard is a bottom sheet on phones and a side rail above 480px.**
  It is one `<aside>`, not two: the closed state translates on a different axis per band (`translate-y-[120%]` under 481px, `xs:translate-x-[120%]` above), which works because Tailwind composes transforms through separate `--tw-translate-x` / `--tw-translate-y` variables. `Leaderboard` also takes its height cap from the caller now - the rail wants `max-h-[80vh]`, the sheet wants `max-h-[52vh]` so the tiles stay visible behind it - because two competing `max-h-*` classes on one element do not resolve by author order.
- **Room-code entry and room-code display are held to different floors on purpose.**
  Entry (`JoinRoom`) stays inside the documented 56-76 x 72-96 slot range at every common phone width. The lobby's display tiles are allowed down to 48px, because the Room code display pattern specifies no dimensions and the panel that holds them has its own padding; at 360px the documented 56px floor would not fit inside both.

Files: `app/tailwind.config.js`, `docs/design_system.md`, `app/imports/ui/components/design.jsx`, `app/imports/ui/components/ConfirmationPopup.jsx`, `app/imports/ui/ColourSequence.jsx`, `app/imports/ui/Leaderboard.jsx`, `app/imports/ui/EndLeaderboard.jsx`, and `Splash.jsx`, `PlayRoute.jsx`, `JoinRoom.jsx`, `PlayerLobby.jsx`, `GameModeSelector.jsx`, `CustomGameSettings.jsx`, `GamePage.jsx`, `GlobalLeaderboard.jsx`, `Account.jsx` under `app/imports/ui/pages/`.

---
## 2026-09-22 - Production target moves to ECS on Fargate, with Terraform for the infrastructure

The production design for replacing the single EC2 instance was worked out and recorded in `docs/ecs-target-architecture.md` (decisions D1-D39), and the Terraform to build it now exists under `infra/terraform/`.
Nothing has been applied yet, and the EC2 stack is still what serves `kimply.online`.

Things that are not obvious from the diff:

- **The ALB health check is `/health/live`, not `/health/ready`.**
  In ECS a failing load balancer check also replaces the task, so a Mongo-dependent check would restart every task in a loop through an Atlas outage.
  `/health/ready` moves to the external canary, which can roll a deploy back but can never restart a task.
- **The canonical host becomes `www.kimply.online`.**
  DNS stays at GoDaddy, which cannot alias the apex to a load balancer, so GoDaddy forwards the apex to `www` and `ROOT_URL` changes with it.
- **The task definition template is shared by Terraform and the pipeline.**
  Terraform renders it once for the first revision and then ignores the service's revision, so an apply never undoes a deploy.
  Because the template hard-codes names and ARNs, preconditions fail the plan if it and the infrastructure drift apart.
- **Until cutover the stack serves `ecs.kimply.online`, against the live database.**
  The EC2 stack keeps `kimply.online` and `www` untouched, so nothing about production DNS changes until the ECS stack has been played on.
  The certificate covers `www` from the start so cutover does not wait on validation.
  GoDaddy forwarding was tested first: it serves HTTPS but drops paths and query strings, so after cutover apex deep links land on a GoDaddy 404.
- **The secret is referenced by its full ARN, random suffix and all.**
  The first deploy referenced it by name, and ECS read that as an SSM Parameter Store parameter and failed with `ssm:GetParameters` denied.
  A precondition now fails the plan if the template's `valueFrom` is not the secret's ARN.
- **The polling interval drops to 3s through `METEOR_POLLING_INTERVAL_MS`, with no code change.**
  Atlas M0 has no oplog, so with two tasks a write on one only reaches the other's subscribers at its next poll.
- **Four application issues surfaced that matter more with two tasks**, recorded as I1-I4 in the architecture document rather than fixed here.
  The most serious is that an in-game DDP reconnect may never re-bind `connectionId`, so a player who reconnects could be removed after the 15s grace window.
  It needs an end-to-end reproduction before it goes in the defect register.

- **Development reuses the same module and borrows production's NAT gateway.**
  `envs/dev` differs from `envs/prod` only in values: `FARGATE_SPOT`, 1-2 tasks, its own cluster, ECR repository, secret, log group and domain (`ecs-dev.kimply.online`).
  A second NAT gateway would have cost more than the whole dev environment, so dev routes through production's and reads its ID from production's Terraform state.
  That is the one resource the environments share, and the cost is a real coupling: replacing production's NAT cuts dev off from its database until dev is re-applied.
- **Development shares production's load balancer, and both canaries slow to 15 minutes (D42).**
  The bill was about US$160/month once credits run out, and the application itself was only about an eighth of it: the rest was a NAT gateway, two load balancers, nine public IPv4 addresses and two canaries.
  Development's own ALB cost more than its compute, so it now serves from production's by host header and runs 0.25 vCPU / 0.5 GB, against measured usage of about 105 MB at ~1% CPU.
  Production stays at 0.5 vCPU: its peak is idle-dominated, autoscaling needs four to five minutes to add a task, and DDP connections stick to the task they landed on, so a burst has to be absorbed by the tasks already running rather than by scaling out.
  The cost is coupling: development now depends on production's listener and security group as well as its NAT gateway, and ECS waits longer on a slower canary before completing a deployment.
  The migration has one trap, now in the runbook: deleting the old ALB's security group stalls until the task group's ingress rule stops referencing it, and Terraform does not order those two against each other.
- **DNS moves to Route 53, because GoDaddy forwarding broke deep links (D41).**
  `https://kimply.online/play` reached a GoDaddy 404: forwarding keeps the domain but drops the path, which A3 recorded as a known limitation and which turned out to matter as soon as anyone shared a link.
  No record type at GoDaddy can point a bare domain at a load balancer; Route 53's ALIAS can, so the registrar stays and only the nameservers move.
  Terraform now writes the certificate validation records too, so a renewal can no longer fail because someone deleted a hand-pasted CNAME.
  The zone is created and fully populated before the nameservers change, so the switch is a cutover rather than a build.
- **`www.kimply.online` and `dev.kimply.online` now point at the load balancers.**
  `ROOT_URL`, the Terraform `domain_name` and the workflow's `service_url` moved together, because the app tells the browser where to open its DDP socket and a Terraform precondition keeps the first two in step.
  DNS moves before the deploy: a `ROOT_URL` the DNS does not yet serve gives a page that loads and a game that cannot connect, and it fails the canary, which now rolls deploys back.
  The apex keeps its GoDaddy forwarding to `www`, so apex links with a path reach a GoDaddy 404 (A3). `ecs.kimply.online` and `ecs-dev.kimply.online` stay as second names that bypass the redirect.
  `deployment-manual.md` and `dev-environment.md` now carry a banner saying they describe the superseded EC2 stack.
- **`elasticloadbalancing:DescribeTargetHealth` cannot be scoped to a target group.**
  The statement named the exact ARN and was still denied: the action does not support resource-level permissions, so it has to be `Resource: "*"`. It reads health and can change nothing.
- **The rollout log prints only when something changes.**
  ECS holds a deployment `IN_PROGRESS` while it bakes the new tasks against the canary alarm, so a healthy rollout repeated the same block every 15s and looked like a stuck loop. It now prints on change, notes once that the bake has started, and otherwise emits a one-line heartbeat each minute.
- **Reporting in the deploy script can never fail a deploy.**
  A denied `elasticloadbalancing:DescribeTargetHealth` killed a dev deploy that ECS had already completed: under `set -o pipefail` the AWS CLI's exit 254 became the pipeline's status even though the rest of the pipeline succeeded.
  The reporting and diagnostic functions now run without `-e` and `-o pipefail` and always return 0, and print what is missing instead.
- **A failed deploy now prints why, in the run itself.**
  `deploy/ecs-deploy.sh` writes a summary table to the GitHub run page (revision, image, deployment id, duration, tasks and their AZs), groups its noisy output, and on failure dumps the service events plus the task's CloudWatch logs.
  That needed three read-only permissions on the deploy role, scoped to one cluster and one log group: `ecs:ListTasks`, `ecs:DescribeTasks` and `logs:FilterLogEvents`.
  Without the logs, a failure showed ECS's view ("tasks failed to start") but never the application's own error.
- **The pipeline deploys only to ECS. The SSM path is gone.**
  Keeping both targets would have kept the EC2 stacks in step until cutover, at the cost of a workflow that had to reason about two deployment systems.
  The consequence is accepted deliberately: `kimply.online` and `dev.kimply.online` now lag their branches until each cutover, and shipping to one in the meantime means running `deploy/deploy.sh` on that instance by hand.
- **The deploy workflow resolves every branch-specific value in one `config` job.**
  A `case` on the branch name maps it to the ECR repository, roles, cluster, service, task definition template, smoke-test URL and EC2 target, and an unrecognised branch fails there.
  The previous `github.ref_name == 'main' && ... || ...` expressions treated every non-main branch as development, which would have silently pointed a future `staging` branch at the dev stack.
- **GitHub roles trust exact OIDC subject prefixes, not repository names.**
  The first pipeline run from the fork failed to assume `GitHubActionsECRPush` because the fork uses GitHub's immutable subject format, `repo:owner@<id>/name@<id>`, while the upstream repository still sends `repo:owner/name`.
  `StringEquals` needs the exact string, so each repository is listed by the prefix GitHub reports for it.
- **During the parallel run, `main` deploys to both production stacks.**
  The deploy workflow is split into build, ECS and EC2 jobs so `kimply.online` and `ecs.kimply.online` always run the same image.
  `deploy/ecs-deploy.sh` waits on the outcome of its own deployment ID rather than `aws ecs wait services-stable`, because after a circuit-breaker rollback the service is stable again on the old revision and that waiter would report success.

Files: `docs/ecs-target-architecture.md` (new), `infra/` (new), `deploy/ecs-deploy.sh` (new), `.github/workflows/deploy.yml`, `scripts/health-check.sh`, `AGENTS.md`, `.gitignore`.

## 2026-09-21 - Finished players now remain in the live round as spectators

`GamePage.jsx` no longer sends a player who has completed a round or been
eliminated to a static result screen while the game is still active. Instead it
shows the live leaderboard and continues to follow the current shared round as
the remaining players progress.

The spectator branch intentionally does not render `ColourSequence`, its tiles,
or selected-colour progress. This keeps the spectator interface focused on
public player status rather than visually revealing the round sequence or any
other player's answer.

Files: `app/imports/ui/pages/GamePage.jsx`, `AGENTS.md`.

## 2026-09-21 - Players now expose a safe live round status

`gameMethods.js` now maintains a public `roundStatus` on each player as they
play, complete a sequence, are eliminated, or enter the next round. The
leaderboard model and its tests use that status instead of treating a correct
answer as a generic completion.

The status is deliberately a short label only. `attemptedSequence` remains
excluded from every player publication, so the multiplayer activity UI can
describe progress without exposing anyone's answer.

Files: `app/imports/api/gameMethods.js`, `app/imports/ui/leaderboardModels.js`,
`app/tests/lifeDeduction.test.js`, `app/tests/roundAdvance.test.js`,
`app/tests/leaderboardModel.test.js`, `AGENTS.md`.
## 2026-09-22 - Account sessions persist instead of riding on router state

Testers were signed out when a game ended and when they rejoined one (#108).
The signed-in account lived only in `location.state.playerAccount`, handed from page to page by hand.
Any navigation that did not forward it dropped it: the reconnect popup's Rejoin, the lobby's kicked and room-gone redirects, typing `/play` into the address bar, or opening an invite link in a new tab.
Once dropped, the rest of that game ran without an `accountId`, so its result was not recorded against the account either.

`register` and `signIn` now return a random session token.
The client keeps it in `localStorage`, resumes it at startup through `playerAccounts.resume`, and every page reads the account from `useSignedInAccount()` in `imports/ui/accountSession.js`.
`playerAccount` is gone from every `navigate(..., { state })` call.
`/play` has a Sign out link.

Things that are not obvious from the diff:

- **Only the SHA-256 of a token is stored.**
  A copy of the `playerAccounts` collection does not contain a usable session.
  Plain SHA-256 is enough here, unlike for passwords, because the token is 43 random characters and there is nothing to brute-force.
- **Each sign-in is its own session.**
  Signing in on a phone does not sign out the laptop, and Sign out ends only the session it was pressed in.
  Expired sessions are pruned whenever a new one is issued, so the array cannot grow without bound.
- **A failed resume clears the token only on `invalid-session`.**
  A dropped connection at startup keeps the token for the next load, rather than signing the player out because the network blinked.
- **`GamePage` waits for a pending resume before calling `players.join`.**
  Without that, a reload that lands on `/game` could join without the account, and the late resume would re-run the effect and join a second time.
- **This is a session, not an authorization boundary.**
  `rooms.create`, `rooms.join`, and `players.join` still take a client-supplied `accountId`, so a hostile client can still record results against someone else's account.
  Moving those methods to accept the token and resolve the account server-side is the follow-up.
- **The account's display name fills the username field when it arrives, unless the player has typed one.**
  The session resumes after the first render, so `/play` and `/play/join` fill the name in late.
  Checking for an empty field would let any prefilled name block it, including a remembered username from a previous player on a shared device (#119), so both pages track whether the player has typed instead.
  `JoinRoom` also never replaces a name passed from `/play`.

Files: `app/imports/api/playerAccounts.js`, `app/server/indexes.js`, `app/imports/ui/accountSession.js` (new), `app/client/main.jsx`, `app/imports/ui/pages/{Account,PlayRoute,JoinRoom,PlayerLobby,GamePage,GlobalLeaderboard}.jsx`, `app/imports/ui/EndLeaderboard.jsx`, `app/tests/playerAccounts.test.js`, `AGENTS.md`.

## 2026-09-22 - The last username is remembered between visits

Players had to type their username on every visit (#119).
The last name used is now kept in `localStorage` under `kimply.username` and prefilled on `/play` and on `/play/join`, including when `/play/join` is opened from an invite link with no router state.

Things that are not obvious from the diff:

- **The name is saved when it is used, not while it is typed.**
  It is written on Create Room, on Join Room from `/play`, and after a successful `rooms.join`, so a half-typed or abandoned name never replaces the last one that actually got someone into a game.
- **A signed-in account's display name still wins over the saved name on `/play`.**
  On a shared device, the saved name belongs to whoever played last, while a signed-in account is a stronger statement of who is at the keyboard.
- **Storage failures are silent.**
  Every read and write is wrapped, so private browsing or blocked site data just means the field starts empty, as it did before.
- `JoinRoom.handleJoin` now refuses to submit with a blank name.
  Before, pressing Enter in the code slots could call `rooms.join` with an empty name even though the button was disabled.

Files: `app/imports/ui/savedUsername.js` (new), `app/imports/ui/pages/PlayRoute.jsx`, `app/imports/ui/pages/JoinRoom.jsx`, `app/tests/uiHelpers.test.js`, `AGENTS.md`.


## 2026-09-04 - The Quality Assurance Plan is now a document in the repo

The QA plan existed only as a submission document, written before most of the machinery it described was built.
It claimed an agile-subteam branch model the repo no longer uses, quoted performance targets that had never been measured, and described security in terms the defect register contradicts.

It now lives at `docs/quality-assurance-plan-submission.md`, and every claim in it is either sourced from the codebase or marked as an unmet target.

Three things that are not obvious from the diff:

- **Unmet requirements are stated as unmet, with the measurement.**
  The "under 0.5s response" performance NFR is marked not met and carries the real numbers from the load test runs: the sequence submission method at a median of roughly 1.1s locally and 4.4s against dev at 100 players.
  The plan is more useful as an accurate account of where we are than as a list of things we would like to be true.
- **The security section is written against the defect register rather than around it.**
  The outstanding identity and hashing defects appear in the plan with the explicit statement that the fix for the first is connection binding and not a login wall, so a future reader cannot use the QA plan as justification for auth-gating the game.
- **The plan ends with its own gap list.**
  It names what it does not yet cover, including the coverage smoke gate, the formatting gate that cannot yet run in CI, and the absent end-to-end test, so the next milestone closes them deliberately instead of rediscovering them.

Files: `docs/quality-assurance-plan-submission.md` (new), `AGENTS.md`.

## 2026-09-01 - The game screen now scales to the viewport instead of overflowing it (D19)

The play column was sized in fixed pixels and `vw`, so it stayed about 740px tall on every screen while the container was pinned to `100dvh` with `overflow: hidden`. Starting the turn added two rows (the message and the `Time left` line, which only existed while input was open), pushed the button row past the fold, and the buttons were clipped with no way to scroll to them. On a full-height 1512x828 laptop there were 7px to spare before the turn started, which is why it read as a mobile bug.

Hearts, the tile grid, the button row and the header padding now scale with `dvh`, the column's rhythm moved from `vh` to `dvh` so it matches the container's own `100dvh`, and the timer row is always rendered so the buttons do not move when the sequence ends.

Two things that are not obvious from the diff:

- **The scroll fallback had to move off the container.** Putting `overflow-y: auto` on the container looked right and was wrong: `TileLattice` is deliberately larger than the screen (1100px tall, offset above the fold), so the container became scrollable by 188px of pure decoration - D18's empty-strip symptom arriving by another route. The container keeps `overflow: hidden` and the fallback sits on the play column, which contains only real content.
- **`dvh` is what makes this hold on mobile.** The column's margins were `vh`, which on mobile resolves to the largest viewport (toolbar hidden) while the container is `100dvh` (toolbar shown). The column was therefore budgeting against a taller box than it actually had.

Files: `app/imports/ui/pages/GamePage.jsx`, `app/imports/ui/ColourSequence.jsx`, `docs/defect-register.md` (D19), `AGENTS.md`.

Verified end to end in Chrome at 13 viewports from 320x568 to 1920x1080, and in a real 420x583 window: the button row is fully visible in both the watching and the input phase, at the same position in each, and nothing scrolls.

## 2026-08-31 - Game page uses 100dvh so it stops scrolling into empty space (D18)

The gameplay container used `minHeight: 100vh`. On mobile `100vh` is the largest viewport (address bar hidden), so the container was taller than the visible screen and left an empty strip to scroll into. Switched it to `100dvh`, which tracks the visible area as browser chrome shows/hides. `overflowY: 'auto'` stays, so genuine overflow on short screens still scrolls.
Files: `app/imports/ui/pages/GamePage.jsx`, `docs/defect-register.md` (D18).
## 2026-08-31 - Lives display now shows the full starting-lives track (D17)

The game page sized its hearts off `Math.max(player.lives, 3)` and computed `totalLives` only for `gameMode === 'custom'`, so preset modes (easy = 5 lives, etc.) fell back to 3 and a lost life removed a heart instead of greying it out.
`customSettings.startingLives` is populated for every preset, so `totalLives` now reads it regardless of mode and the display renders a fixed `totalLives` track, greying circles above the current life count. `players.join` already stores the correct starting lives, so this was display-only.
Files: `app/imports/ui/pages/GamePage.jsx`, `docs/defect-register.md` (D17).
## 2026-08-31 - Locked tile input during the post-mistake sequence replay (D16)

After a wrong guess with lives remaining, `GamePage.handleSubmit` set `playerCanInput` to `true` and bumped `replayKey` in the same breath, so the colour tiles stayed clickable while the sequence replayed and a player could copy the answer as each tile lit up.
Set `playerCanInput` to `false` on the retry path and let `onSequenceComplete` re-enable it after the replay, matching the fresh-round flow. Non-obvious: the retry replay reuses the same `roundId`, so re-enabling has to be driven by the replay finishing, not by a round change.
Files: `app/imports/ui/pages/GamePage.jsx`, `docs/defect-register.md` (D16).
## 2026-08-31 - Fixed the room-code input dropping keystrokes (D15)

`JoinRoom.handleInput` passed a functional updater to `setCode` that read `e.target.value`, then cleared that same value synchronously with `clearCapturedInput(e)` further down the handler.
React only evaluates a functional updater eagerly when the fiber has no pending work; otherwise it defers the updater until render, by which point the clear has already blanked `e.target.value`, so `appendRoomCodeInput` received `''` and the keystroke was lost. That is why players had to type each code letter twice.
The fix reads the typed value into a local before clearing and references that local inside the updater, so the update no longer depends on the mutated DOM node. The non-obvious part: reordering `clearCapturedInput` above `setCode` is not cosmetic — it removes a read-after-mutate race, not just a style preference.
Files: `app/imports/ui/pages/JoinRoom.jsx`, `docs/defect-register.md` (D15).

## 2026-08-29 - Skills are workflows, not product rules

Every skill under `.agents/skills/` was rewritten to drop game-specific rules (defect IDs, publication invariants, route tables, "do not add a login wall", lives / sequences / `'demo'` gameId).
Those belong in `AGENTS.md` and `docs/`. Skills now only say how to run git, tests, Docker, Meteor, and the rest of the toolchain, and they point at the docs when a change would move an invariant.
Files: all ten `SKILL.md` files, `AGENTS.md` skills table.

## 2026-08-29 - The design system gets its own document, and AGENTS.md becomes a hub

`docs/design_system.md` (v0.1, design-authored) is now the source of truth for colour, typography, spacing, radii, elevation, motion, component specs, patterns, and voice.
`AGENTS.md` points at it instead of carrying a four-row token table.
Files: `AGENTS.md`, `docs/defect-register.md`, `.agents/skills/ui/SKILL.md`, `.agents/skills/review/SKILL.md`.

The wider change is a rule about what `AGENTS.md` is for. It is the inventory of the running system - collections, publications, methods, routes, invariants - and nothing else.
Where another file already holds the bulk, it now keeps only what a reviewer needs at a glance and links to the home file. A "Where things live" table near the top names every home.
Design system, development commands, testing prose, deployment prose, and defect detail were trimmed on that basis; the data model, publication, method, and route tables were not touched, because nothing else holds them.

Two pieces of drift surfaced while doing it, both of which had made a reference unsafe to follow:

- **`design.jsx` disagrees with the design system.** `SURFACE` is `oklch(0.18 …)` against the documented `0.20`, `FG` and `FG3` also differ, and `DANGER` / `ACCENT` are not in the document at all. `tailwind.config.js` matches the document exactly, which is why the `ui` skill now says to prefer the Tailwind class wherever both exist. The code was left alone deliberately: changing `SURFACE` moves every card on every screen, and that is a design call, not a cleanup.
- **The defect IDs in `AGENTS.md` and `docs/defect-register.md` had drifted by one.** The register had D12 for the root lockfile and D13 for the `AudioContext` leak, where the summary table had D11 and D12, and D14 existed only in the summary table. Since the register's own header states that its IDs match the summary table, the register was reconciled onto that numbering: two headings renumbered, a real D14 section written, and D9 / D10 marked fixed there rather than only in `AGENTS.md`. **There is no D13**, and the gap is documented so nobody closes it - the IDs are cited from skills and pull requests.

## 2026-08-29 - Stack specialist skills, and this log leaves AGENTS.md

Six skills added under `.agents/skills/`, joining `git`, `test`, `ui`, and `review`: `meteor`, `react`, `mongo`, `docker`, `deploy`, `debug`.
`.claude/skills` and `.cursor/skills` are directory symlinks to `.agents/skills`, so nothing was copied into a vendor folder.
Files: new `.agents/skills/{meteor,react,mongo,docker,deploy,debug}/SKILL.md`; `AGENTS.md`; new `docs/decision-log.md`; `.agents/skills/review/SKILL.md`.

The split is deliberate. The four original skills answer *what to do* (cut a branch, write a test, style a screen, review a diff). The six new ones answer *how this stack actually behaves*, which is the knowledge an agent otherwise reconstructs badly from general Meteor or React habits.

Five things the skills now record that the `AGENTS.md` tables did not, each of which has already caused a real bug or would have:

- **`useSubscribe` returns a function, not a boolean.** `!isLoading` negates a function and is always false. That is what made the dead `useEffect` in `PlayerLobby` dead, and it sat there long enough to become D9.
- **Three different subscription styles coexist** - inside `useTracker` gated on `ready()` (`Leaderboard.jsx`), `useSubscribe` (`PlayerLobby.jsx`), and `Meteor.subscribe` in a `useEffect` with a manual `stop()` (`GamePage.jsx`). All three are correct; picking one at random per component is how a subscription leak gets written.
- **CI runs `meteor test --once --full-app`, but `npm test` does not pass `--full-app`.** The `global._<x>Initialized` guards are therefore load-bearing in CI only: delete one and it passes locally, then fails the PR.
- **Methods are registered behind `Meteor.isServer`, so no client stub exists and there is no latency compensation.** Every call is a full round trip and the component owns its own pending state. Optimistic UI written against an imagined stub would never run.
- **Minimongo stays synchronous while the server is async-only.** `findOne()` inside `useTracker` is correct and `findOneAsync` there is wrong, which is the opposite of the rule that holds three directories away in `imports/api/`.

Two inconsistencies surfaced while checking the source, both left alone as out of scope:

- `app/Dockerfile`'s header comment still says `t4g.medium`. The instances are `t4g.small`, as corrected in the 2026-08-21 entry below.
- `app/Dockerfile` now overwrites `web.browser.legacy` with a copy of `web.browser`, because Meteor serves the ES5 legacy bundle to any user agent its `modern-browsers` package cannot identify (Facebook Messenger's iOS in-app browser is one) and that bundle was missing app code, giving those users a blank screen. That fix is recorded only in a comment in the Dockerfile; it has no entry in this log.

## 2026-08-29 - Agent-agnostic skills; AGENTS.md is the single instruction file
`AGENTS.md` is now the canonical always-on file. `CLAUDE.md` is a symlink to it, so Claude Code and every other agent read the same inventory.
Skills live once under `.agents/skills/` (`git`, `test`, `ui`, `review`). `.claude/skills` and `.cursor/skills` are directory symlinks to that folder — do not copy skills into a vendor directory.
Removed the Claude-only memory-file protocol (those files were never in the repo). `.gitignore` no longer ignores all of `.claude/`, only `settings.local.json` and `worktrees/`.
Tables refreshed against `dev`: live leaderboard subscribes to `players` + `rounds` (not the `leaderboard` pub), `publications.test.js` and `leaderboardModel.test.js` exist, `GamePage` has no `'demo'` gameId.

## 2026-08-24 - Custom flash speed choices

The custom game settings page offers Fast, Med and Slow flash-speed choices, mapped to 200 ms, 500 ms and 1000 ms. The existing numeric `flashSpeed` setting passed through navigation is unchanged.

Carried over from the Feature Log in `CLAUDE.md` on `battle-royale-status-ui-trisha`, which became a symlink to `AGENTS.md` when that branch merged `dev`. The entry would otherwise have been lost with the file.

## 2026-08-21 - A development environment that mirrors production, deployed from `dev`
`dev.kimply.online` is now a second, fully independent copy of the production stack on its own `t4g.small`, with its own Elastic IP, ECR repository, IAM roles and Atlas cluster.
Files: new `.github/workflows/deploy.yml` (replaces `docker-ecr.yml`), new `docs/dev-environment.md`; `deploy/deploy.sh`, `deploy/build-push.sh`, `deploy/init-letsencrypt.sh`, `docs/deployment-manual.md`, `docs/operations.md`, `CLAUDE.md`.
Deleted the untracked `.github/workflows/aws_push.yml` (a broken stub with no `id-token: write`, an undefined `AWS_REGION`, a role that does not exist, and a duplicate `main` trigger that would have raced the real pipeline) and `rendered.conf` (an envsubst debug artifact).

Not a line of `deploy/`, `nginx/` or `docker-compose.prod.yml` needed to change to support a second environment, which is the strongest evidence that the `.env`-driven design was right.

Seven things worth carrying forward:

- **The OIDC roles are per-branch, and that is deliberate.** GitHub's subject claim is `repo:<org>/<repo>:ref:refs/heads/<branch>`, so the existing production roles simply refused a `dev` workflow. Widening them to accept both refs was the smaller change and was rejected: separate `...Dev` roles, scoped to `repository/kimply-dev` and the dev instance ARN, make it structurally impossible for a push to `dev` to touch production. The production roles were not modified at all.
- **Separate ECR repositories are required, not tidiness.** `kimply` is `IMMUTABLE`-tagged and keeps only 10 images. Sharing it would let dev builds evict production rollback targets, and because tags are commit SHAs, a fast-forward `dev` to `main` merge would push an already-existing tag and be rejected outright.
- **`${APP_IMAGE}` has no default, so the ECR repository must be seeded before the box is configured.** `docker compose config` fails on an unset image and `deploy.sh` will not run without one. Run `ECR_REPOSITORY=kimply-dev ./deploy/build-push.sh` locally first, rather than discovering this through a failed first pipeline run.
- **`build-push.sh` had lost its buildx attestation flags, and getting that wrong poisons an immutable tag.** Commit `2b7dfa2` added `--provenance=false --sbom=false` because buildx otherwise attaches provenance and SBOM attestations, turning the result into an OCI index that ECR rejects with a bare `400 Bad Request` on the manifest PUT, after every layer has already uploaded. Main's 53-line rewrite of the script dropped them; this change restores them. The trap on top of the trap: the failed push still lands the in-toto provenance manifest **under the tag**, and because both repositories are `IMMUTABLE`, every retry then fails with the same 400 for an entirely different reason. Recovery is `aws ecr batch-delete-image` on the tag first, since immutability blocks overwrite but not delete.
- **The attestation failure is invisible in CI and only bites locally.** GitHub's runners use the classic Docker image store, where `--load` converts to Docker schema2 and the push succeeds, which is why production has been green since 2026-08-14. Docker Desktop with the containerd image store (`io.containerd.snapshotter.v1`) keeps OCI media types through `--load`, so a developer running `build-push.sh` by hand hits it and CI never does.
- **`deploy/deploy.sh` in the repo was NOT what production actually runs, and the repo copy was broken.** The production box carried a fix that no branch has: `set_app_image()` must `export APP_IMAGE="$image"` as well as rewriting `.env`, because **Docker Compose gives the shell environment precedence over `--env-file`**. `deploy.sh` does `set -a; source "$ENV_FILE"`, which exports the OLD `APP_IMAGE`; rewriting only the file then changes nothing, `compose up` decides the service is already current and prints `Container kimply-app Running` instead of `Recreated`, and the deploy silently becomes a no-op. The post-recreate image guard is what turns that into a loud failure instead of a false success, and it is the only reason this was caught. Verified empirically: `APP_IMAGE=STALE/SENTINEL:0000 docker compose --env-file .env config` resolves to the sentinel, not the file. The fix is now committed; before that, running `sync-config.sh` against **production** would have overwritten prod's working script with the broken one and quietly turned every production deploy into a no-op that reported success.
- **Production's health gate is currently vacuous.** `main` has no `app/server/health.js`, so `/health/live` and `/health/ready` both return the Meteor SPA shell with a 200 and both the Docker `HEALTHCHECK` and `deploy.sh`'s probe pass unconditionally. `main` is also missing `server/publications.js` and `server/indexes.js`, so production still runs the unscoped publications of D2. Development, built from `dev`, has all three and a genuinely working gate. This resolves when `dev` reaches `main`, which is a release decision and was left alone.

Three documentation claims were corrected against reality while doing this: the instances are `t4g.small` (2 GB) not `t4g.medium`, the swap file is 2 GB not 4 GB, and `build-push.sh` neither refuses a dirty tree nor boots the image before pushing, despite `deployment-manual.md` saying it does both.

## 2026-08-05 - Production image and proxy validated end to end
The production stack now runs locally and is verified: arm64 image builds, boots in ~7s, and serves through nginx over TLS.

Measured and confirmed rather than assumed:
- **The bundle asks for Node 22.22.0.** The Dockerfile now reads `star.json` at build time and fails the build on a major-version mismatch with the runner, turning the classic "builds fine, dies on boot" failure into a build error.
- **WebSocket upgrade returns `101` through nginx.** Without this, DDP silently falls back to SockJS long-polling: everything still works, but connection count and latency balloon. Always verify the 101, never just that the app loads.
- Image runs as `node` (uid 1000), carries no Meteor CLI, no `.meteor`, no raw source and no secrets in any layer.
- `kimply-app` publishes no host ports (`{"3000/tcp":null}`); only nginx binds 80 and 443.

New: `loadtest/ddp-smoke.mjs` drives real DDP over a WebSocket using Node's built-in `WebSocket`, with no dependencies.
It asserts room creation, reactive lobby updates, scoped `rounds`, **zero leakage for a foreign gameId**, and **no `attemptedSequence`** on any published player document.
This is scriptable in a way a browser test is not, and it is the foundation for the Phase 7 load harness.

One production bug found by running it: the nginx base image ships `/etc/nginx/conf.d/default.conf`, and conf.d loads alphabetically, so that stock server block became the **default server for port 80**. Any request with an unmatched Host header - a bare hit on the Elastic IP, a scanner - would have received the nginx welcome page instead of the HTTPS redirect. Fixed by mounting `nginx/disable-default.conf` over it and marking our own listeners `default_server`.

## 2026-08-05 - Production deployment configuration (Nginx, Compose, ECR, runbooks)
Added the full manual-deployment stack for a single arm64 EC2 instance.
Files: rewritten `app/Dockerfile` and `docker-compose.prod.yml`; new `nginx/nginx.conf`, `nginx/templates/kimply.conf.template`, `.env.production.example`, root `.dockerignore`; new `deploy/{bootstrap-ec2,init-letsencrypt,build-push,deploy}.sh`, `scripts/health-check.sh`; new `docs/deployment-manual.md` and `docs/operations.md`.

`docker-compose.yml` (development) is untouched and must stay that way.

Three things the production build taught us, all of which would otherwise have failed on a real deploy:
- **`meteor` is not on PATH after `npm install -g meteor`.** The npm package unpacks the toolchain into `$HOME/.meteor` and symlinks there, adding no shim to the global npm bin. Without `ENV PATH="/root/.meteor:$PATH"` every `meteor` call exits 127.
- **`tests/` must stay in the Docker build context.** `meteor.testModule` in `package.json` points at `tests/main.js`, and `meteor build` resolves that path even for a production build. Excluding it fails with `Could not resolve meteor.mainModule "tests/main.js"`.
- **`npm ci` cannot be used inside the bundle.** Meteor 3.4 emits no lockfile into `programs/server`, so `npm ci` fails with npm's usage dump (easy to misread as a bad flag). Use `npm install --omit=dev`, which is Meteor's documented step.

Other non-obvious decisions:
- Nginx config is a **template**, rendered by the official image's entrypoint. `NGINX_ENVSUBST_FILTER=^DOMAIN$` is load-bearing: without it envsubst also replaces nginx's own `$host`, `$remote_addr` and `$http_upgrade`, silently producing a broken config.
- TLS bootstrap uses a **self-signed placeholder certificate** rather than a second HTTP-only config, so there is one nginx config for every environment and local validation exercises the exact production file.
- **No separate rollback script.** Rollback is `deploy.sh <older-sha>` through the same health-gated path, because a rollback runs during an incident and should not be the least-tested code path.

## 2026-08-04 - Production readiness: scoped publications, health endpoints, indexes
Removed the `RoundsCollection.removeAsync({})` startup wipe that destroyed every in-flight game on each restart (D1), and scoped the three global publications by `gameId` while excluding `attemptedSequence` (D2).
Added `/health/live` and `/health/ready` and 11 MongoDB indexes.
Files: `server/main.js`, new `server/publications.js`, `server/health.js`, `server/indexes.js`; `ui/pages/GamePage.jsx`, `ui/Leaderboard.jsx`, `ui/EndLeaderboard.jsx`; new `tests/publications.test.js`; `package.json`.

Consequences worth knowing:
- **Publications moved out of `server/main.js`.** Plain `meteor test` never loads the server entry point, so publications defined there are untestable. They now live in `server/publications.js` behind a double-eval guard.
- **`GamePage` no longer has a `'demo'` gameId fallback.** With scoped publications a placeholder subscribes to a nonexistent game and hangs on LOADING, so it now renders a "no game selected" screen instead.
- **Readiness caches its Mongo ping for 5 s** so that health polling does not become steady load against the Atlas free tier.
- Verified end to end in a browser: with a second game injected directly into Mongo, the client saw 1 round and 1 player instead of the server's 2 and 9, and no `attemptedSequence` on any document.

Also fixed two defects found while testing: `<HostView>` was missing its `navigate` prop and threw on **every** game start (D10), and a dead `useEffect` sitting after an early return violated the rules of hooks (D9).

## 2026-08-04 - CLAUDE.md rebuilt as the project's durable record
The previous version claimed only the splash, room creation, join flow, and lobby were implemented.
In reality the full game loop, leaderboards, end-of-game rankings, player accounts, and lobby reconnect were all already built, which forced a full re-inspection of the codebase.
Replaced with complete collection, publication, method, route, and defect tables plus this log.
Files: `CLAUDE.md`.
Consequence: future sessions should read this file rather than re-scanning `imports/api/`, and must keep the tables current.

## Earlier work (reconstructed from git history, not exhaustive)
- Favicons added in several sizes (`4f85847`)
- Accuracy tracking per player (`5ad5790`)
- Current player highlighted in the final leaderboard (`3e05f3e`)
- Placement message at end of game (`ae9eb5a`)
- Account creation bug fixed (`9922153`)
- Game session reconnect (`8584099`)
- Incorrect-guess life deduction (`4639339`)
