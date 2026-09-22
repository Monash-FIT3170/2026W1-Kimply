# Kimply on ECS: diagrams

Visual reference for the ECS Fargate stack in `infra/`.
The reasoning behind every piece (the D-numbers below) is in [docs/ecs-target-architecture.md](../../docs/ecs-target-architecture.md), and how to build it is in [infra/terraform/README.md](../terraform/README.md).

GitHub renders these diagrams directly.
In VS Code, a Mermaid preview extension does the same.

## 1. Runtime: how a request and a database call travel

This is the end state after cutover.
Until then the same stack serves `ecs.kimply.online` (a GoDaddy CNAME to the ALB), and `kimply.online` and `www` still point at the EC2 instance (D39).

Solid arrows are traffic players cause.
Dotted arrows are traffic the tasks start themselves.
Both directions cross the VPC's internet gateway, which is left out to keep the picture readable.

```mermaid
flowchart TB
    player(["Player's browser"])

    subgraph godaddy["GoDaddy DNS"]
        apex["kimply.online<br/>forwarding to www<br/>(drops paths)"]
        www["www.kimply.online<br/>CNAME to the ALB"]
    end

    subgraph vpc["AWS ap-southeast-2 · default VPC"]
        subgraph public["Public subnets (existing)"]
            alb["ALB · sg-alb<br/>:80 redirects to HTTPS<br/>:443 TLS with the ACM cert"]
            tg["Target group<br/>ip · :3000 · /health/live · sticky"]
        end

        subgraph private["Private subnets 2a + 2b (new)"]
            taskA["Task A · Meteor :3000<br/>sg-kimply-task"]
            taskB["Task B · Meteor :3000<br/>sg-kimply-task"]
        end

        nat["NAT gateway (public subnet, AZ a)<br/>one Elastic IP"]
    end

    subgraph outside["Reached only through the NAT"]
        atlas[("MongoDB Atlas M0<br/>allowlist = NAT Elastic IP")]
        ecr[("ECR<br/>kimply:sha")]
        secret[("Secrets Manager<br/>MONGO_URL")]
        logs["CloudWatch Logs"]
    end

    player -->|"types kimply.online"| apex
    apex -->|"301"| www
    player -->|"opens www"| www
    www --> alb --> tg
    tg -->|"HTTP + DDP WebSocket"| taskA
    tg -->|"HTTP + DDP WebSocket"| taskB

    taskA -.-> nat
    taskB -.-> nat
    nat -.->|":27017"| atlas
    nat -.->|":443"| ecr
    nat -.->|":443"| secret
    nat -.->|":443"| logs
```

## 2. Terraform: which file builds what

An arrow `A --> B` means **B references something in A**, so Terraform creates A first.
References are the only thing that sets the order; there is no step list anywhere.

### 2a. The files and what they hand each other

```mermaid
flowchart LR
    subgraph prod["envs/prod (which values)"]
        tfvars["terraform.tfvars<br/>(gitignored)"] --> rootvars["variables.tf"] --> modcall["main.tf<br/>module kimply"]
        lookups["main.tf<br/>data: default VPC + subnets"] --> modcall
        imports["imports.tf<br/>adopts the existing<br/>ECR push role"]
        backend["backend.tf<br/>state in S3"]
    end

    template["infra/ecs/<br/>task-definition.prod.json"]

    subgraph module["modules/kimply-ecs (what gets built)"]
        network["network.tf"]
        sgs["security_groups.tf"]
        albf["alb.tf"]
        iamf["iam.tf"]
        ecsf["ecs.tf"]
        scalef["autoscaling.tf"]
        monf["monitoring.tf"]
    end

    modcall -->|"module inputs"| module
    imports -.-> iamf
    template -->|"first revision"| ecsf

    network -->|"private subnets"| ecsf
    sgs -->|"sg-alb"| albf
    sgs -->|"sg-kimply-task"| ecsf
    albf -->|"target group, :443 listener"| ecsf
    iamf -->|"execution + task roles"| ecsf
    ecsf -->|"secret ARN, service ARN"| iamf
    ecsf -->|"service"| scalef
    ecsf -->|"service ARN"| monf
    monf -->|"canary alarm name"| ecsf
```

### 2b. `network.tf` and `security_groups.tf`

```mermaid
flowchart LR
    subgraph network["network.tf"]
        eip["Elastic IP<br/>prevent_destroy"] --> natgw["NAT gateway"] --> rt["private route table<br/>0.0.0.0/0 → NAT"] --> rta["associations ×2"]
        subnets["private subnets ×2<br/>for_each over AZs"] --> rta
    end

    subgraph sgs["security_groups.tf"]
        sgalb["sg-alb"]
        sgtask["sg-kimply-task"]
        r1["in 80 from anywhere"]
        r2["in 443 from anywhere"]
        r3["out 3000 to sg-kimply-task"]
        r4["in 3000 from sg-alb"]
        r5["out all"]
        sgalb --> r1
        sgalb --> r2
        sgalb --> r3
        sgtask --> r3
        sgtask --> r4
        sgalb --> r4
        sgtask --> r5
    end
```

