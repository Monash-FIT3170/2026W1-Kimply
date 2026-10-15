terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }

  # Created by infra/terraform/bootstrap. use_lockfile is S3-native locking,
  # so no DynamoDB table is needed.
  backend "s3" {
    bucket       = "kimply-terraform-state-827152325060"
    key          = "prod/terraform.tfstate"
    region       = "ap-southeast-2"
    encrypt      = true
    use_lockfile = true
  }
}
