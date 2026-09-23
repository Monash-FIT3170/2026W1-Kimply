# Kimply infrastructure (Terraform)

Infrastructure for running Kimply on ECS Fargate.
The design and every decision behind it are in [docs/ecs-target-architecture.md](../../docs/ecs-target-architecture.md); this file is only how to operate it.
Diagrams of the runtime, the Terraform files and a deploy are in [infra/docs/architecture.md](../docs/architecture.md).

| Path | Holds |
|---|---|
| `bootstrap/` | The S3 bucket for Terraform state. Local state, applied once |
| `modules/kimply-ecs/` | One Kimply environment: private subnets, NAT, ALB, ACM, ECS, IAM, secret, canary, alarms, scaling, budget |
| `envs/prod/` | Production. Calls the module with prod values |
| `envs/dev/` | Development. Same module, `FARGATE_SPOT`, 1-2 tasks, and it borrows production's NAT gateway (D40) |
| `../ecs/task-definition.prod.json` | The production task definition template, shared with the deploy pipeline |
| `../ecs/task-definition.dev.json` | The same for development |

Terraform 1.10 or newer is required, for S3-native state locking.

## Who owns what

Terraform owns the infrastructure and the **first** task definition revision.
The deploy pipeline owns every revision after that, rendered from the same template with `${IMAGE}` set to the commit's image.
The ECS service ignores `task_definition` and `desired_count` changes, so `terraform apply` never rolls back a deploy or fights auto scaling.

The template hard-codes names and ARNs because the pipeline cannot read Terraform state.
That includes the secret's full ARN with its random suffix: ECS treats a bare name in `valueFrom` as an SSM Parameter Store parameter, not a Secrets Manager secret.
Preconditions on the task definition fail the plan if the template and the infrastructure ever disagree.

## Things Terraform cannot do

| What | Why | Where |
|---|---|---|
| The `MONGO_URL` value | Kept out of state on purpose | `aws secretsmanager put-secret-value` |
| The ACM validation CNAMEs and the `ecs` / `www` CNAMEs | DNS is hosted at GoDaddy | GoDaddy DNS |
| Apex forwarding to `www` | GoDaddy feature | GoDaddy forwarding |
| The Atlas network access entry for the NAT IP | Atlas is outside AWS | Atlas UI |
| Clicking the SNS confirmation email | AWS requires it | Your inbox |

## First-time build (production)

Work from `infra/terraform`.
The stack serves `www.kimply.online`, and `ecs.kimply.online` remains as a second name that bypasses the apex redirect.
During the build it served `ecs.kimply.online` alone, beside the EC2 stack (D39).
Both stacks use the same Atlas database.

1. **State bucket**

   ```bash
   cd bootstrap && terraform init && terraform apply
   ```

2. **Variables**

   ```bash
   cd ../envs/prod
   cp terraform.tfvars.example terraform.tfvars   # then edit
   terraform init
   ```

3. **Certificate first.**
   The full apply waits for the certificate, so request it on its own and publish the validation records.

   ```bash
   terraform apply -target=module.kimply.aws_acm_certificate.app
   terraform output acm_validation_records
   ```

   There is one record per name on the certificate (`ecs` and `www`).
   Add each as a CNAME at GoDaddy, entering the name **without** the trailing `.kimply.online.`, because GoDaddy appends the domain itself.
   These records only prove ownership to ACM; they do not change where `www` points.

4. **Everything else**

   ```bash
   terraform plan -out=prod.tfplan
   terraform apply prod.tfplan
   ```

   This imports `GitHubActionsECRPush` and replaces only its trust policy.
   The service starts two tasks, which fail until steps 5 and 6 are done; the circuit breaker stops retrying on its own.
   Confirm the SNS subscription from the email AWS sends.

5. **The secret value.**
   Use the **same** `MONGO_URL` the EC2 stack uses today (from `/opt/kimply/.env` on the instance, or from Atlas plus your password manager).
   Reading it with `read -s` keeps it out of your terminal and shell history:

   ```bash
   read -rs MONGO_URL && echo "read ${#MONGO_URL} characters"
   aws secretsmanager put-secret-value --region ap-southeast-2 \
     --secret-id kimply/prod/mongo-url --secret-string "$MONGO_URL"
   unset MONGO_URL
   ```

6. **Atlas.**
   Add `terraform output -raw nat_public_ip` to the Atlas network access list.
   Keep the EC2 instance's entry; both stacks need access until the instance is retired.

7. **Start the tasks**

   ```bash
   aws ecs update-service --region ap-southeast-2 --cluster kimply-prod \
     --service kimply-prod --task-definition kimply-prod --force-new-deployment
   ```

