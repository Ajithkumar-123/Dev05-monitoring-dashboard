###############################################################################
# SQS: 14 main queues + 14 DLQs.
# Each main queue is paired with its DLQ via a redrive policy.
###############################################################################

locals {
  # Per-queue parameters: visibility timeout (seconds) and maxReceiveCount.
  # KMS key choice: tenant CMK for everything except audit-events (audit CMK).
  queues = {
    "classification-queue"               = { visibility = 60,  max_receive = 5,  kms = "tenant" }
    "ocr-direct-queue"                   = { visibility = 600, max_receive = 5,  kms = "tenant" }
    "archive-queue"                      = { visibility = 300, max_receive = 5,  kms = "tenant" }
    "output-assembly-queue"              = { visibility = 300, max_receive = 5,  kms = "tenant" }
    "slipsheet-queue"                    = { visibility = 60,  max_receive = 5,  kms = "tenant" }
    "pdf-processing-queue"               = { visibility = 600, max_receive = 5,  kms = "tenant" }
    "convert-office-queue"               = { visibility = 900, max_receive = 3,  kms = "tenant" }
    "convert-html-queue"                 = { visibility = 300, max_receive = 5,  kms = "tenant" }
    "tiff-cog-queue"                     = { visibility = 300, max_receive = 5,  kms = "tenant" }
    "convert-image-queue"                = { visibility = 300, max_receive = 5,  kms = "tenant" }
    "email-queue"                        = { visibility = 300, max_receive = 5,  kms = "tenant" }
    "media-queue"                        = { visibility = 900, max_receive = 5,  kms = "tenant" }
    "state-change-notification-queue"    = { visibility = 60,  max_receive = 10, kms = "tenant" }
    "api-audit-events"                   = { visibility = 60,  max_receive = 5,  kms = "audit"  }
  }

  queue_kms_arn = { tenant = local.tenant_kms_arn, audit = local.audit_kms_arn }
}

resource "aws_sqs_queue" "dlq" {
  for_each = local.queues

  name                              = "docuploader-${each.key}-dlq"
  message_retention_seconds         = 1209600 # 14 days
  receive_wait_time_seconds         = 20
  kms_master_key_id                 = local.queue_kms_arn[each.value.kms]
  kms_data_key_reuse_period_seconds = 300

  tags = merge(local.common_tags, { Queue = "docuploader-${each.key}-dlq", IsDLQ = "true" })
}

resource "aws_sqs_queue" "main" {
  for_each = local.queues

  name                              = "docuploader-${each.key}"
  message_retention_seconds         = 345600 # 4 days
  receive_wait_time_seconds         = 20
  visibility_timeout_seconds        = each.value.visibility
  kms_master_key_id                 = local.queue_kms_arn[each.value.kms]
  kms_data_key_reuse_period_seconds = 300

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq[each.key].arn
    maxReceiveCount     = each.value.max_receive
  })

  tags = merge(local.common_tags, { Queue = "docuploader-${each.key}" })
}
