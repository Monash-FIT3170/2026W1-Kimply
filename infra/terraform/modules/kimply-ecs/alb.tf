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

# DNS lives at GoDaddy, so Terraform cannot create the validation record.
# This resource simply waits until someone adds the CNAME from the
# acm_validation_records output. See infra/terraform/README.md.
resource "aws_acm_certificate_validation" "app" {
  certificate_arn = aws_acm_certificate.app.arn

  timeouts {
    create = "2h"
  }
}

resource "aws_lb" "app" {
  name               = var.name
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
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
  load_balancer_arn = aws_lb.app.arn
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
  load_balancer_arn = aws_lb.app.arn
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
