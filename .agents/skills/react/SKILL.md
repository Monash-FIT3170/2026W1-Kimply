---
name: react
description: >-
  Wire React 18 components to Meteor data with react-meteor-data and React
  Router v7 the way this app already does it. Use when adding a component,
  subscribing, calling a method from the client, moving state between routes,
  or debugging a hooks or re-render problem.
---

# React + reactive data

React 18, `react-meteor-data`, React Router v7. Styling is the `ui` skill. Routes and screen inventory are in `AGENTS.md`.

## Reading data

`useTracker(fn, deps)` runs `fn` in a Tracker computation and re-renders on change.

- Return plain values, not cursors: `Collection.find(...).fetch()` or `findOne(...)`.
- Always pass the deps array.
- Minimongo is synchronous on the client. Do **not** use `*Async` collection methods inside `useTracker`.
- Guard on inputs first (`if (!id) return null`). The component renders before navigation state and before the subscription is ready.

## Subscribing

Prefer (1) or (2) for new code.

1. **Inside `useTracker`, gated on `ready()`** — the computation stops the subscription for you.

```js
const { docs, ready } = useTracker(() => {
  const sub = Meteor.subscribe('somePub', arg);
  if (!sub.ready()) return { docs: [], ready: false };
  return { docs: SomeCollection.find({ arg }).fetch(), ready: true };
}, [arg]);
```

2. **`useSubscribe`** returns a **function**, not a boolean. Call it: `isLoading()`. `!isLoading` is always false.

3. **`Meteor.subscribe` in a `useEffect`** is fine if you return `() => sub.stop()`.

Do not subscribe with a placeholder id for a document that does not exist. A scoped publication will never become ready.

## Calling methods

Methods have no client stub, so every call round-trips.

```js
Meteor.call('some.method', arg, (error, result) => {
  if (error) { setMessage('That failed.'); return; }
  setResult(result);
});
```

Put the failure into UI state. A `console.error` alone looks like a freeze.

## Hooks and navigation state

Every hook must run on every render. Do not put `useEffect` / `useTracker` after a conditional `return`.

`location.state` lives in `window.history.state.usr`. It survives F5 on the same history entry, not a new tab, a shared link, or a cold load. Every screen that reads it needs a defined no-state path.

Add a route in `app/client/main.jsx` and update the routing table in `AGENTS.md` in the same change. `BrowserRouter` means the server must serve `index.html` for unknown paths.
