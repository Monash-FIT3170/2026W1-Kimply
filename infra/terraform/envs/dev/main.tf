provider "aws" {
  region = "ap-southeast-2"

  default_tags {
    tags = {
      App       = "kimply"
      Env       = "development"
      ManagedBy = "terraform"
    }
  }
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

# Development borrows production's NAT gateway rather than paying for a second
# one (D40). This is the one resource the two environments share, and it is a
# deliberate exception to "prod and dev share nothing": if the production NAT is
# ever replaced, development loses database access until this is re-applied.
data "terraform_remote_state" "prod" {
  backend = "s3"

  config = {
    bucket = "kimply-terraform-state-827152325060"
    key    = "prod/terraform.tfstate"
    region = "ap-southeast-2"
  }
}

module "kimply" {
  source = "../../modules/kimply-ecs"

  name = "kimply-dev"

  vpc_id            = data.aws_vpc.default.id
  public_subnet_ids = data.aws_subnets.public.ids

  create_nat_gateway = false
  nat_gateway_id     = data.terraform_remote_state.prod.outputs.nat_gateway_id

  # Above production's private subnets (172.31.128.0/20 and .144.0/20).
  private_subnets = {
    "ap-southeast-2a" = "172.31.160.0/20"
    "ap-southeast-2b" = "172.31.176.0/20"
  }

  # As in production: domain_name is served as ROOT_URL and must match the
  # template. There is no apex here, so dev needs no forwarding and no apex
  # check. ecs-dev.kimply.online was the build-time name (D39) and is retired.
  domain_name       = "dev.kimply.online"
  certificate_names = ["dev.kimply.online"]

  task_definition_template = "${path.root}/../../../ecs/task-definition.dev.json"
  ecr_repository_name      = "kimply-dev"
  initial_image_tag        = var.initial_image_tag
  secret_name              = "kimply/dev/mongo-url"

  # Interruptions only cost a reconnect here, and one task is enough to exercise
  # rolling deploys (D5).
  capacity_provider = "FARGATE_SPOT"
  min_tasks         = 1
  max_tasks         = 2

  alert_email        = var.alert_email
  monthly_budget_usd = var.monthly_budget_usd
  canary_enabled     = var.canary_enabled

  # Records live in the hosted zone production owns (D41).
  manage_dns      = true
  hosted_zone_id  = data.terraform_remote_state.prod.outputs.hosted_zone_id
  dns_alias_names = ["dev.kimply.online"]

  github_subject_prefixes = [
    "repo:Monash-FIT3170/2026W1-Kimply",
    "repo:R4chC0dE@140041789/2026W1-Kimply-ECS-Rollover@1380939227",
  ]
  github_branch             = "dev"
  github_ecr_push_role_name = "GitHubActionsECRPushDev"
}
