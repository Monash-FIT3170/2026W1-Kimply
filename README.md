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
| Hosting           | AWS EC2 (arm64) behind Nginx, MongoDB Atlas            |

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
| WSL2 (Windows only)   | See below. Not optional                                               | Section 2                                               |

You do **not** need a Meteor, Node, or MongoDB install on your machine.
Everything runs inside containers.

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

**The first start takes 5 to 15 minutes** while Meteor downloads packages and compiles from scratch.
Later starts are much faster because the build is cached in a Docker volume.

Open VS Code on the project with `code .` from the same terminal.
On Windows this installs the WSL extension and reopens the project connected to WSL2, shown as **WSL: Ubuntu** in the bottom-left.
Saving a file hot-reloads the browser.

Three commands cover day-to-day work.
Everything else is ordinary Docker Compose, and `docker compose --help` is a better reference than this file.

```bash
docker compose up                                  # start MongoDB and the app on :3000
docker compose exec backend meteor npm test        # run the test suite once
docker compose exec backend meteor npm run format  # Prettier, the only style gate
```

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
deploy/ nginx/          production infrastructure, environment-agnostic
.agents/skills/         per-task instructions for coding agents
```

`AGENTS.md` in the repo root is the real map: every collection, publication, method, route, test, and known defect in one table.
**Read it before reading `imports/api/`.**
`CLAUDE.md` is a symlink to it, and `.claude/skills` and `.cursor/skills` are symlinks to `.agents/skills`, so every tool sees one set of instructions.

---

## 5. Conventions

These are the rules that are not obvious from the code, and the ones most likely to be broken by accident.

**Branches and pull requests.**
`main` is production and `dev` is the integration branch.
Never push to either.
Every branch starts from a GitHub issue and is cut with `gh issue develop <n> --name <prefix>/<n>-<slug> --base dev --checkout`, so the branch appears in the issue's Development sidebar.
Prefixes are `feature/`, `fix/`, `bug/`, `chore/`.
Every PR targets `dev` and its body contains `Closes #<n>` as its own paragraph.
The full workflow is `.agents/skills/git/SKILL.md`.

**Anonymous play is deliberate.**
The game has no login wall and must not gain one.
`this.userId` is empty on purpose; do not "fix" it by adding authentication.

**All writes go through Meteor methods.**
`autopublish` and `insecure` are not installed and there are no `.allow()` or `.deny()` rules.
Adding any of them is a regression.

**Publications are scoped and projected, and that is load-bearing.**
Rounds publish only `isCurrent: true`, players exclude `attemptedSequence` (it holds the answer a player submitted), and every publication is scoped by `gameId`.
Removing any of those three leaks the correct sequence or fans DDP traffic out across the whole deployment.

**Only the scripts that exist.**
`format`, `format:check`, `test`, `test-app` from the repo root or from `app/`.
There is no `lint`, `build`, `dev`, `typecheck`, or `e2e`, and CI must not invent one.
Prettier is the only style gate; there is no ESLint.

**One local compose file.**
`docker-compose.yml` is development only and must keep working.
Production-shaped changes belong in `docker-compose.prod.yml`.
`deploy/`, `nginx/`, and `scripts/` are environment-agnostic and read their configuration from `/opt/kimply/.env` on the instance, so do not fork them per environment.

**Docs are part of the change, not a follow-up.**
Change a collection, publication, method, route, or test, and update the matching table in `AGENTS.md` plus a dated entry at the top of `docs/decision-log.md` in the same commit.
Fix or introduce a defect, and update `docs/defect-register.md`.
Design decisions go in `docs/design_system.md`, not in `AGENTS.md`.
New agent skills go only in `.agents/skills/<name>/SKILL.md`; never copy them into `.claude/` or `.cursor/`.

**CI and deployment.**
Tests run on pull requests to `main` and `dev`.
Pushing to `dev` deploys dev.kimply.online, pushing to `main` deploys production, both through `.github/workflows/deploy.yml`, which picks its target from the branch name.
The two stacks share no AWS resource.

---

## 6. Where to read next

| Document                                                 | Holds                                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                                 | Inventory of collections, publications, methods, routes, identity, defects |
| [`docs/design_system.md`](docs/design_system.md)         | Colour, type, spacing, motion, components, voice                           |
| [`docs/defect-register.md`](docs/defect-register.md)     | Every known defect, how it fails, and the fix                              |
| [`docs/decision-log.md`](docs/decision-log.md)           | What changed and why, newest first                                         |
| [`docs/deployment-manual.md`](docs/deployment-manual.md) | Production runbook, from an empty AWS account to serving traffic           |
| [`docs/dev-environment.md`](docs/dev-environment.md)     | How the dev stack differs from production                                  |
| [`docs/operations.md`](docs/operations.md)               | Monitoring, backups, incidents, cost                                       |

---

## 7. Common problems

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

**`npm ci` fails at the repo root.**
Known defect D11: the root `package-lock.json` is desynced against an empty root `package.json`.
Run npm commands against `app/`, or through the container.

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
