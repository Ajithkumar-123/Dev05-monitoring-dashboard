# document-resolver — Code Summary

| File | Purpose |
| --- | --- |
| `go.mod` | Module manifest; AWS SDK v2 (S3 presigner), data-access library |
| `proto/document.proto` | gRPC contract: `CreateDocument`, `UpdateDocumentStatus`, `GetDocument`, `SubscribeStatusChanged` (server-stream) |
| `cmd/server/main.go` | Entrypoint: slog, IRSA AWS config, DDB + S3 presigner clients |
| `internal/handler/handler.go` | Idempotency on every state-changing call via `idempotency-index` GSI; server-set presigned PUT URL with server-set TTL (15m default) and content-type; status transition guard via `legalTransition`; in-process subscriber fan-out for `SubscribeStatusChanged` (replaced by SQS-side cross-process fan-out at the router layer in production) |
| `helm/Chart.yaml` + `values.yaml` + `templates/manifests.yaml` | 3 replicas; Guaranteed-QoS 500m/512Mi; gRPC :50053 |

**Wiring**: IAM role `docuploader-document-resolver`, ECR `docuploader/document-resolver`, DynamoDB `docuploader-api-documents` + `idempotency-index` via `libs/data-access/go/documents`, S3 staging bucket from `platform-data`.

**Notable invariants encoded**:
- Idempotency key required on every state-changing mutation
- Presigned URL TTL and content-type are **server-set** (NFR-3.2)
- Status transitions are forward-only with `FAILED` as a terminal sink from any non-terminal state (matches `Document.status` lifecycle in `application-design.md`)
- Subscriber fan-out is in-process at the resolver; the WunderGraph router consumes the gRPC stream and re-publishes over `graphql-transport-ws`
