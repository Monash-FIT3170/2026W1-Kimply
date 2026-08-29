---
name: ui
description: >-
  Change Kimply UI against the design system in docs/design_system.md, using
  Tailwind tokens and the existing component set. Use when editing pages,
  components, styling, design tokens, ColourSequence, leaderboard, lobby, or
  routes.
---

# UI

**Read `docs/design_system.md` first.**
It is the source of truth for colour, typography, spacing, radii, elevation, motion, component specs, patterns, and voice. Most "what should this look like" questions are already answered there, and anything genuinely new is proposed into that document rather than invented in a component.

Its rules bind: one lime element per screen maximum, tile colours only on game-meaningful elements, tile colours assigned in the fixed order pink → amber → teal → violet, and no new hues.

This skill covers only how that system is wired into the code.

Implementation lives in `app/imports/ui/components/design.jsx` — **not** `imports/ui/design.jsx`.

Reuse `TileLattice`, `Wordmark`, `TopBar`, `BackButton`, `Avatar`, `avatarColor`, `DangerButton`, `GhostButton`, `ReadyChip`, and the icon helpers before drawing new chrome.

## Tokens

The app defines **no** `:root` custom properties. The CSS block in the design document is a specification; do not paste it in.

Use the Tailwind classes from `app/tailwind.config.js`, whose values match the design document exactly: `bg-bg`, `bg-surface`, `bg-surface2`, `text-fg`, `text-fg2`, `text-fg3`, `border-hairline`, `text-primary`, `bg-tile-pink|amber|teal|violet`, `font-outfit`, `font-manrope`, `font-mono`, `animate-kimply-pulse`.

Outfit for titles and buttons, Manrope for body, JetBrains Mono for PINs and uppercase labels.

JS constants in `design.jsx` exist for values Tailwind cannot express. Inline `style` is allowed **only** for `color-mix()`, `oklch` in `box-shadow`, and dynamic gradients.

**`design.jsx` has drifted from the design system.** Prefer the Tailwind class wherever both exist:

| Token | `docs/design_system.md` and `tailwind.config.js` | `design.jsx` |
|---|---|---|
| surface | `oklch(0.20 0.02 270)` | `SURFACE` is `oklch(0.18 0.02 270)` |
| fg | `oklch(0.97 0.006 80)` | `FG` is `oklch(0.96 0.01 270)` |
| fg-3 | `oklch(0.55 0.015 270)` | `FG3` is `oklch(0.50 0.01 270)` |
| n/a | not documented | `DANGER`, `ACCENT` |

Do not widen the drift. If a screen needs `DANGER` or `ACCENT`, that is a gap to propose into the design document, not a new constant.

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
