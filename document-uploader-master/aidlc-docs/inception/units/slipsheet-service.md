# slipsheet-service

**Tier**: Pipeline
**Language**: TypeScript
**Compute**: EKS Deployment

## Purpose
Deterministic fallback that produces a slipsheet PDF for unsupported types or for documents matching `Workspace.pipelineConfig.forcedSlipsheetExtensions` (default `csv, ods`).

## Responsibilities
- Render the slipsheet PDF template (`pdf-lib`) with document metadata (filename, MIME, reason)
- Pixel-stable output (golden-file tests cover this dimension)
- Set `nativeTrigger=SLIPSHEET`
- Hand off to `output-assembly-service`

## Inputs (consumed)
- SQS `slipsheet` worker queue
- DynamoDB `docuploader-api-workspaces` (workspace pipelineConfig for forced-slipsheet list)
- `docuploader-pipeline-config` (slipsheet template overlays)

## Outputs (produced)
- Slipsheet PDF in S3
- Hand-off to `output-assembly-service` via SQS

## Dependencies
- `platform-orchestration`, `platform-data`, `platform-iam-and-security`

## Test gate
Three-tier — Local: golden-file test on pixel-stable slipsheet template + property tests on metadata-rendering correctness; LocalStack: SQS + S3 + DynamoDB; Sandbox: real-AWS slipsheet generation.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/slipsheet-service/`
- Source: `units/slipsheet-service/`
