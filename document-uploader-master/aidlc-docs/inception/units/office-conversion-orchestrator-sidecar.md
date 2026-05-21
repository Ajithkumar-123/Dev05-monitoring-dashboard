# office-conversion-orchestrator-sidecar

**Tier**: Pipeline (sidecar-pattern Pod, container #2 of 2)
**Language**: Python (uv)
**Compute**: EKS Deployment (co-deployed with `office-conversion-aspose-container`)

## Purpose
Owns the worker loop, SQS queue interaction, S3 streaming IO, chunking strategy, and the qpdf streaming merge step. Calls into the Aspose container via `localhost` REST per chunk and assembles the per-document output via qpdf.

## Responsibilities
- Long-poll the `convert/office` SQS queue
- Stream the source Office document from S3 to local scratch (chunk-aware)
- Compute the chunking strategy bounded by per-pod RAM budget
- Invoke Aspose container per chunk via `localhost` REST + JSON
- Stream-merge per-chunk PDFs via the `qpdf` binary
- Write the merged PDF to S3 and hand off to `pdf-processing-service` / `output-assembly-service`
- `Notify_<X>` per stage; idempotency-keyed downstream calls

## Inputs (consumed)
- SQS `convert/office` worker queue
- S3 source (`docuploader-api-staging`)
- `office-conversion-aspose-container` via `localhost` REST

## Outputs (produced)
- Merged PDFs in S3
- SQS hand-off messages downstream
- `Notify_<X>` interstitial events

## Dependencies
- `office-conversion-aspose-container` (co-deployed); `platform-orchestration`, `platform-data`, `platform-iam-and-security`; qpdf binary (in-image)

## Test gate
Three-tier — Local: `hypothesis` property tests on RAM bound + qpdf merge correctness; LocalStack: SQS + S3; Sandbox: full chunking + merge against reference corpus.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/office-conversion-orchestrator-sidecar/`
- Source: `units/office-conversion-orchestrator-sidecar/`
