# output-assembly-service

**Tier**: Pipeline (terminal)
**Language**: TypeScript
**Compute**: EKS Deployment

## Purpose
Materialises the per-document output set (searchable PDF, plain text, native artefacts, slipsheets) and writes it to S3. Updates `Document.outputs` via the document resolver.

## Responsibilities
- Assemble searchable PDFs (`pdf-lib`) for converted outputs
- Write per-document output set to S3 under `docuploader-pipeline/<documentId>/`
- Call `document-resolver.updateDocumentStatus` with terminal state and `outputs` payload (idempotency-keyed)

## Inputs (consumed)
- SQS `output-assembly` worker queue (from per-route workers)
- S3 intermediate artefacts

## Outputs (produced)
- S3 output objects under the per-document prefix
- gRPC `updateDocumentStatus` to `document-resolver`

## Dependencies
- `platform-orchestration`, `platform-data`, `document-resolver`, `platform-iam-and-security`

## Test gate
Three-tier — Local: property tests on output-set invariants (valid PDF; expected file types; bounded peak RAM); LocalStack: SQS + S3 + DynamoDB; Sandbox: end-to-end output verification across all six routes.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/output-assembly-service/`
- Source: `units/output-assembly-service/`
