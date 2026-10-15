# The ECR push role predates Terraform. Importing it lets the trust policy list
# every repository allowed to deploy, without touching its permissions (D35).
import {
  to = module.kimply.aws_iam_role.github_ecr_push
  id = "GitHubActionsECRPush"
}
