# AI-DLC State Tracking

## Project Information
- **Project Type**: Greenfield
- **Project Name**: Unified Document Uploader (`docuploader`)
- **Start Date**: 2026-05-08T00:00:00Z
- **Current Stage**: CONSTRUCTION - Build and Test (instructions complete)
- **Next Stage**: OPERATIONS - placeholder (post-MVP)

## Workspace State
- **Existing Code**: Yes — 27 units scaffolded; tri-language data-access library at libs/data-access/
- **Programming Languages**: Go 1.23+, Python 3.13+, TypeScript / Node 22 LTS, C++20
- **Build System**: Per-language — Go modules; uv; pnpm; CMake + Conan; Terraform 1.10+ for AWS resources; Helm + Kustomize for K8s
- **Project Structure**: aidlc-docs/ populated end-to-end (inception + construction); units/ scaffolded for all 27 units with source + Helm/Terraform; libs/data-access/{go,python,typescript}/ populated
- **Reverse Engineering Needed**: No
- **Workspace Root**: /Users/akeir/Projects/document-uploader

## Code Location Rules
- **Application Code**: Workspace root `units/<unit-id>/` (NEVER in aidlc-docs/)
- **Documentation**: aidlc-docs/ only
- **Structure patterns**: See code-generation.md Critical Rules; per-language scaffolding per tech-environment.md

## Inputs Detected
- aidlc-inputs/vision.md (project vision/context)
- aidlc-inputs/tech-environment.md (target tech environment)

## Extension Configuration
| Extension | Enabled | Source |
| --- | --- | --- |
| security-baseline | Yes — enforce all rules | tech-environment.md + Q41 ratification |
| property-based-testing | Yes — enforce for all units | tech-environment.md + Q42 ratification |

## Decomposition
- **Units**: 27 (4 platform + 7 API + 15 pipeline + 1 web) — binding per tech-environment.md
- **Manifest**: aidlc-docs/inception/units/units.md
- **Per-unit metadata files**: aidlc-docs/inception/units/<unit-id>.md (27 files)

## Stage Progress
- [x] INCEPTION - Workspace Detection
- [x] INCEPTION - Requirements Analysis
- [x] INCEPTION - User Stories
- [x] INCEPTION - Workflow Planning
- [x] INCEPTION - Application Design
- [x] INCEPTION - Units Generation
- [x] CONSTRUCTION - Tier-1 Platform Substrate (4/4: platform-data, platform-iam-and-security, platform-network-and-compute, platform-orchestration)
- [x] CONSTRUCTION - Tier-2 API Stack (7/7: wundergraph-router, workspace-resolver, batch-resolver, document-resolver, pre-token-generation-lambda, document-event-handler-lambda, audit-event-storage-lambda)
- [x] CONSTRUCTION - Tier-3 Pipeline Workers (15/15: classification, ocr, zip-extraction, output-assembly, slipsheet, pdf-processing, office-aspose-container, office-orchestrator-sidecar, html-gotenberg-container, html-typescript-sidecar, tiff-cog, image-tiff-conversion, email-extraction, media-conversion, update-document-state-lambda)
- [x] CONSTRUCTION - Tier-4 Web (react-web-module)
- [x] CONSTRUCTION - Build and Test (instructions: build-instructions.md, unit-test-instructions.md, integration-test-instructions.md, performance-test-instructions.md, build-and-test-summary.md)
- [ ] OPERATIONS - placeholder (post-MVP follow-on)

## Inception Artefacts Produced
| Stage | Artefact |
| --- | --- |
| Requirements Analysis | aidlc-docs/inception/requirements/requirement-verification-questions.md (42 questions, all answered) |
| Requirements Analysis | aidlc-docs/inception/requirements/requirements.md |
| User Stories | aidlc-docs/inception/user-stories/personas.md (7 personas) |
| User Stories | aidlc-docs/inception/user-stories/user-stories.md (14 stories / 7 epics) |
| Workflow Planning | aidlc-docs/inception/plans/workflow-planning.md |
| Application Design | aidlc-docs/inception/application-design/application-design.md |
| Units Generation | aidlc-docs/inception/units/units.md + 27 per-unit metadata files |

## Construction Artefacts Produced

