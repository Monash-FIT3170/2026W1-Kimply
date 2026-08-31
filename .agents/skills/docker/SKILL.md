---
name: docker
description: >-
  Run and troubleshoot the local Docker environment: compose services,
  volumes, the Meteor dev container, and the production image. Use when the
  app will not boot, dependencies look stale, a file change is not picked up,
  or when editing a Dockerfile or compose file.
---

# Docker

On Windows every command here runs in a **WSL2** terminal, not PowerShell, from the repository root.

## Services

| Service | Build | Port | Notes |
|---|---|---|---|
| `mongodb` | `mongo:7.0` | 27017 | Local database |
| `backend` | `app/Dockerfile.dev` | 3000 | Meteor dev server, bind-mounts the repo |
| `test` | see compose | none | Profile `test`, one shot, separate database |

```bash
docker compose up                      # mongodb + backend
docker compose logs -f backend
docker compose restart backend         # after an env var change
docker compose exec backend bash
docker compose --profile test run test
```

The `test` service is behind a profile, so a bare `docker compose up` never starts it. If compose copies the app into the test image instead of bind-mounting, rebuild (`--build`) after source changes.

## Volumes

```
.:/kimply                                  bind mount — edits are live
meteor_local:/kimply/app/.meteor/local     Meteor build cache
backend_node_modules:/kimply/app/node_modules   shadows the host directory
```

- Install through the container: `docker compose exec backend meteor npm install <pkg>`.
- `app/entrypoint.sh` also runs `meteor npm install` on boot when `node_modules` is missing or `package.json` is newer.
- A mysterious break with no diff: clear `meteor_local` (not `mongodb_data`).

```bash
docker compose down
docker volume ls | grep meteor_local
docker volume rm <that volume>
docker compose up
```

Do not `docker compose down -v` unless you mean to wipe local data.

File watching uses polling (`CHOKIDAR_USEPOLLING=1`) because inotify does not cross the Windows filesystem boundary. `METEOR_ALLOW_SUPERUSER=1` is development-only; the production image runs as `node`.

## The two images are different on purpose

| | `app/Dockerfile.dev` | `app/Dockerfile` |
|---|---|---|
| Contains | Meteor CLI, source bind-mounted | Built bundle only |
| Runs as | root | `node` |
| Started by | `docker compose up` | `docker-compose.prod.yml` |

Local `docker-compose.yml` must keep working. Production-shaped changes belong in `docker-compose.prod.yml`. Neither file is forked per environment.

## When it will not start

1. `docker compose logs -f backend`
2. Port 3000 or 27017 already in use — `docker compose down` in the other project
3. `Cannot find module` after pulling — `docker compose exec backend meteor npm install`, then restart
4. Mongo connection refused on boot — `depends_on` does not wait for readiness; restart `backend`
5. Still wrong — clear `meteor_local`, then `docker compose build --no-cache backend`
