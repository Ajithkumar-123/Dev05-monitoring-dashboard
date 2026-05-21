# audit-event-storage-lambda — Code Summary

| File | Purpose |
| --- | --- |
| `go.mod` | Module manifest; AWS SDK v2 (s3), data-access library, aws-lambda-go |
| `cmd/bootstrap/main.go` | Lambda entrypoint; init() loads AWS config + audit-events DDB client + S3 client; `ARCHIVE_BUCKET` env (default `docuploader-api-audit-archive`) |
| `internal/handler/handler.go` | Drains the SQS event with `ReportBatchItemFailures` semantics; per-message: writes to DynamoDB hot store (90-day TTL set by library), then S3 Glacier IR cold store under deterministic key `audit/{tenantId}/{yyyy}/{MM}/{dd}/{eventId}.json`. Failures on either sink are reported as item-level failures and redriven by SQS |

**Wiring**: IAM role `docuploader-audit-event-storage-lambda` (SQS receive on audit queue, DDB put on audit-events, S3 put on audit-archive bucket, KMS encrypt with audit-archive CMK); SQS event source mapping with batch size and partial-batch failure enabled (set in this unit's Terraform when added).

**Notable invariants**:
- Hot-store write is **idempotent on `eventId`** so SQS retries don't double-count
- Deterministic key shape matches `application-design.md` § Audit
- Object Lock Compliance retention is bucket-level (7-year default) — per-object overrides intentionally not used; consumed-by `platform-data` already provisions the bucket policy
- Redaction is enforced upstream at the WunderGraph router-side audit-emission module (`AUDIT_REDACTION_FIELDS` ConfigMap from `platform-orchestration`)

**Build**: `GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -o bootstrap ./cmd/bootstrap`
