# html-conversion-typescript-sidecar

**Tier**: Pipeline (sidecar-pattern Pod, container #2 of 2)
**Language**: TypeScript (Node 22 LTS, pnpm)
**Compute**: EKS Deployment (co-deployed with `html-conversion-gotenberg-container`)

## Purpose
Worker loop, SQS interaction, S3 IO, and Gotenberg client for the `convert/html` route. Streams HTML from S3, calls the Gotenberg container, and hands off the resulting PDF to `output-assembly-service`.

## Responsibilities
- Long-poll the `convert/html` SQS queue
- Stream the source HTML from S3
- Invoke Gotenberg via `localhost` HTTP
- Write the resulting PDF to S3 and hand off to `output-assembly-service`
- `Notify_<X>` per stage

## Inputs (consumed)
- SQS `convert/html` worker queue
- S3 source object
- `html-conversion-gotenberg-container` via `localhost` HTTP

## Outputs (produced)
- PDF in S3
- SQS hand-off downstream
- `Notify_<X>` events

## Dependencies
- `html-conversion-gotenberg-container` (co-deployed); `platform-orchestration`, `platform-data`, `platform-iam-and-security`

## Test gate
Three-tier — Local: `fast-check` property tests on PDF output invariants; LocalStack: SQS + S3 (Gotenberg via `localhost`); Sandbox: real-AWS verification.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/html-conversion-typescript-sidecar/`
- Source: `units/html-conversion-typescript-sidecar/`
