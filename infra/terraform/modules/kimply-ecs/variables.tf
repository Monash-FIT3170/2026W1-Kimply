# One Kimply environment on ECS Fargate: network additions, ALB, ECS service,
# IAM, secret, monitoring and scaling. Called once per environment from
# infra/terraform/envs/<env>. See docs/ecs-target-architecture.md for the why.

variable "name" {
  description = "Environment-qualified name used for every resource, e.g. kimply-prod."
  type        = string
}

# --- Network ------------------------------------------------------------------

variable "vpc_id" {
  description = "VPC to build in. The default VPC is reused (D18)."
  type        = string
}

variable "public_subnet_ids" {
  description = "Existing public subnets for the ALB."
  type        = list(string)
}

variable "nat_public_subnet_id" {
  description = "The public subnet that hosts the single NAT gateway (D22)."
  type        = string
}

variable "private_subnets" {
  description = "Private subnets to create for tasks, as { availability_zone = cidr }."
  type        = map(string)
}

# --- Domain -------------------------------------------------------------------

variable "domain_name" {
  description = "Hostname the app currently serves as ROOT_URL. Must match the task definition template and be one of certificate_names."
  type        = string
}

variable "certificate_names" {
  description = "Every hostname the ALB certificate covers. The first is the certificate's primary name."
  type        = list(string)
}

variable "apex_domain" {
  description = "Bare domain that GoDaddy forwards to domain_name (D17)."
  type        = string
}

# --- Task definition ----------------------------------------------------------

variable "task_definition_template" {
  description = "Path to the task definition JSON template shared with the deploy pipeline (D28)."
  type        = string
}

variable "ecr_repository_name" {
  description = "Existing ECR repository holding SHA-tagged images."
  type        = string
}

variable "initial_image_tag" {
  description = "Image tag for the first task definition revision only. After that the pipeline owns revisions (D36)."
  type        = string
}

variable "secret_name" {
  description = "Secrets Manager name for MONGO_URL. The template references it by full ARN."
  type        = string
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "container_insights" {
  description = "ECS Container Insights: disabled, enabled or enhanced. It is billed per metric."
  type        = string
  default     = "disabled"
}

# --- Service and scaling ------------------------------------------------------

variable "capacity_provider" {
  description = "FARGATE for prod, FARGATE_SPOT for dev (D5)."
  type        = string
  default     = "FARGATE"
}

variable "min_tasks" {
  type    = number
  default = 2
}

variable "max_tasks" {
  type    = number
  default = 4
}

variable "cpu_target_percent" {
  description = "Average service CPU that triggers scale-out."
  type        = number
  default     = 60
}

variable "health_check_grace_period_seconds" {
  description = "How long a new task may fail ALB health checks before ECS counts it as unhealthy. Covers Meteor boot."
  type        = number
  default     = 90
}

variable "quiet_hours_timezone" {
  type    = string
  default = "Australia/Melbourne"
}

variable "scale_in_cron" {
  description = "When extra tasks are trimmed back to min_tasks (D33). Tasks removed here drop their players."
  type        = string
  default     = "cron(0 3 * * ? *)"
}

variable "scale_in_release_cron" {
  description = "When max_tasks is restored after the nightly trim."
  type        = string
  default     = "cron(10 3 * * ? *)"
}

# --- Monitoring ---------------------------------------------------------------

variable "alert_email" {
  description = "Receives SNS alerts and budget alerts. Confirm the subscription email once."
  type        = string
}

variable "monthly_budget_usd" {
  type    = number
  default = 100
}

variable "canary_enabled" {
  description = <<-EOT
    Starts the canary and turns on alarm-based deployment rollback. Leave false until
    domain_name resolves to this ALB and /health/ready passes there; otherwise the canary
    fails and every deploy is rolled back.
  EOT
  type        = bool
  default     = false
}

variable "check_apex_redirect" {
  description = "Also check that the apex redirects to domain_name. Only true once GoDaddy forwards the apex here."
  type        = bool
  default     = false
}

variable "canary_runtime_version" {
  type    = string
  default = "syn-nodejs-puppeteer-17.0"
}

variable "canary_rate_minutes" {
  type    = number
  default = 5
}

# --- GitHub -------------------------------------------------------------------

variable "github_repositories" {
  description = "owner/name of every repository whose deploy branch may deploy this environment."
  type        = list(string)
}

variable "github_branch" {
  type    = string
  default = "main"
}

variable "github_ecr_push_role_name" {
  description = "Existing ECR push role, imported so its trust policy can list every repository (D35)."
  type        = string
}

variable "alb_deletion_protection" {
  type    = bool
  default = true
}
