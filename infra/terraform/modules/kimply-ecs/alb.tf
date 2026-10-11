# Replaces nginx: TLS, the HTTP redirect, WebSocket/DDP and routing to task IPs (D15).

resource "aws_acm_certificate" "app" {
  domain_name               = var.certificate_names[0]
  subject_alternative_names = slice(var.certificate_names, 1, length(var.certificate_names))
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true

    precondition {
      condition     = contains(var.certificate_names, var.domain_name)
      error_message = "domain_name (${var.domain_name}) must be one of certificate_names."
    }
  }
}

# With manage_dns, Terraform writes the validation records itself and waits on
# them. Without it, DNS lives elsewhere and this only waits for records someone
# adds by hand from the acm_validation_records output.
resource "aws_acm_certificate_validation" "app" {
  certificate_arn = aws_acm_certificate.app.arn

  # Once DNS is ours, waiting on the records Terraform just wrote is exact.
  # Before that, this resource only waits for records added by hand.
  validation_record_fqdns = var.manage_dns ? [for r in aws_route53_record.certificate_validation : r.fqdn] : null

  timeouts {
    create = "2h"
  }
}

# An ALB costs about US$18/month plus one public IPv4 address per subnet, which
# is more than development's compute. Development therefore shares production's
# and is selected by host header (D42).
resource "aws_lb" "app" {
  count = var.create_load_balancer ? 1 : 0

  name               = var.name
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb[0].id]
  subnets            = var.public_subnet_ids

  # nginx held DDP connections for an hour. The ALB default of 60s would drop
  # players idling in a lobby.
  idle_timeout = 3600

  drop_invalid_header_fields = true
  enable_deletion_protection = var.alb_deletion_protection
}

resource "aws_lb_target_group" "app" {
  name        = var.name
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  # DDP cannot be drained to completion, only postponed (D29).
  deregistration_delay = 30

  # Liveness only. In ECS a failing target check also replaces the task, so a
  # Mongo-dependent check here would restart-loop through an Atlas outage (D13).
  health_check {
    path                = "/health/live"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  # SockJS long-polling sends many requests that must reach one task (D25).
  stickiness {
    type            = "lb_cookie"
    enabled         = true
    cookie_duration = 86400
  }
}

resource "aws_lb_listener" "http" {
  count = var.create_load_balancer ? 1 : 0

  load_balancer_arn = aws_lb.app[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      protocol    = "HTTPS"
      port        = "443"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  count = var.create_load_balancer ? 1 : 0

  load_balancer_arn = aws_lb.app[0].arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.app.certificate_arn

  # Two of the three headers nginx set. The ALB cannot set Referrer-Policy;
  # that one has to move into Meteor (N13).
  routing_http_response_x_content_type_options_header_value = "nosniff"
  routing_http_response_x_frame_options_header_value        = "SAMEORIGIN"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

locals {
  # Whether this environment owns the load balancer or borrows one, everything
  # downstream refers to these.
  https_listener_arn    = var.create_load_balancer ? one(aws_lb_listener.https[*].arn) : var.shared_alb.https_listener_arn
  alb_dns_name          = var.create_load_balancer ? one(aws_lb.app[*].dns_name) : var.shared_alb.dns_name
  alb_zone_id           = var.create_load_balancer ? one(aws_lb.app[*].zone_id) : var.shared_alb.zone_id
  alb_security_group_id = var.create_load_balancer ? aws_security_group.alb[0].id : var.shared_alb.security_group_id
}

# A shared listener serves several certificates; SNI picks the right one by the
# hostname the browser asked for.
resource "aws_lb_listener_certificate" "shared" {
  count = var.create_load_balancer ? 0 : 1

  listener_arn    = var.shared_alb.https_listener_arn
  certificate_arn = aws_acm_certificate_validation.app.certificate_arn
}

# Which hostnames reach this environment's tasks on the shared listener.
resource "aws_lb_listener_rule" "shared_host" {
  count = var.create_load_balancer ? 0 : 1

  listener_arn = var.shared_alb.https_listener_arn
  priority     = var.listener_rule_priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }

  condition {
    host_header {
      values = var.host_headers
    }
  }

  lifecycle {
    precondition {
      condition     = length(var.host_headers) > 0
      error_message = "host_headers is required when sharing a load balancer, or nothing routes here."
    }
  }
}
