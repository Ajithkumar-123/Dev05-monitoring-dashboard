# workspace-resolver — Code Summary

## Artefacts

| File | Purpose |
| --- | --- |
| `go.mod` | Module manifest; replace directive points data-access at `libs/data-access/go` |
| `proto/workspace.proto` | gRPC contract (`WorkspaceService` with Create/Update/Get) and entity messages |
| `cmd/server/main.go` | Process entrypoint: slog JSON logger, IRSA-loaded AWS config, DDB + KMS clients, gRPC server, graceful shutdown |
| `internal/handler/handler.go` | Business logic: `CreateWorkspace` provisions per-tenant KMS alias against `alias/docuploader-tenant-master` then persists via `libs/data-access/go/workspaces` |
| `helm/Chart.yaml` | Application chart depending on `docuploader-chassis` library |
| `helm/values.yaml` | Workload config: 2 replicas, Guaranteed-QoS (250m CPU / 256Mi mem), gRPC probes on :50051 |
| `helm/templates/manifests.yaml` | Renders ServiceAccount + Deployment via chassis includes + Service exposing gRPC :50051 |

## Wiring

- IAM role: `docuploader-workspace-resolver` (from `platform-iam-and-security`)
- Image: `docuploader/workspace-resolver` ECR repo (from `platform-network-and-compute`)
- DynamoDB: `docuploader-api-workspaces` via `libs/data-access/go/workspaces`
- KMS: per-tenant aliases created against the tenant CMK provisioned by `platform-data`

## Test gate (deferred to a subsequent test-authoring pass)

Per the unit's inception metadata: Local (Go unit + property tests on tenant-isolation invariants), LocalStack (DDB + KMS), Sandbox (real KMS alias creation + per-tenant isolation evidence).

## Closed in test-authoring + proto-stubs pass (2026-05-11)

- ✅ Generated proto stubs: `proto/workspacev1/workspace.pb.go` + `workspace_grpc.pb.go` (via `protoc --go_out --go-grpc_out`; `.proto` moved into `proto/workspacev1/` to align with `option go_package`)
- ✅ Full mutation set: `CreateWorkspace`, `UpdateWorkspace`, `GetWorkspace` all implement `pb.WorkspaceServiceServer` (forward-compat via embedded `UnimplementedWorkspaceServiceServer`)
- ✅ gRPC server registration: `handler.Register(srv, h)` now calls `pb.RegisterWorkspaceServiceServer(srv, h)` (was a no-op placeholder)
- ✅ 7 unit tests at `internal/handler/handler_test.go` covering Unauthenticated/InvalidArgument/NotFound/translation/default-values invariants — all PASSED

## Still out of scope

- LocalStack-backed integration tests (needs LocalStack + real DDB + KMS) — handler test gate Tier-2
- Sandbox-deployed integration tests (real KMS alias creation + per-tenant isolation evidence) — handler test gate Tier-3
- Same pattern for `batch-resolver` and `document-resolver` (toolchain installed, refactor pattern proven)
