# zip-extraction-service

**Tier**: Pipeline
**Language**: TypeScript
**Compute**: EKS Deployment

## Purpose
Route `archive`. Streaming ZIP extraction via `unzipper` (0.12.x) with per-entry fan-out into the pipeline.

## Responsibilities
- Read ZIP from S3 via streaming
- Per-entry: create child `Document` rows; upload entries to staging; trigger re-entry into classification
- Maintain bounded RAM regardless of archive size

## Inputs (consumed)
- SQS `archive` worker queue
- S3 source object (streaming GET)

## Outputs (produced)
- Per-entry S3 PUTs into `docuploader-api-staging`
- Per-entry `createDocument` calls (gRPC into `document-resolver` via service-account JWT)
- `Notify_<X>` per fan-out

## Dependencies
- `platform-orchestration`, `platform-data`, `document-resolver`, `platform-iam-and-security`

## Test gate
Three-tier — Local: property test that peak RAM is bounded irrespective of archive size + nesting; LocalStack: SQS + S3; Sandbox: real fan-out into the pipeline.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/zip-extraction-service/`
- Source: `units/zip-extraction-service/`
