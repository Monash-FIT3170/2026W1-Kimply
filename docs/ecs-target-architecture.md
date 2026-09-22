# ECS target architecture (production)

This is the target design for moving Kimply production off a single EC2 instance running Docker Compose and Nginx, and onto ECS on Fargate behind an Application Load Balancer.
It was worked out one decision at a time on 2026-09-22 (Phase 2 of the migration), and is being built in Phase 3 under issue #1.

Until the cutover in [Migration](#migration) is complete, [deployment-manual.md](deployment-manual.md) still describes what is actually serving traffic.
The development environment (`dev.kimply.online`) is out of scope and stays on EC2 + Compose until it gets its own cluster.

## At a glance

```
Player
  │  kimply.online ──(GoDaddy forwarding)──► www.kimply.online (GoDaddy CNAME)
  ▼
ALB  (HTTPS :443, ACM cert, :80 → redirect)
  ▼
Target group  (ip, :3000, /health/live, sticky)
  ▼
ECS service kimply-prod  (Fargate, arm64, 2-4 tasks across 2 AZs)
  ▼  outbound only, via NAT gateway (Elastic IP)
MongoDB Atlas M0  (allowlist = NAT EIP)

GitHub Actions → ECR kimply:<sha> → task def revision → ECS rolling deploy
CloudWatch: task logs · canary on /health/ready → alarm → ECS rollback + SNS email
```

## Detailed

```
                     GoDaddy (registrar + DNS)
                     kimply.online  → forwarding → https://www.kimply.online (drops paths)
                     www            → CNAME → ALB DNS name
                     ACM validation → CNAME
                                  │
┌──────────────── Default VPC 172.31.0.0/16 (ap-southeast-2) ─────────────────┐
│                          Internet gateway                                   │
│  PUBLIC SUBNETS (existing default subnets)                                  │
│  ┌──────────────────────────────────────────────────┐  ┌─────────────────┐  │
│  │ ALB  [sg-alb: in 80,443 from anywhere]           │  │ NAT gateway     │  │
│  │  :80  → 301 https                                │  │ one AZ, new EIP │  │
│  │  :443 → ACM cert (www) → forward                 │  └───────▲─────────┘  │
│  │  target group: ip, HTTP :3000, /health/live,     │          │ outbound   │
│  │  cookie stickiness, deregistration delay 30s     │          │            │
│  └───────────┬──────────────────────┬───────────────┘          │            │
│  PRIVATE SUBNETS (new: 172.31.128.0/20 in 2a, 172.31.144.0/20 in 2b)        │
│  ┌───────────▼──────────┐ ┌─────────▼────────────┐             │            │
│  │ Task (AZ a)          │ │ Task (AZ b)          │─────────────┘            │
│  │ [sg-kimply-task: in  │ │                      │  Atlas :27017            │
│  │  3000 from sg-alb]   │ │                      │  AWS APIs :443           │
│  └──────────────────────┘ └──────────────────────┘                          │
│   ECS cluster kimply-prod · service kimply-prod · capacity provider FARGATE │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components

| Component | Responsible for | Replaces |
|---|---|---|
| GoDaddy DNS and forwarding | Apex → `www` redirect, `www` CNAME to the ALB, ACM validation record | Apex A record → Elastic IP |
| ACM | TLS certificate for `www`, renewed automatically | Let's Encrypt and the certbot cron |
| ALB | TLS termination, HTTP redirect, WebSocket/DDP, idle timeout, stickiness | Nginx |
| Target group | The current list of healthy task IPs, health checks on `/health/live` | `upstream app:3000` |
| ECS cluster `kimply-prod` | Boundary for prod services, tasks and capacity | The instance ID hard-coded in `deploy.yml` |
| ECS service | Desired count, rolling deploys, circuit breaker, alarm rollback | `restart: unless-stopped` and `deploy/deploy.sh` |
| Task definition | Image SHA, arm64, CPU/memory, env, secret reference, health check, logging, roles | The `app:` block of `docker-compose.prod.yml` and `APP_IMAGE` |
| Fargate | Compute per task, host failure | EC2 `t4g.small` |
| Private subnets, NAT gateway, Elastic IP | A single stable outbound IP for the Atlas allowlist | The instance's Elastic IP |
| Security groups | Internet reaches the ALB only; only the ALB reaches tasks on 3000 | `kimply-sg` |
| Secrets Manager | `MONGO_URL` | `/opt/kimply/.env` |
| Task execution role | Pull from ECR, write logs, read the secret | EC2 instance profile |
| Task role | ECS Exec | SSM Session Manager on the host |
| GitHub ECS deploy role | Register task definition revisions, update the service | `GitHubActionsEC2Commands` |
| CloudWatch Logs | Application logs | json-file log rotation |
| Synthetics canary and alarm | External readiness check, rollback trigger, uptime monitor | The public probe in `deploy.sh` |
| SNS topic | Email alerts | Nothing (there were none) |
| ECR, Atlas, GitHub Actions | Unchanged | - |

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | ECS owns task recovery and deploys; AWS owns host failure | An ASG or a host restart policy only sees machines, not containers |
| D2 | ECS on Fargate, arm64 | Chosen for learning, to mirror the ECS on Fargate setup used at work. ECS on EC2 is deliberately **not** ruled out and may be revisited |
| D3 | One cluster per environment: `kimply-prod` now, `kimply-dev` later | Keeps the "prod and dev share nothing" property and lets IAM scope by cluster |
| D4 | Tasks in private subnets, egress through a NAT gateway with an Elastic IP | Task IPs change every deploy; Atlas M0 needs one stable IP to allowlist |
| D5 | Prod uses the `FARGATE` capacity provider; dev will use `FARGATE_SPOT` | A Spot interruption drops every DDP session on the task |
| D6 | Fargate bills per running task; idle savings come only from service scaling | Fargate does not scale to zero on its own |
| D7 | Task size 0.5 vCPU / 1 GB | Idle usage is about 95 MiB. Meteor boot and poll-and-diff need CPU headroom. Right-size from CloudWatch data |
| D8 | ECS Exec enabled, via a task role scoped to its own cluster | Fargate has no host to shell into |
| D9 | `METEOR_SETTINGS` dropped | Nothing reads it |
| D10 | `MONGO_URL` stored whole as one Secrets Manager secret, no rotation yet | Meteor reads a single string. Matches the team's tooling at work |
| D11 | `ROOT_URL` and `PORT` are plain task definition environment | They are not secret, and they should roll back with a revision |
| D12 | Container health check on `/health/live`, restated in the task definition | ECS ignores the Dockerfile `HEALTHCHECK` |
| D13 | ALB target health check on `/health/live` | In ECS a failing ALB check also **replaces** the task. A Mongo-dependent check would restart-loop through an Atlas outage |
| D14 | `/health/ready` kept for the deploy smoke test, the canary and the runbook | It is the only check that proves the Atlas path, and nothing it drives can restart a task |
| D15 | ALB replaces Nginx: ACM cert, :80 redirect, target type `ip`, raised idle timeout | The proxy must learn task IPs from ECS |
| D16 | Tasks get no public IP | The ALB reaches them privately; they reach out through the NAT |
| D17 | DNS stays at GoDaddy; `www.kimply.online` is canonical and the apex is forwarded | GoDaddy cannot alias the apex to an ALB. `ROOT_URL` becomes `https://www.kimply.online` |
| D18 | Reuse the default VPC, add two private subnets and a NAT route table | No new VPC needed |
| D19 | `sg-alb`: 80/443 from anywhere. `sg-kimply-task`: 3000 from `sg-alb` only | Port 3000 is unreachable from the internet by two independent layers |
| D20 | Task egress is allow-all | Avoids breaking on a forgotten dependency port. Atlas is 27017, not 443 |
| D21 | A new Elastic IP for the NAT; both IPs on the Atlas allowlist during migration | Lets old and new stacks run in parallel |
| D22 | One NAT gateway | Accepted risk: an outage in its AZ leaves the site up but unable to reach Atlas |
| D23 | Two tasks across two AZs | Survives a task or AZ failure |
| D24 | Meteor polling interval lowered to a few seconds | Without an oplog on M0, a write on one task reaches the other task's subscribers only on its next poll |
| D25 | SockJS fallback kept, ALB cookie stickiness on | Long-polling requests must reach one task. Classroom networks may block WebSockets |
| D26 | Rolling deploy with min 100% / max 200%, smoke test on `/health/ready` after the service is stable | Old tasks keep serving until new ones are healthy |
| D27 | Retire `deploy.sh`, the SSM deploy step and role, Compose, Nginx, certbot, the bootstrap scripts and the host `.env` for prod | Replaced by ECS, ALB, ACM, Secrets Manager |
| D28 | The task definition is a JSON template in the repo; the pipeline fills in the SHA and registers a revision | Runtime changes are reviewed in PRs |
| D29 | Deregistration delay 30s | Draining cannot finish a DDP connection, only postpone it |
| D30 | Deployment circuit breaker with rollback | Catches tasks that never become healthy |
| D31 | Alarm-based rollback with a bake period | Catches tasks that are healthy but cannot reach Atlas |
| D32 | A Synthetics canary on `/health/ready` feeds that alarm and is the uptime monitor | ALB 5xx does not see DDP failures; Route 53 health check metrics live only in us-east-1 |
| D33 | Service auto scaling: min 2, max 4, CPU target tracking for scale-out only, scheduled overnight trim back to 2 | Scale-in drops players, so it only happens in a quiet window |
| D34 | Alerts via SNS to email: canary alarm, deployment failure or rollback; plus an AWS Budgets alert | Nothing pages anyone today |
| D35 | Separate GitHub OIDC roles for ECR push and ECS deploy | Least privilege per step. Both trust `main` on the upstream repo and, until it is deleted, this fork |
| D36 | Terraform owns infrastructure and the initial task definition; the pipeline owns revisions; the Terraform service ignores task definition changes | Stops `terraform apply` and the pipeline fighting over the running revision |
| D37 | Cutover by parallel run | Verify on the ALB hostname, switch GoDaddy, then retire the instance, its Elastic IP and its Atlas entry |
| D39 | Until cutover, the stack serves `ecs.kimply.online` beside the EC2 stack, against the same Atlas database. The certificate covers `ecs` and `www` from the start | A real hostname with a real certificate to play on before any production DNS changes. Same database because that is exactly what cutover will run against |
| D38 | The canary also checks that the apex root redirects to `www` | GoDaddy forwarding is otherwise unmonitored. Only the root is checked, because forwarding drops paths (A3) |

## Assumptions to validate

| # | Assumption | How |
|---|---|---|
| A1 | 0.5 vCPU / 1 GB is enough under real game load | CloudWatch task metrics during a real game |
| A2 | GoDaddy forwarding serves HTTPS on the apex with a valid certificate | **Confirmed 2026-09-22** on a test subdomain. HTTPS came up about an hour after the forward was created, with a GoDaddy-issued certificate |
| A3 | GoDaddy forwarding preserves path and query string | **False, and accepted.** Tested 2026-09-22: any path returns a GoDaddy 404 and the query string is dropped. New invite links use `www` (they are built from `window.location.origin`), so only old or hand-written apex deep links break |
| A4 | Free-plan credits cover the NAT, ALB, tasks, canary and Secrets Manager | Budget alert (D34) |
| A5 | Atlas M0 operation and connection limits hold with lower polling and up to 8 tasks during a deploy | Atlas metrics |
| A6 | The existing image runs unchanged on Fargate | First deploy |
| A7 | Meteor boots within the health check grace period at 0.5 vCPU | Measure boot time |

## Risks

| # | Risk |
|---|---|
| R1 | Until I3 is resolved, a deploy or the overnight trim during a live game may remove players who are still playing. Deploy when no games are running |
| R2 | Polling cost grows with active rooms × tasks ÷ polling interval, against the M0 operation limit |
| R3 | Single NAT gateway: an outage in its AZ leaves the site up but unable to reach Atlas |
| R4 | The apex depends on GoDaddy forwarding: apex deep links show a GoDaddy 404, and the forward may land on `http://www` for one unencrypted hop before the ALB upgrades it |
| R5 | Alarm-based rollback is not zero-downtime: a few minutes on the bad version |
| R6 | An Atlas outage during a bake period triggers a harmless but unnecessary rollback |
| R7 | A secret change takes effect only after a forced new deployment |
| R8 | After credits run out, the NAT, ALB, tasks and canary cost several times one `t4g.small` |
| R9 | I1-I4 below are unfixed |
| R11 | Until the EC2 instance is retired, EC2 and ECS are separate app processes on the same database, so the cross-process issues (I1-I4) apply between them, and a bug in an ECS build writes to live data |
| R10 | `iam:PassRole` and `ecs:ExecuteCommand` are where IAM is most likely to become too broad |

## Application issues found during design

Logged for later, not fixed as part of the migration.

| # | Issue |
|---|---|
| I1 | Cross-task reactivity lag: without an oplog, a write on one task is only seen by the other task's subscribers at its next poll. Mitigated by D24, not removed |
| I2 | The disconnect grace timer (`gameMethods.js`, `Meteor.onConnection`) lives in process memory, so it is lost when a task stops or is replaced |
| I3 | After an in-game DDP reconnect, `players.join` is skipped because `playerId` is already set, so `connectionId` may never be re-bound and the player may be removed after the 15s grace window. Needs an end-to-end reproduction |
| I4 | The read-then-write races in D4 of the defect register now span two processes |

## Unchanged

- GitHub Actions as the pipeline, triggered on push to `main`, with the same concurrency group and arm64 runner
- GitHub OIDC and the `GitHubActionsECRPush` role
- ECR repository `kimply`, full 40-character SHA tags, `deploy/build-push.sh`
- The Dockerfile and image
- Application code, apart from the polling interval
- MongoDB Atlas M0 cluster, user and database; only the allowlist changes
- GoDaddy as registrar and DNS host
- Region `ap-southeast-2`
- `/health/live`, `/health/ready`, `scripts/health-check.sh`
- The dev environment, for now

## Migration

The step-by-step commands are in [infra/terraform/README.md](../infra/terraform/README.md).

1. Create the Terraform state bucket, then the prod stack, alongside the running instance.
2. Add the ACM validation CNAMEs (for `ecs` and `www`) at GoDaddy.
3. Put the current `MONGO_URL` into Secrets Manager and add the NAT Elastic IP to the Atlas allowlist.
4. Point `ecs.kimply.online` at the ALB and play on it (D39). Turn on the canary.
5. Switch the `main` deploy workflow to ECS.
6. Cutover: change `ROOT_URL` and `domain_name` to `www`, point `www` at the ALB and set the apex forwarding at GoDaddy (A2 and A3 were tested on 2026-09-22; see Assumptions).
7. Retire the old instance, release its Elastic IP, and remove it from the Atlas allowlist.
