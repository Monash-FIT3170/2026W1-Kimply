# Kimply Operations

Day-2 operations for the production deployment: monitoring, backups, cost, and incident response.

Setup and deployment are in [deployment-manual.md](deployment-manual.md).
Known application defects are in [defect-register.md](defect-register.md).

**Last updated:** 2026-08-05

---

## Contents

1. [What to watch](#1-what-to-watch)
2. [CloudWatch setup](#2-cloudwatch-setup)
3. [MongoDB Atlas monitoring](#3-mongodb-atlas-monitoring)
4. [External uptime](#4-external-uptime)
5. [Backups](#5-backups)
6. [Incident runbook](#6-incident-runbook)
7. [Cost](#7-cost)
8. [Capacity and scaling triggers](#8-capacity-and-scaling-triggers)

---

## 1. What to watch

Optimised for cost. A new AWS account's free tier covers 10 custom metrics, 10 alarms and 5 GB of log ingestion for 12 months, which is enough for everything below.

| Signal | Source | Alarm at | Why it matters |
|---|---|---|---|
| CPU utilisation | `CPUUtilization` (free) | >80% for 10 min | Saturation |
| **CPU credit balance** | `CPUCreditBalance` (free) | <100 | **The one people forget.** On a burstable T-family instance this predicts a performance cliff before CPU itself looks bad |
| Memory | `mem_used_percent` (agent) | >85% | Meteor's merge boxes grow with subscriber count |
| Disk | `disk_used_percent` on `/` | >80% | Docker images and logs accumulate |
| nginx 5xx rate | log metric filter | >10 in 5 min | App errors reaching users |
| Upstream latency | `urt=` in the nginx log | p95 >1s | Meteor or Atlas slowing down |
| Public readiness | external monitor | 2 consecutive failures | Catches "the whole box is gone" |
| Atlas connections | Atlas alerts | >400 of 500 | Connection leak or scaling limit |
| Atlas disk | Atlas alerts | >78% of 512 MB | Free tier ceiling |

`$request_time` versus `$upstream_response_time` in the nginx log is the primary attribution signal.
If `rt` is much larger than `urt`, the delay is in nginx or the network, not in Meteor.

---

## 2. CloudWatch setup

The instance role already has `CloudWatchAgentServerPolicy` from the deployment runbook.

Install the agent (arm64) on the instance:

```bash
curl -fsSLo /tmp/amazon-cloudwatch-agent.deb \
  https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/arm64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i /tmp/amazon-cloudwatch-agent.deb
```

Write `/opt/aws/amazon-cloudwatch-agent/etc/config.json`:

```json
{
  "agent": { "metrics_collection_interval": 60 },
  "metrics": {
    "namespace": "Kimply",
    "append_dimensions": { "InstanceId": "${aws:InstanceId}" },
    "metrics_collected": {
      "mem": { "measurement": [{ "name": "mem_used_percent", "rename": "MemoryUsedPercent" }] },
      "disk": {
        "resources": ["/"],
        "measurement": [{ "name": "disk_used_percent", "rename": "DiskUsedPercent" }]
      }
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/lib/docker/containers/*/*-json.log",
            "log_group_name": "/kimply/containers",
            "retention_in_days": 7
          },
          {
            "file_path": "/var/log/kimply-certbot.log",
            "log_group_name": "/kimply/certbot",
            "retention_in_days": 30
          }
        ]
      }
    }
  }
}
```

Start it:

```bash
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json
```

Set retention deliberately.
CloudWatch log groups default to **never expire**, which quietly turns into a recurring cost.

### Alarms

```bash
# CPU credit exhaustion - the most valuable single alarm on a T-family instance
aws cloudwatch put-metric-alarm --region ap-southeast-2 \
  --alarm-name kimply-cpu-credits-low \
  --namespace AWS/EC2 --metric-name CPUCreditBalance \
  --dimensions Name=InstanceId,Value=<INSTANCE_ID> \
  --statistic Average --period 300 --evaluation-periods 2 \
  --threshold 100 --comparison-operator LessThanThreshold

# Memory
aws cloudwatch put-metric-alarm --region ap-southeast-2 \
  --alarm-name kimply-memory-high \
  --namespace Kimply --metric-name MemoryUsedPercent \
  --dimensions Name=InstanceId,Value=<INSTANCE_ID> \
  --statistic Average --period 300 --evaluation-periods 2 \
  --threshold 85 --comparison-operator GreaterThanThreshold
```

Repeat for `CPUUtilization` (>80) and `DiskUsedPercent` (>80).
Attach an SNS topic to `--alarm-actions` so alarms reach an inbox.

Start thresholds loose and tighten them using the load-test baseline.
Alarm fatigue is worse than no alarms.

### Container restarts

Rather than wiring `docker events` into CloudWatch, a small cron writing to an agent-watched file is enough:

```bash
# /etc/cron.d/kimply-container-health
*/5 * * * * root docker ps --filter health=unhealthy --format 'UNHEALTHY {{.Names}}' >> /var/log/kimply-health.log 2>&1
```

---

## 3. MongoDB Atlas monitoring

Free and built into the Atlas UI. Use it rather than paying to duplicate it in CloudWatch.

- **Metrics tab** - operation rates, connection count, and **query targeting ratio** (documents scanned per document returned). A ratio far above 1 is the direct signal for a missing index.
- **Performance Advisor** - automatic index suggestions, available on the free tier.
- **Profiler** - slow queries.
- **Alerts** - configure connections >400 of 500 and disk usage >78% of 512 MB.

The indexes created by `app/server/indexes.js` should keep query targeting close to 1.
If it drifts, something is querying an unindexed field.

---

## 4. External uptime

CloudWatch agent metrics cannot tell you the instance is gone, because they come from the instance.

Set up a free external monitor (UptimeRobot or similar):

- URL: `https://<DOMAIN>/health/ready`
- Interval: 5 minutes
- Alert after 2 consecutive failures
- Email or webhook notification

`/health/ready` is the right target rather than `/`, because it also proves MongoDB connectivity.

---

## 5. Backups

Atlas M0 has **no automated backup**. This is a deliberate trade for the free tier.

The data is a student game, and the TTL indexes keep total volume in single-digit megabytes, so a simple nightly dump is proportionate.

### Nightly dump

Create a **read-only** Atlas user for backups (do not reuse the application user), then:

```bash
# /etc/cron.d/kimply-backup
0 4 * * * root /opt/kimply/deploy/backup.sh >> /var/log/kimply-backup.log 2>&1
```

```bash
#!/usr/bin/env bash
# /opt/kimply/deploy/backup.sh
set -Eeuo pipefail
BACKUP_DIR=/var/backups/kimply
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$BACKUP_DIR"

source /opt/kimply/.env   # provides MONGO_BACKUP_URL

docker run --rm \
  -v "$BACKUP_DIR:/dump" \
  mongo:7.0 \
  mongodump --uri="$MONGO_BACKUP_URL" --archive="/dump/kimply-$STAMP.archive" --gzip

# Keep 7 days
find "$BACKUP_DIR" -name 'kimply-*.archive' -mtime +7 -delete
echo "backup complete: kimply-$STAMP.archive"
```

### Restore

```bash
docker run --rm -v /var/backups/kimply:/dump mongo:7.0 \
  mongorestore --uri="$MONGO_URL" --archive=/dump/kimply-<STAMP>.archive --gzip --drop
```

**Test the restore at least once.** An untested backup is a guess.

Optionally sync to S3 for off-instance durability, which costs pennies at this volume.
A backup that only exists on the instance does not survive losing the instance.

---

## 6. Incident runbook

### The site is down

```bash
aws ssm start-session --region ap-southeast-2 --target <INSTANCE_ID>
cd /opt/kimply
docker compose -f docker-compose.prod.yml --env-file .env ps
```

Work outward from the app:

1. `curl -sS localhost/healthz` - is nginx alive at all?
2. `docker inspect -f '{{.State.Health.Status}}' kimply-app` - is the app healthy?
3. `docker compose ... logs --tail=100 app` - what did it say?
4. `curl -sS https://<DOMAIN>/health/ready` - 503 means the app is up but MongoDB is not reachable.

### After a bad deploy

`deploy.sh` rolls back automatically. If it exited 3, the rollback also failed:

```bash
grep '^APP_IMAGE=' /opt/kimply/.env                    # what it is on now
aws ecr describe-images --region ap-southeast-2 --repository-name kimply \
  --query 'sort_by(imageDetails,&imagePushedAt)[*].[imageTags[0],imagePushedAt]' --output table
sudo /opt/kimply/deploy/deploy.sh <KNOWN_GOOD_SHA>
```

### Certificate expired

Renewal runs daily at 03:00 via `/etc/cron.d/kimply-certbot-renew`.
If it lapsed:

```bash
tail -50 /var/log/kimply-certbot.log
cd /opt/kimply
docker compose -f docker-compose.prod.yml --env-file .env run --rm certbot renew --force-renewal
docker compose -f docker-compose.prod.yml --env-file .env exec nginx nginx -t
docker compose -f docker-compose.prod.yml --env-file .env exec nginx nginx -s reload
```

### Disk full

Most likely Docker images accumulating.

```bash
df -h /
docker system df
docker image prune -f --filter "until=168h"
```

**Never `docker system prune -a`** on this host: it deletes the previous image and turns an instant rollback into a re-pull.

### A game is stuck and nobody can proceed

This is defect **D5**: round advancement requires *every* active player to submit, and there is no server-side deadline.
One player closing their tab stalls that room permanently.

There is no clean operational fix.
As a last resort the round can be forced from the database, but the real fix is a server-side round deadline.
See [defect-register.md](defect-register.md#d5---no-server-side-round-deadline).

---

## 7. Cost

Approximate, `ap-southeast-2`, USD per month.

### Fixed

| Item | Cost |
|---|---|
| EC2 `t4g.medium` on demand | $26.86 |
| EBS gp3 30 GB | $2.88 |
| Elastic IP / public IPv4 | $3.65 |
| ECR storage (~10 images, heavy layer sharing) | $0.15-0.20 |
| Route 53 | $0.00 (DNS is external) |
| MongoDB Atlas M0 | $0.00 |
| CloudWatch | $0.00-5.00 (free tier covers 12 months) |
| **Total** | **~$33-38/month** (roughly A$51-58) |

### Usage-dependent

Data transfer out: first 100 GB/month free AWS-wide, then $0.114/GB.
A player session is a few MB, so expect $0.

### Reducing it

- **1-year no-upfront Savings Plan on `t4g.medium`**: about 28% off, bringing EC2 to roughly $19/month.
- **`t4g.small`** (2 GB, ~$13/month) is genuinely viable now that builds happen off-box. The runtime budget is roughly 700 MB-1 GB. Treat it as a post-load-test optimisation, not a starting point, and confirm headroom first.

### Watch out for

- CloudWatch log groups default to **never expire**. Set retention explicitly (done in the config above).
- Elastic IPs are billed even while attached, and billed *more* when unattached. Release it if the instance is torn down.
- ECR without a lifecycle policy grows unbounded.

---

## 8. Capacity and scaling triggers

Exhaust the cheap options before spending on availability infrastructure.

| Trigger | Action | Cost |
|---|---|---|
| Memory >85% sustained, or CPU credits exhausting | `t4g.medium` -> `t4g.large` (8 GB). A stop/start | +$27/month |
| Query targeting stays poor after indexing, or Atlas opcounters plateau while EC2 idles | Atlas M10 (dedicated, adds oplog and automated backups) | +$60/month |
| Load test detects the D4 races, or players report lost lives and duplicate winners | Fix the correctness defects. **Do this before any horizontal scaling** | engineering time |
| One instance genuinely saturated after the above | Horizontal scaling | ~$130/month |

**Horizontal scaling is a bigger step than it looks**, for two reasons that are easy to miss:

1. It needs **sticky sessions** for DDP session resumption and SockJS fallback.
2. It needs **Atlas M10+ for oplog access**. Without it, poll-and-diff across multiple processes degrades reactive updates to as much as 10 seconds, because the immediate same-process re-poll no longer covers writes made by the other instance.

It also removes the single-process serialisation that currently masks the D4 read-then-write races by accident, which is why fixing those comes first.

Application Load Balancer at $18.40/month plus LCU charges costs more than the EC2 instance itself, so it is only worth it once there is genuinely more than one instance to balance.
