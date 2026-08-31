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

## 2026-08-31 - Locked tile input during the post-mistake sequence replay (D16)

After a wrong guess with lives remaining, `GamePage.handleSubmit` set `playerCanInput` to `true` and bumped `replayKey` in the same breath, so the colour tiles stayed clickable while the sequence replayed and a player could copy the answer as each tile lit up.
Set `playerCanInput` to `false` on the retry path and let `onSequenceComplete` re-enable it after the replay, matching the fresh-round flow. Non-obvious: the retry replay reuses the same `roundId`, so re-enabling has to be driven by the replay finishing, not by a round change.
Files: `app/imports/ui/pages/GamePage.jsx`, `docs/defect-register.md` (D16).

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