### Tier-1 platform substrate (4/4)
| Unit | Source location | Construction docs |
| --- | --- | --- |
| platform-data | units/platform-data/terraform/ (6 .tf); libs/data-access/{go,python,typescript}/ (tri-language library) | aidlc-docs/construction/platform-data/ |
| platform-iam-and-security | units/platform-iam-and-security/terraform/ (8 .tf; ~20 IAM roles + GuardDuty + Secrets) | aidlc-docs/construction/platform-iam-and-security/ |
| platform-network-and-compute | units/platform-network-and-compute/{terraform/ (6 .tf, 22 ECR + ACM), helm/docuploader-chassis/ (library chart), kustomize/} | aidlc-docs/construction/platform-network-and-compute/ |
| platform-orchestration | units/platform-orchestration/{terraform/ (7 .tf, 14 SQS + EventBridge + Step Functions), asl/docuploader-pipeline-mvp.asl.json (14 Notify_X), kustomize/audit-emission/} | aidlc-docs/construction/platform-orchestration/ |

### Tier-2 API stack (7/7 — all Go)
units/{wundergraph-router, workspace-resolver, batch-resolver, document-resolver, pre-token-generation-lambda, document-event-handler-lambda, audit-event-storage-lambda}/ — each with cmd/, internal/handler/, go.mod, (.proto for resolvers), helm/. Code summaries: aidlc-docs/construction/<unit>/code/code-summary.md

### Tier-3 pipeline workers (15/15)
units/{classification-service, ocr-service, zip-extraction-service, output-assembly-service, slipsheet-service, pdf-processing-service, office-conversion-aspose-container, office-conversion-orchestrator-sidecar, html-conversion-gotenberg-container, html-conversion-typescript-sidecar, tiff-cog-service, image-tiff-conversion-service, email-extraction-service, media-conversion-service, update-document-state-lambda}/ — TypeScript/Python/C++/Go per `units.md`. Code summaries: aidlc-docs/construction/<unit>/code/code-summary.md

### Tier-4 web (1/1)
units/react-web-module/ — embeddable TS/React module with urql + graphql-transport-ws. Code summary: aidlc-docs/construction/react-web-module/code/code-summary.md

### Build and Test (instructions)
aidlc-docs/construction/build-and-test/ — build-instructions.md, unit-test-instructions.md, integration-test-instructions.md, performance-test-instructions.md, build-and-test-summary.md

## Test Artefacts Produced (binding property invariants)

