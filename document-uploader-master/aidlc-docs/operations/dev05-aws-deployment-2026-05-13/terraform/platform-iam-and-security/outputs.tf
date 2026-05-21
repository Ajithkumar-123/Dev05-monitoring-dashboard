output "api_tier_role_arns" {
  value = {
    router                              = aws_iam_role.router.arn
    workspace_resolver                  = aws_iam_role.workspace_resolver.arn
    batch_resolver                      = aws_iam_role.batch_resolver.arn
    document_resolver                   = aws_iam_role.document_resolver.arn
    pre_token_generation_lambda         = aws_iam_role.pre_token_generation_lambda.arn
    document_event_handler_lambda       = aws_iam_role.document_event_handler_lambda.arn
    audit_event_storage_lambda          = aws_iam_role.audit_event_storage_lambda.arn
    update_document_state_lambda        = aws_iam_role.update_document_state_lambda.arn
  }
}

output "pipeline_worker_role_arns" {
  value = { for k, v in aws_iam_role.pipeline_worker : k => v.arn }
}

output "guardduty_detector_id" {
  value = aws_guardduty_detector.main.id
}

output "secret_arns" {
  value = {
    graphql_internal_auth = aws_secretsmanager_secret.graphql_internal_auth.arn
    aspose_licence        = aws_secretsmanager_secret.aspose_licence.arn
    audit_archive_cmk_arn = aws_secretsmanager_secret.audit_archive_cmk_arn.arn
  }
}
