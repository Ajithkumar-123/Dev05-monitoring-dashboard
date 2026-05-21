# batch-resolver — Code Summary

| File | Purpose |
| --- | --- |
| `go.mod` | Module manifest with `libs/data-access/go` replace directive |
| `proto/batchv1/batch.proto` | gRPC contract: `CreateBatch`, `CloseBatch`, `GetBatch` |
| `proto/batchv1/batch.pb.go` + `batch_grpc.pb.go` | **Generated stubs** via `protoc --go_out=. --go_opt=paths=source_relative --go-grpc_out=. --go-grpc_opt=paths=source_relative proto/batchv1/batch.proto` |
| `cmd/server/main.go` | Entrypoint: slog JSON logger, IRSA AWS config, DDB client, gRPC server, graceful shutdown |
| `internal/handler/handler.go` | Embeds `pb.UnimplementedBatchServiceServer`; implements `CreateBatch / CloseBatch / GetBatch` with proto request/response signatures; `tenantIDKey` + `WithTenantID` + `tenantIDFromContext` for auth-context pattern (tenancy never trusted from request body); `batchToPB` translator. OPEN→CLOSED state-machine transition guard returns `codes.FailedPrecondition` |
| `internal/handler/handler_test.go` | 6 unit tests covering Unauthenticated/InvalidArgument paths + status round-trip — all PASSED |
| `helm/Chart.yaml` + `values.yaml` + `templates/manifests.yaml` | App chart depending on `docuploader-chassis`; renders SA + Deployment + gRPC :50052 Service |

**Wiring**: IAM role `docuploader-batch-resolver`, ECR `docuploader/batch-resolver`, DynamoDB `docuploader-api-batches` via `libs/data-access/go/batches`.

**Pattern**: Mirrors `workspace-resolver` minus the KMS-alias provisioning step. State transitions are the only differentiating logic; all CRUD goes through the data-access library. `Register(srv, h)` now calls `pb.RegisterBatchServiceServer(srv, h)` instead of the construction-stage no-op placeholder.
