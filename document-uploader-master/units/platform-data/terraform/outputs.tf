output "tenant_kms_key_arn" {
  value = aws_kms_key.tenant.arn
}

output "audit_archive_kms_key_arn" {
  value = aws_kms_key.audit_archive.arn
}

output "dynamodb_table_arns" {
  value = {
    workspaces     = aws_dynamodb_table.workspaces.arn
    batches        = aws_dynamodb_table.batches.arn
    documents      = aws_dynamodb_table.documents.arn
    audit_events   = aws_dynamodb_table.audit_events.arn
    content_hashes = aws_dynamodb_table.content_hashes.arn
    pipeline_files = aws_dynamodb_table.pipeline_files.arn
    task_tokens    = aws_dynamodb_table.task_tokens.arn
  }
}

output "s3_bucket_names" {
  value = {
    staging         = aws_s3_bucket.staging.id
    pipeline        = aws_s3_bucket.pipeline.id
    pipeline_config = aws_s3_bucket.pipeline_config.id
    audit_archive   = aws_s3_bucket.audit_archive.id
  }
}
