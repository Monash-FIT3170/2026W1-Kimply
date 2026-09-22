output "acm_validation_records" {
  value = module.kimply.acm_validation_records
}

output "alb_dns_name" {
  value = module.kimply.alb_dns_name
}

output "nat_public_ip" {
  value = module.kimply.nat_public_ip
}

output "cluster_name" {
  value = module.kimply.cluster_name
}

output "service_name" {
  value = module.kimply.service_name
}

output "secret_name" {
  value = module.kimply.secret_name
}

output "github_deploy_role_arn" {
  value = module.kimply.github_deploy_role_arn
}

output "github_ecr_push_role_arn" {
  value = module.kimply.github_ecr_push_role_arn
}
