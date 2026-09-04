---
name: deploy
description: >-
  Ship to the dev or production EC2 stack, roll back, and change deployment
  configuration. Use when touching deploy/, nginx/, docker-compose.prod.yml,
  .github/workflows/deploy.yml, or when a deployment failed, a certificate
  needs renewing, or the site is down.
---

# Deployment

Two environments, one workflow, no shared AWS resources. Which branch maps to which URL, instance, and ECR repo is in `AGENTS.md` and `docs/dev-environment.md`.

`.github/workflows/deploy.yml` picks its target from `github.ref_name`. OIDC roles are per-branch, so a push to `dev` cannot obtain a credential that reaches production.

Runbooks: `docs/deployment-manual.md`, `docs/dev-environment.md`, `docs/operations.md`. Read the relevant one before changing anything on a box.

## Two delivery channels

```
app/ source                  -> build-push.sh -> ECR -> deploy.sh -> container
nginx/, deploy/, scripts/,   -> sync-config.sh      -> /opt/kimply/
docker-compose.prod.yml
```

`deploy.sh` only swaps the application image. Nginx, compose, and deploy scripts sit on your laptop until `./deploy/sync-config.sh` sends them (`--dry-run` first).

Everything under `deploy/`, `nginx/`, and `docker-compose.prod.yml` is environment-agnostic and reads `/opt/kimply/.env` on the box. **Do not fork any of it per environment.** Differences belong in `.env`.

## Deploying and rolling back

CI deploys on push to `main` or `dev`. By hand, over SSM:

```bash
/opt/kimply/deploy/deploy.sh <full-40-char-git-sha>
```

Rollback is the same command with an older SHA. There is no separate rollback script.

| Exit | Meaning |
|---|---|
| 0 | Deployed and verified |
| 1 | Deploy failed, previous image restored |
| 2 | Usage or precondition; nothing changed |
| 3 | Rollback also failed — act now |

## Traps that are load-bearing

- **`APP_IMAGE` must be exported**, not only written to `.env`. Compose gives the shell environment precedence over `--env-file`. Rewriting the file after `source`ing it is a silent no-op. Do not remove the post-recreate image guard in `deploy.sh`.
- **`build-push.sh` keeps `--provenance=false --sbom=false`.** Otherwise buildx attaches attestations, ECR rejects the manifest, and an `IMMUTABLE` tag is poisoned. Recovery is `aws ecr batch-delete-image` on the tag. This only shows up locally (containerd image store); CI's classic store hides it.
- **Tags are commit SHAs and repositories are `IMMUTABLE`.** Dev and production cannot share one repository.
- **`NGINX_ENVSUBST_FILTER: "^DOMAIN$$"`** — without it envsubst also replaces nginx's `$host` / `$http_upgrade`.
- **`sync-config.sh` pushes your working tree.** `--dry-run` first; an out-of-date branch overwrites what the box actually runs.

## TLS and verify

Let's Encrypt via the `certbot` service (`tools` profile). First issuance is `deploy/init-letsencrypt.sh` (self-signed placeholder, then HTTP-01). Always `--dry-run` first (5 duplicate certs/week).

```bash
./scripts/health-check.sh https://<host>
node loadtest/ddp-smoke.mjs wss://<host>/websocket
```

Confirm the WebSocket upgrade returns **101**. A page load is not proof DDP is on WebSockets.

What is currently true of each environment (health endpoints, publications, indexes) is in the runbooks and `docs/decision-log.md`, not here.
