# document-event-handler-lambda

**Tier**: API
**Language**: Go
**Compute**: AWS Lambda (Event-Driven variant; `provided.al2023`)

## Purpose
Pre-pipeline event consumer. Drains EventBridge events for S3 PutObject (uploads) and GuardDuty Malware Protection findings. Starts Step Functions executions for clean objects; terminates pipeline entry for malware-flagged objects.

## Responsibilities
- Subscribe to `docuploader-api-events` EventBridge rules
- For S3 PutObject + GuardDuty `NO_THREATS_FOUND`: start Step Functions execution
- For GuardDuty `THREATS_FOUND`: do not start; transition `Document.status` to a scan-failure terminal state via document-resolver
- W3C Trace Context propagation into Step Functions task input

## Inputs (consumed)
- EventBridge: S3 PutObject events on `docuploader-api-staging`; GuardDuty Malware Protection findings
- DynamoDB `docuploader-api-documents` (resolve document by S3 key)

## Outputs (produced)
- Step Functions `StartExecution` calls
- gRPC calls to `document-resolver.updateDocumentStatus` (for scan-failure paths)

## Dependencies
- `platform-orchestration` (Step Functions + EventBridge), `platform-data` (DynamoDB), `platform-iam-and-security` (IAM role + GuardDuty findings access), `document-resolver`

## Test gate
Three-tier — Local: handler unit tests + property tests on event-shape parsing; LocalStack: EventBridge + Step Functions + DynamoDB (GuardDuty mocked at SDK boundary); Sandbox: real GuardDuty EICAR-style probe + real Step Functions execution.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/document-event-handler-lambda/`
- Source: `units/document-event-handler-lambda/`
