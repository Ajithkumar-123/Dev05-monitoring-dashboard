data "terraform_remote_state" "platform_data" {
  backend = "s3"
  config = {
    bucket = var.tfstate_bucket
    key    = var.platform_data_remote_state_key
    region = var.aws_region
  }
}

data "terraform_remote_state" "platform_iam" {
  backend = "s3"
  config = {
    bucket = var.tfstate_bucket
    key    = var.platform_iam_remote_state_key
    region = var.aws_region
  }
}

data "aws_route53_zone" "sandbox" {
  name         = var.route53_zone_name
  private_zone = false
}

locals {
  tenant_kms_arn = data.terraform_remote_state.platform_data.outputs.tenant_kms_key_arn
  api_role_arns  = data.terraform_remote_state.platform_iam.outputs.api_tier_role_arns
  worker_role_arns = data.terraform_remote_state.platform_iam.outputs.pipeline_worker_role_arns

  common_tags = {
    Component   = "platform-network-and-compute"
    Environment = var.environment
  }
}
