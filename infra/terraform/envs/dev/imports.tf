# The dev ECR push role predates Terraform, like its production counterpart.
# Only its trust policy is managed here (D35).
import {
  to = module.kimply.aws_iam_role.github_ecr_push
  id = "GitHubActionsECRPushDev"
}
