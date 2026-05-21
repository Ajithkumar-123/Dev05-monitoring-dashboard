# media-conversion-service

**Tier**: Pipeline
**Language**: TypeScript (Node 22 LTS, pnpm)
**Compute**: EKS Deployment

## Purpose
Route `media`. Audio/video conversion via FFmpeg/FFprobe.

## Responsibilities
- Long-poll the `media` SQS worker queue
- Probe input via FFprobe; convert via FFmpeg with bounded resource budgets
- Produce a per-document media output set
- Hand off to `output-assembly-service`
- `Notify_<X>` per stage

## Inputs (consumed)
- SQS `media` worker queue
- S3 source media

## Outputs (produced)
- Converted media artefacts in S3
- SQS hand-off downstream
- `Notify_<X>` events

## Dependencies
- `platform-orchestration`, `platform-data`, `platform-iam-and-security`; FFmpeg / FFprobe (in-image)

## Test gate
Three-tier — Local: property tests on probe-then-convert determinism + bounded RAM; LocalStack: SQS + S3; Sandbox: real-AWS verification.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/media-conversion-service/`
- Source: `units/media-conversion-service/`
