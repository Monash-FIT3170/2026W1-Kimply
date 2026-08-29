---
name: ui
description: >-
  Change UI using the shared design system, Tailwind tokens, and existing
  components. Use when editing pages, components, styling, design tokens, or
  client routes.
---

# UI

**Read `docs/design_system.md` first.** Colour, type, spacing, components, and voice live there. Propose genuinely new visual language into that document rather than inventing it in a component.

How tokens are wired:

- Implementation: `app/imports/ui/components/design.jsx` (not `imports/ui/design.jsx`).
- Tailwind: `app/tailwind.config.js`. Prefer those classes over duplicating values in JS.
- Inline `style` only for what Tailwind cannot express (`color-mix()`, `oklch` in `box-shadow`, dynamic gradients).
- Content globs are `./imports/**` and `./client/**` only. A class used from anywhere else is purged in production.

Reuse components already exported from `design.jsx` before drawing new chrome. If a JS token and a Tailwind token disagree, prefer the class and do not widen the drift — fix it in the design document if the screen needs a new value.

Routes and screen inventory are in `AGENTS.md`. Update that table when you add a route.

## Verify in the browser

A screenshot is not enough. Exercise the changed flow the way a user would: click, type, submit, navigate. Then hit every other route that reads the same state. Check empty / error / missing-state paths, and a mobile width if layout changed.
