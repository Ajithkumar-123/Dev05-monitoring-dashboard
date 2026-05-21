# Code Generation Plan — platform-data

## Scope

Generate all source artefacts for the `platform-data` unit:

1. **Terraform infrastructure** at `units/platform-data/terraform/`: 7 DynamoDB tables (with GSIs + TTLs), 4 S3 buckets (BPA + SSE-KMS + Lifecycle), KMS keys + audit-archive separate CMK, S3 Lifecycle rules.
2. **Tri-language data-access library** at `libs/data-access/{go,python,typescript}/`: typed entities + table-name constants + GSI helpers + idempotency-key derivation utilities + thin AWS SDK client wrappers for the 7 DynamoDB tables, in each language idiom.

## Out of scope (this stage)

- KMS per-tenant **alias** creation logic — that lives in `workspace-resolver` per A27 override; this unit only provisions the underlying KMS key infrastructure.
- Business logic on top of the data-access primitives — consumer units (resolvers, Lambdas, pipeline workers) own that.

## File list

### Terraform (`units/platform-data/terraform/`)
- [x] `versions.tf`
- [x] `variables.tf`
- [x] `kms.tf` — customer-managed key + audit-archive separate CMK
- [x] `dynamodb.tf` — 7 tables with GSIs + TTLs
- [x] `s3.tf` — 4 buckets with BPA + SSE-KMS + Lifecycle
- [x] `outputs.tf`

### Go (`libs/data-access/go/`)
- [x] `go.mod`
- [x] `internal/dynamoclient/client.go` — shared session helper
- [x] `internal/idempotency/key.go` — idempotency-key derivation
- [x] `workspaces/workspace.go`
- [x] `batches/batch.go`
- [x] `documents/document.go`
- [x] `auditevents/event.go`
- [x] `contenthashes/hash.go`
- [x] `pipelinefiles/file.go`
- [x] `tasktokens/token.go`

### Python (`libs/data-access/py/`)
- [x] `pyproject.toml`
- [x] `.python-version`
- [x] `data_access/__init__.py`
- [x] `data_access/_dynamo.py` — shared boto3 helper
- [x] `data_access/_idempotency.py`
- [x] `data_access/workspaces/__init__.py`
- [x] `data_access/batches/__init__.py`
- [x] `data_access/documents/__init__.py`
- [x] `data_access/auditevents/__init__.py`
- [x] `data_access/contenthashes/__init__.py`
- [x] `data_access/pipelinefiles/__init__.py`
- [x] `data_access/tasktokens/__init__.py`

### TypeScript (`libs/data-access/ts/`)
- [x] `package.json`
- [x] `tsconfig.json`
- [x] `src/index.ts`
- [x] `src/_dynamo.ts` — shared SDK v3 client
- [x] `src/_idempotency.ts`
- [x] `src/workspaces/index.ts`
- [x] `src/batches/index.ts`
- [x] `src/documents/index.ts`
- [x] `src/auditevents/index.ts`
- [x] `src/contenthashes/index.ts`
- [x] `src/pipelinefiles/index.ts`
- [x] `src/tasktokens/index.ts`

## Conventions

- **Naming**: All resource identifiers use `docuploader` token only (binding rule).
- **No secrets in code**: zero credentials, env vars, or tokens checked in.
- **Lockfiles**: omitted in this stage (CI generates them on first install; committing pre-CI lockfiles would be stale-on-arrival).
- **Tests**: stub property-test scaffolding included; full test suites are per-consumer responsibility in their respective unit construction.
- **Single AWS SDK major per language**: Go SDK v2, boto3 (latest), AWS SDK for JavaScript v3.
- **Structured logging**: data-access library does not log directly — it returns errors; callers log with their unit's structured-logging convention.
