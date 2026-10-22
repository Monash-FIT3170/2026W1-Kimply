# Kimply

A real-time multiplayer colour-sequence memory game, like Simon Says.
Players join a room with a 5-character PIN, wait in a lobby, then compete through progressively longer colour sequences until one player is left.

No account is needed to play. Accounts exist only so a player can keep a history.

Live: [kimply.online](https://kimply.online) (production, `main`) and [dev.kimply.online](https://dev.kimply.online) (development, `dev`).

|                   |                                                        |
| ----------------- | ------------------------------------------------------ |
| Framework         | Meteor 3.4 (bundling, methods, reactive data over DDP) |
| UI                | React 18, React Router v7, Tailwind CSS 3              |
| Database          | MongoDB 7.0                                            |
| Bundler           | Rspack                                                 |
| Local environment | Docker Compose                                         |
| Hosting           | AWS ECS Fargate (arm64) behind an ALB, MongoDB Atlas   |

---

## 1. What you need

**Hardware.** Any machine from roughly the last five years.
Give Docker at least 4 GB of RAM (8 GB total on the machine is comfortable) and keep about 10 GB of free disk.
The Meteor build is the heavy part, not the game itself.

**Software.**

|                       | Why                                                                   | Get it                                                  |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| Git                   | Clone the repo                                                        | [git-scm.com](https://git-scm.com/downloads)            |
| Docker Desktop        | Runs everything. You do not install Meteor, Node, or MongoDB yourself | [docker.com](https://www.docker.com/get-started/)       |
| VS Code (recommended) | Editor. Workspace settings are committed                              | [code.visualstudio.com](https://code.visualstudio.com/) |
| GitHub CLI (`gh`), logged in | Issues, linked branches and PRs. The PR process in section 7 relies on `gh issue develop` and `gh pr create` | [cli.github.com](https://cli.github.com/) |
| WSL2 (Windows only)   | See below. Not optional                                               | Section 2                                               |

You do **not** need a Meteor, Node, or MongoDB install on your machine.
Everything runs inside containers.

**Only for infrastructure work or manual deploys.**

| Software | Needed for | Notes |
|---|---|---|
| AWS CLI v2 with credentials for the right environment | `deploy/ecs-deploy.sh`, `deploy/build-push.sh`, checking ECS, ECR and logs | Region `ap-southeast-2`. Dev and production use different roles |
| Terraform 1.10 or newer | `infra/terraform/` | 1.10 is required for S3-native state locking. The pipeline never runs Terraform; it is applied by hand |
| Docker with buildx (arm64) | `deploy/build-push.sh` by hand | Images are `linux/arm64` only. CI builds them on an arm64 runner |
| Node 22 | `loadtest/` scripts | Only if you run them outside a container |

**Accounts and access.**
Beyond the tools, you will need the GitHub repository (`Monash-FIT3170/2026W1-Kimply`), the AWS account (ap-southeast-2), the MongoDB Atlas projects for dev and production, the Route 53 hosted zone, GoDaddy (registrar only) and the Google Cloud project for sign-in.

---

## 2. Windows: set up WSL2 first

Docker on Windows must be driven from WSL2, and the repo must live inside the WSL2 filesystem.
Running from PowerShell, or cloning onto your Windows drive at `/mnt/c/...`, breaks file watching so hot reload silently stops working.
This is a Windows/Docker limitation, not a bug in the project.

1. In **PowerShell as Administrator**, run `wsl --install`, then restart.
   Ubuntu opens and asks for a Linux username and password. Pick anything.
   Already have WSL? `wsl --status` must report `Default Version: 2`.
2. In Docker Desktop, go to **Settings > Resources > WSL Integration**.
   Enable integration with your default distro, toggle Ubuntu on, then **Apply & Restart**.
3. Open the **Ubuntu** app from the Start menu.
   Every command in this README goes in that terminal, never PowerShell.

Mac and Linux need none of this. Just open a terminal.

---

## 3. Get it running

```bash
git clone https://github.com/Monash-FIT3170/2026W1-Kimply
cd 2026W1-Kimply
docker compose up
```

On Windows, clone into your Linux home (`cd ~` first), not `/mnt/c/...`.

With Docker Desktop running, `docker compose up` starts MongoDB and the Meteor dev server.
Wait for `App running at: http://localhost:3000`, then open <http://localhost:3000>.

Bot detection is on. The local compose file sets `HTTP_FORWARDED_COUNT` to `0` because the browser talks to Meteor directly. To play from an automated client while you are developing, set `BOT_DETECTION_ENABLED=false` in the root `.env` and restart. That value is ignored outside a development Meteor process.

**The first start takes 5 to 15 minutes** while Meteor downloads packages and compiles from scratch.
Later starts are much faster because the build is cached in a Docker volume.

Open VS Code on the project with `code .` from the same terminal.
On Windows this installs the WSL extension and reopens the project connected to WSL2, shown as **WSL: Ubuntu** in the bottom-left.
Saving a file hot-reloads the browser.

Three commands cover day-to-day work.
Everything else is ordinary Docker Compose, and `docker compose --help` is a better reference than this file.

```bash
docker compose up                                  # start MongoDB and the app on :3000
docker compose --profile test run --build --rm test  # run the test suite once
docker compose exec backend meteor npm run format  # Prettier, the only style gate
```

The tests run in their own container with a baked-in copy of `app/`, because a second Meteor process in the backend container cannot bind port 3000 and corrupts the dev server's build.
`--build` is what copies your latest changes in, so do not drop it.
`docker compose exec backend meteor npm test` fails with "Can't listen on port 3000" while the app is running.

Port 8080 must also be published, because Rspack's hot reload connects to it separately.
After changing published ports use `docker compose up -d --no-deps backend`; `docker compose restart backend` does not apply a new port mapping.

Install npm packages **inside the container** so they land in the container's `node_modules`, and do not rebuild the image afterwards:

```bash
docker compose exec backend meteor npm install <package>
```

---

## 4. How the code is laid out

Everything Meteor runs lives in `app/`.

```
app/
├── client/main.jsx     all client routes
├── server/             startup, publications, indexes, health
├── imports/api/        collections and Meteor methods (the whole game loop)
├── imports/ui/         pages, components, the design system
└── tests/              meteortesting:mocha specs
docs/                   design system, defect register, decision log, deployment
infra/                  Terraform and ECS task definitions for dev and production
deploy/ scripts/        build-push.sh, ecs-deploy.sh and health-check.sh (used by CI), plus the retired EC2 scripts
loadtest/               DDP load and smoke tests
.agents/skills/         per-task instructions for coding agents
```

`AGENTS.md` in the repo root is the real map: every collection, publication, method, route, test, and known defect in one table.
**Read it before reading `imports/api/`.**
`CLAUDE.md` is a symlink to it, and `.claude/skills` and `.cursor/skills` are symlinks to `.agents/skills`, so every tool sees one set of instructions.

---

## 5. Conventions

These are the rules that are not obvious from the code, and the ones most likely to be broken by accident.

**Anonymous play is deliberate.**
The game has no login wall and must not gain one.
`this.userId` is empty on purpose; do not "fix" it by adding authentication.

**All writes go through Meteor methods.**
`autopublish` and `insecure` are not installed and there are no `.allow()` or `.deny()` rules.
Adding any of them is a regression.

**Publications are scoped and projected, and that is load-bearing.**
`rounds` never carries `sequence`, so no client can read a round's answer.
`players` and `eliminations` exclude `attemptedSequence` (the answer a player submitted), `secret` (their sequence, draft and hand), `guard`, and `reconnectTokenHash`.
Each player receives their own `secret` only through `players.secret`, which is keyed on their connection.
Every game publication is scoped by `gameId`.
Removing any of those leaks the correct sequence, another player's cards, or a reconnect credential, or fans DDP traffic out across the whole deployment.

**UI follows the design system.**
Work from [`docs/design_system.md`](docs/design_system.md). Prefer the Tailwind classes over the constants in `design.jsx`, which have drifted from the document.

**Only the scripts that exist.**
`format`, `format:check`, `test`, `test-app` from the repo root or from `app/`.
There is no `lint`, `build`, `dev`, `typecheck`, or `e2e`, and CI must not invent one.
Prettier is the only style gate; there is no ESLint.

**One local compose file.**
`docker-compose.yml` is development only and must keep working.
Production runs on ECS, so production-shaped changes belong in `infra/` (Terraform and the task-definition templates), not in a second local compose file.

**Docs are part of the change, not a follow-up.**
Change a collection, publication, method, route, or test, and update the matching table in `AGENTS.md` plus a dated entry at the top of `docs/decision-log.md` in the same commit.
Fix or introduce a defect, and update `docs/defect-register.md`.
Design decisions go in `docs/design_system.md`, not in `AGENTS.md`.
New agent skills go only in `.agents/skills/<name>/SKILL.md`; never copy them into `.claude/` or `.cursor/`.

**CI and deployment.**
Merging to `dev` or `main` deploys it. See section 6.

---

## 6. Deployment

Both environments run on ECS Fargate (arm64) and are deployed by `.github/workflows/deploy.yml` through `deploy/ecs-deploy.sh`. The target comes from the branch name. How it is built and why: [`docs/ecs-target-architecture.md`](docs/ecs-target-architecture.md), [`infra/terraform/README.md`](infra/terraform/README.md), [`infra/docs/architecture.md`](infra/docs/architecture.md). The `deploy` skill (`.agents/skills/deploy/SKILL.md`) lists the traps, exit codes and rollback detail.

### Deploy steps

1. **Merge your PR into `dev`.** The workflow builds the arm64 image, pushes it to ECR tagged with the full commit SHA, registers a new task definition revision from `infra/ecs/task-definition.dev.json`, and waits for ECS to report the rollout `COMPLETED`. It then probes `https://dev.kimply.online/health/ready`.
2. **Verify development.** Check the Actions run is green, play a game with two browsers on https://dev.kimply.online, and optionally run `node loadtest/ddp-smoke.mjs wss://dev.kimply.online/websocket`.
3. **Release to production.** Open a PR from `dev` into `main` (two approvals, section 7) and merge it when no one is playing. The same workflow deploys `kimply-prod`.
4. **Verify production** the same way on https://www.kimply.online, then tag the release (section 7).

Manual deploy or rollback of a specific commit uses the same script with an older or newer full SHA, whose image must be in ECR:

```bash
ECS_CLUSTER=kimply-dev ECS_SERVICE=kimply-dev ECR_REPOSITORY=kimply-dev \
  TASK_DEF_TEMPLATE=infra/ecs/task-definition.dev.json SERVICE_URL=https://dev.kimply.online \
  ./deploy/ecs-deploy.sh <full-40-char-git-sha>
```

The defaults are production's. Infrastructure under `infra/terraform/` is never applied by the pipeline; apply `envs/prod` before `envs/dev` by hand. Runtime settings live in the task definition templates and ship with the next deploy.

### Things to know

- A deploy takes about 35 to 37 minutes, because ECS waits out the canary alarm before it reports complete.
- **A deploy drops live games.** Deploy when no one is playing.
- Atlas M0 has no automated backups. Backup and incident guidance that still applies is in [`docs/operations.md`](docs/operations.md) sections 3 and 5.
- The EC2 stack is retired (instances terminated 2026-10-04). `docs/deployment-manual.md`, `docs/dev-environment.md`, `docker-compose.prod.yml`, `nginx/` and the other EC2 `deploy/` scripts are history, not CI.
- Google sign-in setup: [`docs/google-sign-in.md`](docs/google-sign-in.md).

---

## 7. Git conventions

`main` is production and `dev` is the integration branch. Never push to either: everything goes in by PR. One branch per issue, cut from `dev`; `dev` is merged into `main` as a release PR. Commands are in `.agents/skills/git/SKILL.md` and the reasoning is in [`docs/quality-assurance-plan-submission.md`](docs/quality-assurance-plan-submission.md).

**Pull request process**

1. Start from a GitHub issue.
2. Branch from `origin/dev` with `gh issue develop <n> --name <prefix>/<n>-<slug> --base dev --checkout` (prefixes `feature/`, `fix/`, `bug/`, `chore/`).
3. Keep commits small, roughly 500 lines at most, and never force-push a shared branch.
4. Run the tests and Prettier (section 3). New behaviour comes with tests.
5. Update the docs in the same change (section 5).
6. Open the PR into `dev` with `gh pr create --base dev`, with `Closes #<n>` as its own paragraph in the body.
7. CI (`meteor test --once --full-app`, run on PRs to `dev` and `main`, never on merge) must pass. One approval merges into `dev`; two are needed for `main`. Reviewers use the `review` skill. Check these counts in GitHub's branch protection settings, which are not stored in the repo.
8. Merge, then delete the branch. Merging deploys (section 6).

**Versioning**

The repo has no versioning today: no git tags, no `version` in `package.json`, no changelog. A release is identified only by its commit SHA, which is also the ECR image tag.

Suggested: use [semantic versioning](https://semver.org) (`vMAJOR.MINOR.PATCH`) and tag the `main` merge commit of each `dev` to `main` release PR, for example `git tag -a v1.0.0 -m "v1.0.0" && git push origin v1.0.0`. A tag does not deploy anything.

---

## 8. Where to read next

| Document                                                                                 | Holds                                                                      |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                                                                 | Inventory of collections, publications, methods, routes, identity, defects |
| [`docs/design_system.md`](docs/design_system.md)                                         | Colour, type, spacing, motion, components, voice                           |
| [`docs/defect-register.md`](docs/defect-register.md)                                     | Every known defect, how it fails, and the fix                              |
| [`docs/decision-log.md`](docs/decision-log.md)                                           | What changed and why, newest first                                         |
| [`docs/deployment-manual.md`](docs/deployment-manual.md)                                 | Production runbook, from an empty AWS account to serving traffic           |
| [`docs/dev-environment.md`](docs/dev-environment.md)                                     | How the dev stack differs from production                                  |
| [`docs/operations.md`](docs/operations.md)                                               | Monitoring, backups, incidents, cost                                       |
| [`docs/ecs-target-architecture.md`](docs/ecs-target-architecture.md)                     | The ECS Fargate design: decisions, risks, migration history                |
| [`infra/terraform/README.md`](infra/terraform/README.md)                                 | Building and operating the ECS stack with Terraform                        |
| [`docs/bot-detection-test-results.md`](docs/bot-detection-test-results.md) | Executed bot-detection verification and the failures that block sign-off |
| [`infra/docs/architecture.md`](infra/docs/architecture.md) | Mermaid diagrams of the ECS stack |
| [`docs/google-sign-in.md`](docs/google-sign-in.md)                                       | The Google OAuth client and where `GOOGLE_CLIENT_ID` lives                 |
| [`docs/quality-assurance-plan-submission.md`](docs/quality-assurance-plan-submission.md) | Testing plan, git gates, NFRs, accessibility                               |

---

## 9. Common problems

**File changes do not reload (Windows).**
You are running from PowerShell, or the repo is on `/mnt/c/...`.
Clone into `~/` inside WSL2 and run from the Ubuntu terminal.

**The app cannot connect to MongoDB.**
Something else already holds port 27017, usually a MongoDB installed directly on your machine. Stop it.

**Port 3000 is in use.**
Run `docker compose down` to clear leftover containers, or stop whatever else is on 3000.

**`docker compose` not found.**
Docker Desktop is not running or not installed. Very old versions use `docker-compose` with a hyphen.

**The first build seems stuck.**
It is not. Give it 15 minutes. Meteor is compiling from scratch and prints little while it does.

**A stray empty overlay appears under the username field on `/play`.**
That is a browser extension, most likely a password manager, appended outside `#react-target`.
It is not app markup. Nobody needs to chase it.

**Reset the database.**
`docker compose down -v` stops everything and wipes the Mongo volume.
Plain `docker compose down` keeps your data. 

---

## Team

| Name           | Email                       |
| -------------- | --------------------------- |
| Dhruv Israni   | dhruv.isr14@gmail.com       |
| Jeremy Lim     | jeremylim.0304@gmail.com    |
| Owen Kolotsos  | owenkolotsos@outlook.com    |
| Ojaswi Pandey  | ojaswioj98@gmail.com        |
| Koby Crosby    | crosbk01@gmail.com          |
| Tan Ee Dhing   | joycetan613@gmail.com       |
| Trisha Bhagat  | trisha.bhagat445@gmail.com  |
| Layela Moyo    | layelaheart@gmail.com       |
| Ian Nguyen     | mriannguyen352@gmail.com    |
| Zeji Li        | jarrodlizeji@gmail.com      |
| Ze Xiang Li    | lijefferson73@gmail.com     |
| Benjamin Quan  | scientistquan@gmail.com     |
| Lachlan Shi    | lshi0046@student.monash.edu |
| Ambrris Bushen | ambrrisb2803@gmail.com      |

## Licence

MIT. See [`app/LICENSE`](app/LICENSE).
