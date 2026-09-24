output "acm_validation_records" {
  description = "Add each of these as a CNAME at GoDaddy so the certificate can be issued."
  value = [for o in aws_acm_certificate.app.domain_validation_options : {
    name  = o.resource_record_name
    type  = o.resource_record_type
    value = o.resource_record_value
  }]
}

output "alb_dns_name" {
  description = "Point each served hostname's CNAME here."
  value       = aws_lb.app.dns_name
}

output "nat_public_ip" {
  description = "Add this to the Atlas network access list. Null when this environment borrows another's NAT gateway."
  value       = one(aws_eip.nat[*].public_ip)
}

output "nat_gateway_id" {
  description = "The NAT gateway these tasks egress through, whether created here or borrowed."
  value       = local.nat_gateway_id
}

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "service_name" {
  value = aws_ecs_service.app.name
}

output "secret_name" {
  value = aws_secretsmanager_secret.mongo_url.name
}

output "github_deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}

output "github_ecr_push_role_arn" {
  value = aws_iam_role.github_ecr_push.arn
}
