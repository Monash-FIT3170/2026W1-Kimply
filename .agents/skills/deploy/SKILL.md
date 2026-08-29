---
name: deploy
description: >-
  Ship Kimply to the dev or production EC2 stack, roll back, and change
  deployment configuration. Use when touching deploy/, nginx/,
  docker-compose.prod.yml, .github/workflows/deploy.yml, or when a deployment
  failed, a certificate needs renewing, or the site is down.
---

# Deployment

Two environments, one workflow file, zero shared AWS resources.

| | Production | Development |
|---|---|---|
| Branch | `main` | `dev` |
| URL | `https://kimply.online` | `https://dev.kimply.online` |
| ECR repo | `kimply` | `kimply-dev` |
| Instance | `i-08184036cf37c932c` | `i-09575e88c984e1c7d` |
| Roles | `GitHubActionsECRPush`, `GitHubActionsEC2Commands` | same names + `Dev` |

`.github/workflows/deploy.yml` picks its target from `github.ref_name` and fails loudly on any branch it does not recognise. A push to `dev` cannot obtain a credential that reaches production, because GitHub's OIDC subject claim names one ref.

Runbooks: `docs/deployment-manual.md` (production), `docs/dev-environment.md` (the dev delta), `docs/operations.md` (monitoring, backups, cost). Read the relevant one before changing anything on a box.

## Two delivery channels - confusing them is the standard mistake

```
app/ source                  -> build-push.sh -> ECR -> deploy.sh -> container
nginx/, deploy/, scripts/,   -> sync-config.sh      -> /opt/kimply/
docker-compose.prod.yml
```

`deploy.sh` only swaps the application image. It will **never** notice a change to nginx config, the compose file, or the deploy scripts. Those sit on your laptop until `./deploy/sync-config.sh` sends them (`--dry-run` first, always).

Everything under `deploy/`, `nginx/`, and `docker-compose.prod.yml` is environment-agnostic and reads its configuration from `/opt/kimply/.env` on the box. **Do not fork any of it per environment.** If something must differ, it belongs in `.env`.

## Deploying and rolling back

CI does this automatically on a push to `main` or `dev`. By hand, over SSM:

```bash
/opt/kimply/deploy/deploy.sh <full-40-char-git-sha>
```

Rollback is the same command with an older SHA. There is deliberately no separate rollback script - a rollback runs during an incident and must not be the least-tested path.

Exit codes matter:

| Code | Meaning |
|---|---|
| 0 | Deployed and verified |
| 1 | Deploy failed, previous image restored and verified. Site is serving - investigate at your leisure |
| 2 | Usage or precondition error. Nothing changed |
| 3 | **Act now.** The rollback also failed, or there was nothing safe to roll back to |

List rollback targets:

```bash
aws ecr describe-images --repository-name "$ECR_REPOSITORY" --region ap-southeast-2 \
  --query 'sort_by(imageDetails,&imagePushedAt)[*].[imageTags[0],imagePushedAt]' --output table
```

## Traps that have already cost a day each

- **`APP_IMAGE` must be exported, not only written to `.env`.** Docker Compose gives the shell environment precedence over `--env-file`, and `deploy.sh` does `set -a; source "$ENV_FILE"`, which exports the *old* value. Rewriting only the file changes nothing, compose reports `Container kimply-app Running` instead of `Recreated`, and the deploy silently becomes a no-op that reports success. The post-recreate image guard is the only reason this was ever caught. Do not remove it.
- **`build-push.sh` must keep `--provenance=false --sbom=false`.** Without them buildx attaches attestations, the result becomes an OCI index, and ECR rejects the manifest PUT with a bare `400` after every layer has uploaded. Worse, the failed push lands the provenance manifest under the tag, and both repositories are `IMMUTABLE`, so every retry fails for a different reason. Recovery is `aws ecr batch-delete-image` on the tag first.
- **That failure is invisible in CI.** GitHub runners use the classic Docker image store, where `--load` converts to schema2 and the push succeeds. Docker Desktop with the containerd image store keeps OCI media types, so it only bites locally.
- **Tags are commit SHAs and repositories are `IMMUTABLE`.** A tag cannot be overwritten, only deleted. This is also why dev and production cannot share one repository: a fast-forward `dev` to `main` merge would push an existing tag and be rejected.
- **`NGINX_ENVSUBST_FILTER: "^DOMAIN$$"` is load-bearing.** Without it envsubst also replaces nginx's own `$host`, `$remote_addr`, and `$http_upgrade`, silently producing a broken config.
- **`sync-config.sh` pushes your working tree to a box.** Running it against production with an out-of-date branch overwrites what production is actually running. `--dry-run` first.

## TLS

Let's Encrypt, renewed by `/etc/cron.d/kimply-certbot-renew` (installed by `deploy/bootstrap-ec2.sh`) at 03:00 daily. Certbot no-ops until the certificate is within 30 days of expiry, and the job reloads nginx only after `nginx -t` passes.
The `certbot` service is behind the `tools` profile, so `up` never starts it. Run it on demand:

```bash
docker compose -f docker-compose.prod.yml run --rm certbot <args>
```

First issuance is `deploy/init-letsencrypt.sh`, which starts nginx against a **self-signed placeholder** and lets certbot replace it over HTTP-01. That is what keeps one nginx config for every environment instead of a stripped-down local variant.
Always `--dry-run` first: Let's Encrypt allows 5 duplicate certificates per week, and iterating on a broken setup exhausts that quota fast.

## Verifying a deployment

```bash
./scripts/health-check.sh https://kimply.online          # DNS, EIP, nginx, TLS, app, Mongo in one probe
node loadtest/ddp-smoke.mjs wss://kimply.online/websocket # DDP, methods, scoped publications, no attemptedSequence
```

Confirm the WebSocket upgrade returns **101**. Without it DDP silently falls back to SockJS long-polling: everything still works while connection count and latency balloon. Never accept "the page loads" as proof.

`/health/live` is liveness only and must never touch MongoDB. `/health/ready` pings Mongo behind a 5 s cache so that polling does not become steady load on the Atlas free tier.

## Known state

`main` has no `app/server/health.js`, `server/publications.js`, or `server/indexes.js`, so production's health gate returns the SPA shell with a 200 and passes unconditionally, and production still runs the unscoped publications of D2. Development, built from `dev`, has all three. This resolves when `dev` reaches `main`, which is a release decision - do not "fix" it by pushing to `main`.
