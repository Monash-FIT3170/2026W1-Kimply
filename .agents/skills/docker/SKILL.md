---
name: docker
description: >-
  Run and troubleshoot the local Kimply environment - docker compose services,
  volumes, the Meteor dev container, and the production image. Use when the app
  will not boot, dependencies look stale, a file change is not picked up, or
  when editing a Dockerfile or compose file.
---

# Docker

On Windows every command here runs in a **WSL2** terminal, not PowerShell.
Run them from the repository root, where `docker-compose.yml` lives.

## Services

| Service | Image / build | Port | Notes |
|---|---|---|---|
| `mongodb` | `mongo:7.0` | 27017 published | Database `kimply` |
| `backend` | `app/Dockerfile.dev` | 3000 published | Meteor dev server, bind-mounts the repo |
| `test` | `app/Dockerfile.dev` | none | Profile `test`, one shot, database `kimply-test` |

```bash
docker compose up                      # start mongodb + backend
docker compose logs -f backend         # the only place server stack traces appear
docker compose restart backend         # after an env var change
docker compose exec backend bash       # shell inside the app container (cwd /kimply/app)
docker compose --profile test run test # one-shot test container
```

The `test` service is behind a profile, so a bare `docker compose up` never starts it.

## Volumes, and the mistakes they cause

```
.:/kimply                                  bind mount - your edits are live
meteor_local:/kimply/app/.meteor/local     named volume - the Meteor build cache
backend_node_modules:/kimply/app/node_modules   named volume - shadows the host directory
```

Two consequences worth memorising:

- **`node_modules` inside the container is not the `node_modules` on your host.** Install through the container - `docker compose exec backend meteor npm install <pkg>` - or the container never sees the package. `app/entrypoint.sh` also runs `meteor npm install` on boot when `node_modules` is missing or `package.json` is newer than it, so a restart usually resolves a dependency added by someone else.
- **`.meteor/local` is a cache, and it is the first thing to suspect when the app misbehaves for no reason in the diff.** Clearing it forces a full rebuild, which is slow but non-destructive:

```bash
docker compose down
docker volume ls | grep meteor_local   # named <compose-project>_meteor_local
docker volume rm <that volume>
docker compose up
```

Do not reach for `docker compose down -v`. It also removes `mongodb_data`, which is where every local room, player and account lives.

File watching uses polling (`CHOKIDAR_USEPOLLING=1`, 500 ms) because inotify does not cross the Windows filesystem boundary. If a save is not picked up, check the file is inside the bind mount before suspecting Meteor.

`METEOR_ALLOW_SUPERUSER=1` is set because the dev container runs as root. That is a development-only concession; the production image runs as `node` (uid 1000).

## The two images are different on purpose

| | `app/Dockerfile.dev` | `app/Dockerfile` |
|---|---|---|
| Base | `node:20` | `node:22-bookworm` builder, `node:22-bookworm-slim` runner |
| Contains | Meteor CLI, source bind-mounted at run time | The built bundle only - no Meteor CLI, no `.meteor`, no source |
| Runs as | root | `node` |
| Started by | `docker compose up` | `docker-compose.prod.yml`, image pulled by commit SHA |

The production build asserts that `star.json`'s `nodeVersion` starts with `22.`, turning a Node major mismatch into a build failure instead of a container that dies on boot.
It also needs `devDependencies` (`rspack.config.js` pulls in postcss-loader and babel at build time), and it uses `npm install --omit=dev` rather than `npm ci` inside the bundle, because Meteor 3.4 emits no lockfile there.

Local `docker-compose.yml` must keep working. Production-shaped changes belong in `docker-compose.prod.yml`, and neither file is forked per environment - see the `deploy` skill.

## When it will not start

1. `docker compose logs -f backend` first. Meteor prints build errors there, and a server-side `Meteor.Error` stack trace appears nowhere else.
2. Port already in use: something else holds 3000 or 27017. `docker compose down` in the other project.
3. `Cannot find module` after pulling: dependencies changed. `docker compose exec backend meteor npm install`, then restart.
4. Mongo connection refused on boot: `backend` only `depends_on` mongodb, which does not wait for readiness. Restart `backend`.
5. Still wrong: clear `meteor_local` as above, then rebuild the image with `docker compose build --no-cache backend`.
