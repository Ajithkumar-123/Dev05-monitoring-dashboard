# update-document-state-lambda

**Tier**: Pipeline (state surfacing)
**Language**: Go
**Compute**: AWS Lambda (Event-Driven; `provided.al2023`)

## Purpose
Drains the `state-change-notification-queue` populated by the 14 fire-and-forget `Notify_<X>` interstitials in the Step Functions ASL. For each event, calls `document-resolver.updateDocumentStatus` with an idempotency key derived from `(executionId, toState, phase)`.

## Responsibilities
- SQS event source mapping with partial-batch failure (`ReportBatchItemFailures`)
- Idempotency-keyed `updateDocumentStatus` call via gRPC into `document-resolver` (service-account JWT for internal auth)
- Surface `Document.status` and `Document.pipelineStage` transitions for `Document.statusChanged` subscribers

## Inputs (consumed)
- SQS `state-change-notification-queue`

## Outputs (produced)
- gRPC `updateDocumentStatus` calls
- DLQ messages on persistent failure

## Dependencies
- `platform-orchestration` (SQS), `document-resolver`, `platform-iam-and-security` (IAM role + service-account JWT)

## Test gate
Three-tier — Local: Go property tests on idempotency-key derivation correctness + de-dup behaviour; LocalStack: SQS; Sandbox: end-to-end state-change → subscription verification.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/update-document-state-lambda/`
- Source: `units/update-document-state-lambda/`
