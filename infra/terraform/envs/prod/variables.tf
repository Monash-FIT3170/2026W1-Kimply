variable "alert_email" {
  description = "Receives SNS and budget alerts. Set in terraform.tfvars (gitignored)."
  type        = string
}

variable "monthly_budget_usd" {
  type    = number
  default = 100
}

variable "initial_image_tag" {
  description = "Commit SHA of an image already in ECR, used only for the first task definition revision."
  type        = string
}

variable "canary_enabled" {
  description = "Set true once the served hostname resolves to the ALB and /health/ready passes there."
  type        = bool
  default     = false
}

variable "check_apex_redirect" {
  description = "Set true once GoDaddy forwards the apex to the served hostname (at cutover)."
  type        = bool
  default     = false
}
