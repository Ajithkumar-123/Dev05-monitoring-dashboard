# pdf-processing-service

**Tier**: Pipeline
**Language**: Python (uv)
**Compute**: EKS Deployment

## Purpose
PDF repair, page-level operations, OCR text-layer assembly using `pikepdf`, `PyMuPDF`, and `Ghostscript` bindings.

## Responsibilities
- Repair malformed PDFs (`pikepdf`)
- Page-level operations (split, merge, normalise) with streaming where viable
- Assemble OCR text layer into a searchable PDF
- Preserve page count; produce valid output per `pikepdf.open()`

## Inputs (consumed)
- SQS `pdf-processing` worker queue (from `ocr-service` or directly from office-conversion completion)
- S3 source / intermediate artefacts

## Outputs (produced)
- Repaired / assembled PDFs in S3
- Hand-off to `output-assembly-service` via SQS

## Dependencies
- `platform-orchestration`, `platform-data`, `platform-iam-and-security`

## Test gate
Three-tier — Local: `hypothesis` property tests (page count preserved, text extractable, no orphaned XObjects, output parses); LocalStack: SQS + S3; Sandbox: real-AWS verification.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/pdf-processing-service/`
- Source: `units/pdf-processing-service/`
