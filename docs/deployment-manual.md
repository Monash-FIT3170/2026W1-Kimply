# Kimply Production Deployment Runbook

Manual deployment to a single AWS EC2 instance, with Nginx as the public reverse proxy, Let's Encrypt TLS, MongoDB Atlas Free as the database, and images pulled from Amazon ECR by exact commit SHA.

Follow this top to bottom the first time.
Once the instance exists, only [Routine deployment](#7-routine-deployment) and [Rollback](#8-rollback) are needed day to day.

**Region:** `ap-southeast-2` (Sydney) throughout.

This runbook describes **production**.
The development environment at `dev.kimply.online` is the same stack with different names throughout; see [dev-environment.md](dev-environment.md), which is a delta against this document rather than a second copy of it.

---

## Contents

1. [Before you start](#1-before-you-start)
2. [Placeholders](#2-placeholders)
3. [ECR repository](#3-ecr-repository)
4. [IAM](#4-iam)
5. [EC2, Elastic IP, security group](#5-ec2-elastic-ip-security-group)
6. [MongoDB Atlas](#6-mongodb-atlas)
7. [DNS](#7-dns)
8. [Host bootstrap](#8-host-bootstrap)
9. [First deployment and TLS](#9-first-deployment-and-tls)
10. [Verification checklist](#10-verification-checklist)
11. [Routine deployment](#11-routine-deployment)
12. [Rollback](#12-rollback)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Before you start

You need:

- An AWS account with permission to create ECR repositories, IAM roles, EC2 instances and Elastic IPs.
- AWS CLI v2 configured locally (`aws sts get-caller-identity` must succeed).
- Docker with buildx on your machine. Apple Silicon builds `linux/arm64` natively; on x86 it runs under QEMU and is much slower.
- A domain you control, with the ability to create an A record.
- A MongoDB Atlas account.

**Architecture note.** The deployment target is `t4g.small`, which is **arm64** (Graviton).
Images are built for `linux/arm64` only.
An amd64 image will not run on it.

**The production host never builds.** Images are built on a developer machine, verified, pushed to ECR by commit SHA, and pulled by the instance.
That keeps a slow, memory-hungry Meteor build off the production box and makes rollback a tag change rather than a rebuild.

---

## 2. Placeholders

Substitute these throughout. Keep a note of them as you go.

| Placeholder | Meaning | Example |
|---|---|---|
| `<ACCOUNT_ID>` | AWS account id | `123456789012` |
| `<DOMAIN>` | Public hostname | `kimply.example.com` |
| `<EMAIL>` | Let's Encrypt contact | `you@example.com` |
| `<INSTANCE_ID>` | EC2 instance id | `i-0abc123...` |
| `<ELASTIC_IP>` | Allocated Elastic IP | `13.55.x.x` |
| `<SHA>` | Full 40-character git commit SHA | `a1b2c3...` |

Both environments exist in the same AWS account, so the placeholders resolve differently depending on which one you are working on:

| Placeholder | Production | Development |
|---|---|---|
| `<DOMAIN>` | `kimply.online` | `dev.kimply.online` |
| `<INSTANCE_ID>` | `i-08184036cf37c932c` | `i-09575e88c984e1c7d` |
| `<ELASTIC_IP>` | `15.134.53.178` | `15.134.96.122` |
| `ECR_REPOSITORY` | `kimply` | `kimply-dev` |

Getting these two mixed up is the single most consequential mistake available in this document.
Check `<INSTANCE_ID>` before every `ssm start-session` and every `deploy.sh`.

Get your account id with:

```bash
aws sts get-caller-identity --query Account --output text
```

---

## 3. ECR repository

**Tag mutability must be `IMMUTABLE`, and it cannot be changed later without recreating the repository.**
This is what makes rollback trustworthy: a given SHA can never be overwritten, so the image you roll back to is provably the one that was running before.

```bash
aws ecr create-repository \
  --repository-name kimply \
  --region ap-southeast-2 \
  --image-tag-mutability IMMUTABLE \
  --image-scanning-configuration scanOnPush=true
```

Attach a lifecycle policy so storage stays bounded.
Without it, ECR grows unchecked with every deploy.

```bash
cat > /tmp/ecr-lifecycle.json <<'EOF'
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Expire untagged images after 1 day",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 1
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "Keep only the 10 most recent tagged images",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": { "type": "expire" }
    }
  ]
}
EOF

aws ecr put-lifecycle-policy \
  --repository-name kimply \
  --region ap-southeast-2 \
  --lifecycle-policy-text file:///tmp/ecr-lifecycle.json
```

Ten retained images means nine rollback targets, which is ample.

---

## 4. IAM

Push and pull are deliberately separated.
Developers can push but not pull to the instance role; the instance can pull but **cannot push**, so a compromised instance cannot poison the registry.

### 4a. Instance role (`kimply-ec2-role`)

```bash
cat > /tmp/ec2-trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ec2.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role \
  --role-name kimply-ec2-role \
  --assume-role-policy-document file:///tmp/ec2-trust.json

# Session Manager. This is what replaces SSH; no port 22 is ever opened.
aws iam attach-role-policy --role-name kimply-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

# CloudWatch agent (used in docs/operations.md).
aws iam attach-role-policy --role-name kimply-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy
```

ECR **pull only**:

```bash
cat > /tmp/ecr-pull.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrAuthToken",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "EcrPullKimplyOnly",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchCheckLayerAvailability",
        "ecr:DescribeImages"
      ],
      "Resource": "arn:aws:ecr:ap-southeast-2:<ACCOUNT_ID>:repository/kimply"
    }
  ]
}
EOF

aws iam put-role-policy --role-name kimply-ec2-role \
  --policy-name kimply-ecr-pull --policy-document file:///tmp/ecr-pull.json
```

`ecr:GetAuthorizationToken` requires `"Resource": "*"` because AWS does not support resource-level scoping for that action.
It grants nothing on its own; the pull actions above are scoped to the one repository.

Create the instance profile:

```bash
aws iam create-instance-profile --instance-profile-name kimply-ec2-profile
aws iam add-role-to-instance-profile \
  --instance-profile-name kimply-ec2-profile --role-name kimply-ec2-role
```

### 4b. Developer push policy (`kimply-ecr-push`)

Attach to the IAM user or SSO permission set that runs `deploy/build-push.sh`.
Do **not** attach it to the instance role.

```bash
cat > /tmp/ecr-push.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage",
        "ecr:DescribeImages",
        "ecr:ListImages"
      ],
      "Resource": "arn:aws:ecr:ap-southeast-2:<ACCOUNT_ID>:repository/kimply"
    }
  ]
}
EOF

aws iam create-policy --policy-name kimply-ecr-push \
  --policy-document file:///tmp/ecr-push.json
```

---

## 5. EC2, Elastic IP, security group

### 5a. Security group

**This is not optional.** AWS will not launch an instance without a security group, so the only question is what it contains.

The contents here are deliberately permissive on the player-facing path: **80 and 443 are open to the entire internet**, which is exactly the "anyone can play, no account needed" model.
Its real job is to make sure that if anything ever binds an unexpected port on the host, it is not silently reachable.

```bash
VPC_ID=$(aws ec2 describe-vpcs --region ap-southeast-2 \
  --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)

SG_ID=$(aws ec2 create-security-group \
  --region ap-southeast-2 \
  --group-name kimply-sg \
  --description "Kimply: public HTTP/HTTPS only, no SSH" \
  --vpc-id "$VPC_ID" \
  --query GroupId --output text)

aws ec2 authorize-security-group-ingress --region ap-southeast-2 \
  --group-id "$SG_ID" --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --region ap-southeast-2 \
  --group-id "$SG_ID" --protocol tcp --port 443 --cidr 0.0.0.0/0

echo "SG_ID=$SG_ID"
```

**No port 22 rule.** Shell access is via SSM Session Manager.

The default VPC is fine here.
There is no private tier to isolate (the database is external to AWS entirely), and a custom VPC would want a NAT gateway at roughly US$45/month, more than the rest of this stack combined.

### 5b. Launch the instance

Resolve the current Ubuntu 24.04 **arm64** AMI rather than hardcoding an id:

```bash
AMI_ID=$(aws ssm get-parameter --region ap-southeast-2 \
  --name /aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id \
  --query 'Parameter.Value' --output text)
echo "AMI_ID=$AMI_ID"
```

```bash
aws ec2 run-instances \
  --region ap-southeast-2 \
  --image-id "$AMI_ID" \
  --instance-type t4g.medium \
  --iam-instance-profile Name=kimply-ec2-profile \
  --security-group-ids "$SG_ID" \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":30,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --metadata-options 'HttpTokens=required,HttpEndpoint=enabled' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=kimply},{Key=App,Value=kimply},{Key=Env,Value=production}]' \
  --query 'Instances[0].InstanceId' --output text
```

Notes:
- **No `--key-name`.** No SSH key is needed or wanted.
- `HttpTokens=required` enforces IMDSv2, which blocks the SSRF-style credential theft that IMDSv1 allows.
- The `App` and `Env` tags exist so future automation can target the instance by tag.

### 5c. Elastic IP

Required for two independent reasons: the DNS A record must be stable, and **Atlas network access is allowlisted to this exact address**.
A stop/start without an Elastic IP changes the public IP and silently breaks database connectivity.

```bash
ALLOC_ID=$(aws ec2 allocate-address --region ap-southeast-2 --domain vpc \
  --query AllocationId --output text)

aws ec2 associate-address --region ap-southeast-2 \
  --instance-id <INSTANCE_ID> --allocation-id "$ALLOC_ID"

aws ec2 describe-addresses --region ap-southeast-2 \
  --allocation-ids "$ALLOC_ID" --query 'Addresses[0].PublicIp' --output text
```

Record the result as `<ELASTIC_IP>`.

---

## 6. MongoDB Atlas

Greenfield: the `kimply` database is created empty.
Nothing is migrated, so there is no cutover and no duplicate-key risk when the unique indexes are built.

1. **Confirm the cluster is M0** (free tier: 512 MB storage, 500 connections, shared CPU, no oplog access).
2. **Create a dedicated application user.** Not the account owner.
   - Role: **`readWrite` on database `kimply` only**. Not `atlasAdmin`, not `readWriteAnyDatabase`.
   - Generate the password with `openssl rand -base64 32`.
   - It goes only into `/opt/kimply/.env` on the instance. Never into git, an image, or a chat window.
3. **Network access:** delete any `0.0.0.0/0` entry. Add exactly one:
   - `<ELASTIC_IP>/32`
   - Add a temporary developer IP only while iterating, and remove it afterwards.
   - This restricts who can reach the *database*. Players never touch Atlas directly, so it has no effect on who can play.
4. **Connection string** for `.env`:

```
MONGO_URL=mongodb+srv://kimply_app:<PASSWORD>@kimply-mongodb.rom2saq.mongodb.net/kimply?retryWrites=true&w=majority&maxPoolSize=20&appName=Kimply
```

Three things that are easy to get wrong:
- **The database name `kimply` must be in the path.** Without it every collection lands in `test`.
- **Do not add `directConnection=true`.** It disables replica-set discovery and breaks `+srv`.
- `maxPoolSize=20` keeps one app instance from consuming a large share of the 500-connection allowance.

### Reactivity note, worth understanding

Atlas shared tiers do not grant access to `local.oplog.rs`, so Meteor cannot use oplog tailing and falls back to poll-and-diff.

This is fine **at exactly one app instance**, because Meteor re-polls affected cursors immediately when a write happens in the same server process.
With one container, every write goes through that process, so reactivity is effectively instant.

It degrades to up-to-10-second update latency the moment a second instance is added without oplog access.
That is a hard constraint on horizontal scaling, not a problem today.

---

## 7. DNS

Create an A record at your DNS provider:

```
<DOMAIN>   A   <ELASTIC_IP>   TTL 300
```

Wait for it to resolve before requesting a certificate, or the ACME challenge will fail:

```bash
dig +short <DOMAIN>     # must print <ELASTIC_IP>
```

A short TTL is deliberate while setting up, so a mistake is cheap to correct.

---

## 8. Host bootstrap

Connect over SSM (no SSH):

```bash
aws ssm start-session --region ap-southeast-2 --target <INSTANCE_ID>
```

If this fails, the instance role or SSM agent is not right. Do not open port 22 as a workaround.

Copy `deploy/bootstrap-ec2.sh` onto the instance and run it as root:

```bash
sudo bash /tmp/bootstrap-ec2.sh
```

It installs Docker CE and the compose plugin, installs **AWS CLI v2** (required by `deploy.sh` for ECR auth, and not shipped with Ubuntu), creates a 2 GB swap file (`SWAP_SIZE_MB` in `deploy/bootstrap-ec2.sh`), creates `/opt/kimply`, and installs the certificate renewal cron.
It is idempotent.

Then place the deployment configuration in `/opt/kimply`:

```
/opt/kimply/
├── docker-compose.prod.yml
├── nginx/
│   ├── nginx.conf
│   └── templates/kimply.conf.template
├── deploy/
│   ├── deploy.sh
│   └── init-letsencrypt.sh
├── scripts/
│   └── health-check.sh
└── .env                     <- created next, never committed
```

**The application source is not needed on the instance.**
That is a real reduction in what lives on a public-facing box.

---

## 9. First deployment and TLS

### 9a. Build and push from your machine

```bash
./deploy/build-push.sh
```

This builds `linux/arm64`, asserts the image declares a `HEALTHCHECK`, and pushes it tagged with the commit SHA.
It reads `ECR_REPOSITORY` from the environment, which is how the same script serves both environments.

It does **not** refuse a dirty working tree and does **not** boot the image before pushing.
An earlier version did both; the rewrite that moved the build into CI dropped them.
The health gate that does exist is in `deploy.sh`, after the image is already in the registry.

Note the SHA it prints.

### 9b. Create the environment file

On the instance, as root:

```bash
cd /opt/kimply
umask 077
cp .env.production.example .env
nano .env
stat -c '%a %U:%G' .env      # MUST print: 600 root:root
```

Fill in `APP_IMAGE`, `DOMAIN`, `ROOT_URL`, `LETSENCRYPT_EMAIL`, `MONGO_URL`, `AWS_REGION`, `ECR_REGISTRY`, `ECR_REPOSITORY`.

`ROOT_URL` must be the **public HTTPS origin**.
Meteor puts it in `__meteor_runtime_config__`, so a wrong value breaks the client's DDP endpoint.

### 9c. Issue the certificate

**Always dry-run first.** Let's Encrypt allows only 5 duplicate certificates per week, and iterating on a broken setup will exhaust that quota fast.

```bash
./deploy/init-letsencrypt.sh --dry-run
```

Then for real:

```bash
./deploy/init-letsencrypt.sh
```

The script creates a self-signed placeholder certificate so nginx can start, brings nginx up, runs `nginx -t`, obtains the real certificate over the HTTP-01 webroot challenge, validates the config again, and reloads.

The placeholder approach means there is **one nginx config for every environment**, so what you validated locally is exactly what runs here.

### 9d. Deploy

```bash
./deploy/deploy.sh <SHA>
```

### 9e. Enable HSTS

Only after HTTPS is confirmed working.
Uncomment the `Strict-Transport-Security` line in `nginx/templates/kimply.conf.template`, then:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate nginx
```

Enabling HSTS before successful issuance locks browsers out of the site.

---

## 10. Verification checklist

Run all of these. Several failures are silent.

```bash
# HTTP redirects to HTTPS
curl -I http://<DOMAIN>/                       # expect 301

# App is ready end to end (DNS, EIP, SG, nginx, TLS, app, Atlas)
curl -sS https://<DOMAIN>/health/ready         # expect {"status":"ready"}
./scripts/health-check.sh https://<DOMAIN>

# nginx itself is up, independent of the app
curl -sS https://<DOMAIN>/healthz              # expect ok

# WebSocket upgrade actually happened. THIS IS THE ONE PEOPLE MISS:
# without a 101 the client silently falls back to SockJS long-polling,
# which still works but multiplies connections and latency at scale.
docker compose -f docker-compose.prod.yml --env-file .env logs nginx | grep " 101 "

# Nothing but 80/443 is exposed
nmap -Pn -p 22,80,443,3000,27017 <DOMAIN>      # only 80 and 443 open

# Certificate renewal will work in 60 days
docker compose -f docker-compose.prod.yml --env-file .env run --rm certbot renew --dry-run

# Secrets are protected
stat -c '%a %U:%G' /opt/kimply/.env            # 600 root:root

# TLS configuration
# (from your machine) testssl.sh <DOMAIN>, or use SSL Labs
```

Then **play a full game from two devices on different networks**, including using the copied invite link.
The invite link matters specifically: `navigator.clipboard` is unavailable outside a secure context, and the UI reports "Copied" either way, so the copy button silently fails over plain HTTP.

---

## 11. Routine deployment

Normally you do not run this at all.
`.github/workflows/deploy.yml` performs exactly these steps on every push: `main` deploys to production, `dev` deploys to development.
The manual path below is for when CI is unavailable, or for deploying a SHA that is not the tip of a branch.

```bash
# On your machine. ECR_REPOSITORY selects the environment.
ECR_REPOSITORY=kimply     ./deploy/build-push.sh        # production, prints <SHA>
ECR_REPOSITORY=kimply-dev ./deploy/build-push.sh        # development

# On the instance. Check you targeted the right one.
aws ssm start-session --region ap-southeast-2 --target <INSTANCE_ID>
sudo /opt/kimply/deploy/deploy.sh <SHA>
```

`deploy.sh` pulls before touching anything running, validates the compose config, recreates **only** the app container (`--no-deps`, so TLS never blips), waits for the container healthcheck, probes the public HTTPS endpoint, and **rolls back automatically** if either check fails.

**Deploying interrupts any game in progress.**
The `autoupdate` and `hot-code-push` Meteor packages are active in the production bundle, so every connected client reloads itself when a new bundle ships.
No deployment strategy avoids that without pinning client bundle versions.
Deploy outside play sessions.

---

## 12. Rollback

Rollback is a deploy with an older SHA, through the exact same health-gated path:

```bash
sudo /opt/kimply/deploy/deploy.sh <PREVIOUS_SHA>
```

There is deliberately no separate rollback script.
A rollback runs during an incident, which is the worst possible time to be exercising a less-tested code path.

List what is available:

```bash
aws ecr describe-images --region ap-southeast-2 --repository-name kimply \
  --query 'sort_by(imageDetails,&imagePushedAt)[*].[imageTags[0],imagePushedAt]' \
  --output table
```

What is currently deployed:

```bash
grep '^APP_IMAGE=' /opt/kimply/.env
```

---

## 13. Troubleshooting

| Symptom | Likely cause | Check |
|---|---|---|
| `deploy.sh` exits 2 | Precondition failed (bad SHA, missing `.env`) | Read the error; it names the specific problem |
| `deploy.sh` exits 1 | Deploy failed, previous image restored automatically | `docker compose logs --tail=100 app` |
| `deploy.sh` exits 3 | Rollback also failed, **site is down** | `docker compose ps`, `docker compose logs app` |
| Container never healthy | Cannot reach Atlas | Confirm the Elastic IP is in the Atlas allowlist; check `MONGO_URL` has `/kimply` in the path |
| `/health/ready` returns 503 | App is up, MongoDB is not reachable | Same as above |
| nginx will not start | Certificate missing at the configured path | Re-run `init-letsencrypt.sh`; check `DOMAIN` matches the certificate directory |
| Certificate request fails | DNS not resolving, or port 80 blocked | `dig +short <DOMAIN>`; confirm the security group allows 80 |
| Real-time updates lag ~10s | More than one app instance without oplog | Should not happen with this architecture; check `docker compose ps` |
| Game feels sluggish at scale | WebSocket upgrade failing, long-polling fallback | Look for `101` in the nginx access log |
| `docker pull` denied | Instance role lacks ECR pull, or wrong region | `aws sts get-caller-identity` on the instance |
| Push rejected as existing tag | Tags are immutable and that SHA is already pushed | Commit a change; the SHA is the tag |

### Useful commands on the instance

```bash
cd /opt/kimply
docker compose -f docker-compose.prod.yml --env-file .env ps
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=100 app
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=100 nginx
docker compose -f docker-compose.prod.yml --env-file .env exec nginx nginx -t
docker inspect -f '{{.State.Health.Status}}' kimply-app
```

Day-2 operations, monitoring and backups are in [operations.md](operations.md).
