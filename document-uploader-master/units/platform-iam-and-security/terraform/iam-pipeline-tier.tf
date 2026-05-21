###############################################################################
# Pipeline workers: one IRSA role per worker. The permission set is
# parameterised per worker; for_each over the local.pipeline_workers map.
###############################################################################

locals {
  # Per-worker permission profile. Each worker gets a queue, a set of S3
  # buckets, a set of DynamoDB tables, and KMS decrypt with the tenant CMK.
  pipeline_workers = {
    classification-service = {
      queue_name = "docuploader-classification-queue"
      s3_buckets = [local.staging_bucket_arn]
      ddb_tables = [local.ddb_arns.workspaces, local.ddb_arns.content_hashes]
    }
    ocr-service = {
      queue_name = "docuploader-ocr-direct-queue"
      s3_buckets = [local.staging_bucket_arn, local.pipeline_bucket_arn]
      ddb_tables = [local.ddb_arns.task_tokens, local.ddb_arns.pipeline_files]
    }
    zip-extraction-service = {
      queue_name = "docuploader-archive-queue"
      s3_buckets = [local.staging_bucket_arn]
      ddb_tables = [local.ddb_arns.pipeline_files]
    }
    output-assembly-service = {
      queue_name = "docuploader-output-assembly-queue"
      s3_buckets = [local.pipeline_bucket_arn]
      ddb_tables = [local.ddb_arns.pipeline_files]
    }
    slipsheet-service = {
      queue_name = "docuploader-slipsheet-queue"
      s3_buckets = [local.pipeline_bucket_arn, local.pipeline_config_bucket_arn]
      ddb_tables = [local.ddb_arns.workspaces]
    }
    pdf-processing-service = {
      queue_name = "docuploader-pdf-processing-queue"
      s3_buckets = [local.pipeline_bucket_arn]
      ddb_tables = [local.ddb_arns.pipeline_files]
    }
    office-conversion-orchestrator-sidecar = {
      queue_name = "docuploader-convert-office-queue"
      s3_buckets = [local.staging_bucket_arn, local.pipeline_bucket_arn]
      ddb_tables = [local.ddb_arns.pipeline_files, local.ddb_arns.workspaces]
    }
    html-conversion-typescript-sidecar = {
      queue_name = "docuploader-convert-html-queue"
      s3_buckets = [local.staging_bucket_arn, local.pipeline_bucket_arn]
      ddb_tables = [local.ddb_arns.pipeline_files]
    }
    tiff-cog-service = {
      queue_name = "docuploader-tiff-cog-queue"
      s3_buckets = [local.staging_bucket_arn, local.pipeline_bucket_arn]
      ddb_tables = [local.ddb_arns.pipeline_files]
    }
    image-tiff-conversion-service = {
      queue_name = "docuploader-convert-image-queue"
      s3_buckets = [local.staging_bucket_arn, local.pipeline_bucket_arn]
      ddb_tables = [local.ddb_arns.pipeline_files]
    }
    email-extraction-service = {
      queue_name = "docuploader-email-queue"
      s3_buckets = [local.staging_bucket_arn]
      ddb_tables = [local.ddb_arns.documents, "${local.ddb_arns.documents}/index/idempotency-index"]
    }
    media-conversion-service = {
      queue_name = "docuploader-media-queue"
      s3_buckets = [local.staging_bucket_arn, local.pipeline_bucket_arn]
      ddb_tables = [local.ddb_arns.pipeline_files]
    }
  }
}

data "aws_iam_policy_document" "pipeline_worker" {
  for_each = local.pipeline_workers

  statement {
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility",
    ]
    resources = ["arn:${local.partition}:sqs:${var.aws_region}:${local.account_id}:${each.value.queue_name}"]
  }

  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = [for b in each.value.s3_buckets : "${b}/*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
      "dynamodb:DeleteItem", "dynamodb:Query",
    ]
    resources = each.value.ddb_tables
  }

  statement {
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [local.tenant_kms_arn]
  }
}

resource "aws_iam_role" "pipeline_worker" {
  for_each = local.pipeline_workers

  name               = "docuploader-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.irsa_trust[each.key].json
  tags               = merge(local.common_tags, { Workload = each.key })
}

resource "aws_iam_role_policy" "pipeline_worker" {
  for_each = local.pipeline_workers

  name   = "permissions"
  role   = aws_iam_role.pipeline_worker[each.key].id
  policy = data.aws_iam_policy_document.pipeline_worker[each.key].json
}
