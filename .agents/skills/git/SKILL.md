---
name: git
description: >-
  Create a GitHub issue, cut a named branch from origin/dev, and open a pull
  request targeting dev. Use when starting work, creating a branch, opening a
  PR, or when the user mentions issues, feature/fix/bug branches, gh, or git
  workflow.
---

# Git

Integration branch is `dev`. `main` is production. Never push to either.

Do not commit unless the user asked. Do not force-push `main` or `dev`.

Every new branch is created **with** a GitHub issue. If `gh` or git cannot run (not installed, not authenticated, sandbox), print the exact commands and stop. Do not skip the issue.

## 1. Issue first

If an issue already exists, use it. Otherwise create one:

```bash
gh issue create --title "<short title>" --body "$(cat <<'EOF'
## Why
<problem or opportunity>

## What
<intended change>

## Done when
- [ ] <observable outcome>
EOF
)"
```

Use the returned number as `<n>` below. Do not invent a number.

## 2. Branch from origin/dev

Prefix by kind of work:

| Prefix | When |
|---|---|
| `feature/` | New behaviour |
| `fix/` | Bug fix (preferred) |
| `bug/` | Same as `fix/` if the user says "bug" |
| `chore/` | Docs, skills, formatting, tooling |

```bash
git fetch origin
git checkout dev
git pull --ff-only origin dev
git checkout -b <prefix>/<n>-<slug>
```

`<slug>` is lowercase, hyphenated, 3–6 words. Example: `feature/42-live-elimination-feed`.

Already on a branch with no issue? Create the issue, put `#<n>` in the PR, and offer to rename:

```bash
git branch -m <prefix>/<n>-<slug>
```

## 3. Pull request → `dev`

After the user asks to open a PR:

```bash
git push -u origin HEAD
gh pr create --base dev --title "<title>" --body "$(cat <<'EOF'
## Summary
- <what changed and why>

Closes #<n>

## Test plan
- [ ] <how to verify>
EOF
)"
```

Target `main` only when the user is cutting a production release.

If the branch has no issue yet, create the issue before the PR, then `Closes #<n>`.

## Commands to hand the user

When you cannot run the tools, print this filled in (issue title, slug, body) rather than a generic reminder:

```bash
gh issue create --title "TITLE" --body "## Why\n...\n## What\n...\n## Done when\n- [ ] ..."
git fetch origin && git checkout dev && git pull --ff-only origin dev
git checkout -b feature/N-slug
# after the user asks to open a PR:
git push -u origin HEAD
gh pr create --base dev --title "TITLE" --body "## Summary\n- ...\n\nCloses #N\n\n## Test plan\n- [ ] ..."
```
