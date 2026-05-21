# Code Generation Summary — platform-data

## Status: complete

All artefacts listed in `code-generation-plan.md` have been produced.

## Artefacts produced

### Terraform infrastructure (`units/platform-data/terraform/`)

| File | Purpose |
| --- | --- |
| `versions.tf` | Terraform 1.10+, AWS provider ~5.0, S3-native state locking, eu-west-1 |
| `variables.tf` | Region, environment, default 7-day input retention, 7-year audit retention, 180-day KMS rotation |
| `kms.tf` | Tenant customer-managed key + separate audit-archive operator-managed CMK (both rotation-enabled) |
| `dynamodb.tf` | 7 DynamoDB tables: workspaces, batches, documents (+idempotency-index), audit_events (90-day TTL), content_hashes (90-day TTL), pipeline_files (+folderPath-index, 7-day TTL), task_tokens (1-day TTL). PAY_PER_REQUEST. PITR enabled. SSE-KMS with the appropriate key per table |
| `s3.tf` | 4 buckets: staging, pipeline, pipeline_config, audit_archive. BPA on all, `aws:SecureTransport=false` deny on all, SSE-KMS bucket-key enabled. Staging Lifecycle (7-day expiry default). Audit-archive: Object Lock Compliance (7-year), GLACIER_IR transition at day 0 |
| `outputs.tf` | KMS key ARNs, DynamoDB table ARNs, S3 bucket names |

### Go data-access library (`libs/data-access/go/`)

| File | Purpose |
| --- | --- |
| `go.mod` | Module path, Go 1.23, AWS SDK v2 dependencies |
| `internal/dynamoclient/client.go` | Thin construction helper for `*dynamodb.Client` from `aws.Config` |
| `internal/idempotency/key.go` | `DeriveUpdateStatusKey(executionId, toState, phase) -> hex SHA-256` |
| `workspaces/workspace.go` | `Workspace` entity, `Client.Get/Put`, `RetentionPolicy`, `EncryptionConfig`, `PipelineConfig`, status constants |
| `batches/batch.go` | `Batch` entity, `Client.Get/Put`, OPEN/CLOSED constants |
| `documents/document.go` | `Document` entity, `Client.Get/Put/FindByIdempotencyKey`, `Output`, `ProcessingError`, full status set, `IdempotencyIndexName` constant |
| `auditevents/event.go` | `AuditEvent` entity, `Client.Get/Put`, `TTLForEvent` (90-day TTL) |
| `contenthashes/hash.go` | `ContentHash` entity, `Client.Get/Put`, `TTLForHash` (90-day TTL) |
| `pipelinefiles/file.go` | `PipelineFile` entity, `Client.Get/Put/ListByFolder`, `TTLForFile` (7-day TTL), `FolderPathIndexName` constant |
| `tasktokens/token.go` | `TaskToken` entity, `Client.Get/Put/Delete`, `TTLForToken` (1-day TTL) |

### Python data-access library (`libs/data-access/py/`)

| File | Purpose |
| --- | --- |
| `pyproject.toml` | uv-managed package; boto3 dep; dev group: pytest + hypothesis + allure-pytest |
| `.python-version` | 3.13 |
| `data_access/__init__.py` | Re-exports `dynamo_resource`, `derive_update_status_key` |
| `data_access/_dynamo.py` | Shared boto3 DynamoDB resource helper (IRSA only) |
| `data_access/_idempotency.py` | `derive_update_status_key(execution_id, to_state, phase) -> hex SHA-256` |
| `data_access/workspaces/__init__.py` | `Workspace` dataclass + `Client.get/put` + `_to_item/_from_item` |
| `data_access/batches/__init__.py` | `Batch` dataclass + `Client.get/put` |
| `data_access/documents/__init__.py` | `Document` dataclass + `Client.get/put/find_by_idempotency_key`; `Output`; `ProcessingError` |
| `data_access/auditevents/__init__.py` | `AuditEvent` dataclass + `Client.get/put` + `ttl_for_event` |
| `data_access/contenthashes/__init__.py` | `ContentHash` dataclass + `Client.get/put` + `ttl_for_hash` |
| `data_access/pipelinefiles/__init__.py` | `PipelineFile` dataclass + `Client.get/put/list_by_folder` + `ttl_for_file` |
| `data_access/tasktokens/__init__.py` | `TaskToken` dataclass + `Client.get/put/delete` + `ttl_for_token` |

### TypeScript data-access library (`libs/data-access/ts/`)

| File | Purpose |
| --- | --- |
| `package.json` | `@docuploader/data-access`, AWS SDK v3 dependencies, vitest + fast-check + allure-vitest dev deps, per-table sub-path exports |
| `tsconfig.json` | ES2022, strict mode, declaration output to `dist/` |
| `src/index.ts` | Re-exports `newDynamoDocumentClient`, `deriveUpdateStatusKey`, and per-table namespaces |
| `src/_dynamo.ts` | `newDynamoDocumentClient(region)` — IRSA-only credential resolution |
| `src/_idempotency.ts` | `deriveUpdateStatusKey(executionId, toState, phase) -> hex SHA-256` |
| `src/workspaces/index.ts` | `Workspace`, `Client.get/put`, status union |
| `src/batches/index.ts` | `Batch`, `Client.get/put`, status union |
| `src/documents/index.ts` | `Document`, `Client.get/put/findByIdempotencyKey`, `Output`, `ProcessingError` |
| `src/auditevents/index.ts` | `AuditEvent`, `Client.get/put`, `ttlForEvent` |
| `src/contenthashes/index.ts` | `ContentHash`, `Client.get/put`, `ttlForHash` |
| `src/pipelinefiles/index.ts` | `PipelineFile`, `Client.get/put/listByFolder`, `ttlForFile` |
| `src/tasktokens/index.ts` | `TaskToken`, `Client.get/put/delete`, `ttlForToken` |

## Consistency invariants across languages

- **Same conceptual surface**: one entity type + one `Client` per table. Each `Client` exposes the minimum operations the consumer units in `application-design.md` require.
- **Idempotency-key derivation** is bit-identical across Go / Python / TypeScript: SHA-256 over `executionId\x1ftoState\x1fphase` (ASCII Unit Separator), hex-encoded.
- **TTL derivation** matches the table's TTL window (90d / 7d / 1d) per `dynamodb.tf`.
- **No logging** from the library itself — callers log with their unit's structured-logging convention (slog / structlog / pino).
- **No secrets in code**: IRSA only; no env-var credential reads anywhere.

## Lockfiles

Not generated in this stage. CI generates them on first `go mod download` / `uv sync` / `pnpm install`. Committing pre-CI lockfiles would be stale-on-arrival.

## What's deliberately not here

- Per-table integration tests (Local / LocalStack / Sandbox). These belong in this unit's test gate but are produced in a subsequent test-authoring pass.
- Per-tenant KMS *alias* creation. That logic lives in `workspace-resolver` per A27 — `platform-data` provisions only the underlying customer-managed key.
- Workspace-resolver business logic — exists outside this unit.

## Construction next

Tier-1 platform substrate remaining: `platform-network-and-compute`, `platform-iam-and-security`, `platform-orchestration`. After all four Tier-1 units complete code generation, Tier-2 (API stack) construction begins.
