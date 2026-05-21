locals {
  bucket_tags = {
    Component   = "platform-data"
    Environment = var.environment
  }
}

resource "aws_s3_bucket" "staging" {
  bucket = "docuploader-api-staging"
  tags   = merge(local.bucket_tags, { Name = "docuploader-api-staging" })
}

resource "aws_s3_bucket" "pipeline" {
  bucket = "docuploader-pipeline"
  tags   = merge(local.bucket_tags, { Name = "docuploader-pipeline" })
}

resource "aws_s3_bucket" "pipeline_config" {
  bucket = "docuploader-pipeline-config"
  tags   = merge(local.bucket_tags, { Name = "docuploader-pipeline-config" })
}

resource "aws_s3_bucket" "audit_archive" {
  bucket              = "docuploader-api-audit-archive"
  object_lock_enabled = true
  tags                = merge(local.bucket_tags, { Name = "docuploader-api-audit-archive" })
}

resource "aws_s3_bucket_public_access_block" "all" {
  for_each = {
    staging         = aws_s3_bucket.staging.id
    pipeline        = aws_s3_bucket.pipeline.id
    pipeline_config = aws_s3_bucket.pipeline_config.id
    audit_archive   = aws_s3_bucket.audit_archive.id
  }
  bucket                  = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tenant_keyed" {
  for_each = {
    staging         = aws_s3_bucket.staging.id
    pipeline        = aws_s3_bucket.pipeline.id
    pipeline_config = aws_s3_bucket.pipeline_config.id
  }
  bucket = each.value
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.tenant.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audit_archive" {
  bucket = aws_s3_bucket.audit_archive.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.audit_archive.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_object_lock_configuration" "audit_archive" {
  bucket = aws_s3_bucket.audit_archive.id
  rule {
    default_retention {
      mode  = "COMPLIANCE"
      years = var.audit_archive_retention_years
    }
  }
}

data "aws_iam_policy_document" "deny_insecure_transport" {
  for_each = {
    staging         = aws_s3_bucket.staging.arn
    pipeline        = aws_s3_bucket.pipeline.arn
    pipeline_config = aws_s3_bucket.pipeline_config.arn
    audit_archive   = aws_s3_bucket.audit_archive.arn
  }
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      each.value,
      "${each.value}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "deny_insecure_transport" {
  for_each = {
    staging         = aws_s3_bucket.staging.id
    pipeline        = aws_s3_bucket.pipeline.id
    pipeline_config = aws_s3_bucket.pipeline_config.id
    audit_archive   = aws_s3_bucket.audit_archive.id
  }
  bucket = each.value
  policy = data.aws_iam_policy_document.deny_insecure_transport[each.key].json
}

resource "aws_s3_bucket_lifecycle_configuration" "staging" {
  bucket = aws_s3_bucket.staging.id
  rule {
    id     = "default-input-retention"
    status = "Enabled"
    expiration {
      days = var.input_retention_days_default
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
    filter {}
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "audit_archive" {
  bucket = aws_s3_bucket.audit_archive.id
  rule {
    id     = "transition-to-glacier-ir"
    status = "Enabled"
    transition {
      days          = 0
      storage_class = "GLACIER_IR"
    }
    filter {}
  }
}
