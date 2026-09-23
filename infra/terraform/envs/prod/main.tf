provider "aws" {
  region = "ap-southeast-2"

  default_tags {
    tags = {
      App       = "kimply"
      Env       = "production"
      ManagedBy = "terraform"
    }
  }
}

# The default VPC and its public subnets already exist and are reused (D18).
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

data "aws_subnet" "nat" {
  vpc_id            = data.aws_vpc.default.id
  availability_zone = "ap-southeast-2a"
  default_for_az    = true
}

module "kimply" {
  source = "../../modules/kimply-ecs"

  name = "kimply-prod"

  vpc_id               = data.aws_vpc.default.id
  public_subnet_ids    = data.aws_subnets.public.ids
  nat_public_subnet_id = data.aws_subnet.nat.id

  # Above the default subnets (172.31.0.0/20, .16.0/20, .32.0/20).
  private_subnets = {
    "ap-southeast-2a" = "172.31.128.0/20"
    "ap-southeast-2b" = "172.31.144.0/20"
  }

  # domain_name is what the app serves as ROOT_URL, and it must match the
  # template (a precondition enforces it). The certificate also covers
  # ecs.kimply.online, which stays as a second name that bypasses the apex
  # redirect and is how the stack was verified before cutover (D39).
  # GoDaddy forwards the apex here, because it cannot alias it to an ALB (D17).
  domain_name       = "www.kimply.online"
  certificate_names = ["ecs.kimply.online", "www.kimply.online"]
  apex_domain       = "kimply.online"

  task_definition_template = "${path.root}/../../../ecs/task-definition.prod.json"
  ecr_repository_name      = "kimply"
  initial_image_tag        = var.initial_image_tag
  secret_name              = "kimply/prod/mongo-url"

  capacity_provider = "FARGATE"
  min_tasks         = 2
  max_tasks         = 4

  alert_email         = var.alert_email
  monthly_budget_usd  = var.monthly_budget_usd
  canary_enabled      = var.canary_enabled
  check_apex_redirect = var.check_apex_redirect

  # Exact OIDC subject prefixes. The upstream repository uses the plain form; the
  # migration fork uses GitHub's immutable form, with owner and repository IDs.
  # The fork is listed only until it is merged upstream and deleted.
  github_subject_prefixes = [
    "repo:Monash-FIT3170/2026W1-Kimply",
    "repo:R4chC0dE@140041789/2026W1-Kimply-ECS-Rollover@1380939227",
  ]
  github_ecr_push_role_name = "GitHubActionsECRPush"
}
