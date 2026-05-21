# batch-resolver

**Tier**: API
**Language**: Go
**Compute**: EKS Deployment (gRPC backend)

## Purpose
Implements `Batch` CRUD and `OPEN`/`CLOSED` state transitions. Batch is the envelope for one or more `Document` records; `createDocument` requires an `OPEN` batch.

## Responsibilities
- gRPC handlers: `createBatch`, `closeBatch`, `getBatch`
- Batch state machine: `OPEN` → `CLOSED` (terminal)
- Idempotency-keyed mutations

## Inputs (consumed)
- gRPC from `wundergraph-router`
- DynamoDB `docuploader-api-batches`

## Outputs (produced)
- DynamoDB rows in `docuploader-api-batches`
- gRPC responses to router

## Dependencies
- `platform-data` (table), `platform-iam-and-security` (IAM role)

## Test gate
Three-tier — Local: state-machine property tests; LocalStack: DynamoDB; Sandbox: real DynamoDB.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/batch-resolver/`
- Source: `units/batch-resolver/`
