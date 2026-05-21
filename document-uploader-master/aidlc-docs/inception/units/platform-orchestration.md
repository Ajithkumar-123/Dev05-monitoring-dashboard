# platform-orchestration

**Tier**: Platform
**Language**: Terraform + ASL JSON
**Compute**: Cross-cutting infrastructure

## Purpose
Owns the Step Functions state machine, the EventBridge bus, all SQS queues + DLQs, and the WunderGraph audit-emission router-side wiring.

## Responsibilities
- Step Functions 21-state ASL with 14 fire-and-forget `Notify_<X>` interstitials; Two-Catch error pattern
- `docuploader-api-events` EventBridge bus + rules for S3 PutObject and GuardDuty findings (with DLQs on rule targets)
- 12 worker SQS queues (one per route/sub-route) + `state-change-notification-queue` + `docuploader-api-audit-events`, each with a DLQ
- WunderGraph router-side ConfigMap and SQS sender configuration for the audit-emission custom module

## Inputs (consumed)
- IAM roles from `platform-iam-and-security` (Step Functions execution role; SQS queue policies)
- KMS keys from `platform-data` (SQS server-side encryption)

## Outputs (produced)
- Step Functions state machine ARN (consumed by `document-event-handler-lambda`)
- SQS queue URLs (consumed by every pipeline worker, `update-document-state-lambda`, `audit-event-storage-lambda`)
- EventBridge bus + rule ARNs (consumed by `document-event-handler-lambda`)

## Dependencies
- `platform-iam-and-security`
- `platform-data` (KMS for SQS encryption)

## Test gate
Three-tier — Local: ASL syntax + `terraform plan`; LocalStack: Step Functions + SQS + EventBridge; Sandbox: real execution end-to-end with synthetic state-change traffic.

## Construction-stage artefacts
- Infrastructure design: `aidlc-docs/construction/platform-orchestration/infrastructure-design/`
- Code summary: `aidlc-docs/construction/platform-orchestration/code/`
- Source: `units/platform-orchestration/`
