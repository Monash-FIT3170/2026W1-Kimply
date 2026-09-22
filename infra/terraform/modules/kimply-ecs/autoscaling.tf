# Scale out on CPU, never scale in on a metric, and trim back to the minimum at a
# quiet hour instead (D33). A metric-driven scale-in would stop a task mid-game
# and drop every player on it.

resource "aws_appautoscaling_target" "service" {
  service_namespace  = "ecs"
  scalable_dimension = "ecs:service:DesiredCount"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.app.name}"
  min_capacity       = var.min_tasks
  max_capacity       = var.max_tasks
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.name}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.service.service_namespace
  scalable_dimension = aws_appautoscaling_target.service.scalable_dimension
  resource_id        = aws_appautoscaling_target.service.resource_id

  target_tracking_scaling_policy_configuration {
    target_value       = var.cpu_target_percent
    disable_scale_in   = true
    scale_out_cooldown = 120

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

# Lowering the maximum is what forces the count down, because the policy above
# never scales in by itself.
resource "aws_appautoscaling_scheduled_action" "trim" {
  name               = "${var.name}-nightly-trim"
  service_namespace  = aws_appautoscaling_target.service.service_namespace
  scalable_dimension = aws_appautoscaling_target.service.scalable_dimension
  resource_id        = aws_appautoscaling_target.service.resource_id
  schedule           = var.scale_in_cron
  timezone           = var.quiet_hours_timezone

  scalable_target_action {
    min_capacity = var.min_tasks
    max_capacity = var.min_tasks
  }
}

resource "aws_appautoscaling_scheduled_action" "release" {
  name               = "${var.name}-nightly-release"
  service_namespace  = aws_appautoscaling_target.service.service_namespace
  scalable_dimension = aws_appautoscaling_target.service.scalable_dimension
  resource_id        = aws_appautoscaling_target.service.resource_id
  schedule           = var.scale_in_release_cron
  timezone           = var.quiet_hours_timezone

  scalable_target_action {
    min_capacity = var.min_tasks
    max_capacity = var.max_tasks
  }

  # Scheduled actions on one target must not be modified concurrently.
  depends_on = [aws_appautoscaling_scheduled_action.trim]
}
