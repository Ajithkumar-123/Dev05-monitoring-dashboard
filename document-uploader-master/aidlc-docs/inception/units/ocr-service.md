# ocr-service

**Tier**: Pipeline
**Language**: TypeScript
**Compute**: EKS Deployment

## Purpose
Route `ocr-direct`. Invokes AWS Textract (sync and async) on already-PDF inputs needing OCR; assembles the OCR text layer.

## Responsibilities
- Sync Textract for small inputs; async Textract with SNS callback to `textract-completion-queue` for large inputs
- Maintain `textract-task-tokens` records (1-day TTL) for async correlation
- Hand off to `pdf-processing-service` / `output-assembly-service` for text-layer assembly into a searchable PDF
- `Notify_<X>` per stage

## Inputs (consumed)
- SQS `ocr-direct` worker queue
- S3 source object
- Textract API
- SNS → `textract-completion-queue` for async results

## Outputs (produced)
- OCR result blobs (S3)
- SQS messages to downstream `pdf-processing-service` / `output-assembly-service`

## Dependencies
- `platform-orchestration` (queues + Textract task tokens), `platform-data` (S3 + `textract-task-tokens` table), `platform-iam-and-security` (Textract IAM)

## Test gate
Three-tier — Local: property tests on OCR output invariants (page count preserved, text extractable); LocalStack: SQS + S3 (Textract mocked at SDK boundary); Sandbox: real Textract.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/ocr-service/`
- Source: `units/ocr-service/`