| Property | File(s) | Status |
| --- | --- | --- |
| Idempotency-key SHA-256 cross-language parity | libs/data-access/go/idempotency/key_test.go + libs/data-access/py/tests/test_idempotency.py + libs/data-access/ts/tests/idempotency.test.ts | ✅ authored |
| Workspace entity round-trip | libs/data-access/go/workspaces/workspace_test.go | ✅ authored |
| Document state-machine forward-only + terminal semantics | units/document-resolver/internal/handler/handler_test.go | ✅ authored |
| Classification routing + forced-slipsheet short-circuit | units/classification-service/tests/handler.test.ts | ✅ authored (fast-check property) |
| Pre-token validator rejects on missing/empty claims | units/pre-token-generation-lambda/internal/handler/handler_test.go | ✅ authored |
| Audit-emission recursive redaction | units/wundergraph-router/internal/handler/audit_test.go | ✅ authored |
| Aspose render input validation (C++) | units/office-conversion-aspose-container/tests/render_test.cpp | ✅ authored |
| Per-table entity round-trip + TTL invariants (Go) — 6 tables | libs/data-access/go/{batches,documents,auditevents,contenthashes,pipelinefiles,tasktokens}/*_test.go | ✅ authored |
| Per-table entity round-trip + TTL invariants (Python) — 7 tables | libs/data-access/py/tests/test_{workspaces,batches,documents,auditevents,contenthashes,pipelinefiles,tasktokens}.py | ✅ authored |
| Per-table entity round-trip + TTL invariants (TypeScript) — 7 tables | libs/data-access/ts/tests/{workspaces,batches,documents,auditevents,contenthashes,pipelinefiles,tasktokens}.test.ts | ✅ authored |
| **Bounded-RAM property test** (zip-extraction) | units/zip-extraction-service/tests/{bounded-ram.test.ts, helpers/zip-builder.ts, helpers/rss-sampler.ts} | ✅ **executable + 3/3 PASSED** (10 MB / 50 MB / 200 MB archives; growth 19.7 / 14.0 / 0.0 MB — does not scale with archive size). Runs via `NODE_OPTIONS=--expose-gc pnpm test`. Same pattern applies to image / pdf / office / media — each needs its own per-route fixture builder |
| **Bounded-RAM property test** (email-extraction Go side) | units/email-extraction-service/internal/handler/bounded_ram_test.go | ✅ **executable + 3/3 PASSED** (10 / 50 / 200 attachments × 1 MB each; growth 0 / 0 / 0 MB — Go stdlib `mail` + `multipart` are truly streaming). Pure stdlib, no third-party deps |
| **Bounded-RAM property tests** (image, pdf, office, media) | — | ⏸ deferred (need per-route fixture builders; RSS sampler + harness pattern now proven on both TS and Go sides and reusable) |
| **LocalStack-backed integration** (Tier-2 gate) | — | ⏸ deferred (per workload; needs LocalStack runner) |
| **Sandbox-deployed integration + 4 journey suites** (Tier-3 gate, J1–J4) | — | ⏸ deferred (real AWS) |

**Test file count: 30** across 4 languages (1 C++ + 9 Go + 8 Python + 12 TypeScript).

## Test Execution — libs/data-access (verified 2026-05-11)

| Language | Suite | Tests | Result |
| --- | --- | --- | --- |
| Go | `go test ./...` | 22 | ✅ all PASSED |
| Python | `pytest` | 28 | ✅ all PASSED |
| TypeScript | `vitest run` | 26 | ✅ all PASSED |
| **Total** | | **76** | **✅ green** |

C++ tests not executed (Conan-in-Docker harness added — see `units/office-conversion-aspose-container/Dockerfile.test`; local Docker daemon permission-restricted in this environment but harness builds end-to-end on any machine with Docker group membership).

## Test Execution — Per-Unit Go Handler Tests (verified 2026-05-11)

After running, the consumer-unit handler tests now run cleanly. A real visibility bug was caught during this pass — `libs/data-access/go/internal/dynamoclient/` was unimportable from consumer modules because of Go's `internal/` rule. Fixed by moving the package out of `internal/` (now `libs/data-access/go/dynamoclient/`); all 6 consumer `main.go` files patched.

| Unit | Suite | Tests | Result |
| --- | --- | --- | --- |
| `document-resolver` | `go test ./...` | 4 | ✅ all PASSED |
| `pre-token-generation-lambda` | `go test ./...` | 3 (+7 subtests) | ✅ all PASSED |
| `wundergraph-router` | `go test ./...` | 3 | ✅ all PASSED |
| **Subtotal** | | **10** | **✅ green** |

## Test Execution — Per-Unit TS Handler Tests (verified 2026-05-11)

Added a workspace manifest at the repo root — `pnpm-workspace.yaml` listing `libs/data-access/ts` plus the 10 TypeScript units — so `workspace:*` deps resolve. Installed deps with pnpm 10.

| Unit | Suite | Tests | Result |
| --- | --- | --- | --- |
| `classification-service` | `pnpm test` (vitest run) | 5 (incl. 200-run fast-check property) | ✅ all PASSED |
| **Subtotal** | | **5** | **✅ green** |

`react-web-module` does not yet have authored tests — component-level coverage is deferred per the earlier prioritisation. Other TS units (`ocr-service`, `zip-extraction-service`, etc.) likewise have no per-unit handler tests authored.

### Cumulative verified-by-execution test count

| Suite | Tests |
| --- | --- |
| libs/data-access Go | 22 |
| libs/data-access Python | 28 |
| libs/data-access TypeScript | 26 |
| document-resolver Go | 4 |
| pre-token-generation-lambda Go | 3 (+ 7 subtests) |
| wundergraph-router Go | 3 |
| classification-service TS | 5 |
| zip-extraction-service TS (bounded-RAM) | 3 |
| email-extraction-service Go (bounded-RAM) | 3 |
| workspace-resolver Go (gRPC handler post-proto-stubs) | 7 |
| batch-resolver Go (gRPC handler post-proto-stubs) | 6 |
| office-conversion-aspose-container C++ (GoogleTest) | 2 |
| **Total** | **112** |

### Document-resolver proto-stubs refactor (complete — verified 2026-05-12)
- ✅ `proto/document.proto` → `proto/documentv1/document.proto`
- ✅ Generated `proto/documentv1/document.pb.go` + `document_grpc.pb.go`
- ✅ `internal/handler/handler.go` refactored to embed `pb.UnimplementedDocumentServiceServer` and implement the 4 gRPC methods (CreateDocument, UpdateDocumentStatus, GetDocument, SubscribeStatusChanged) with proto request/response signatures
- ✅ Old legacy method bodies removed; `documentToPB` translator added
- ✅ `go mod tidy` + `go test ./...` run cleanly — `internal/handler` 4/4 PASSED (TestLegalTransition_ForwardOnly / BackwardRejected / FailedIsTerminalSink / RejectsUnknownStatus); `cmd/server` + `proto/documentv1` build with no test files
- ⏸ No new gRPC-shaped tests authored yet (out of scope; existing legalTransition tests still cover the state-machine surface)

### dev05 deployment-staged local rehearsal (complete — verified 2026-05-13)

Ran a full local rehearsal of the chart layer (no AWS push, no kubectl apply). Installed helm 3.16.2 to `/tmp/helm`, ran `helm dependency build` + `helm template` against every unit chart, and `kubectl kustomize` against the Phase C ArgoCD bundle. Surfaced **5 chart-layer bugs that would have failed at first ArgoCD sync**, then fixed all 5 in-tree.

| ID | Bug | Severity | Fix | Files touched |
| --- | --- | --- | --- | --- |
| R-1 | 11 worker `values.yaml` missing `probes:` (chassis requires it) | 🟠 Major | Appended PID-1-alive placeholder probes (`kill -0 1`) with REVIEW comments to tighten to real probes later | 11 |
| R-2 | `office-conversion-aspose-container/helm/` was empty (no Chart.yaml, values.yaml, templates) | 🔴 Critical | Authored Chart.yaml + values.yaml (license-secret volume, HTTP probes :8080, 2-4GiB RAM) + manifests.yaml. Extended chassis `_deployment.tpl` with optional `extraVolumes`/`extraVolumeMounts` (backward-compat) | 4 |
| R-3 | `html-conversion-gotenberg-container/helm/templates/notes.txt` parsed as YAML manifest | 🟠 Major | Option-A: deleted the standalone gotenberg chart; folded image/port/resources into `html-conversion-typescript-sidecar/helm/values.yaml` under `gotenberg:` block; rewrote typescript-sidecar's hardcoded sidecar container to use `{{ .Values.gotenberg.* }}` refs. ApplicationSet 19→18 entries. | 2 + 1 dir delete |
| R-4 | `deploy/argocd-dev05/kustomization.yaml` `namespace: argocd` directive corrupted Namespace `metadata.name` from `docuploader-dev05` → `argocd` | 🟠 Major | Removed the directive (the namespace.yaml already names itself; AppProject + ApplicationSet declare their own namespace inline) | 1 |
| R-5 | ApplicationSet template had no sync-wave annotations — all 18 Apps would sync simultaneously | 🟡 Minor | Added `wave: "<N>"` to each list element + annotation in template. Waves: -10 namespace, 0 resolvers, 1 wundergraph-router, 5 KEDA workers, 8 Aspose, 10 react-web-module | 1 |

**Result**:

| Metric | Before rehearsal | After fixes |
| --- | --- | --- |
| Charts rendering clean | 6 of 18 (33%) | **17 of 17 (100%)** |
| Phase C kustomize | renders but Namespace corrupted | **renders clean** (Namespace correctly named `docuploader-dev05`) |
| Sync-wave ordering | none | resolvers → router → workers → Aspose → web |

**AWS read-only inspection findings** (account 537462380503, profile `opus2-dev`):
- ✅ DEV05-EKS-CLUSTER OIDC provider exists at `oidc.eks.eu-west-1.amazonaws.com/id/4CD18ACA973AEF3E3D289F4092A757EA`
- ✅ ACM cert ISSUED for `*.dev05.k8s.opus2dev.com` (resolves `DEV05_PLATFORM_DOMAIN` token)
- ❌ Phase A Terraform NOT yet applied: 0 docuploader DDB tables, 0 S3 buckets, 0 ECR repos, 0 IAM roles, 0 KMS aliases, 0 SQS queues, 0 SFN state machines
- 🔒 EKS API server firewalled from this workstation — cluster runtime gates (ArgoCD presence, ESO, Karpenter, Grafana) cannot be verified without VPN

**Artefacts produced**:
- `aidlc-docs/operations/dev05-rehearsal-report.md` — structured report capturing the gate scorecard and all 5 bug fixes
- `aidlc-docs/operations/dev05-readiness-checklist.md` — 9-gate pre-deploy checklist (authored earlier this session; gates relevant to source state now tickable)

**Still deferred** (require external action):
- `git commit` of the rename + bug fixes (operator decision; reversible local commit OK)
- Phase A Terraform apply against dev05 AWS account (terraform-deploy permission gate)
- Phase B ECR image builds + pushes (CI pipeline + GitHub OIDC)
- Phase C gitops repo restore + manifest transplant
- VPN access for cluster runtime gates (G5.3-5, G7)

### Bug found and fixed during this run
The original `derive_update_status_key` implementation joined `(executionId, toState, phase)` with `\x1f` and hashed the concatenation. The Python `test_delimiter_safety` case caught a real collision: `("a", "b\x1fc", "d")` and `("a", "b", "c\x1fd")` both encode to `"a\x1fb\x1fc\x1fd"`, so produce identical SHA-256s. Classic delimiter-injection.

**Fix**: switched all three implementations to **length-prefix encoding** — big-endian uint32 byte-length followed by UTF-8 bytes per component. Files changed: `libs/data-access/{go/internal/idempotency/key.go, python/data_access/_idempotency.py, typescript/src/_idempotency.ts}`. Bit-identical cross-language parity preserved (verified by re-running all three suites; all 76 green).

### Second bug found and fixed (per-unit handler-test pass)
`libs/data-access/go/internal/dynamoclient/` was placed under `internal/` but imported by 6 consumer modules (resolvers + Lambdas). Go's `internal/` visibility rule forbids cross-module imports of `internal/` packages, so consumer builds failed with `use of internal package ... not allowed`. **Fix**: moved the package to `libs/data-access/go/dynamoclient/` (no longer internal) and patched the import path in all 6 consumers via `sed`. After the fix, all per-unit handler test suites built and passed.

### Third bug found and fixed (email-extraction bounded-RAM pass)
`units/email-extraction-service/internal/handler/handler.go` declared a hand-rolled `sqstypeshim` struct as an alias for `sqs/types.Message`, but Go does not duck-type field-named structs — the SDK's `out.Messages` items cannot be passed to a function expecting `sqstypeshim`. Compilation failed with `cannot use m (variable of type ...sqs/types.Message) as sqstypeshim value`. **Fix**: imported `sqstypes "github.com/aws/aws-sdk-go-v2/service/sqs/types"`, changed the function signature to `handleOne(ctx context.Context, m sqstypes.Message)`, deleted the dead `sqstypeshim` definition.

### Fifth bug found and fixed (C++ Aspose test compilation)
`units/office-conversion-aspose-container/include/render.h` declared `class DocumentProcessingError : public std::runtime_error { using std::runtime_error::runtime_error; };` but did not `#include <stdexcept>`. Without that header, the constructor-inheritance using-declaration brings in nothing visible, so `throw DocumentProcessingError("...")` in render.cpp is parsed as aggregate initialisation — error: `too many initializers`. **Fix**: added `#include <stdexcept>` to render.h. Caught when bypassing Docker and compiling the test binary directly with g++ + manually-built GoogleTest 1.14.

### Fourth bug found and fixed (full-vet sweep)
`libs/data-access/go/internal/idempotency/` (same shape as the dynamoclient bug from #2) was imported by `update-document-state-lambda`. Caught by `go vet` across all 10 Go modules. **Fix**: moved the package to `libs/data-access/go/idempotency/`, patched the one import path, updated a stale doc-comment reference in `libs/data-access/go/documents/document.go`. Re-vetted: all 10 modules clean. libs/data-access/go tests still 22/22 PASSED after the move.
