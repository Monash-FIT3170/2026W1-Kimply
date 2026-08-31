# Kimply Design System

Multiplayer memory challenge. This document is the single source of truth for how Kimply looks, sounds, and behaves. Check here before designing or building anything new.

**Status:** v0.1 · Active
**Owner:** Design

---

## Contents

- [Principles](#principles)
- [Logo](#logo)
- [Color](#color)
- [Typography](#typography)
- [Spacing & layout](#spacing--layout)
- [Radii & elevation](#radii--elevation)
- [Motion](#motion)
- [Components](#components)
- [Patterns](#patterns)
- [Voice & copy](#voice--copy)
- [CSS tokens](#css-tokens)
- [Contributing](#contributing)

---

## Principles

**Playful, not loud.** Color earns its keep. One vibrant primary, one signature tile palette, used in moments — not on every surface.

**Fast to grasp.** A new player understands any screen in two seconds. Large titles, generous spacing, no decorative text.

**Pressure under levity.** It's a memory game. Celebrate wins, never patronise. Motion is short. Confirmation is single-tap.

**Multiplayer first.** Every layout assumes other people. Room codes, player lists, and status chips are first-class.

---

## Logo

The mark is the **KIMPLY** wordmark in Outfit 800, paired with a 2×2 tile cluster in fixed order: **pink → amber → teal → violet**, top-left to bottom-right.

| Rule | Value |
|---|---|
| Wordmark | Outfit 800, letter-spacing `-0.025em` |
| Cluster position | Right of wordmark, top-aligned to cap-height |
| Cluster width | ≈ wordmark cap-height |
| Cluster gap | cluster width ÷ 11 |
| Tile radius | 22% of tile size |

**Sizes:** 16–24px favicon · 24px top bar · 56px+ hero.

**Variants:** primary (wordmark + cluster) · submark (cluster alone) · favicon (cluster on ink tile, 14px radius).

**Don't:** stack the cluster above the wordmark, reorder or recolor the tiles, use a single tile alone as a mark, or recolor the wordmark to anything but `--fg`, `--bg`, or `--primary`-on-dark.

---

## Color

Neutrals carry ~95% of surface area. The tile palette is the game's signature — used for memory tiles, the logo, avatars, and small accents. Lime is reserved for the single most important action on a screen.

### Neutrals

| Token | Hex | OKLCH | Use |
|---|---|---|---|
| `--bg` | `#1f2030` | `oklch(0.14 0.02 270)` | Page background |
| `--surface` | `#2a2b3a` | `oklch(0.20 0.02 270)` | Cards, inputs, rows |
| `--surface-2` | `#33344a` | `oklch(0.24 0.02 270)` | Raised / filled states |
| `--hairline` | `#494a5e` | `oklch(0.32 0.02 270)` | 1px borders, dividers |
| `--fg` | `#f7f6f0` | `oklch(0.97 0.006 80)` | Primary text |
| `--fg-2` | `#b0b1bd` | `oklch(0.72 0.01 270)` | Secondary text |
| `--fg-3` | `#7a7b8c` | `oklch(0.55 0.015 270)` | Meta, labels, placeholders |

### Tile palette

Assign in fixed order. When mapping players to colors, follow this sequence.

| Token | Hex | OKLCH |
|---|---|---|
| `--tile-pink` | `#ee6f7c` | `oklch(0.72 0.19 12)` |
| `--tile-amber` | `#f4ba53` | `oklch(0.83 0.16 80)` |
| `--tile-teal` | `#5ec7c8` | `oklch(0.78 0.13 195)` |
| `--tile-violet` | `#9968d7` | `oklch(0.66 0.19 295)` |

### Primary

| Token | Hex | OKLCH | Use |
|---|---|---|---|
| `--primary` | `#c8e94d` | `oklch(0.86 0.19 130)` | The one key CTA per screen |

Soft tint for pulsing states and chip backgrounds: `color-mix(in oklab, var(--primary) 14%, var(--bg))`

**Rules**
- One lime element per screen, maximum.
- Tile colors only on game-meaningful elements. Never as page backgrounds.
- Don't introduce new hues. Propose additions instead.

---

## Typography

Three families, three jobs.

| Family | Job | Weights |
|---|---|---|
| **Outfit** | Display, titles, buttons, wordmark | 500 · 600 · 700 · 800 |
| **Manrope** | Body, helper text, descriptions | 400 · 500 · 600 · 700 |
| **JetBrains Mono** | Room codes, HUD labels, numerics | 400 · 500 · 600 · 700 |

### Scale

| Role | Size / weight | Family | Tracking |
|---|---|---|---|
| Display | 56px / 800 | Outfit | `-0.025em` |
| H1 | 36–48px / 800 | Outfit | `-0.02em` |
| H2 | 22px / 700 | Outfit | `-0.01em` |
| Body | 16px / 500 | Manrope | normal |
| Small | 13px / 500 | Manrope | normal |
| Label | 11px / 600 uppercase | JetBrains Mono | `0.18em` |
| Code | 42px / 700 | JetBrains Mono | normal |

Mono uppercase tracked labels sit above titles — they are the game's HUD voice.

**Don't:** mix in another display face, render room codes in Outfit, or justify body text.

```html
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
```

---

## Spacing & layout

4px base unit. Use tokens, never raw px.

| Token | px | Use |
|---|---|---|
| `--s-1` | 4 | Tile cluster gaps, compact chip padding |
| `--s-2` | 8 | Icon-to-text gap, tight inline rows |
| `--s-3` | 12 | Standard gap between siblings |
| `--s-4` | 16 | Compact card padding, button vertical padding |
| `--s-5` | 24 | Default card padding |
| `--s-6` | 32 | Between major blocks |
| `--s-7` | 48 | Desktop screen-edge padding |
| `--s-8` | 64 | Hero breathing room |

### Breakpoints

| Range | Layout |
|---|---|
| ≤ 480px | Single column. Route cards stack. Player list 1 col. CTAs full-width. |
| 481–1024px | 2-col route cards. Player list 1–2 cols. |
| ≥ 1025px | 2-col route cards. Player list `auto-fill, minmax(260px, 1fr)`. Max content 720–1080px. |

Use flex/grid with `gap`. Never margin-based spacing between siblings.

---

## Radii & elevation

| Token | Value | Use |
|---|---|---|
| `--r-sm` | 6px | Underline accents, small chips |
| `--r-md` | 10px | Inputs, ghost buttons |
| `--r-lg` | 14px | Cards, code slots |
| `--r-xl` | 18px | Route cards, hero panels |
| `--r-pill` | 999px | Status chips |

| Elevation | Value |
|---|---|
| Flat | `1px solid var(--hairline)` |
| Raised | `0 6px 18px -10px rgba(0,0,0,0.5)` |
| Primary glow | `0 12px 40px -10px color-mix(in oklab, var(--primary) 70%, transparent)` |

Primary glow is for lime CTAs only.

---

## Motion

Motion conveys state. It does not decorate.

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(.2,.7,.3,1)` | Default for all UI state changes |
| `--ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | Tile flips, ready toggle, win celebration |
| `--dur-fast` | `120ms` | Hover, focus, ghost button states |
| `--dur-base` | `240ms` | Card mounts, route transitions |

### Named animations

```css
@keyframes kimplyPulse {
  0%, 100% { transform: scale(1);   opacity: 1; }
  50%      { transform: scale(1.6); opacity: 0.5; }
}
/* Pending / waiting states — 1.4s ease-in-out infinite */

@keyframes kimplyCaret {
  0%, 49%   { opacity: 1; }
  50%, 100% { opacity: 0; }
}
/* Active text input — 1s steps(2) infinite */
```

---

## Components

### Buttons

One primary per screen.

**Primary** — `--primary` fill, `--bg` text, 14px/24px padding, 12px radius, primary glow. Outfit 800, 14px, uppercase, `0.14em`.
Disabled: `color-mix(in oklab, var(--primary) 30%, var(--bg))`, `cursor: not-allowed`.

**Ghost** — transparent fill, 1px `--hairline` border, 9px/14px padding, 9px radius. Outfit 600, 12px, uppercase, `0.1em`.

**Icon** — 32×32 (bare) or 36×36 (with `--surface` fill and hairline border), 8–10px radius.

Minimum hit target on touch: **44×44**.

### Inputs

**Text input (avatar-led)** — `--surface` fill, hairline border, 14px radius, 14px/18px padding. Avatar circle left (36px), value in Outfit 600 18px, hint below in Mono 10px `--fg-3`.

**Code slot** — 5 slots. 56–76px wide × 72–96px tall, 12–16px radius, Mono 700 at 36–56px.

| State | Treatment |
|---|---|
| Empty | `--surface`, no border |
| Active | `--surface`, 2px `--primary` border, `0 0 0 4px` primary @22% ring, blinking caret |
| Filled | `--surface-2`, hairline border, tile-colored 3px underline |
| Error | 2px `--tile-pink` border |

### Chips

| Chip | Treatment |
|---|---|
| Ready | Primary @16% bg, primary text, primary @40% border, 6px dot, pill |
| Waiting | Transparent, hairline border, `--fg-3` text, pill |
| Room code | `--surface`, hairline border, 10px radius. Mono label + Mono 700 code |
| Pulse meta | Amber dot with `kimplyPulse` + Mono 11px amber text |

All chip text: Outfit 600–700, 11px, uppercase, `0.12em`.

### Player row

`--surface` fill, hairline border, 12px radius, 10px/14px padding, 12px gap.
Avatar (32px circle, gradient from assigned tile color, `--bg` initial) → name block (Outfit 600 14px + Mono 9px uppercase role) → status chip.

**Variants:** filled · empty (dashed border, dashed avatar outline, "Empty slot") · you (appends `· you` in `--fg-3`).

### Cards

**Surface card** — `--surface`, hairline border, 18px radius, 22px padding. For lists, panels, code displays.

**Action card** — `--primary` fill, `--bg` text, 18px radius, primary glow. For the one primary route choice only.

---

## Patterns

### Top bar
Wordmark left, contextual control right (version on splash, back button elsewhere). 22px/28px padding. Sticky on tablet+, static on mobile.

### Code entry
Mono uppercase label → 5 code slots → helper text → primary CTA.
CTA stays disabled until all 5 characters are entered.

### Lobby
Title row (mono eyebrow + H1, room chip right) → gradient progress bar → player grid → primary CTA pinned bottom.
Player count always renders as `n/cap`, e.g. `PLAYERS (5/8)`. Unfilled seats use the dashed Empty slot row.

### Room code display
Panel with a 4px tile-gradient band across the top edge, mono uppercase label, 5 code tiles each with a tile-colored underline, then Copy / Share ghost buttons.

---

## Voice & copy

Kimply talks like a quietly confident host. Direct, second person, present tense. Never gimmicky, never apologetic.

| | |
|---|---|
| **We are** | Direct · concise · playful — "Click anywhere to play." |
| **We are not** | Cute · cluttered · corporate — avoid "Oopsies!", "Get ready to crush it 🎉" |
| **Under pressure** | Plainspoken — "Wrong tile. Try again." |

### Rules

| Rule | Example |
|---|---|
| UI labels | Title Case — "Create Room", "Start Game" |
| Mono labels | UPPERCASE — "ENTER ROOM CODE", "PLAYERS (5/8)" |
| Body copy | Sentence case — "Start a new game and invite friends." |
| Room codes | 5 chars, A–Z + 0–9, uppercase — "K3210" |
| Numbers | Numerals — "3 lives", "Level 5". Never "three lives". |
| Counts | `x/y` with the cap — "PLAYERS (5/8)" |
| Punctuation | No exclamation marks, except genuine win/loss moments |
| Errors | State + recovery — "Wrong tile tapped. Try again." |

---

## CSS tokens

Drop this into your global stylesheet.

```css
:root {
  /* Neutrals */
  --bg:        oklch(0.14 0.02 270);
  --surface:   oklch(0.20 0.02 270);
  --surface-2: oklch(0.24 0.02 270);
  --hairline:  oklch(0.32 0.02 270);
  --fg:        oklch(0.97 0.006 80);
  --fg-2:      oklch(0.72 0.01 270);
  --fg-3:      oklch(0.55 0.015 270);

  /* Tile palette — fixed order */
  --tile-pink:   oklch(0.72 0.19 12);
  --tile-amber:  oklch(0.83 0.16 80);
  --tile-teal:   oklch(0.78 0.13 195);
  --tile-violet: oklch(0.66 0.19 295);

  /* Primary */
  --primary: oklch(0.86 0.19 130);

  /* Radii */
  --r-sm: 6px; --r-md: 10px; --r-lg: 14px; --r-xl: 18px; --r-pill: 999px;

  /* Spacing — 4px base */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-7: 48px; --s-8: 64px;

  /* Motion */
  --ease-out:    cubic-bezier(.2, .7, .3, 1);
  --ease-spring: cubic-bezier(.34, 1.56, .64, 1);
  --dur-fast: 120ms;
  --dur-base: 240ms;

  /* Type */
  --font-display: 'Outfit', system-ui, sans-serif;
  --font-body:    'Manrope', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;

  /* Elevation */
  --elev-raised: 0 6px 18px -10px rgba(0, 0, 0, 0.5);
  --elev-primary: 0 12px 40px -10px color-mix(in oklab, var(--primary) 70%, transparent);
}
```

### Favicon

```html
<meta name="theme-color" content="#1f2030" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
```

---

## Contributing

The system grows by addition, not by drift.

1. **Check first.** Look here before designing something new. Most of the time the answer already exists.
2. **Propose.** If something genuinely new is needed: a sketch, a use case, and why no existing component fits.
3. **Adopt.** Once approved, document it here with spec and example, then add a changelog entry.

### Ownership

| Area | Owner |
|---|---|
| Logo, color, type | Design lead |
| Tokens, motion | Design + engineering |
| Copy & voice | Author writes, design lead reviews |
| Components & patterns | Engineering, design reviews additions |

---

## Changelog

| Version | Date | Change |
|---|---|---|
| v0.1 | 2026-08-29 | Initial system. Covers brand, tokens, components, and patterns for the room create / join flow. |
