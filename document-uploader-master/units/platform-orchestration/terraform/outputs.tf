output "state_machine_arn" {
  value = aws_sfn_state_machine.pipeline.arn
}

output "event_bus_arn" {
  value = aws_cloudwatch_event_bus.main.arn
}

output "event_bus_name" {
  value = aws_cloudwatch_event_bus.main.name
}

output "event_rule_arns" {
  value = {
    s3_putobject_staging        = aws_cloudwatch_event_rule.s3_putobject_staging.arn
    guardduty_malware_findings  = aws_cloudwatch_event_rule.guardduty_malware_findings.arn
  }
}

output "sqs_queue_urls" {
  value = { for k, q in aws_sqs_queue.main : k => q.url }
}

output "sqs_queue_arns" {
  value = { for k, q in aws_sqs_queue.main : k => q.arn }
}

output "sqs_dlq_arns" {
  value = { for k, q in aws_sqs_queue.dlq : k => q.arn }
}
