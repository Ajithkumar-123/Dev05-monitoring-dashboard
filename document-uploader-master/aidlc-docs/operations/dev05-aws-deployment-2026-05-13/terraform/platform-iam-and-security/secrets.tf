###############################################################################
# Secrets Manager bootstrap.
# Resources defined here are skeletons. Values are populated by operator
# runbooks post-apply (e.g., the Aspose licence text). Secret rotation is also
# operator-owned at MVP.
###############################################################################

resource "aws_secretsmanager_secret" "graphql_internal_auth" {
  name        = "docuploader/graphql-internal-auth"
  description = "Service-account JWT signing secret for internal gRPC calls; consumed via External Secrets Operator"
  tags        = local.common_tags
}

resource "aws_secretsmanager_secret" "aspose_licence" {
  name        = "docuploader/aspose-licence"
  description = "Aspose.Total for C++ licence; operator-managed value (mounted into the aspose-converter pod via External Secrets Operator)"
  tags        = local.common_tags
}

resource "aws_secretsmanager_secret" "audit_archive_cmk_arn" {
  name        = "docuploader/audit-archive-cmk-arn"
  description = "ARN of the operator-managed CMK used by the audit-archive bucket; consumed by audit-event-storage-lambda"
  tags        = local.common_tags
}

resource "aws_secretsmanager_secret_version" "audit_archive_cmk_arn" {
  secret_id     = aws_secretsmanager_secret.audit_archive_cmk_arn.id
  secret_string = local.audit_kms_arn
}
