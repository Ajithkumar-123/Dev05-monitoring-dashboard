locals {
  table_tags = {
    Component   = "platform-data"
    Environment = var.environment
  }
}

resource "aws_dynamodb_table" "workspaces" {
  name         = "docuploader-api-workspaces"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "workspaceId"

  attribute {
    name = "workspaceId"
    type = "S"
  }

  point_in_time_recovery { enabled = true }
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.tenant.arn
  }

  tags = merge(local.table_tags, { Name = "docuploader-api-workspaces" })
}

resource "aws_dynamodb_table" "batches" {
  name         = "docuploader-api-batches"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "batchId"

  attribute {
    name = "batchId"
    type = "S"
  }

  point_in_time_recovery { enabled = true }
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.tenant.arn
  }

  tags = merge(local.table_tags, { Name = "docuploader-api-batches" })
}

resource "aws_dynamodb_table" "documents" {
  name         = "docuploader-api-documents"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "documentId"

  attribute {
    name = "documentId"
    type = "S"
  }

  attribute {
    name = "idempotencyKey"
    type = "S"
  }

  global_secondary_index {
    name            = "idempotency-index"
    hash_key        = "idempotencyKey"
    projection_type = "ALL"
  }

  point_in_time_recovery { enabled = true }
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.tenant.arn
  }

  tags = merge(local.table_tags, { Name = "docuploader-api-documents" })
}

resource "aws_dynamodb_table" "audit_events" {
  name         = "docuploader-api-audit-events"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "eventId"

  attribute {
    name = "eventId"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery { enabled = true }
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.audit_archive.arn
  }

  tags = merge(local.table_tags, { Name = "docuploader-api-audit-events" })
}

resource "aws_dynamodb_table" "content_hashes" {
  name         = "docuploader-content-hashes"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "sha256"

  attribute {
    name = "sha256"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery { enabled = true }
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.tenant.arn
  }

  tags = merge(local.table_tags, { Name = "docuploader-content-hashes" })
}

resource "aws_dynamodb_table" "pipeline_files" {
  name         = "docuploader-pipeline-files"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "fileId"

  attribute {
    name = "fileId"
    type = "S"
  }

  attribute {
    name = "folderPath"
    type = "S"
  }

  global_secondary_index {
    name            = "folderPath-index"
    hash_key        = "folderPath"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery { enabled = true }
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.tenant.arn
  }

  tags = merge(local.table_tags, { Name = "docuploader-pipeline-files" })
}

resource "aws_dynamodb_table" "task_tokens" {
  name         = "textract-task-tokens"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "taskToken"

  attribute {
    name = "taskToken"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery { enabled = true }
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.tenant.arn
  }

  tags = merge(local.table_tags, { Name = "textract-task-tokens" })
}
