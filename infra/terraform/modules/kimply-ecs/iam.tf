data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_partition" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region
}

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

# --- Execution role: used by ECS around the container --------------------------
# Pulls the image, writes logs, and reads MONGO_URL at task start (D10).

resource "aws_iam_role" "execution" {
  name               = "${var.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secret" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.mongo_url.arn]
  }
}

resource "aws_iam_role_policy" "execution_secret" {
  name   = "read-mongo-url"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secret.json
}

# --- Task role: used by code inside the container ------------------------------
# Kimply makes no AWS calls. This role exists only so ECS Exec works (D8).

resource "aws_iam_role" "task" {
  name               = "${var.name}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "task_exec" {
  statement {
    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "task_exec" {
  name   = "ecs-exec"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_exec.json
}

# --- GitHub Actions ------------------------------------------------------------

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # One ref per repository. A push to any other branch cannot obtain this role.
    # StringEquals needs the subject exactly as GitHub sends it, which differs
    # between plain and immutable-subject repositories (see the variable).
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [for prefix in var.github_subject_prefixes : "${prefix}:ref:refs/heads/${var.github_branch}"]
    }
  }
}

# Pre-existing role, imported (see envs/prod/imports.tf). Only its trust policy
# is managed here; its permissions policy is left exactly as it was.
resource "aws_iam_role" "github_ecr_push" {
  name               = var.github_ecr_push_role_name
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
}

# Separate from ECR push (D35): this role can change what runs, not what exists.
resource "aws_iam_role" "github_deploy" {
  name               = "${var.name}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
}

data "aws_iam_policy_document" "github_deploy" {
  # Task definition APIs do not support resource-level permissions.
  statement {
    sid = "TaskDefinitions"
    actions = [
      "ecs:RegisterTaskDefinition",
      "ecs:DescribeTaskDefinition",
    ]
    resources = ["*"]
  }

  statement {
    sid = "ThisServiceOnly"
    actions = [
      "ecs:UpdateService",
      "ecs:DescribeServices",
    ]
    resources = [aws_ecs_service.app.arn]
  }

  # Read-only, so a failed deploy can print what actually happened instead of
  # only "deployment failed": which tasks are running, and what the app logged.
  statement {
    sid       = "ExplainFailures"
    actions   = ["ecs:DescribeTasks"]
    resources = ["arn:${data.aws_partition.current.partition}:ecs:${local.region}:${local.account_id}:task/${var.name}/*"]
  }

  statement {
    sid       = "ListTasksInThisClusterOnly"
    actions   = ["ecs:ListTasks"]
    resources = ["*"]

    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [aws_ecs_cluster.this.arn]
    }
  }

  statement {
    sid       = "ReadTargetHealth"
    actions   = ["elasticloadbalancing:DescribeTargetHealth"]
    resources = [aws_lb_target_group.app.arn]
  }

  statement {
    sid = "ReadThisEnvironmentsLogs"
    actions = [
      "logs:FilterLogEvents",
      "logs:GetLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = [aws_cloudwatch_log_group.app.arn, "${aws_cloudwatch_log_group.app.arn}:*"]
  }

  # Registering a task definition hands these roles to ECS. Without the
  # condition, the same permission could pass them to any other service.
  statement {
    sid       = "PassOnlyTheseRolesOnlyToEcs"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.execution.arn, aws_iam_role.task.arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "deploy-${var.name}"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
