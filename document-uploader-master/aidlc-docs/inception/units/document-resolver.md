# document-resolver

**Tier**: API
**Language**: Go
**Compute**: EKS Deployment (gRPC backend)

## Purpose
Implements `Document` CRUD, presigned-URL minting on `createDocument`, idempotency-keyed `updateDocumentStatus`, and the `Document.statusChanged` subscription resolver.

## Responsibilities
- gRPC handlers: `createDocument` (mints server-set presigned URL with server-set TTL and content-type), `updateDocumentStatus` (idempotency key derived from `(executionId, toState, phase)`), `getDocument`, subscription resolver
- Enforces `Batch` is `OPEN`, `Workspace` is `ACTIVE`, status transitions are legal
- Idempotency enforcement via `idempotency-index` GSI on `docuploader-api-documents`
- Output set materialisation in `Document.outputs` at terminal state
- `processingError` population for `FAILED` documents

## Inputs (consumed)
- gRPC from `wundergraph-router`
- DynamoDB `docuploader-api-documents`
- S3 (`docuploader-api-staging`) — presigned URL minting
- KMS — per-tenant alias for SSE-KMS in presigned URLs

## Outputs (produced)
- DynamoDB rows in `docuploader-api-documents`
- Presigned PUT URLs (server-set)
- gRPC subscription events propagating to router subscription fan-out

## Dependencies
- `platform-data` (table + S3 + KMS), `platform-iam-and-security` (IAM role)

## Test gate
Three-tier — Local: idempotency + state-machine + presigned-URL property tests (server-set TTL invariants); LocalStack: DynamoDB + S3 + KMS; Sandbox: real `Document.statusChanged` subscription E2E.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/document-resolver/`
- Source: `units/document-resolver/`
