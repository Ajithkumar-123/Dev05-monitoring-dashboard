# image-tiff-conversion-service

**Tier**: Pipeline
**Language**: TypeScript (Node 22 LTS, pnpm)
**Compute**: EKS Deployment

## Purpose
Routes `convert/image` and `convert/tiff`. Transcodes images (sharp) and wraps them in PDF containers (PDFKit). For TIFFs, uses ranged extraction via `geotiff.js` against COG-formatted input from `tiff-cog-service`.

## Responsibilities
- Long-poll the `convert/image` and `convert/tiff` worker queues
- Per-page or per-frame extraction with bounded RAM (ranged reads for TIFF)
- Produce per-frame PDF wrappers via `PDFKit`
- Hand off to `output-assembly-service`
- `Notify_<X>` per stage

## Inputs (consumed)
- SQS worker queues for `convert/image` and `convert/tiff`
- S3 source / COG-converted intermediate

## Outputs (produced)
- Per-frame PDFs in S3
- SQS hand-off downstream
- `Notify_<X>` events

## Dependencies
- `tiff-cog-service` (for ranged TIFF reads); `platform-orchestration`, `platform-data`, `platform-iam-and-security`; `sharp`, `PDFKit`, `geotiff.js` (in-image)

## Test gate
Three-tier — Local: property tests on bounded peak RAM regardless of input file size + valid-PDF output; LocalStack: SQS + S3; Sandbox: real-AWS verification.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/image-tiff-conversion-service/`
- Source: `units/image-tiff-conversion-service/`
