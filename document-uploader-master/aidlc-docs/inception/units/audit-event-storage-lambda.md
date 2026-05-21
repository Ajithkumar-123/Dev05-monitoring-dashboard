# audit-event-storage-lambda

**Tier**: API
**Language**: Go
**Compute**: AWS Lambda (Event-Driven; `provided.al2023`)

## Purpose
Drains `docuploader-api-audit-events` SQS. For each message, writes a record to the DynamoDB hot store (90-day TTL) AND an object to the S3 Glacier IR cold store (Object Lock Compliance, 7-year default). Uses partial-batch failure semantics.

## Responsibilities
- SQS event source mapping with partial-batch failure (`ReportBatchItemFailures`)
- Write to `docuploader-api-audit-events` (DynamoDB hot store)
- Write to `docuploader-api-audit-archive` (S3 Glacier IR, deterministic key `audit/{tenantId}/{yyyy}/{MM}/{dd}/{eventId}.json`)
- Apply redaction policy (presigned URLs / OIDC tokens / data keys / customer document content never appear in payload)
- On dual-sink success, message is acked; on either-sink failure, item-level failure reported (SQS retries; DLQ on exhaustion)
- Emergency fall-through: on SQS-side failure detected upstream, audit-fallback CloudWatch log is the outlet (provisioned by `platform-orchestration` + `platform-network-and-compute`)

## Inputs (consumed)
- SQS `docuploader-api-audit-events`

## Outputs (produced)
- DynamoDB rows in `docuploader-api-audit-events`
- S3 objects in `docuploader-api-audit-archive`
- DLQ messages on persistent failure

## Dependencies
- `platform-orchestration` (SQS), `platform-data` (DynamoDB + S3 + audit-archive CMK), `platform-iam-and-security` (IAM role)

## Test gate
Three-tier — Local: unit + property tests on redaction and idempotent dual-sink writes; LocalStack: SQS + DynamoDB + S3; Sandbox: synthetic mutation probe → both sinks verified.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/audit-event-storage-lambda/`
- Source: `units/audit-event-storage-lambda/`
