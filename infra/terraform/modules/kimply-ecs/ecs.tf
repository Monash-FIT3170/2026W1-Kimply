resource "aws_secretsmanager_secret" "mongo_url" {
  name        = var.secret_name
  description = "Kimply MONGO_URL (Atlas connection string including credentials)"

  # The value is set outside Terraform so it never lands in state:
  #   aws secretsmanager put-secret-value --secret-id <name> --secret-string '<url>'
  recovery_window_in_days = 7
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.name}"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "this" {
  name = var.name

  setting {
    name  = "containerInsights"
    value = var.container_insights
  }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = [var.capacity_provider]

  default_capacity_provider_strategy {
    capacity_provider = var.capacity_provider
    weight            = 1
  }
}

data "aws_ecr_repository" "app" {
  name = var.ecr_repository_name
}

# The same template the pipeline renders on every deploy. Terraform uses it only
# for the first revision; the ${IMAGE} placeholder is the only substitution.
locals {
  task_definition = jsondecode(templatefile(var.task_definition_template, {
    IMAGE = "${data.aws_ecr_repository.app.repository_url}:${var.initial_image_tag}"
  }))

  app_container = one(local.task_definition.containerDefinitions)
}

resource "aws_ecs_task_definition" "app" {
  family                   = local.task_definition.family
  requires_compatibilities = local.task_definition.requiresCompatibilities
  network_mode             = local.task_definition.networkMode
  cpu                      = local.task_definition.cpu
  memory                   = local.task_definition.memory
  execution_role_arn       = local.task_definition.executionRoleArn
  task_role_arn            = local.task_definition.taskRoleArn
  container_definitions    = jsonencode(local.task_definition.containerDefinitions)

  runtime_platform {
    cpu_architecture        = local.task_definition.runtimePlatform.cpuArchitecture
    operating_system_family = local.task_definition.runtimePlatform.operatingSystemFamily
  }

  # The template hard-codes names and ARNs because the pipeline has no access
  # to Terraform state. These checks fail the plan if the two ever drift apart.
  lifecycle {
    precondition {
      condition     = local.task_definition.family == var.name
      error_message = "Task definition template family must be ${var.name}."
    }
    precondition {
      condition     = local.task_definition.executionRoleArn == aws_iam_role.execution.arn
      error_message = "Template executionRoleArn does not match ${aws_iam_role.execution.arn}."
    }
    precondition {
      condition     = local.task_definition.taskRoleArn == aws_iam_role.task.arn
      error_message = "Template taskRoleArn does not match ${aws_iam_role.task.arn}."
    }
    precondition {
      condition     = local.app_container.logConfiguration.options["awslogs-group"] == aws_cloudwatch_log_group.app.name
      error_message = "Template awslogs-group does not match ${aws_cloudwatch_log_group.app.name}."
    }
    # ECS reads a bare name as an SSM Parameter Store parameter, so a Secrets
    # Manager secret must be referenced by its full ARN, random suffix included.
    precondition {
      condition     = one(local.app_container.secrets).valueFrom == aws_secretsmanager_secret.mongo_url.arn
      error_message = "Template MONGO_URL valueFrom must be ${aws_secretsmanager_secret.mongo_url.arn}."
    }
    precondition {
      condition     = contains([for e in local.app_container.environment : e.value if e.name == "ROOT_URL"], "https://${var.domain_name}")
      error_message = "Template ROOT_URL must be https://${var.domain_name}."
    }
  }
}

resource "aws_ecs_service" "app" {
  name            = var.name
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.min_tasks

  capacity_provider_strategy {
    capacity_provider = var.capacity_provider
    weight            = 1
  }

  enable_execute_command            = true
  health_check_grace_period_seconds = var.health_check_grace_period_seconds

  # Old tasks keep serving until new ones are healthy (D26).
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # Catches tasks that never become healthy (D30).
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # Catches tasks that are healthy but cannot reach Atlas (D31). Follows the
  # canary: an alarm from a canary that is not running means nothing.
  alarms {
    alarm_names = [aws_cloudwatch_metric_alarm.canary.alarm_name]
    enable      = var.canary_enabled
    rollback    = var.canary_enabled
  }

  network_configuration {
    subnets          = [for s in aws_subnet.private : s.id]
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = local.app_container.name
    container_port   = 3000
  }

  propagate_tags = "SERVICE"

  lifecycle {
    # The pipeline registers revisions and auto scaling owns the count (D33, D36).
    # Without this, every terraform apply would roll prod back to the revision
    # Terraform last saw.
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [
    aws_lb_listener.https,
    aws_iam_role_policy.execution_secret,
    aws_route_table_association.private,
  ]
}
