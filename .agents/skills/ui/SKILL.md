---
name: ui
description: >-
  Change Kimply UI using the shared design system, Tailwind tokens, and
  existing page/component patterns. Use when editing pages, components,
  styling, design tokens, ColourSequence, leaderboard, lobby, or routes.
---

# UI

Design system: `app/imports/ui/components/design.jsx` — **not** `imports/ui/design.jsx`.

Reuse `TileLattice`, `Wordmark`, `TopBar`, `BackButton`, `Avatar`, `avatarColor`, `DangerButton`, `GhostButton`, `ReadyChip`, and the icon helpers before drawing new chrome.

## Tokens

Prefer Tailwind classes from `app/tailwind.config.js`: `bg-bg`, `bg-surface`, `text-fg`, `text-fg2`, `text-fg3`, `border-hairline`, `text-primary`, `font-outfit`, `font-manrope`, `font-mono`, `animate-kimply-pulse`.

Outfit for titles and buttons, Manrope for body, JetBrains Mono for PINs and uppercase labels.

JS constants in `design.jsx` (`BG`, `PRIMARY`, `TILE.*`, `DANGER`, …) exist for values Tailwind cannot express. Inline `style` is allowed **only** for `color-mix()`, `oklch` in `box-shadow`, and dynamic gradients.

`SURFACE` in `design.jsx` is `oklch(0.18 …)`; the Tailwind `surface` token is `oklch(0.20 …)`. Prefer the class `bg-surface` for new work so screens match.

Content globs are `./imports/**` and `./client/**` only. A class used from anywhere else is purged in production.

## Routes that share state

`location.state` (`playerName`, `pin`, `playerId`, `isHost`, `playerAccount`) is how lobby, game, and account screens talk. It survives F5 on the same history entry, not a new tab.

| Path | Component |
|---|---|
| `/` | `Splash` |
| `/play` | `PlayRoute` |
| `/play/join` | `JoinRoom` |
| `/play/:pin` | `PlayerLobby` |
| `/game` | `GamePage` |
| `/account` | `Account` |

`GamePage` needs `location.state.pin`. With no pin it must show the "no game selected" screen — never subscribe to `'demo'`.

A live leaderboard is `Leaderboard.jsx` + `leaderboardModels.js` (rows from `players` + current `rounds`, not the `leaderboard` collection). End-of-game ranking is `EndLeaderboard.jsx`.

## Do not

- Do not create a new `AudioContext` per tile click (D12 in `ColourSequence.jsx`). Reuse one context if you touch sound.
- Do not add a login wall. Anonymous play is intended.
- Do not treat the empty `position: fixed; z-index: 2147483647` overlay under the username field as app markup. It is a browser-extension overlay outside `#react-target`.

## Verify in the browser

A screenshot is not enough. Exercise the changed flow the way a player would: click, type, submit, navigate. Then hit every other route that reads the same state. Check empty / error / missing-`location.state` paths, and a mobile width if layout changed.
