data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

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

locals {
  account_id        = data.aws_caller_identity.current.account_id
  partition         = data.aws_partition.current.partition
  tenant_kms_arn    = data.terraform_remote_state.platform_data.outputs.tenant_kms_key_arn
  audit_kms_arn     = data.terraform_remote_state.platform_data.outputs.audit_archive_kms_key_arn
  staging_bucket    = data.terraform_remote_state.platform_data.outputs.s3_bucket_names.staging
  doc_handler_role  = data.terraform_remote_state.platform_iam.outputs.api_tier_role_arns.document_event_handler_lambda

  common_tags = {
    Component   = "platform-orchestration"
    Environment = var.environment
  }
}
