# wundergraph-router — Code Summary

| File | Purpose |
| --- | --- |
| `go.mod` | Module manifest; AWS SDK v2 (sqs), gRPC client deps |
| `cmd/server/main.go` | Process entrypoint; loads `AUDIT_SQS_QUEUE_URL` + `AUDIT_REDACTION_FIELDS` from the `wundergraph-audit-emission` ConfigMap (mounted via env-from-configMap). In production the WunderGraph router binary is exec'd here with its schema and the audit emitter wired in as a custom-module hook; for the inception-stage scaffold a minimal HTTP surface (`/healthz`, `/audit-probe`) exercises the emitter |
| `internal/handler/audit.go` | `AuditEmitter` — one SQS message per state-changing mutation; `redact()` strips the never-log fields (`AUDIT_REDACTION_FIELDS`) before send; defaults: `eventId` = UUID, `occurredAt` = now, `schemaVersion` = 1 |
| `helm/Chart.yaml` + `values.yaml` + `templates/manifests.yaml` | App chart depending on chassis; 3 replicas; Guaranteed-QoS 1 vCPU/1 GiB; HTTP probes on :8080; env-from-configMap for the audit-emission settings; Service exposes :80 → :8080 |

**Wiring**:
- ConfigMap `wundergraph-audit-emission` from `platform-orchestration` provides the SQS URL, redaction field set, and the master switch
- IAM role `docuploader-router` (Secrets Manager:GetSecretValue for the service-account JWT; SQS SendMessage on `docuploader-api-audit-events`; KMS Decrypt for the audit CMK)
- ECR `docuploader/wundergraph-router`
- Backends: 3 resolvers via gRPC service-account JWT
- Ingress: created by `platform-network-and-compute` Kustomize base/ingress; target Service is the one rendered here

**Notable behaviour**:
- `AuditEmitter.redact()` is recursive over nested map payloads so PII / sensitive keys are stripped at any nesting depth
- Schema version is carried on every message (`schemaVersion=1`), matching the SQS message-schema-versioning rule in `tech-environment.md`
- The router process itself is the WunderGraph binary in production; this scaffold replaces that with an HTTP probe so the emitter can be exercised end-to-end against LocalStack/real-AWS during integration testing

**Build**: `GOOS=linux GOARCH=arm64 go build -o wundergraph-router ./cmd/server`. Production image base includes the WunderGraph router binary.