8. **Publish the subdomain.**
   At GoDaddy, add a CNAME `ecs` pointing at `terraform output -raw alb_dns_name`.
   Then check it end to end and play a game on it:

   ```bash
   curl -s https://ecs.kimply.online/health/ready    # {"status":"ready"}, before any apex change
   ```

9. **Turn on the canary**, which also turns on alarm-based rollback: set `canary_enabled = true` in `terraform.tfvars` and apply.
   This is the moment to deliberately test a rollback, for example by deploying a revision whose secret points at a wrong database name.

## First-time build (development)

Development is the same module with different values, serving `dev.kimply.online` (and `ecs-dev.kimply.online` as a second name).
It has one extra step, because its template needs the secret's ARN and the ARN's suffix is random.

Work from `infra/terraform/envs/dev`.

1. `cp terraform.tfvars.example terraform.tfvars`, edit it, then `terraform init`.
2. Certificate first, as in production:

   ```bash
   terraform apply -target=module.kimply.aws_acm_certificate.app
   terraform output acm_validation_records
   ```

   Add both CNAMEs at GoDaddy (`ecs-dev` and `dev`).
3. Create the secret on its own, then put its ARN in the template:

   ```bash
   terraform apply -target=module.kimply.aws_secretsmanager_secret.mongo_url
   aws secretsmanager describe-secret --region ap-southeast-2 \
     --secret-id kimply/dev/mongo-url --query ARN --output text
   ```

   Replace the `...mongo-url-REPLACE` placeholder in `infra/ecs/task-definition.dev.json` with that ARN.
   A precondition fails the plan until it matches.
4. `terraform plan -out=dev.tfplan` and `terraform apply dev.tfplan`.
5. Put the development `MONGO_URL` into `kimply/dev/mongo-url`, exactly as in production step 5.
6. In the **development** Atlas cluster, allowlist the shared NAT IP (`terraform output -raw nat_gateway_id` egresses through production's Elastic IP, `terraform -chdir=../prod output -raw nat_public_ip`).
7. Start the tasks, add the `ecs-dev` CNAME, then set `canary_enabled = true`, as in production steps 7-9.

## Cutover

The app's `ROOT_URL` is what the browser opens its DDP socket against, so **DNS moves first**.
Deploying a `ROOT_URL` the DNS does not yet serve gives a page that loads and a game that cannot connect, and it fails the canary.

1. **GoDaddy, DNS records.** Point the hostname at the load balancer, replacing the old A record:

   | Type | Name | Value |
   |---|---|---|
   | CNAME | `www` | prod ALB (`terraform -chdir=envs/prod output -raw alb_dns_name`) |
   | CNAME | `dev` | dev ALB (`terraform -chdir=envs/dev output -raw alb_dns_name`) |

   Leave the two `_<hash>.www` / `_<hash>.dev` ACM validation CNAMEs in place permanently: they are what renews the certificates.

2. **Deploy the new `ROOT_URL`.** In one PR, change all three, which a Terraform precondition keeps in step:
   - `infra/ecs/task-definition.<env>.json`: `ROOT_URL`
   - `infra/terraform/envs/<env>/main.tf`: `domain_name`
   - `.github/workflows/deploy.yml`: that branch's `service_url`

3. **GoDaddy, the apex** (production only). Delete the apex `A` record and add **forwarding** to `https://www.kimply.online`, permanent (301), forward only, no masking.
   Tested on 2026-09-22: HTTPS works, but paths and query strings are dropped (A2, A3), so apex deep links reach a GoDaddy 404. New invite links are built from `window.location.origin`, so they use `www`.
   `dev` has no apex and needs nothing here.

4. **Apply**, with `check_apex_redirect = true` for production, so the canary also watches the redirect.

5. **Retire the EC2 instances.** Stop the instance, release its Elastic IP, and remove that IP from the Atlas network access list.
   The pipeline already ignores them, so nothing in CI changes.

## Day to day

- Deploys come from the pipeline, not from Terraform: a push to `main` runs `deploy/ecs-deploy.sh <sha>` in `.github/workflows/deploy.yml`.
  The same script deploys or rolls back by hand from a machine with the right credentials, for example `./deploy/ecs-deploy.sh <older-sha>`.
- A change to the task definition shape (CPU, env, health check) is a change to `infra/ecs/task-definition.prod.json` in a PR; the next deploy picks it up.
- A secret change needs a forced new deployment to take effect.
- Shell into a running task:

  ```bash
  aws ecs execute-command --region ap-southeast-2 --cluster kimply-prod \
    --task <task-id> --container app --interactive --command sh
  ```
