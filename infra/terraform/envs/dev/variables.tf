variable "alert_email" {
  description = "Receives SNS and budget alerts. Set in terraform.tfvars (gitignored)."
  type        = string
}

variable "monthly_budget_usd" {
  type    = number
  default = 50
}

variable "initial_image_tag" {
  description = "Commit SHA of an image already in the kimply-dev repository, used only for the first task definition revision."
  type        = string
}

variable "canary_enabled" {
  description = "Set true once ecs-dev.kimply.online resolves to the dev ALB and /health/ready passes there."
  type        = bool
  default     = false
}
