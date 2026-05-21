# classification-service

**Tier**: Pipeline
**Language**: TypeScript (Node 22 LTS, pnpm)
**Compute**: EKS Deployment

## Purpose
Pre-routing classifier. Reads the staged object, detects MIME via magic bytes (`file-type` 21.x), and routes to the appropriate per-route worker queue.

## Responsibilities
- Read staged S3 object metadata + first-bytes for `file-type` detection
- Map detected MIME → route (`ocr-direct`, `convert/office`, `convert/html`, `convert/image`, `convert/tiff`, `email`, `archive`, `media`, `slipsheet`)
- Honour `Workspace.pipelineConfig.allowedExtensions` and `forcedSlipsheetExtensions`
- Publish per-route queue message with `schemaVersion`

## Inputs (consumed)
- SQS classification queue (from Step Functions task)
- S3 (`docuploader-api-staging`) — head + first-bytes read
- DynamoDB `docuploader-api-workspaces` (pipelineConfig)

## Outputs (produced)
- SQS messages to per-route worker queue
- `Notify_<X>` interstitial state-change events (via Step Functions)

## Dependencies
- `platform-orchestration` (queues + ASL), `platform-data` (S3 + DynamoDB), `platform-iam-and-security`

## Test gate
Three-tier — Local: property tests on MIME-detection invariants across the reference corpus; LocalStack: SQS + S3 + DynamoDB; Sandbox: real-AWS classification across corpus.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/classification-service/`
- Source: `units/classification-service/`
