# Route 53 (D41). GoDaddy stays the registrar; only the nameservers move.
#
# The reason is the apex. DNS forbids a CNAME at a bare domain and GoDaddy has no
# ALIAS, so kimply.online could only be a redirect through GoDaddy's forwarding,
# which drops the path: https://kimply.online/play reached a GoDaddy 404 (A3).
# A Route 53 ALIAS record points the apex straight at the load balancer.
#
# One hosted zone serves every environment, so production creates it and other
# environments take its id, the same arrangement as the NAT gateway (D40).

resource "aws_route53_zone" "this" {
  count = var.create_hosted_zone ? 1 : 0

  name    = var.dns_zone_name
  comment = "Kimply. Registered at GoDaddy, hosted here."

  # Deleting the zone takes every record with it, including the ones that renew
  # the certificates, and the domain would stop resolving entirely.
  lifecycle {
    prevent_destroy = true
  }
}

locals {
  zone_id = var.create_hosted_zone ? one(aws_route53_zone.this[*].zone_id) : var.hosted_zone_id
}

# Certificate validation, automated. Previously each record was pasted into
# GoDaddy by hand, and a missing one silently breaks renewal about 11 months later.
resource "aws_route53_record" "certificate_validation" {
  for_each = var.manage_dns ? {
    for option in aws_acm_certificate.app.domain_validation_options :
    option.domain_name => option
  } : {}

  zone_id         = local.zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 60
  allow_overwrite = true
}

# Every hostname this environment answers on, pointed at the load balancer.
# ALIAS records cost nothing to resolve and follow the ALB's changing addresses,
# which is the whole reason for moving off GoDaddy's DNS.
resource "aws_route53_record" "alias" {
  for_each = var.manage_dns ? toset(var.dns_alias_names) : []

  zone_id = local.zone_id
  name    = each.value
  type    = "A"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = false
  }
}

# Hostnames that should send visitors to the canonical one. The load balancer
# preserves the path and query, which is exactly what GoDaddy's forwarding did not.
resource "aws_lb_listener_rule" "redirect_to_canonical" {
  for_each = toset(var.redirect_hosts)

  listener_arn = aws_lb_listener.https.arn

  action {
    type = "redirect"

    redirect {
      host        = var.domain_name
      path        = "/#{path}"
      query       = "#{query}"
      protocol    = "HTTPS"
      port        = "443"
      status_code = "HTTP_301"
    }
  }

  condition {
    host_header {
      values = [each.value]
    }
  }

  lifecycle {
    precondition {
      condition     = !contains(var.redirect_hosts, var.domain_name)
      error_message = "domain_name (${var.domain_name}) cannot redirect to itself."
    }
  }
}
