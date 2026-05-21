data "terraform_remote_state" "platform_data" {
  backend = "s3"
  config = {
    bucket = var.tfstate_bucket
    key    = var.platform_data_remote_state_key
    region = var.aws_region
  }
}

data "aws_eks_cluster" "sandbox" {
  name = var.eks_cluster_name
}

data "aws_iam_openid_connect_provider" "eks" {
  url = data.aws_eks_cluster.sandbox.identity[0].oidc[0].issuer
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  oidc_provider_arn  = data.aws_iam_openid_connect_provider.eks.arn
  oidc_provider_host = replace(data.aws_iam_openid_connect_provider.eks.url, "https://", "")

  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition

  ddb_arns          = data.terraform_remote_state.platform_data.outputs.dynamodb_table_arns
  s3_bucket_names   = data.terraform_remote_state.platform_data.outputs.s3_bucket_names
  tenant_kms_arn    = data.terraform_remote_state.platform_data.outputs.tenant_kms_key_arn
  audit_kms_arn     = data.terraform_remote_state.platform_data.outputs.audit_archive_kms_key_arn

  staging_bucket_arn         = "arn:${local.partition}:s3:::${local.s3_bucket_names.staging}"
  pipeline_bucket_arn        = "arn:${local.partition}:s3:::${local.s3_bucket_names.pipeline}"
  pipeline_config_bucket_arn = "arn:${local.partition}:s3:::${local.s3_bucket_names.pipeline_config}"
  audit_archive_bucket_arn   = "arn:${local.partition}:s3:::${local.s3_bucket_names.audit_archive}"

  common_tags = {
    Component   = "platform-iam-and-security"
    Environment = var.environment
  }
}

# IRSA trust-policy helper. Caller-supplied service account name binds the role
# to system:serviceaccount:<namespace>:<service-account>.
data "aws_iam_policy_document" "irsa_trust" {
  for_each = local.irsa_service_accounts

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_provider_host}:sub"
      values   = ["system:serviceaccount:${each.value.namespace}:${each.value.service_account}"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_provider_host}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

locals {
  # ServiceAccount-name map drives IRSA trust policies. Each entry maps to a
  # K8s service account that the role is bound to.
  irsa_service_accounts = {
    router                                   = { namespace = var.k8s_namespace, service_account = "wundergraph-router" }
    workspace-resolver                       = { namespace = var.k8s_namespace, service_account = "workspace-resolver" }
    batch-resolver                           = { namespace = var.k8s_namespace, service_account = "batch-resolver" }
    document-resolver                        = { namespace = var.k8s_namespace, service_account = "document-resolver" }
    classification-service                   = { namespace = var.k8s_namespace, service_account = "classification-service" }
    ocr-service                              = { namespace = var.k8s_namespace, service_account = "ocr-service" }
    zip-extraction-service                   = { namespace = var.k8s_namespace, service_account = "zip-extraction-service" }
    output-assembly-service                  = { namespace = var.k8s_namespace, service_account = "output-assembly-service" }
    slipsheet-service                        = { namespace = var.k8s_namespace, service_account = "slipsheet-service" }
    pdf-processing-service                   = { namespace = var.k8s_namespace, service_account = "pdf-processing-service" }
    office-conversion-orchestrator-sidecar   = { namespace = var.aspose_namespace, service_account = "office-conversion-orchestrator-sidecar" }
    html-conversion-typescript-sidecar       = { namespace = var.k8s_namespace, service_account = "html-conversion-typescript-sidecar" }
    tiff-cog-service                         = { namespace = var.k8s_namespace, service_account = "tiff-cog-service" }
    image-tiff-conversion-service            = { namespace = var.k8s_namespace, service_account = "image-tiff-conversion-service" }
    email-extraction-service                 = { namespace = var.k8s_namespace, service_account = "email-extraction-service" }
    media-conversion-service                 = { namespace = var.k8s_namespace, service_account = "media-conversion-service" }
  }
}
