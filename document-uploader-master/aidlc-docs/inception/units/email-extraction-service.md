# email-extraction-service

**Tier**: Pipeline
**Language**: Go (1.23+)
**Compute**: EKS Deployment

## Purpose
Route `email`. Extracts EML (Go stdlib `net/mail` + `mime/multipart`) and MSG (`mscfb` + `crtf`) into body + attachment fan-out. Each attachment becomes a child `Document` re-entering classification.

## Responsibilities
- Long-poll the `email` SQS worker queue
- Parse EML or MSG; extract body, headers, attachments
- For each attachment: create a child `Document` row; upload to staging; trigger classification re-entry
- Body becomes a per-document text output

## Inputs (consumed)
- SQS `email` worker queue
- S3 source object (streaming)

## Outputs (produced)
- Per-attachment S3 PUTs + child `Document` rows
- gRPC `createDocument` into `document-resolver`
- `Notify_<X>` per fan-out

## Dependencies
- `document-resolver`, `platform-orchestration`, `platform-data`, `platform-iam-and-security`

## Test gate
Three-tier — Local: Go property tests on EML/MSG parsing invariants + bounded RAM regardless of attachment count/size; LocalStack: SQS + S3; Sandbox: real fan-out + re-entry.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/email-extraction-service/`
- Source: `units/email-extraction-service/`
