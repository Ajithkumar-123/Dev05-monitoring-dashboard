resource "aws_cloudwatch_event_bus" "main" {
  name = "docuploader-api-events"
  tags = local.common_tags
}

# DLQ for failed EventBridge → Lambda invocations.
resource "aws_sqs_queue" "eventbridge_dlq" {
  name                              = "docuploader-eventbridge-dlq"
  message_retention_seconds         = 1209600
  receive_wait_time_seconds         = 20
  kms_master_key_id                 = local.tenant_kms_arn
  kms_data_key_reuse_period_seconds = 300

  tags = merge(local.common_tags, { Queue = "docuploader-eventbridge-dlq" })
}

###############################################################################
# Rule 1: S3 PutObject on docuploader-api-staging.
# Target: document-event-handler-lambda (lambda ARN injected by deploy runbook;
# the Lambda is built and deployed by the document-event-handler-lambda unit,
# which then registers its own target on this rule via terraform import or via
# a deploy-side aws_cloudwatch_event_target resource defined inside that unit).
###############################################################################
resource "aws_cloudwatch_event_rule" "s3_putobject_staging" {
  name           = "docuploader-s3-putobject-staging"
  event_bus_name = aws_cloudwatch_event_bus.main.name
  description    = "S3 PutObject events on docuploader-api-staging — triggers DocumentEventHandler"

  event_pattern = jsonencode({
    source        = ["aws.s3"]
    "detail-type" = ["Object Created"]
    detail = {
      bucket = { name = [local.staging_bucket] }
      reason = ["PutObject"]
    }
  })

  tags = local.common_tags
}

###############################################################################
# Rule 2: GuardDuty Malware Protection findings — also triggers
# DocumentEventHandler so clean/threats decisions short-circuit before pipeline
# entry.
###############################################################################
resource "aws_cloudwatch_event_rule" "guardduty_malware_findings" {
  name           = "docuploader-guardduty-malware-findings"
  event_bus_name = aws_cloudwatch_event_bus.main.name
  description    = "GuardDuty Malware Protection for S3 findings on docuploader-api-staging"

  event_pattern = jsonencode({
    source        = ["aws.guardduty"]
    "detail-type" = ["GuardDuty Malware Protection Object Scan Result"]
    detail = {
      s3ObjectDetails = {
        bucketName = [local.staging_bucket]
      }
    }
  })

  tags = local.common_tags
}

# Note: aws_cloudwatch_event_target.document_event_handler_lambda is defined in
# the document-event-handler-lambda unit, alongside the Lambda itself. This
# keeps Lambda lifecycle (build/deploy) ownership inside that unit.
