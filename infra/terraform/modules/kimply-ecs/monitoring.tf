# Alerts (D34), the readiness canary and the alarm that drives deployment
# rollback (D31, D32, D38), and the budget alert.

# --- SNS -----------------------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  name = "${var.name}-alerts"
}

data "aws_iam_policy_document" "alerts" {
  # Setting a topic policy replaces the default one, so the owner's rights are
  # restated here. SNS rejects "sns:*" in a topic policy because it includes
  # account-level actions, so the topic-level ones are listed explicitly.
  statement {
    sid = "AccountOwner"
    actions = [
      "sns:AddPermission",
      "sns:DeleteTopic",
      "sns:GetTopicAttributes",
      "sns:ListSubscriptionsByTopic",
      "sns:Publish",
      "sns:RemovePermission",
      "sns:SetTopicAttributes",
      "sns:Subscribe",
    ]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "AWS"
      identifiers = ["arn:${data.aws_partition.current.partition}:iam::${local.account_id}:root"]
    }
  }

  statement {
    sid       = "CloudWatchAlarms"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }

  statement {
    sid       = "DeploymentEvents"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.deployment_failed.arn]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts.json
}

# AWS emails a confirmation link. Nothing is delivered until it is clicked.
resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# --- Deployment failures ---------------------------------------------------------

resource "aws_cloudwatch_event_rule" "deployment_failed" {
  name        = "${var.name}-deployment-failed"
  description = "A ${var.name} deployment failed (circuit breaker or alarm rollback)"

  event_pattern = jsonencode({
    source        = ["aws.ecs"]
    "detail-type" = ["ECS Deployment State Change"]
    resources     = [aws_ecs_service.app.arn]
    detail = {
      eventName = ["SERVICE_DEPLOYMENT_FAILED"]
    }
  })
}

resource "aws_cloudwatch_event_target" "deployment_failed" {
  rule = aws_cloudwatch_event_rule.deployment_failed.name
  arn  = aws_sns_topic.alerts.arn
}

# --- Canary ------------------------------------------------------------------

resource "aws_s3_bucket" "canary" {
  bucket        = "${var.name}-canary-${local.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "canary" {
  bucket = aws_s3_bucket.canary.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "canary" {
  bucket = aws_s3_bucket.canary.id

  rule {
    id     = "expire-canary-artifacts"
    status = "Enabled"

    filter {}

    expiration {
      days = 30
    }
  }
}

data "aws_iam_policy_document" "canary_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "canary" {
  name               = "${var.name}-canary"
  assume_role_policy = data.aws_iam_policy_document.canary_assume.json
}

data "aws_iam_policy_document" "canary" {
  statement {
    actions   = ["s3:PutObject", "s3:GetObject"]
    resources = ["${aws_s3_bucket.canary.arn}/*"]
  }

  statement {
    actions   = ["s3:GetBucketLocation"]
    resources = [aws_s3_bucket.canary.arn]
  }

  statement {
    actions   = ["s3:ListAllMyBuckets"]
    resources = ["*"]
  }

  statement {
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:${data.aws_partition.current.partition}:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/cwsyn-*"]
  }

  statement {
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["CloudWatchSynthetics"]
    }
  }
}

resource "aws_iam_role_policy" "canary" {
  name   = "canary"
  role   = aws_iam_role.canary.id
  policy = data.aws_iam_policy_document.canary.json
}

# Node.js Synthetics runtimes load the handler from nodejs/node_modules/.
data "archive_file" "canary" {
  type        = "zip"
  output_path = "${path.module}/build/canary.zip"

  source {
    content  = file("${path.module}/canary/index.js")
    filename = "nodejs/node_modules/index.js"
  }
}

resource "aws_synthetics_canary" "ready" {
  lifecycle {
    precondition {
      condition     = !var.check_apex_redirect || var.apex_domain != ""
      error_message = "check_apex_redirect needs apex_domain to be set."
    }
  }

  # Canary names are limited to 21 characters.
  name                 = substr("${var.name}-ready", 0, 21)
  artifact_s3_location = "s3://${aws_s3_bucket.canary.bucket}/"
  execution_role_arn   = aws_iam_role.canary.arn
  runtime_version      = var.canary_runtime_version
  handler              = "index.handler"
  zip_file             = data.archive_file.canary.output_path
  start_canary         = var.canary_enabled
  delete_lambda        = true

  success_retention_period = 7
  failure_retention_period = 30

  schedule {
    expression = "rate(${var.canary_rate_minutes} minutes)"
  }

  run_config {
    timeout_in_seconds = 60

    environment_variables = {
      READY_URL      = "https://${var.domain_name}/health/ready"
      CHECK_APEX     = tostring(var.check_apex_redirect)
      APEX_URL       = "https://${var.apex_domain}/"
      CANONICAL_HOST = var.domain_name
    }
  }

  depends_on = [aws_iam_role_policy.canary]
}

# Two consecutive failed runs, so one dropped probe does not roll back a deploy.
# Missing data (canary stopped) is not a failure.
resource "aws_cloudwatch_metric_alarm" "canary" {
  alarm_name          = "${var.name}-canary"
  alarm_description   = "Kimply readiness or apex redirect failing from outside. Also rolls back an in-progress ECS deployment."
  namespace           = "CloudWatchSynthetics"
  metric_name         = "SuccessPercent"
  statistic           = "Average"
  period              = var.canary_rate_minutes * 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "LessThanThreshold"
  threshold           = 100
  treat_missing_data  = "notBreaching"

  dimensions = {
    CanaryName = aws_synthetics_canary.ready.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# --- Budget --------------------------------------------------------------------

resource "aws_budgets_budget" "monthly" {
  name         = "${var.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 35
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}
