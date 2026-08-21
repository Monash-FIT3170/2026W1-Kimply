# Kimply Development Environment

A second, fully independent copy of the production stack, deployed automatically on every push to `dev`.

**This document is a delta.**
Every section of [deployment-manual.md](deployment-manual.md) applies unchanged.
Only the substitutions below and the differences in section 3 are specific to development.

---

## Contents

1. [What is different, and why](#1-what-is-different-and-why)
2. [Substitutions](#2-substitutions)
3. [Differences from the production runbook](#3-differences-from-the-production-runbook)
4. [Standing up the box](#4-standing-up-the-box)
5. [Verification](#5-verification)
6. [What development deliberately does not have](#6-what-development-deliberately-does-not-have)

---

## 1. What is different, and why

Nothing is shared between the two environments.
Not the instance, not the Elastic IP, not the ECR repository, not the IAM roles, not the database, and not the certificate.
The only shared artifact is `.github/workflows/deploy.yml`, which selects its target from `github.ref_name`.

Two of those separations are load-bearing rather than tidiness.

**Separate IAM roles, not one widened pair.**
GitHub's OIDC subject claim is `repo:<org>/<repo>:ref:refs/heads/<branch>`, and each role's trust policy names exactly one ref.
`GitHubActionsECRPushDev` and `GitHubActionsEC2CommandsDev` trust `refs/heads/dev` and are scoped to the `kimply-dev` repository and the dev instance ARN respectively.
A push to `dev` therefore cannot obtain a credential capable of overwriting the production image or running a command on the production instance.
Adding `refs/heads/dev` to the existing production roles would have been fewer resources and would have thrown that guarantee away.

**Separate ECR repositories.**
`kimply` is `IMMUTABLE`-tagged and its lifecycle policy keeps only the ten most recent images.
Sharing one repository would let development builds evict production rollback targets.
Worse, tags are full commit SHAs, so a fast-forward merge of `dev` into `main` would produce an identical SHA whose second push an immutable repository rejects outright.

---

## 2. Substitutions

Apply these throughout `deployment-manual.md`.

| Concern | Production | Development |
|---|---|---|
| Branch | `main` | `dev` |
| Domain | `kimply.online`, `www.kimply.online` | `dev.kimply.online` |
| `<INSTANCE_ID>` | `i-08184036cf37c932c` | `i-09575e88c984e1c7d` |
| `<ELASTIC_IP>` | `15.134.53.178` | `15.134.96.122` |
| Instance type | `t4g.small` | `t4g.small` |
| EC2 `Name` tag | `kimply` | `kimply-dev` |
| Security group | `kimply-sg` | `kimply-dev-sg` (`sg-0a44f4220d678f83e`) |
| Instance role / profile | `kimply-ec2-role` / `kimply-ec2-profile` | `kimply-dev-ec2-role` / `kimply-dev-ec2-profile` |
| Inline pull policy | `kimply-ecr-pull` | `kimply-dev-ecr-pull` |
| `ECR_REPOSITORY` | `kimply` | `kimply-dev` |
| OIDC push role | `GitHubActionsECRPush` | `GitHubActionsECRPushDev` |
| OIDC SSM role | `GitHubActionsEC2Commands` | `GitHubActionsEC2CommandsDev` |
| Atlas project / cluster | existing / `kimply-mongodb` | `Kimply Dev` / `kimply-dev-mongodb` |
| Host directory | `/opt/kimply` | `/opt/kimply` |
| `SSH_HOST` for `sync-config.sh` | `kimply` | `kimply-dev` |
| `Env` tag | `production` | `development` |

The host directory stays `/opt/kimply` on both boxes on purpose.
`deploy/deploy.sh` and `deploy/sync-config.sh` both default to it, the workflow's SSM command hardcodes `/opt/kimply/deploy/deploy.sh`, and these are separate machines so there is nothing to collide with.

The dev `/opt/kimply/.env` differs from production's in exactly four values: `DOMAIN`, `ROOT_URL`, `ECR_REPOSITORY`, and `MONGO_URL`.
`AWS_REGION` and `ECR_REGISTRY` are the same, and `APP_IMAGE` is rewritten by `deploy.sh` on every deploy.

---

## 3. Differences from the production runbook

### 3a. The ECR repository must be seeded before the box is configured

This is the one ordering trap.

`docker-compose.prod.yml` gives `${APP_IMAGE}` no default, so `docker compose config` fails when it is unset, and `deploy/deploy.sh` refuses to run without it.
That means an image has to exist in `kimply-dev` before `/opt/kimply/.env` can be written.
Do it locally rather than by pushing to `dev` and letting the first pipeline run fail:

```bash
ECR_REPOSITORY=kimply-dev ./deploy/build-push.sh
```

`build-push.sh` reads `ECR_REPOSITORY` from the environment, so no edit is needed.
Note the SHA it prints.

### 3a-bis. The TLS bootstrap depends on a working database

This is not obvious and it will stop you dead.

`init-letsencrypt.sh` runs `docker compose up -d nginx`, and in `docker-compose.prod.yml` nginx carries `depends_on: app: condition: service_healthy`.
So nginx cannot start until the app container is healthy, the app cannot become healthy until Meteor boots, and Meteor refuses to boot on an unparseable `MONGO_URL`:

```
MongoParseError: Invalid scheme, expected connection string to start with
"mongodb://" or "mongodb+srv://"
```

The container then crash-loops, `compose up` reports only `dependency failed to start: container kimply-app is unhealthy`, and nothing in that message mentions the database.

**Set a real `MONGO_URL` before attempting the certificate.**
The dependency chain is Atlas, then the app, then nginx, then TLS, and it does not bend.

### 3a-ter. `check-mongo.mjs` cannot run on the instance

`scripts/check-mongo.mjs` defaults to reading `/opt/kimply/.env`, which implies it runs on the box.
It cannot: the instance has Docker but no Node.js and no `npm`, deliberately, because it never builds anything.

Run it through a throwaway container instead:

```bash
sudo docker run --rm \
  -v /opt/kimply/scripts/check-mongo.mjs:/app/check-mongo.mjs:ro \
  -v /opt/kimply/.env:/app/.env:ro \
  -w /app \
  node:22-bookworm-slim \
  sh -c 'npm install --no-save --silent mongodb >/dev/null 2>&1; node /app/check-mongo.mjs /app/.env'
```

Both mounts must land in the **same directory**, and `npm install` must run there.
Node resolves `node_modules` upward from the importing module's own path, not from the working directory, so mounting the script at `/` while installing into `/tmp` makes it report `The "mongodb" driver is not installed` even though the install succeeded.

It prints the host and database name but never the credentials, so its output is safe to share.

### 3b. Only the bare hostname goes on the certificate

```bash
CERT_DOMAINS="dev.kimply.online" ./deploy/init-letsencrypt.sh --dry-run
CERT_DOMAINS="dev.kimply.online" ./deploy/init-letsencrypt.sh
```

`nginx/templates/kimply.conf.template` is left byte-identical to production, which means it still renders a `www.${DOMAIN}` server block, here `www.dev.kimply.online`.
That block never receives traffic because no DNS record points at it, and it is not on the certificate.
Running the same nginx configuration in both environments is the entire point of the exercise, so the template is not forked to remove it.

### 3c. HSTS stays off

Leave the `Strict-Transport-Security` line commented out in the template on this box.
Development is exactly where you want the freedom to break TLS without locking browsers out of the hostname for a year.

### 3d. `sync-config.sh` needs its own SSH alias

```bash
SSH_HOST=kimply-dev ./deploy/sync-config.sh --dry-run
SSH_HOST=kimply-dev ./deploy/sync-config.sh
```

This requires a `kimply-dev` entry in `~/.ssh/config` tunnelled over SSM, because the security group opens 80 and 443 only and there is no port 22, exactly as in production.

### 3e. The health gate actually works here

`app/server/health.js` exists on `dev` but not on `main`.
On this environment `/health/ready` returns `{"status":"ready"}` and genuinely pings Atlas, so `deploy/deploy.sh` will roll back a deploy that cannot reach the database.
On production the same path currently returns the Meteor SPA shell with a 200, which makes both the Docker `HEALTHCHECK` and the deploy gate pass unconditionally.
That resolves itself when `dev` reaches `main`.

---

## 4. Standing up the box

Already provisioned: the ECR repository and its lifecycle policy, both IAM roles for GitHub Actions, the instance role and profile, the security group, the instance, and the Elastic IP.

Remaining, in order:

1. **Atlas.**
   New project `Kimply Dev`, new free M0 cluster `kimply-dev-mongodb`, database `kimply`, user `kimply_app` with `readWrite` on `kimply` only.
   Network access allowlist: `15.134.96.122/32` and nothing else.
2. **DNS.**
   An `A` record for `dev` on `kimply.online` pointing at `15.134.96.122`, TTL 300.
   The zone is on GoDaddy.
3. **Seed the repository** with `ECR_REPOSITORY=kimply-dev ./deploy/build-push.sh` (section 3a).
4. **Bootstrap**, following `deployment-manual.md` section 8:
   `aws ssm start-session --region ap-southeast-2 --target i-09575e88c984e1c7d`, then run `deploy/bootstrap-ec2.sh` as root.
5. **Push the configuration**: `SSH_HOST=kimply-dev ./deploy/sync-config.sh`.
6. **Write `/opt/kimply/.env`** at mode `600 root:root`, per `deployment-manual.md` section 9b, using the substitutions in section 2.
7. **Issue the certificate**, per section 3b above. Dry run first, always; Let's Encrypt allows five duplicate certificates per week.
8. **Bring the stack up**: `docker compose -f docker-compose.prod.yml --env-file .env up -d`.

From step 8 onward every push to `dev` deploys itself.
`deploy.sh` handles the first deploy correctly: it logs that there is no rollback target rather than failing.

---

## 5. Verification

```bash
# TLS, redirect, and certificate name
curl -sI http://dev.kimply.online/ | head -1
echo | openssl s_client -connect dev.kimply.online:443 -servername dev.kimply.online 2>/dev/null \
  | openssl x509 -noout -subject -dates

# The health gate. Expect JSON, not the SPA shell. This is the sharpest single
# check that the running image really is the dev branch and Atlas is reachable.
curl -s https://dev.kimply.online/health/ready
curl -s https://dev.kimply.online/healthz

# WebSocket upgrade. Without a 101 the client silently falls back to SockJS
# long-polling: it still works, but connection count and latency balloon.
curl -sI -o /dev/null -w '%{http_code}\n' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  https://dev.kimply.online/websocket

# End-to-end DDP: room creation, reactive lobby, scoped publications, zero
# leakage for a foreign gameId, no attemptedSequence on any published player.
node loadtest/ddp-smoke.mjs wss://dev.kimply.online/websocket

# Nothing but 80 and 443 exposed
nmap -Pn -p 22,80,443,3000,27017 dev.kimply.online
```

Then push a trivial commit to `dev`, confirm the run is green, and check that the
`Configure AWS credentials ECR` step assumed `GitHubActionsECRPushDev` rather than the production role.
That step's log is the readable proof of the isolation claim in section 1.

---

## 6. What development deliberately does not have

- **No CloudWatch agent, no alarms.** The instance role carries `CloudWatchAgentServerPolicy` so it can be turned on later, but nothing is installed or alarming.
- **No backups.** `docs/operations.md` describes a `deploy/backup.sh` and a `kimply-backup` cron that do not exist in this repository for either environment.
- **No external uptime monitor.**
- **No HSTS.** See section 3c.

If dev goes down, nothing pages anyone. That is the correct trade for a development environment and the reason it costs roughly US$30 per month rather than more.
