# Defect Register

Defects found during the production-readiness inspection that were **deliberately not fixed** in Phase 1.

They are recorded here so no future session has to rediscover them, and so the decision to defer them is explicit rather than accidental.
Each entry states what is wrong, how it actually fails, and what the fix would be.

The IDs match the summary table in [AGENTS.md](../AGENTS.md#known-defects), which carries one line per defect and points here for the detail.
Keep the two in step: an ID means the same thing in both files, or neither file can be trusted.

There is no D13. The register and the summary table had drifted by one on the last three IDs; reconciling them on 2026-08-29 onto the summary table's numbering left the gap. Do not renumber to close it - the IDs are cited from skills and pull requests.

**Last verified:** 2026-08-31

---

## Fixed in Phase 1 (kept here for history)

| ID | Was | Resolution |
|---|---|---|
| D1 | `server/main.js:13` wiped `RoundsCollection` on every startup | Removed. Old rounds now expire via a TTL index in `server/indexes.js` |
| D2 | Three unfiltered whole-collection publications | Scoped by `gameId`; `players` also excludes `attemptedSequence` |
| D9 | A conditional `return null` sat between two hooks in `PlayerLobby.jsx` | The dead `useEffect` after the early return was deleted, so no hook follows the conditional return |
| D10 | `<HostView>` was rendered without its `navigate` prop | `navigate` is now passed down. It was throwing on **every** game start |
| - | No health endpoint | `server/health.js` adds `/health/live` and `/health/ready` |
| - | No indexes at all | `server/indexes.js` creates 11 indexes on startup |
| - | `istanbul-lib-instrument` used by `scripts/include-all-coverage.js:3` but undeclared | Added to `devDependencies` |

---

## D3 - The server trusts client-supplied player identifiers

**Severity: high.** The most serious outstanding defect.

`imports/api/gameMethods.js:122`

```js
async 'players.submitSequence'(playerId, attemptedSequence) {
  const player = await PlayersCollection.findOneAsync(playerId);
  // ...no check that the caller owns this player
}
```

Every player's `_id` is published to every client in the same room by the `players` publication.
Any browser can therefore call `Meteor.call('players.submitSequence', '<someone else>', ['x'])` in a loop and drain another player's lives to zero.

**Be precise about the framing.**
Kimply is intentionally open to anyone, and accounts are optional by design.
"There is no login" is therefore **not** the defect, and the fix is **not** a login wall.

The defect is narrower: the server never checks that the connection sending an identifier is the connection that owns it.

Related, all in the same category:

| Method | Location | Problem |
|---|---|---|
| `rooms.start` | `rooms.js:58` | No host check. Anyone who knows a PIN can start someone else's game |
| `rooms.kick` | `rooms.js:69` | Refuses to kick the host, but never verifies the caller. Any member can kick any other member |
| `rooms.updateGameName` | `rooms.js:126` | No host check. Also the only string field written untrimmed (`:142`) |
| `rooms.disconnect` | `rooms.js:82` | Passing the host's id **deletes the entire room**. The ids are published by `rooms.lobby` at `rooms.js:24` |
| `rooms.reconnect` | `rooms.js:149` | Trusts a client-supplied `playerId` and returns that player's name, so anyone can "reconnect as" anyone |
| `rounds.generate` | `gameMethods.js:88` | Publicly callable with an unvalidated `length`. `Meteor.call('rounds.generate', 100000000)` is a one-line OOM |
| `rounds.advance` | `gameMethods.js:218` | Publicly callable with any round id, so anyone can force-advance any game |
| `players.join` | `gameMethods.js:102` | No check that the room exists, that the caller is in it, or that the round belongs to it |

There is also no `check()` / `Match` / SimpleSchema validation anywhere in the codebase, and no `DDPRateLimiter`.
`attemptedSequence` is written to Mongo verbatim at `gameMethods.js:139`, so arbitrary JSON can be stored.

### Fix

1. Record `this.connection.id` on the player document in `players.join`.
2. Assert it on every subsequent mutation (`players.submitSequence` above all).
3. Do the same for room membership so `rooms.kick` / `rooms.start` / `rooms.updateGameName` verify the caller is the host.
4. Add `check()` on every method argument, including `Array.isArray` plus a length and colour-membership check on `attemptedSequence`.
5. Make `rounds.generate` and `rounds.advance` plain functions rather than public methods, since only server code calls them.
6. Add `DDPRateLimiter` rules.

This preserves anonymous play exactly as designed.

---

## D4 - Read-then-write races

**Severity: medium-high.** Invisible under light testing, likely under load.

Meteor's single-threaded event loop currently serialises many of these by accident, which is why they have not been noticed. They become much more likely with concurrent submissions, and much worse if a second replica is ever added.

### Double round advance
`gameMethods.js:220 -> 227 -> 230` reads `currentRound`, checks `if (currentRound.advanced) return`, then sets `advanced: true`. Not atomic.
Two concurrent submissions that both satisfy `allFinished` can both pass the guard and create **two `isCurrent: true` rounds** for one game, splitting the player set.
The `advanced` flag is checked in three separate places (`:79`, `:206`, `:227`), all on stale snapshots.

**Fix:** conditional update, `updateAsync({ _id, advanced: false }, { $set: { advanced: true } })`, and only proceed if `matchedCount === 1`.

### Double winner
`checkWinner` at `gameMethods.js:14 -> 22` fetches all players, computes `active.length === 1`, then writes `winner: true`.
Two concurrent eliminations can each observe a different single remaining player and crown two winners.
The `active.length === 0` branch at `:39-53` uses a `{ multi: true }` update and will mark **every** tied player as winner.

**Fix:** `findOneAndUpdate` with the expected precondition in the selector.

### Life deduction loses a life
`gameMethods.js:162` computes `const newLives = player.lives - 1` from a document read at `:124`, then writes `$set: { lives: newLives }` at `:171`.
Two concurrent wrong submissions both read `lives: 3` and both write `lives: 2`, so one life is silently lost.

**Fix:** `$inc: { lives: -1 }`. This is a one-line change and the cheapest win in this section.

### Duplicate player names
`rooms.js:113 -> 118` checks name uniqueness against a snapshot, then `$push`es.
This matters more than it looks: host identity is determined by **name comparison** at `rooms.js:76` and `:89`, so winning this race can promote a non-host.

**Fix:** stop identifying the host by name. Persist `hostId` on the room (see D6) and compare against that.

### PIN collision - **closed in Phase 1**
`rooms.js:37-46` was a check-then-insert with no unique index.
The `pin_unique` index added in `server/indexes.js` now makes a duplicate insert fail at the database layer.
The method should still be updated to catch the duplicate-key error and retry rather than surfacing it, but the data can no longer become corrupt.

Note that PINs are generated with `Math.random()` (`rooms.js:15`), not a CSPRNG, over a 32^5 keyspace with only 10 retries.

---

## D5 - No server-side round deadline

**Severity: high for real users.** The most likely thing to ruin an actual game session.

A round advances only when **every** active player has submitted (`gameMethods.js:79-81` and `:206-208`).
There is no timer, no deadline, and no timeout.

One player closing their tab mid-round stalls that game **permanently** for everyone else. There is no recovery path short of everyone leaving.

**Fix:** a server-side per-round deadline that auto-submits an empty attempt for any player who has not responded, or marks them disconnected and excludes them from the `allFinished` calculation.

---

## D6 - `rooms.reconnect` always reports `isHost: false`

`rooms.js:172` returns `isHost: room.hostId === playerId`, but `rooms.create` (`rooms.js:46-53`) **never writes a `hostId` field** to the document.
`room.hostId` is therefore always `undefined` and the comparison is always false.

`rooms.create` does return `hostId` to the client at `:55`, and `PlayRoute.jsx:151` uses it, so only the reconnect path is broken.

Compounding this, the host's reconnect data is never persisted at all: the branch that would store it is commented out at `PlayRoute.jsx:144-150`.
A host who reloads has no reconnect path.

**Fix:** persist `hostId` on the room document in `rooms.create`, and re-enable the host branch in `PlayRoute.jsx`. This also fixes the name-comparison problem in D4.

---

## D7 - Refreshing the game page grants free lives

`GamePage.jsx:39-49`

`playerId` is held only in React state (`GamePage.jsx:12`) and is never persisted.
After any remount it is `null`, so the effect re-fires `players.join` and creates a **second player document with a fresh 3 lives**.

A refresh is therefore a way to reset your lives, and it leaves duplicate rows in both leaderboards.

**Fix:** persist `playerId` to `sessionStorage` keyed by `gameId`, and make `players.join` idempotent per connection (which D3's fix provides).

---

## D8 - Password hashing is a single unstretched SHA-256

`playerAccounts.js:20-22`

```js
return createHash('sha256').update(`${salt}:${password}`).digest('hex');
```

Per-user 16-byte salts are present (`:53`), so rainbow tables do not apply.
But this is one round of SHA-256 with no work factor, and a commodity GPU computes billions per second. An offline crack of a leaked `playerAccounts` dump is effectively instant for anything short of a passphrase.

Also in this file:

- **Non-constant-time comparison** at `:87` (`attemptedHash !== account.passwordHash`).
- **Account enumeration oracle**: `:83` throws `not-found` for an unknown email but `:88` throws `wrong-password` for a known one, so the method confirms whether an address is registered.
- **No rate limiting**, so credential stuffing and enumeration are both unbounded.
- **No maximum password length**, so a client can post a very large string and force unbounded hashing work.
- `signIn` issues **no session token** (`:91-94` returns a plain object), so authentication has no effect on any authorization decision anywhere in the app.

This becomes materially riskier now that the app is on a public IP.

**Fix:** move to `accounts-password`, or at minimum bcrypt/scrypt/argon2 with a real work factor, `crypto.timingSafeEqual` for comparison, an identical error for both failure modes, a `DDPRateLimiter` rule, and a maximum password length.

Note that adding `accounts-password` pulls in `bcrypt`, which introduces a native compiled dependency and would change the multi-architecture Docker build calculus described in `docs/deployment-manual.md`.

---

## D9 - Conditional `return null` between two hooks

**Status: fixed.** Kept because the analysis below is still the reason the code looks the way it does.

`PlayerLobby.jsx:376-379` sits **between** the `useEffect` at `:369` and the `useEffect` at `:380`.

When that branch is taken, React renders 8 hooks instead of 9 and throws `Rendered fewer hooks than expected`.

Two further problems in the same block:
- `navigate()` is called during render at `:377`, which is a side effect in the render phase.
- `!isLoading` at `:381` tests a **function object**, not a boolean, so that effect is dead code.

**Fix:** move the early return below all hook calls, and move the `navigate()` into an effect. `eslint-plugin-react-hooks` would catch this automatically, which is a concrete argument for adding ESLint (there is none in this repo today).

---

## D10 - `HostView` is missing its `navigate` prop

**Status: fixed.** Kept for the failure mode, which was masked by a race and so looked like it worked.

`PlayerLobby.jsx:419` renders `<HostView room={room} playerName={playerName} onBack={onBack} />`, but `HostView` destructures `navigate` at `:110` and calls it at `:124`.

The host's "Start Game" callback throws `TypeError: navigate is not a function` after `rooms.start` succeeds.
It only appears to work because the parent effect at `:369-374` races it and navigates first.

**Fix:** pass `navigate` down, or call `useNavigate()` inside `HostView`.

---

## D11 - Root `package-lock.json` is desynced

Root `package-lock.json` declares a dependency on `@meteorjs/rspack@^2.0.1`, while root `package.json` has no `dependencies` block at all and `app/package.json` pins `^1.0.0` (a different major).
It also carries a stale `"name": "2026W1-Kimply"` against the actual `"kimply-workspace"`.

`npm ci` at the repository root fails today.

This is currently harmless because everything runs with `working-directory: app`, but it will break the first root-level CI or tooling step that is added.

**Fix:** regenerate the root lockfile from the root `package.json`, or delete it if the root is not meant to be an npm project.

---

## D12 - A new `AudioContext` per tile click

`ColourSequence.jsx:80-92` constructs a new `AudioContext` on every tile click and never closes it.
Browsers cap the number of live contexts per document, so a long game eventually throws and click feedback silently stops.

**Fix:** create one context lazily, reuse it, and resume it on first user gesture.

---

## D14 - `npm run format:check` fails on `main`

Twelve files are Prettier-dirty on `main`, predating any deployment work.
Prettier is the only style gate in this repository (there is no ESLint), and it cannot become a CI gate while the default branch fails it.

The cost of leaving it is that every branch inherits the dirt, so no diff can be trusted to be formatting-clean.

**Fix:** one dedicated commit that runs `meteor npm run format` and changes nothing else, so it can be reviewed as a no-op and skipped in `git blame`.

---

## D18 - Game page scrolls into empty space below the play area - **fixed 2026-08-31**

The gameplay container in `GamePage` used `minHeight: '100vh'` with `overflowY: 'auto'`. On mobile browsers `100vh` resolves to the largest viewport height (as if the toolbar were hidden), so the container was taller than the visible area and left a strip of empty space the user could scroll into.

**Fix (applied):** size the container with `100dvh` (dynamic viewport height), which follows the visible area as the browser chrome shows/hides, so there is no empty space to scroll into. Legitimate overflow on short screens still scrolls via `overflowY: 'auto'`. `app/imports/ui/pages/GamePage.jsx`.
## D17 - Lives display hardcoded to 3 and shrinks instead of greying out - **fixed 2026-08-31**

`GamePage` computed `totalLives` only for the `'custom'` mode:

```js
const totalLives = room?.gameMode === 'custom' ? (room.customSettings?.startingLives ?? 3) : 3;
```

but preset modes (`easy`, `medium`, `hard`, `battle_royale`) also store their lives in `customSettings.startingLives` and are not `'custom'`, so this fell back to 3. The heart track also ignored `totalLives` and sized itself off `Math.max(player.lives, 3)`, so losing a life removed a circle rather than greying it out. `players.join` already sets `lives: startingLives`, so the value was right - only the display was wrong.

**Fix (applied):** read `totalLives` from `customSettings.startingLives` for every mode, render a fixed `totalLives`-circle track, and grey circles above the current life count. `app/imports/ui/pages/GamePage.jsx`.
## D16 - Tiles clickable during the post-mistake sequence replay - **fixed 2026-08-31**

On a wrong guess with lives left, `GamePage.handleSubmit` re-enabled input and restarted the sequence replay together:

```js
setAttemptedSequence([]);
setPlayerCanInput(true);
setReplayKey((prev) => prev + 1);
```

`replayKey` restarts `ColourSequence` playback, but `playerCanInput` was already `true`, so the tiles accepted clicks throughout the replay - a player could click each tile as it lit up and copy the answer. A fresh round instead starts with input disabled and only re-enables it from `onSequenceComplete`.

**Fix (applied):** set `playerCanInput` to `false` on the retry path; the replay re-enables input via `onSequenceComplete` when it finishes. `app/imports/ui/pages/GamePage.jsx`.
## D15 - Room code input drops keystrokes - **fixed 2026-08-31**

On `/play/join`, `JoinRoom.handleInput` read the freshly typed character inside a `setCode` functional updater, then cleared the hidden capture input in the same handler:

```js
setCode((prev) => appendRoomCodeInput(prev, e.target.value, SLOTS));
setError('');
clearCapturedInput(e); // e.target.value = ''
```

React evaluates a `useState` functional updater eagerly only when the fiber has no pending work. When it cannot (fast typing, or a render already scheduled), the updater runs at render time - after `clearCapturedInput` has blanked `e.target.value` - so `appendRoomCodeInput` appends `''` and the keystroke is lost. Players saw the first letter (and intermittently later ones) vanish and had to type the code twice.

**Fix (applied):** capture `e.target.value` into a local, clear the input, then update state from the local so the updater never depends on the mutated DOM node. `app/imports/ui/pages/JoinRoom.jsx:30`.

The ID is D15 because D13 is a deliberate gap (see the note at the top of this file).

---

## Structural issues that are not bugs but shape future work

**Duplicated sequence generator.** `generateSequence` exists identically in `imports/api/sequence.js:9` and `imports/api/gameMethods.js:9`.
The live game uses the `gameMethods.js` copy; `tests/sequence.test.js` covers the `sequence.js` copy.
The tested function is therefore not the one the game runs.

**The current-round sequence is necessarily on the client.** Phase 1 removed other rooms' sequences, past rounds' sequences, and other players' `attemptedSequence` from what is published.
A player's own current-round sequence still reaches their browser, because the client must have it to animate the playback (`GamePage.jsx:287` into `ColourSequence.jsx:72`).
Genuinely preventing same-round cheating needs a server-timed reveal plus server-side enforcement of the submission window, which is a redesign rather than a fix.

**Sequences use `Math.random()`.** `sequence.js:10` and `gameMethods.js:10` are not cryptographically random, so future sequences are in principle predictable from observed ones.
This only matters once the reveal timing above is addressed.
