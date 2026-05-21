###############################################################################
# wundergraph-router: read service-account JWT secret; emit audit events
###############################################################################
data "aws_iam_policy_document" "router" {
  statement {
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.graphql_internal_auth.arn]
  }
  statement {
    effect    = "Allow"
    actions   = ["sqs:SendMessage", "sqs:GetQueueAttributes"]
    resources = ["arn:${local.partition}:sqs:${var.aws_region}:${local.account_id}:docuploader-api-audit-events"]
  }
}

resource "aws_iam_role" "router" {
  name               = "docuploader-router"
  assume_role_policy = data.aws_iam_policy_document.irsa_trust["router"].json
  tags               = local.common_tags
}

resource "aws_iam_role_policy" "router" {
  name   = "permissions"
  role   = aws_iam_role.router.id
  policy = data.aws_iam_policy_document.router.json
}

###############################################################################
# workspace-resolver: workspaces table CRUD + KMS alias management
###############################################################################
data "aws_iam_policy_document" "workspace_resolver" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
      "dynamodb:DeleteItem", "dynamodb:Query",
    ]
    resources = [local.ddb_arns.workspaces]
  }
  statement {
    effect    = "Allow"
    actions   = ["kms:CreateAlias", "kms:DeleteAlias", "kms:UpdateAlias", "kms:ListAliases", "kms:TagResource"]
    resources = [local.tenant_kms_arn, "arn:${local.partition}:kms:${var.aws_region}:${local.account_id}:alias/docuploader-tenant-*"]
  }
}

resource "aws_iam_role" "workspace_resolver" {
  name               = "docuploader-workspace-resolver"
  assume_role_policy = data.aws_iam_policy_document.irsa_trust["workspace-resolver"].json
  tags               = local.common_tags
}

resource "aws_iam_role_policy" "workspace_resolver" {
  name   = "permissions"
  role   = aws_iam_role.workspace_resolver.id
  policy = data.aws_iam_policy_document.workspace_resolver.json
}

###############################################################################
# batch-resolver: batches table CRUD
###############################################################################
data "aws_iam_policy_document" "batch_resolver" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
      "dynamodb:DeleteItem", "dynamodb:Query",
    ]
    resources = [local.ddb_arns.batches]
  }
}

resource "aws_iam_role" "batch_resolver" {
  name               = "docuploader-batch-resolver"
  assume_role_policy = data.aws_iam_policy_document.irsa_trust["batch-resolver"].json
  tags               = local.common_tags
}

resource "aws_iam_role_policy" "batch_resolver" {
  name   = "permissions"
  role   = aws_iam_role.batch_resolver.id
  policy = data.aws_iam_policy_document.batch_resolver.json
}

###############################################################################
# document-resolver: documents table + idempotency GSI + S3 presign + KMS encrypt
###############################################################################
data "aws_iam_policy_document" "document_resolver" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query",
    ]
    resources = [
      local.ddb_arns.documents,
      "${local.ddb_arns.documents}/index/idempotency-index",
    ]
  }
  statement {
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:GetObject"]
    resources = ["${local.staging_bucket_arn}/*"]
  }
  statement {
    effect    = "Allow"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"]
    resources = [local.tenant_kms_arn]
  }
}

resource "aws_iam_role" "document_resolver" {
  name               = "docuploader-document-resolver"
  assume_role_policy = data.aws_iam_policy_document.irsa_trust["document-resolver"].json
  tags               = local.common_tags
}

resource "aws_iam_role_policy" "document_resolver" {
  name   = "permissions"
  role   = aws_iam_role.document_resolver.id
  policy = data.aws_iam_policy_document.document_resolver.json
}

###############################################################################
# Lambdas
###############################################################################
locals {
  lambda_basic_logging = [
    "logs:CreateLogGroup",
    "logs:CreateLogStream",
    "logs:PutLogEvents",
  ]
  fallback_log_group_arn = "arn:${local.partition}:logs:${var.aws_region}:${local.account_id}:log-group:/aws/docuploader/api/audit-fallback:*"
}

# pre-token-generation-lambda
data "aws_iam_policy_document" "pre_token_generation_lambda" {
  statement {
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.graphql_internal_auth.arn]
  }
  statement {
    effect    = "Allow"
    actions   = local.lambda_basic_logging
    resources = [local.fallback_log_group_arn]
  }
}

resource "aws_iam_role" "pre_token_generation_lambda" {
  name               = "docuploader-pre-token-generation-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy" "pre_token_generation_lambda" {
  name   = "permissions"
  role   = aws_iam_role.pre_token_generation_lambda.id
  policy = data.aws_iam_policy_document.pre_token_generation_lambda.json
}

# document-event-handler-lambda
data "aws_iam_policy_document" "document_event_handler_lambda" {
  statement {
    effect    = "Allow"
    actions   = ["states:StartExecution"]
    resources = ["arn:${local.partition}:states:${var.aws_region}:${local.account_id}:stateMachine:docuploader-pipeline-*"]
  }
  statement {
    effect    = "Allow"
    actions   = ["dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:Query"]
    resources = [local.ddb_arns.documents, "${local.ddb_arns.documents}/index/idempotency-index"]
  }
  statement {
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = [local.tenant_kms_arn]
  }
  statement {
    effect    = "Allow"
    actions   = local.lambda_basic_logging
    resources = [local.fallback_log_group_arn]
  }
}

resource "aws_iam_role" "document_event_handler_lambda" {
  name               = "docuploader-document-event-handler-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy" "document_event_handler_lambda" {
  name   = "permissions"
  role   = aws_iam_role.document_event_handler_lambda.id
  policy = data.aws_iam_policy_document.document_event_handler_lambda.json
}

# audit-event-storage-lambda
data "aws_iam_policy_document" "audit_event_storage_lambda" {
  statement {
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility",
    ]
    resources = ["arn:${local.partition}:sqs:${var.aws_region}:${local.account_id}:docuploader-api-audit-events"]
  }
  statement {
    effect    = "Allow"
    actions   = ["dynamodb:PutItem"]
    resources = [local.ddb_arns.audit_events]
  }
  statement {
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${local.audit_archive_bucket_arn}/*"]
  }
  statement {
    effect    = "Allow"
    actions   = ["kms:Encrypt", "kms:GenerateDataKey"]
    resources = [local.audit_kms_arn]
  }
  statement {
    effect    = "Allow"
    actions   = local.lambda_basic_logging
    resources = [local.fallback_log_group_arn]
  }
}

resource "aws_iam_role" "audit_event_storage_lambda" {
  name               = "docuploader-audit-event-storage-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy" "audit_event_storage_lambda" {
  name   = "permissions"
  role   = aws_iam_role.audit_event_storage_lambda.id
  policy = data.aws_iam_policy_document.audit_event_storage_lambda.json
}

# update-document-state-lambda
data "aws_iam_policy_document" "update_document_state_lambda" {
  statement {
    effect    = "Allow"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"]
    resources = ["arn:${local.partition}:sqs:${var.aws_region}:${local.account_id}:docuploader-state-change-notification-queue"]
  }
  statement {
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.graphql_internal_auth.arn]
  }
  statement {
    effect    = "Allow"
    actions   = local.lambda_basic_logging
    resources = [local.fallback_log_group_arn]
  }
}

resource "aws_iam_role" "update_document_state_lambda" {
  name               = "docuploader-update-document-state-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy" "update_document_state_lambda" {
  name   = "permissions"
  role   = aws_iam_role.update_document_state_lambda.id
  policy = data.aws_iam_policy_document.update_document_state_lambda.json
}