### 2c. `alb.tf`

```mermaid
flowchart LR
    cert["ACM certificate<br/>www.kimply.online"] --> certval["certificate validation<br/>waits for the GoDaddy CNAME"] --> https["listener :443<br/>TLS, 2 security headers"]
    alb["ALB<br/>idle timeout 3600s"] --> https
    alb --> http["listener :80<br/>301 to HTTPS"]
    tg["target group<br/>ip · /health/live · sticky · 30s drain"] --> https
```

### 2d. `ecs.tf` and `iam.tf`

```mermaid
flowchart LR
    subgraph ecsf["ecs.tf"]
        secret["secret<br/>kimply/prod/mongo-url"]
        loggroup["log group<br/>/ecs/kimply-prod"]
        cluster["cluster<br/>kimply-prod"]
        taskdef["task definition<br/>first revision only"]
        service["service<br/>ignores task_definition + desired_count"]
    end

    subgraph iamf["iam.tf"]
        exec["execution role<br/>ECR, logs, read secret"]
        taskrole["task role<br/>ECS Exec"]
        oidc["data: GitHub OIDC provider"]
        ghpush["GitHub ECR push role<br/>(imported)"]
        ghdeploy["GitHub deploy role<br/>register + update this service"]
    end

    template["task-definition.prod.json"] --> taskdef
    secret --> exec
    exec --> taskdef
    taskrole --> taskdef
    loggroup --> taskdef
    cluster --> service
    taskdef --> service
    service --> ghdeploy
    exec -->|"PassRole"| ghdeploy
    taskrole -->|"PassRole"| ghdeploy
    oidc --> ghpush
    oidc --> ghdeploy
```

### 2e. `monitoring.tf` and `autoscaling.tf`

```mermaid
flowchart LR
    subgraph monf["monitoring.tf"]
        canary["Synthetics canary<br/>/health/ready + apex redirect"] --> alarm["canary alarm<br/>2 failed runs"]
        eventrule["deploy-failed event rule"]
        sns["SNS topic + email"]
        budget["budget<br/>emails directly"]
        alarm --> sns
        eventrule --> sns
    end

    service["ecs.tf: service"]
    alarm -->|"alarm rollback"| service
    service --> eventrule

    subgraph scalef["autoscaling.tf"]
        target["scalable target<br/>min 2 · max 4"] --> cpu["CPU 60%<br/>scale-out only"]
        target --> trim["03:00 set max 2"]
        target --> release["03:10 set max 4"]
    end

    service --> target
```

## 3. How one value reaches a resource

Using `alert_email`, which crosses both layers of variables.
Most values are simpler: they are written directly in `envs/prod/main.tf`, or they fall back to the module's default.

```mermaid
flowchart LR
    a["envs/prod/terraform.tfvars<br/>alert_email = your address<br/>(gitignored)"]
    b["envs/prod/variables.tf<br/>declares alert_email"]
    c["envs/prod/main.tf<br/>module kimply { alert_email = var.alert_email }"]
    d["modules/kimply-ecs/variables.tf<br/>declares alert_email"]
    e["monitoring.tf<br/>endpoint = var.alert_email"]

    a --> b --> c --> d --> e
```

| Prefix | Value comes from |
|---|---|
| `var.x` | An input: `terraform.tfvars`, else the `default`, else Terraform asks |
| `data.TYPE.NAME.attr` | Looked up from AWS on every plan |
| `TYPE.NAME.attr` | A resource Terraform creates, known after apply and kept in state |
| `local.x` | Computed in the code |
| `module.NAME.x` | An output of a module |

## 4. A deploy, end to end

What happens on a push to `main` once the pipeline is switched to ECS.
Terraform is not involved.

```mermaid
sequenceDiagram
    autonumber
    participant GH as GitHub Actions
    participant ECR as ECR
    participant ECS as ECS service
    participant New as New tasks
    participant ALB as ALB target group
    participant Old as Old tasks
    participant Canary as Canary + alarm

    GH->>ECR: build arm64, push kimply:SHA
    GH->>ECS: register revision from the template, update service
    ECS->>New: start 2 tasks alongside the old 2 (max 200%)
    New->>ALB: register, pass /health/live
    alt new tasks never become healthy
        ECS->>ECS: circuit breaker trips, back to last good revision
        Note over Old: old tasks were never stopped
    else new tasks healthy
        ALB->>Old: deregister, drain for 30s
        ECS->>Old: SIGTERM, stop
        GH->>ALB: smoke test https://www.kimply.online/health/ready
        Canary->>Canary: keeps probing during the bake period
        opt canary alarm fires
            Canary->>ECS: roll back to the previous revision
        end
    end
```
