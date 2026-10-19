---
name: deploy
description: >-
  Ship to the dev or production ECS stack, roll back, and change deployment
  configuration. Use when touching deploy/, infra/, .github/workflows/deploy.yml,
  app/Dockerfile, or when a deployment failed or the site is down.
---

# Deployment

Two environments on ECS Fargate (arm64), one workflow. Which branch maps to which URL, cluster, ECR repo and role is the Deployment table in `AGENTS.md`.

`.github/workflows/deploy.yml` runs on push to `main` or `dev` and picks its target from `github.ref_name` in its `config` job. OIDC roles are per-branch, so a push to `dev` cannot obtain a credential that reaches production.

Development has its own cluster, service, ECR repo, roles and Atlas database, but **shares production's load balancer and NAT gateway** (D42). Apply `infra/terraform/envs/prod` before `envs/dev`.

Runbooks: `infra/terraform/README.md` (build and operate), `docs/ecs-target-architecture.md` (decisions D26-D42 and risks), `infra/docs/architecture.md` (diagrams). Read the relevant one before changing infrastructure.

## Delivery

```
app/ source  -> deploy/build-push.sh -> ECR <repo>:<sha> -> deploy/ecs-deploy.sh -> new task definition revision -> ECS rolling deploy
infra/       -> terraform apply (by hand; the pipeline never runs Terraform)
```

`ecs-deploy.sh` renders `infra/ecs/task-definition.<env>.json` with the image, registers a revision, updates the service, waits for the rollout to report `COMPLETED`, then runs `scripts/health-check.sh` against the public URL.
Environment variables for the app live in that template, not in Terraform and not in an `.env` file. `MONGO_URL` comes from Secrets Manager.

## Deploying and rolling back

Merging to `dev` or `main` deploys. By hand, with credentials for that environment:

```bash
ECS_CLUSTER=kimply-dev ECS_SERVICE=kimply-dev ECR_REPOSITORY=kimply-dev \
  TASK_DEF_TEMPLATE=infra/ecs/task-definition.dev.json SERVICE_URL=https://dev.kimply.online \
  ./deploy/ecs-deploy.sh <full-40-char-git-sha>
```

The defaults are production's. Rollback is the same command with an older SHA, whose image must still be in ECR.
ECS also rolls back on its own when the circuit breaker or the canary alarm fails a rollout.

| Exit | Meaning |
|---|---|
| 0 | Rollout `COMPLETED` and the public readiness probe passed |
| 1 | Deploy failed: ECS rolled back, or the probe failed. The script prints service events and task logs |
| 2 | Usage or precondition; nothing changed |

## Traps that are load-bearing

- **A deploy takes about 37 minutes.** With alarms on, ECS holds the rollout `IN_PROGRESS` for the canary alarm's period times its evaluation periods (900 s x 2) after the tasks are healthy. `ROLLOUT_TIMEOUT` defaults to 2700 s and must stay inside the one-hour OIDC session. Change `canary_rate_minutes` and this moves with it (#146).
- **`build-push.sh` keeps `--provenance=false --sbom=false`.** Otherwise buildx attaches attestations, ECR rejects the manifest, and an `IMMUTABLE` tag is poisoned. Recovery is `aws ecr batch-delete-image` on the tag.
- **Tags are commit SHAs and repositories are `IMMUTABLE`.** Dev and production cannot share one repository.
- **`ROOT_URL` is what the browser opens its DDP socket against.** Change it only together with `domain_name` in Terraform and `service_url` in the workflow; a Terraform precondition keeps them in step.
- **`HTTP_FORWARDED_COUNT` stays `1`** behind the single ALB hop, or bot-detection IP bans read the wrong address (D44).
- **Atlas M0 has no oplog.** `METEOR_POLLING_INTERVAL_MS=3000` sets how stale another task's writes can look. More tasks means more polling load on the database.

## Verify

```bash
./scripts/health-check.sh https://<host>
node loadtest/ddp-smoke.mjs wss://<host>/websocket
```

Confirm the WebSocket upgrade returns **101**. A page load is not proof DDP is on WebSockets.

## The retired EC2 stack

The EC2 instances were terminated on 2026-10-04. `deploy/deploy.sh`, `sync-config.sh`, `bootstrap-ec2.sh`, `init-letsencrypt.sh`, `nginx/` and `docker-compose.prod.yml` belong to it, and `docs/deployment-manual.md` is its historical runbook. Do not change them to affect production.
