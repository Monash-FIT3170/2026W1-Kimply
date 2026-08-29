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

Every new branch is created **with** a GitHub issue, then natively linked on that issue. If `gh` or git cannot run, print the exact commands and stop. Do not skip the issue. Do not "link" by pasting branch or PR URLs into the issue body — that is not a GitHub Development link.

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

## 2. Branch from origin/dev, linked on the issue

Prefix by kind of work:

| Prefix | When |
|---|---|
| `feature/` | New behaviour |
| `fix/` | Bug fix (preferred) |
| `bug/` | Same as `fix/` if the user says "bug" |
| `chore/` | Docs, skills, formatting, tooling |

`<slug>` is lowercase, hyphenated, 3–6 words. Example: `feature/42-live-elimination-feed`.

Create the branch **through GitHub** so it appears under the issue's Development sidebar:

```bash
git fetch origin
gh issue develop <n> --name <prefix>/<n>-<slug> --base dev --checkout
```

`gh issue develop` is what links the branch on the issue. `git checkout -b` alone does not.

If `gh issue develop` fails (branch name taken, no permission), fall back and tell the user to link it in the UI:

```bash
git checkout dev
git pull --ff-only origin dev
git checkout -b <prefix>/<n>-<slug>
```

Then: open the issue → **Development** → **Create a branch** / link this branch. Print that path; do not paste the tree URL into the issue body.

Already on a branch with no issue? Create the issue, then:

```bash
git branch -m <prefix>/<n>-<slug>
git push -u origin HEAD
gh issue develop <n> --name <prefix>/<n>-<slug> --base dev
```

If develop still will not attach, tell the user to link the branch from the issue Development sidebar.

## 3. Pull request → `dev`, closing the issue

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

`Closes #<n>` must be its own paragraph in the PR body (not in a code fence, not only in chat). That is what produces **"linked a pull request that will close this issue"** on the issue. Same keywords: `Closes`, `Fixes`, `Resolves`.

Target `main` only when the user is cutting a production release.

If the branch has no issue yet, create the issue before the PR, then `Closes #<n>`.

Verify the native link landed:

```bash
gh pr view --json closingIssuesReferences --jq '.closingIssuesReferences[].number'
```

That must print `<n>`. If it is empty, add the keyword and re-check:

```bash
gh pr edit --body "$(cat <<'EOF'
## Summary
- <same summary>

Closes #<n>

## Test plan
- [ ] <same plan>
EOF
)"
```

If it is still empty, tell the user: open the issue → **Development** → **Link a pull request** → select this PR. Do not edit the issue body with a markdown URL.

## Commands to hand the user

When you cannot run the tools, print this filled in rather than a generic reminder:

```bash
gh issue create --title "TITLE" --body "## Why\n...\n## What\n...\n## Done when\n- [ ] ..."
git fetch origin
gh issue develop N --name feature/N-slug --base dev --checkout
# after the user asks to open a PR:
git push -u origin HEAD
gh pr create --base dev --title "TITLE" --body "## Summary\n- ...\n\nCloses #N\n\n## Test plan\n- [ ] ..."
gh pr view --json closingIssuesReferences --jq '.closingIssuesReferences[].number'
```
