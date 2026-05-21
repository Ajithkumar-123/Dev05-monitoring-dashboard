# Infrastructure Design — platform-orchestration

## Scope

This unit owns the pipeline orchestration backbone:

1. **Step Functions Standard state machine** (21-state ASL with 14 `Notify_<X>` interstitials and the Two-Catch error pattern)
2. **EventBridge bus** `docuploader-api-events` and its rules (S3 PutObject + GuardDuty findings)
3. **SQS queues**: 14 total — 12 worker queues + `state-change-notification-queue` + `docuploader-api-audit-events`, each with a DLQ
4. **WunderGraph router-side audit-emission ConfigMap and SQS sender configuration** (Kustomize, consumed by the wundergraph-router unit's Helm chart)

## SQS inventory (14 main queues + 14 DLQs)

| Queue | Consumer | `maxReceiveCount` | Visibility timeout |
| --- | --- | --- | --- |
| `docuploader-classification-queue` | classification-service | 5 | 60s |
| `docuploader-ocr-direct-queue` | ocr-service | 5 | 600s (Textract async) |
| `docuploader-archive-queue` | zip-extraction-service | 5 | 300s |
| `docuploader-output-assembly-queue` | output-assembly-service | 5 | 300s |
| `docuploader-slipsheet-queue` | slipsheet-service | 5 | 60s |
| `docuploader-pdf-processing-queue` | pdf-processing-service | 5 | 600s |
| `docuploader-convert-office-queue` | office-conversion-orchestrator-sidecar | 3 | 900s (long-running chunks) |
| `docuploader-convert-html-queue` | html-conversion-typescript-sidecar | 5 | 300s |
| `docuploader-tiff-cog-queue` | tiff-cog-service | 5 | 300s |
| `docuploader-convert-image-queue` | image-tiff-conversion-service | 5 | 300s |
| `docuploader-email-queue` | email-extraction-service | 5 | 300s |
| `docuploader-media-queue` | media-conversion-service | 5 | 900s (long media) |
| `docuploader-state-change-notification-queue` | update-document-state-lambda | 10 | 60s |
| `docuploader-api-audit-events` | audit-event-storage-lambda | 5 | 60s |

Each queue has a DLQ with `<name>-dlq`, 14-day retention per `tech-environment.md`. Long-poll 20s on all main queues. Server-side encryption with the tenant CMK (audit-events queue uses the audit-archive CMK).

## EventBridge

Bus: `docuploader-api-events`.

Rules:
- **S3 PutObject on `docuploader-api-staging`** → target: `document-event-handler-lambda` (with DLQ on rule target)
- **GuardDuty Malware Protection finding** (any severity) → target: `document-event-handler-lambda` (with DLQ on rule target)

Both rules carry transformation that strips presigned URLs / sensitive metadata before invoking the Lambda target.

## Step Functions state machine (21-state ASL with 14 `Notify_<X>` interstitials)

State machine: `docuploader-pipeline-mvp` (Standard execution; 1-year ceiling).

### State inventory

1. `Initialize` — Pass; seeds execution context (documentId, tenantId, workspaceId, batchId)
2. `Notify_QUEUED` — Notify interstitial
3. `Classify` — Task: SQS SendMessage to `docuploader-classification-queue` (waitForTaskToken not used; classification updates state via Notify_ chain)
4. `Notify_CLASSIFYING` — Notify interstitial
5. `RouteChoice` — Choice based on detected route
6. `ConvertOffice` — Task (SendMessage to office queue)
7. `ConvertHTML` — Task (SendMessage to html queue)
8. `ConvertImage` — Task (SendMessage to image queue)
9. `ConvertTIFF` — Task (TIFF: tiff-cog then image worker)
10. `OCRDirect` — Task (SendMessage to ocr-direct queue)
11. `EmailExtraction` — Task (SendMessage to email queue)
12. `ZipExtraction` — Task (SendMessage to archive queue)
13. `MediaConversion` — Task (SendMessage to media queue)
14. `Notify_PROCESSING` — Notify interstitial (per-stage)
15. `PDFProcessing` — Task (SendMessage to pdf-processing queue)
16. `Notify_ASSEMBLING` — Notify interstitial
17. `OutputAssembly` — Task (SendMessage to output-assembly queue)
18. `Notify_COMPLETED` — Notify interstitial
19. `Succeeded` — terminal Succeed
20. `HandleError` — Pass (logs error context for synthetic-injection traceability)
21. `Failed` — terminal Fail

### 14 `Notify_<X>` fire-and-forget interstitials

Each `Notify_<X>` is a Pass-like state that includes a fire-and-forget SQS SendMessage to `docuploader-state-change-notification-queue` via the optimized SDK service integration `arn:aws:states:::aws-sdk:sqs:sendMessage`. The Notify chain covers every pipeline phase transition: `QUEUED`, `CLASSIFYING`, `OCR_QUEUED`, `OCR_PROCESSING`, `CONVERT_QUEUED`, `CONVERT_PROCESSING`, `EMAIL_PROCESSING`, `ARCHIVE_PROCESSING`, `MEDIA_PROCESSING`, `SLIPSHEETED`, `PROCESSING`, `ASSEMBLING`, `COMPLETED`, `FAILED`.

### Two-Catch error pattern (binding)

Every Task state carries:

```json
"Catch": [
  { "ErrorEquals": ["DocumentProcessingError"], "Next": "Slipsheet" },
  { "ErrorEquals": ["States.ALL"],              "Next": "HandleError" }
]
```

- `DocumentProcessingError` → `Slipsheet` (a per-route fallback Task that hands the document off to `docuploader-slipsheet-queue`) → reaches `Succeeded` via `OutputAssembly`
- `States.ALL` → `HandleError` → `Notify_FAILED` → `Failed`

Both branches must be evidenced via synthetic-error injection at MVP success-criteria time.

## WunderGraph audit-emission ConfigMap

Kustomize-managed ConfigMap that the `wundergraph-router` Helm chart mounts. Carries:
- `AUDIT_SQS_QUEUE_URL` — URL of `docuploader-api-audit-events`
- `AUDIT_REDACTION_FIELDS` — comma-separated never-log set (presigned URLs, OIDC tokens, data keys, customer document content, AWS access keys, Secrets Manager values, PII metadata)
- `AUDIT_EMISSION_ENABLED` — `true` at MVP

The router-side custom module (Go) reads these via env-from-configmap, dispatches one SQS message per state-changing mutation, and runs the redaction pipeline before sending.
