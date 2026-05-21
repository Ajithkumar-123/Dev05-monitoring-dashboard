###############################################################################
# Step Functions Standard state machine.
# ASL definition lives in `../asl/docuploader-pipeline-mvp.asl.json`. We render
# it through templatefile() so Terraform substitutes queue URLs at apply time.
###############################################################################

data "aws_iam_policy_document" "step_functions_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "step_functions_permissions" {
  # Send messages to every worker queue + the state-change-notification queue.
  statement {
    effect    = "Allow"
    actions   = ["sqs:SendMessage", "sqs:GetQueueAttributes"]
    resources = [for q in aws_sqs_queue.main : q.arn if !endswith(q.name, "-api-audit-events")]
  }

  # KMS for SSE-KMS encryption on queue puts.
  statement {
    effect    = "Allow"
    actions   = ["kms:Encrypt", "kms:GenerateDataKey", "kms:Decrypt"]
    resources = [local.tenant_kms_arn]
  }

  # CloudWatch Logs for state-machine execution history.
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogDelivery", "logs:GetLogDelivery", "logs:UpdateLogDelivery",
      "logs:DeleteLogDelivery", "logs:ListLogDeliveries",
      "logs:PutResourcePolicy", "logs:DescribeResourcePolicies", "logs:DescribeLogGroups",
    ]
    resources = ["*"]
  }

  # X-Ray (optional; W3C Trace Context is primary).
  statement {
    effect    = "Allow"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"]
  }
}

resource "aws_iam_role" "step_functions" {
  name               = "docuploader-pipeline-mvp-execution"
  assume_role_policy = data.aws_iam_policy_document.step_functions_trust.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy" "step_functions" {
  name   = "permissions"
  role   = aws_iam_role.step_functions.id
  policy = data.aws_iam_policy_document.step_functions_permissions.json
}

resource "aws_cloudwatch_log_group" "step_functions" {
  name              = "/aws/vendedlogs/states/docuploader-pipeline-mvp"
  retention_in_days = 30
  tags              = local.common_tags
}

locals {
  asl_queue_urls = {
    classification    = aws_sqs_queue.main["classification-queue"].url
    ocr_direct        = aws_sqs_queue.main["ocr-direct-queue"].url
    archive           = aws_sqs_queue.main["archive-queue"].url
    output_assembly   = aws_sqs_queue.main["output-assembly-queue"].url
    slipsheet         = aws_sqs_queue.main["slipsheet-queue"].url
    pdf_processing    = aws_sqs_queue.main["pdf-processing-queue"].url
    convert_office    = aws_sqs_queue.main["convert-office-queue"].url
    convert_html      = aws_sqs_queue.main["convert-html-queue"].url
    tiff_cog          = aws_sqs_queue.main["tiff-cog-queue"].url
    convert_image     = aws_sqs_queue.main["convert-image-queue"].url
    email             = aws_sqs_queue.main["email-queue"].url
    media             = aws_sqs_queue.main["media-queue"].url
    state_change      = aws_sqs_queue.main["state-change-notification-queue"].url
  }
}

resource "aws_sfn_state_machine" "pipeline" {
  name       = "docuploader-pipeline-mvp"
  role_arn   = aws_iam_role.step_functions.arn
  type       = "STANDARD"
  definition = templatefile("${path.module}/../asl/docuploader-pipeline-mvp.asl.json", local.asl_queue_urls)

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.step_functions.arn}:*"
    include_execution_data = false
    level                  = "ERROR"
  }

  tracing_configuration {
    enabled = true
  }

  tags = local.common_tags
}
