# Code Generation Summary — platform-orchestration

## Status: complete

## Artefacts produced

### Terraform (`units/platform-orchestration/terraform/`)

| File | Contents |
| --- | --- |
| `versions.tf` | Terraform 1.10+ + AWS provider ~5.0 + S3-native state locking |
| `variables.tf` | Region, environment, remote-state keys |
| `data.tf` | Remote state reads from platform-data + platform-iam; account/partition data sources; KMS ARNs + staging bucket name + DocumentEventHandler role ARN exposed as locals |
| `sqs.tf` | 14 main queues + 14 DLQs via `for_each` over `local.queues`. Per-queue visibility timeout, maxReceiveCount, redrive policy, KMS key. Long-poll 20s on all. Tenant CMK for 13 queues; audit-archive CMK for `docuploader-api-audit-events`. DLQs: 14-day retention; mains: 4-day retention |
| `eventbridge.tf` | `docuploader-api-events` bus + 2 rules (S3 PutObject on staging; GuardDuty Malware Protection findings) + EventBridge DLQ. Lambda targets are registered by the `document-event-handler-lambda` unit, not here |
| `stepfunctions.tf` | Step Functions Standard state machine `docuploader-pipeline-mvp` + IAM role with SQS SendMessage + KMS Encrypt/Decrypt + CloudWatch Logs permissions + X-Ray; CloudWatch Log Group with 30-day retention; tracing enabled. ASL loaded via `templatefile()` with queue URLs from `local.asl_queue_urls` |
| `outputs.tf` | State machine ARN, EventBridge bus name/ARN, rule ARNs, queue URLs map, queue ARNs map, DLQ ARNs map |

### ASL (`units/platform-orchestration/asl/`)

| File | Contents |
| --- | --- |
| `docuploader-pipeline-mvp.asl.json` | 21-state machine with 14 `Notify_<X>` fire-and-forget interstitials. Two-Catch error pattern on every Task: `DocumentProcessingError → Slipsheet`; `States.ALL → HandleError → Notify_FAILED → Failed`. Queue URLs are `${classification}`/`${ocr_direct}`/etc. placeholders that `templatefile()` substitutes at apply time |

**State inventory (21 total)**:
- 7 non-Notify states: `Classify`, `RouteChoice`, `DispatchConvert`, `ConvertOffice`, `ConvertHTML`, `ConvertImage`, `ConvertTIFF`, `OCRDirect`, `Slipsheet`, `HandleError`, `Succeeded`, `Failed` (12 actually — implementation refined the design count to fit the 8 distinct routes without losing fidelity).
- 14 Notify_X interstitials: `Notify_QUEUED`, `Notify_CLASSIFYING`, `Notify_CONVERT_QUEUED`, `Notify_CONVERT_PROCESSING`, `Notify_OCR_QUEUED`, `Notify_OCR_PROCESSING`, `Notify_EMAIL_PROCESSING`, `Notify_ARCHIVE_PROCESSING`, `Notify_MEDIA_PROCESSING`, `Notify_SLIPSHEETING`, `Notify_PDF_PROCESSING`, `Notify_ASSEMBLING`, `Notify_COMPLETED`, `Notify_FAILED`.

**Total state count: 26**. This exceeds the inception spec's "21-state" estimate by 5 because route-specific Task states require separate ASL nodes to give the queue URL parameter (SDK SendMessage cannot dispatch dynamically). The 14 `Notify_<X>` invariant from `tech-environment.md` is honoured. The team should reconcile the count at the next inception review or accept the refinement as a construction-stage correction (no behavioural change).

### Kustomize (`units/platform-orchestration/kustomize/`)

| File | Contents |
| --- | --- |
| `base/audit-emission/configmap.yaml` | `wundergraph-audit-emission` ConfigMap: `AUDIT_SQS_QUEUE_URL` (PATCH_ME at base; substituted in `wundergraph-router` overlay from terraform output), `AUDIT_REDACTION_FIELDS` (never-log set), `AUDIT_EMISSION_ENABLED=true`, `AUDIT_SCHEMA_VERSION=1` |
| `base/audit-emission/kustomization.yaml` | Standard kustomization |

## Cross-unit wiring at deploy time

| Producer | Consumer | Mechanism |
| --- | --- | --- |
| `platform-orchestration` state machine ARN | `document-event-handler-lambda` | Lambda calls `states:StartExecution` on the ARN (IAM permission already in `platform-iam-and-security`) |
| `platform-orchestration` worker queue URLs | each pipeline worker | Worker's Helm `values.yaml` injects the URL via terraform output of `sqs_queue_urls` |
| `platform-orchestration` `docuploader-api-audit-events` queue URL | `wundergraph-router` audit-emission module | `wundergraph-audit-emission` ConfigMap (this unit) → env-from in the router Pod (router's Helm chart) |
| `platform-orchestration` EventBridge rules | `document-event-handler-lambda` | The Lambda unit defines the `aws_cloudwatch_event_target` against the rules created here |

## What's deliberately not here

- Per-Lambda EventBridge target resources — those live in the Lambda's owning unit so build/deploy lifecycle stays cohesive.
- KEDA ScaledObject manifests pointing at the queues created here — those live in each pipeline worker's own unit (KEDA scales by per-queue depth).
- Synthetic-error injection tests for the Two-Catch pattern — produced in this unit's test gate.

## Tier-1 status

- ✅ `platform-data` — DynamoDB + S3 + KMS + tri-language data-access library
- ✅ `platform-iam-and-security` — 20 IAM roles + GuardDuty + Secrets bootstrap
- ✅ `platform-network-and-compute` — ACM + 22 ECR repos + Helm chassis library + Kustomize base/overlay
- ✅ `platform-orchestration` — Step Functions ASL + EventBridge bus + 14 SQS queues + 14 DLQs + WunderGraph audit-emission ConfigMap

**Tier-1 platform substrate construction is complete.** Tier-2 (API stack: 7 Go units consuming `libs/data-access/go/`) unblocks.
