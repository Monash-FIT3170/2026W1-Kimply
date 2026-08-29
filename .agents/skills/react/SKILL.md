---
name: react
description: >-
  Wire React 18 components to Meteor data with react-meteor-data and React
  Router v7 the way this app already does it. Use when adding a component,
  subscribing to a publication, calling a method from the client, moving state
  between routes, or debugging a hooks or re-render problem.
---

# React + reactive data

React 18, `react-meteor-data@4.0.1`, `react-router-dom@7`.
Styling, tokens, and the design system are the `ui` skill. This one is about data and hooks.

## Reading data

`useTracker(fn, deps)` runs `fn` in a Tracker computation and re-renders on change.

- Return plain values, not cursors. `Collection.find(...).fetch()` or `findOne(...)`.
- Always pass the deps array. Without it the computation is rebuilt on every render.
- Minimongo is synchronous on the client. Do **not** use the `*Async` collection methods inside `useTracker`.
- Guard on the inputs first (`if (!gameId) return null;`), because the component renders before `location.state` and before the subscription is ready.

## Subscribing

Three styles already exist. Prefer the first two for new code.

1. **Inside `useTracker`, gated on `ready()`** - `Leaderboard.jsx:9-24`. The computation stops the subscription for you, and `ready` rides along in the returned object.

```js
const { rows, ready } = useTracker(() => {
  const sub = Meteor.subscribe('players', gameId);
  if (!sub.ready()) return { rows: [], ready: false };
  return { rows: PlayersCollection.find({ gameId }).fetch(), ready: true };
}, [gameId]);
```

2. **`useSubscribe`** - `PlayerLobby.jsx:366`. It returns a **function**, not a boolean. Call it: `isLoading()`.
   `!isLoading` negates a function and is always `false`. That exact mistake produced dead code that shipped (D9).

3. **`Meteor.subscribe` in a `useEffect` with a `stop()` cleanup** - `GamePage.jsx:26-33`. Correct, but you own the teardown. If you use it, return the cleanup.

Never subscribe with a placeholder `gameId` such as `'demo'`. Publications are scoped, so a placeholder subscribes to a game that does not exist and hangs on LOADING forever.

## Calling methods

Methods have no client stub (they are registered behind `Meteor.isServer`), so nothing is applied optimistically and every call round-trips.

```js
Meteor.call('players.join', roundId, playerName, gameId, (error, result) => {
  if (error) { setMessage('Could not join the game.'); return; }
  setPlayerId(result);
});
```

Put the failure into UI state. A `console.error` alone leaves the player looking at a frozen screen.

## Hooks discipline

Every hook must run on every render.
`PlayerLobby.jsx` has an early `return null` on the redirect path, and everything below it is hook-free on purpose - the comment there records the "Rendered fewer hooks than expected" crash that a `useEffect` after that return caused (D9). Do not add one.

Effects keyed on `round?._id` are how the game resets per-round input state. Keep the deps honest; adding a value to the body without adding it to the deps is how stale rounds leak into the next one.

## State between routes

`location.state` carries `playerName`, `pin`, `playerId`, `isHost`, and `playerAccount`.
It lives in `window.history.state.usr`, so it survives F5 on the same history entry but not a new tab, a shared link, or a cold load.

Every screen that reads it needs a defined no-state path. `GamePage` renders "no game selected" when `location.state.pin` is missing; the display name falls back to `'Demo Player'`.

In-game `playerId` lives only in React state (`GamePage.jsx:12`), so a refresh re-fires `players.join` and mints a second player with fresh lives (D7). Do not add a second copy of that state without fixing D7 properly.

## Routes

`app/client/main.jsx` uses `BrowserRouter`, so deep links depend on the server serving `index.html` for unknown paths.

| Path | Component |
|---|---|
| `/` | `Splash` |
| `/play` | `PlayRoute` |
| `/play/join` | `JoinRoom` |
| `/play/:pin` | `PlayerLobby` |
| `/game` | `GamePage` |
| `/account` | `Account` |
| `*` | `Navigate to="/"` |

There are two identical `path="*"` routes (`main.jsx:24` and `:26`). React Router v7 ranks by specificity, so `/account` still matches; the duplicate is dead code, not a bug to chase.

Add a route in `main.jsx` and update the tables in `AGENTS.md` and the `ui` skill in the same change.
