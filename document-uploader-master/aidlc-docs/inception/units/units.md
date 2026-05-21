# Units of Work: Unified Document Uploader (27 units, binding)

The inception units-generation stage emits **27 units total**: 23 software units + 4 platform units. This decomposition is binding per `aidlc-inputs/tech-environment.md`; deviations require an inception rerun. Per-unit metadata files live alongside this manifest under `units/<unit-id>.md`.

---

## Decomposition Summary

| Tier | Count | Members |
| --- | --- | --- |
| Platform | 4 | `platform-network-and-compute`, `platform-data`, `platform-orchestration`, `platform-iam-and-security` |
| API stack | 7 | `wundergraph-router`, `workspace-resolver`, `batch-resolver`, `document-resolver`, `pre-token-generation-lambda`, `document-event-handler-lambda`, `audit-event-storage-lambda` |
| Pipeline stack | 15 | `classification-service`, `ocr-service`, `zip-extraction-service`, `output-assembly-service`, `slipsheet-service`, `pdf-processing-service`, `office-conversion-aspose-container`, `office-conversion-orchestrator-sidecar`, `html-conversion-gotenberg-container`, `html-conversion-typescript-sidecar`, `tiff-cog-service`, `image-tiff-conversion-service`, `email-extraction-service`, `media-conversion-service`, `update-document-state-lambda` |
| Web | 1 | `react-web-module` |
| **Total** | **27** | |

---

## Unit Index

### Platform (4 units)

| Unit ID | Owns | File |
| --- | --- | --- |
| `platform-network-and-compute` | EKS integration, ALB Ingress, ACM, ECR, K8s service chassis | [platform-network-and-compute.md](platform-network-and-compute.md) |
| `platform-data` | DynamoDB tables, S3 buckets, KMS keys + aliases, S3 lifecycle + tri-language data-access library for the 7 DynamoDB tables at workspace-root `libs/data-access/{go,py,ts}/` (multi-language unit: Terraform + Go + Python + TypeScript; root-level path is an explicit project-structure override — see audit.md; slug names aligned to `multi-language-units.md` § 3 in 2026-05-13 rehearsal) | [platform-data.md](platform-data.md) |
| `platform-orchestration` | Step Functions ASL, EventBridge bus, SQS queues, WunderGraph audit wiring | [platform-orchestration.md](platform-orchestration.md) |
| `platform-iam-and-security` | IAM role library (~17 roles), IRSA bindings, GuardDuty config, Secrets Manager bootstrap | [platform-iam-and-security.md](platform-iam-and-security.md) |

### API Stack (7 units)

| Unit ID | Language | Compute | File |
| --- | --- | --- | --- |
| `wundergraph-router` | Go | EKS Deployment | [wundergraph-router.md](wundergraph-router.md) |
| `workspace-resolver` | Go | EKS Deployment | [workspace-resolver.md](workspace-resolver.md) |
| `batch-resolver` | Go | EKS Deployment | [batch-resolver.md](batch-resolver.md) |
| `document-resolver` | Go | EKS Deployment | [document-resolver.md](document-resolver.md) |
| `pre-token-generation-lambda` | Go | Lambda (Sync) | [pre-token-generation-lambda.md](pre-token-generation-lambda.md) |
| `document-event-handler-lambda` | Go | Lambda (Event-Driven) | [document-event-handler-lambda.md](document-event-handler-lambda.md) |
| `audit-event-storage-lambda` | Go | Lambda (Event-Driven) | [audit-event-storage-lambda.md](audit-event-storage-lambda.md) |

### Pipeline Stack (15 units)

| Unit ID | Language | Compute | File |
| --- | --- | --- | --- |
| `classification-service` | TypeScript | EKS Deployment | [classification-service.md](classification-service.md) |
| `ocr-service` | TypeScript | EKS Deployment | [ocr-service.md](ocr-service.md) |
| `zip-extraction-service` | TypeScript | EKS Deployment | [zip-extraction-service.md](zip-extraction-service.md) |
| `output-assembly-service` | TypeScript | EKS Deployment | [output-assembly-service.md](output-assembly-service.md) |
| `slipsheet-service` | TypeScript | EKS Deployment | [slipsheet-service.md](slipsheet-service.md) |
| `pdf-processing-service` | Python | EKS Deployment | [pdf-processing-service.md](pdf-processing-service.md) |
| `office-conversion-aspose-container` | C++ | EKS Pod (container #1) | [office-conversion-aspose-container.md](office-conversion-aspose-container.md) |
| `office-conversion-orchestrator-sidecar` | Python | EKS Pod (container #2) | [office-conversion-orchestrator-sidecar.md](office-conversion-orchestrator-sidecar.md) |
| `html-conversion-gotenberg-container` | Third-party (Gotenberg) | EKS Pod (container #1) | [html-conversion-gotenberg-container.md](html-conversion-gotenberg-container.md) |
| `html-conversion-typescript-sidecar` | TypeScript | EKS Pod (container #2) | [html-conversion-typescript-sidecar.md](html-conversion-typescript-sidecar.md) |
| `tiff-cog-service` | TypeScript | EKS Deployment | [tiff-cog-service.md](tiff-cog-service.md) |
| `image-tiff-conversion-service` | TypeScript | EKS Deployment | [image-tiff-conversion-service.md](image-tiff-conversion-service.md) |
| `email-extraction-service` | Go | EKS Deployment | [email-extraction-service.md](email-extraction-service.md) |
| `media-conversion-service` | TypeScript | EKS Deployment | [media-conversion-service.md](media-conversion-service.md) |
| `update-document-state-lambda` | Go | Lambda (Event-Driven) | [update-document-state-lambda.md](update-document-state-lambda.md) |

### Web (1 unit)

| Unit ID | Language | Target | File |
| --- | --- | --- | --- |
| `react-web-module` | TypeScript | Static asset bundle | [react-web-module.md](react-web-module.md) |

---

## Per-Unit Metadata Template

Each per-unit file follows this template:

```markdown
# <unit-id>

**Tier**: Platform / API / Pipeline / Web
**Language**: Go / Python / TypeScript / C++ / Third-party
**Compute**: EKS Deployment / Lambda / Static asset / Pod (sidecar pair)

## Purpose
<one or two sentences>

## Responsibilities
- ...

## Inputs (consumed)
- Queues / events / API calls

## Outputs (produced)
- Queues / events / API calls / data writes

## Dependencies
- Other units, AWS services

## Test gate
Three-tier (Local + LocalStack + Sandbox); property-based tests; Allure reports.

## Construction-stage artefacts
- Functional design: `aidlc-docs/construction/<unit-id>/functional-design/`
- NFR requirements + design: `aidlc-docs/construction/<unit-id>/nfr-requirements/`, `nfr-design/`
- Infrastructure design: `aidlc-docs/construction/<unit-id>/infrastructure-design/`
- Code summary: `aidlc-docs/construction/<unit-id>/code/`
- Source: `units/<unit-id>/`
```

---

## Build Sequence

Per `workflow-planning.md`, construction proceeds in four tiers:

1. **Tier-1 (Platform substrate)**: 4 platform units — critical path
2. **Tier-2 (API stack)**: 7 API units — depends on Tier-1
3. **Tier-3 (Pipeline workers)**: 15 pipeline units — depends on Tier-1; parallel with Tier-2
4. **Tier-4 (Web)**: 1 web unit — depends on Tier-2 GraphQL surface

---

## Out of Units Generation Scope

- Per-unit functional design (data classes, message shapes, business-rule pseudocode): produced in Construction stage **Functional Design** per unit
- Per-unit NFR specifics: produced in Construction stages **NFR Requirements** + **NFR Design** per unit
- Per-unit Terraform / Helm / Kustomize: produced in Construction stage **Infrastructure Design** per unit
- Code: produced in Construction stage **Code Generation** per unit

---

# Current Status — UPGRADED 2026-05-15

This addendum reflects all work completed across the 27 units since the May 11 inception. The decomposition above is still binding; this section adds **what's verified, deployed, or deferred** per unit.

## Cumulative work across all 27 units

| Metric | Count |
| --- | --- |
| Units fully construction-complete (source code + helm chart + tests authored) | **27 / 27** ✅ |
| Helm charts rendering cleanly via `helm template` | **17 of 17** deployable ✅ (4 platform units are Terraform-only; gotenberg folded into typescript-sidecar; aspose chart authored from scratch) |
| LIB-04 cross-language tests passing | **76 / 76** ✅ (Go 22, Python 28, TypeScript 26) |
| Per-unit handler tests passing | **30+** ✅ (workspace 7, batch 6, document 4, router 3, classification 5, pre-token 3, plus bounded-RAM × 2) |
| C++ Aspose render tests | 2 ✅ |
| Cumulative verified-by-execution tests | **116+** |
| Real bugs caught + fixed during construction + rehearsal | **9** (delimiter-injection, 2× Go internal/ visibility, sqstypeshim, C++ stdexcept include, plus R-1 through R-5 chart-layer bugs) |
| AWS resources deployed (full Phase A units 1+2 cycle) | **73 + 72** (May 13 then May 14 redeploy) |
| AWS resources cleanly reverted | **73** (May 13 revert) + **partial today** (state-bucket loss prevents Terraform-driven cleanup) |

## Status per unit

### Platform tier (4 units)

| Unit | Code | Helm | Tests | Terraform applied? |
| --- | --- | --- | --- | --- |
| `platform-data` | ✅ + tri-lang library | n/a (creates DDB/S3/KMS) | ✅ 76 LIB-04 tests | ✅ applied 2× (May 13, 14); state-bucket loss on May 15 |
| `platform-iam-and-security` | ✅ | n/a | n/a | ✅ applied 2× (minus GuardDuty Malware Plan — same failure both times: S3 EventBridge perms) |
| `platform-network-and-compute` | ✅ + `docuploader-chassis` Helm library chart | ✅ chassis lib chart | n/a | ❌ never applied |
| `platform-orchestration` | ✅ (Step Functions 21-state ASL + 14 SQS + EventBridge) | n/a | n/a | ❌ never applied |

### API stack (7 units)

| Unit | Source code | Helm | Tests | Status |
| --- | --- | --- | --- | --- |
| `wundergraph-router` | ✅ Go | ✅ | ✅ 3/3 (audit redaction) | Image not built; not deployed |
| `workspace-resolver` | ✅ Go (gRPC + proto stubs) | ✅ | ✅ 7/7 (post-proto-stubs refactor) | Image not built; not deployed |
| `batch-resolver` | ✅ Go (gRPC + proto stubs) | ✅ | ✅ 6/6 | Image not built; not deployed |
| `document-resolver` | ✅ Go (gRPC + proto stubs) | ✅ | ✅ 4/4 (legalTransition state machine) | Image not built; not deployed |
| `pre-token-generation-lambda` | ✅ Go | n/a (Lambda) | ✅ 3/3 (+ 7 subtests) | Image not built; not deployed |
| `document-event-handler-lambda` | ✅ Go | n/a (Lambda) | ✅ chassis-test coverage | Image not built; not deployed |
| `audit-event-storage-lambda` | ✅ Go | n/a (Lambda) | ✅ | Image not built; not deployed |

### Pipeline stack (15 units)

| Unit | Lang | Source | Helm | Tests | Image / Deploy |
| --- | --- | --- | --- | --- | --- |
| `classification-service` | TS | ✅ | ✅ | ✅ 5/5 (forced-slipsheet, 200-run fast-check) | ❌ |
| `ocr-service` | TS | ✅ | ✅ | ✅ unit tests | ❌ |
| `zip-extraction-service` | TS | ✅ | ✅ | ✅ + 3/3 bounded-RAM property | ❌ |
| `output-assembly-service` | TS | ✅ | ✅ | ✅ | ❌ |
| `slipsheet-service` | TS | ✅ | ✅ | ✅ | ❌ |
| `pdf-processing-service` | Python | ✅ uv | ✅ | ✅ | ❌ |
| `office-conversion-aspose-container` | C++ | ✅ Conan + CMake | ✅ (authored from scratch in R-2 fix) | ✅ 2/2 GoogleTest | ❌ |
| `office-conversion-orchestrator-sidecar` | Python | ✅ uv | ✅ | ✅ | ❌ |
| `html-conversion-gotenberg-container` | 3rd-party | ✅ values folded into typescript-sidecar (R-3 fix) | ✅ (was standalone chart; deleted, config consolidated into sibling) | n/a | ❌ |
| `html-conversion-typescript-sidecar` | TS | ✅ | ✅ (now holds gotenberg sidecar config) | ✅ | ❌ |
| `tiff-cog-service` | TS | ✅ | ✅ | ✅ | ❌ |
| `image-tiff-conversion-service` | TS | ✅ | ✅ | ✅ | ❌ |
| `email-extraction-service` | Go | ✅ | ✅ | ✅ + 3/3 bounded-RAM property | ❌ |
| `media-conversion-service` | TS | ✅ | ✅ | ✅ | ❌ |
| `update-document-state-lambda` | Go | ✅ | n/a (Lambda) | ✅ | ❌ |

### Web tier (1 unit)

| Unit | Source | Helm | Tests | Deploy |
| --- | --- | --- | --- | --- |
| `react-web-module` | ✅ TS | ✅ (nginx + /healthz) | ⏸ component tests deferred | ❌ |

## Construction artefacts produced (cross-cutting)

| Artefact | Path | Purpose |
| --- | --- | --- |
| **LIB-04 standalone design doc** | [`construction/lib-04-data-access/design.md`](../../construction/lib-04-data-access/design.md) | 462-line architecture + API + data model + parity contract for the data-access module |
| Per-unit code summaries | `construction/<unit-id>/code/code-summary.md` | File-by-file map per unit (where authored) |
| Tri-language data-access library | `libs/data-access/{go,py,ts}/` | Shared library consumed by 21 units |
| Helm chassis library chart | `units/platform-network-and-compute/helm/docuploader-chassis/` | Shared k8s template helpers consumed by 19 unit charts |
| 6 archetype Dockerfiles | [`deploy/dockerfiles/`](../../../deploy/dockerfiles/) | Per-language container build templates |
| Phase C ArgoCD draft manifests | [`deploy/argocd-dev05/`](../../../deploy/argocd-dev05/) | 9 files: AppProject + ApplicationSet + Namespace + 4 values overlays |
| CI/CD workflows | [`.github/workflows/`](../../../.github/workflows/) | ci.yml, build-and-push.yml, terraform-plan.yml |
| Operator scripts | [`scripts/`](../../../scripts/) | build-image.sh, build-all-images.sh, deploy-dev05.sh |
| Top-level Makefile | [`Makefile`](../../../Makefile) | Operator entrypoints (test, build, dev05-* targets) |

## Operations-stage artefacts produced (added post-construction)

| Artefact | Path | Purpose |
| --- | --- | --- |
| Readiness checklist (9 gates, 43 items) | [`operations/dev05-readiness-checklist.md`](../../operations/dev05-readiness-checklist.md) | Pre-deploy gates |
| Rehearsal report (5 chart-layer bugs surfaced + fixed) | [`operations/dev05-rehearsal-report.md`](../../operations/dev05-rehearsal-report.md) | Local pre-deploy validation |
| Deployment runbook | [`operations/dev05-runbook.md`](../../operations/dev05-runbook.md) | Step-by-step phased deploy + rollback |
| Deployment snapshot — May 13 | [`operations/dev05-aws-deployment-2026-05-13/`](../../operations/dev05-aws-deployment-2026-05-13/) | First deploy + revert: 18 files including 14 .tf copies, urls.md, inventory.md, revert.sh |
| Deployment snapshot — May 14 | [`operations/dev05-aws-deployment-2026-05-14/`](../../operations/dev05-aws-deployment-2026-05-14/) | Redeploy: 3 files (README, urls.md, revert.sh) |

## AWS deployment cycle history (3 days)

| Date | What happened | Resources |
| --- | --- | --- |
| 2026-05-13 | First Phase A deploy → revert | Created 73 AWS resources, destroyed 73 (audit-archive bucket survived 7-year Object Lock briefly then was empty-deleted; 2 KMS keys + 3 secrets entered standard grace periods) |
| 2026-05-14 | Phase A redeploy (after revert validated reproducibility) | Created 72 AWS resources; 2 imported (secrets from May 13's pending-deletion grace), 1 GuardDuty Malware Plan failed same as before; state bucket cleanly tracked |
| 2026-05-15 | Revert attempt failed | Terraform state bucket vanished between May 14 and May 15 (root cause unknown — needs CloudTrail `DeleteBucket` lookup); `revert.sh` failed at Step 1; AWS state of the 72 May-14 resources currently unknown (user requested no further AWS API queries) |

## Bugs found + fixed across the project

| # | When | Bug | Caught by | Fix |
| --- | --- | --- | --- | --- |
| 1 | Construction (LIB-04) | Delimiter-injection in cross-language SHA-256 | Python `test_delimiter_safety` property test | Length-prefix encoding in all 3 languages |
| 2 | Construction | Go `internal/dynamoclient` blocked cross-module imports | Consumer `go test` | Moved to top-level `dynamoclient/` |
| 3 | Construction (email-extraction) | `sqstypeshim` struct mismatch with `sqs/types.Message` | `go vet` | Imported real type, deleted shim |
| 4 | Construction | Go `internal/idempotency` — same shape as #2 | Same | Moved to top-level `idempotency/` |
| 5 | Construction (aspose) | C++ render.h missing `#include <stdexcept>` | g++ compile error | Added include |
| 6 (R-1) | Rehearsal | 11 worker charts missing `probes:` block | `helm template` nil-pointer | Appended PID-1-alive placeholder probes |
| 7 (R-2) | Rehearsal | `office-conversion-aspose-container/helm/` was empty | `helm template` errored | Authored Chart.yaml + values.yaml + manifests.yaml; extended chassis with `extraVolumes`/`extraVolumeMounts` |
| 8 (R-3) | Rehearsal | gotenberg chart's `templates/notes.txt` parsed as YAML manifest | `helm template` error | Deleted standalone chart; folded config into typescript-sidecar |
| 9 (R-4) | Rehearsal | Phase C kustomize namespace name corruption | `kubectl kustomize` output check | Removed `namespace: argocd` directive |
| 10 (R-5) | Rehearsal | ApplicationSet sync-wave annotations missing | Code review | Added `argocd.argoproj.io/sync-wave` per archetype (-10 ns, 0 resolvers, 1 router, 5 workers, 8 Aspose, 10 web) |

## Test execution scorecard

| Suite | Count | Status |
| --- | --- | --- |
| LIB-04 Go (`go test ./libs/data-access/go/...`) | 22 | ✅ |
| LIB-04 Python (`pytest libs/data-access/py/tests/`) | 28 (hypothesis-driven) | ✅ |
| LIB-04 TypeScript (`pnpm -C libs/data-access/ts test`) | 26 (fast-check) | ✅ |
| Per-unit Go handler tests | ~16 (workspace 7, batch 6, document 4, router 3, pre-token 3) | ✅ |
| Per-unit TS handler tests | ~10 (classification 5, etc.) | ✅ |
| Bounded-RAM property tests | 6 (zip-extraction 3, email-extraction 3) | ✅ |
| C++ Aspose GoogleTest | 2 | ✅ |
| Helm template (deployable charts) | 17 | ✅ |
| Phase C kustomize render | 1 (3 objects: Namespace, AppProject, ApplicationSet) | ✅ |
| **Cumulative verified-by-execution** | **120+** | **✅** |

## Phase scorecard

| Phase | Status |
| --- | --- |
| Inception (all stages) | ✅ complete |
| Construction (all 27 units) | ✅ complete |
| Phase A unit 1 (platform-data) Terraform | ✅ applied 2× (May 13, 14) — state-bucket lost on May 15 |
| Phase A unit 2 (platform-iam-and-security) Terraform | ✅ applied 2× (minus GuardDuty Malware Plan) — state-bucket lost on May 15 |
| Phase A unit 3 (platform-network-and-compute) Terraform | ❌ never applied |
| Phase A unit 4 (platform-orchestration) Terraform | ❌ never applied |
| Phase B (build + push 22 container images) | ❌ never run; 6 archetype Dockerfiles authored but never `docker build`-ed (local docker permission blocker) |
| Phase C (gitops repo transplant) | ❌ never run; 9 draft manifests authored at `deploy/argocd-dev05/` |
| Phase D (cluster bootstrap) | ✅ pre-existing on DEV05-EKS-CLUSTER (ArgoCD, KEDA, Karpenter, Kyverno, ESO, Grafana Alloy all running) |
| Phase E (ArgoCD sync of docuploader workloads) | ❌ never run |
| Phase F (J1-J4 smoke tests) | ❌ never run |

## Deferred items (intentional — out of scope for the current iteration)

| # | Item | Why deferred |
| --- | --- | --- |
| 1 | Tier-2 LocalStack integration tests | Harness not authored (`make localstack-up`, `cmd/local-test-rig` not in repo) |
| 2 | Tier-3 sandbox-deployed integration tests | Requires Phase E (cluster deploy) — depends on Phases A3+A4+B+C |
| 3 | J4 cross-tenant isolation evidence | Requires Phase E + 2 test tenants |
| 4 | Performance benchmarks (p50/p95/p99) | No SLOs measured yet against real DDB |
| 5 | OpenTelemetry tracing inside LIB-04 library | Design decision — span granularity, attribute set |
| 6 | Schema migration tooling | Premature — no schema evolution pending |
| 7 | R-1 probe tightening (replace PID-1 placeholders with real `/healthz`) | Needs worker source-code health-endpoint impls |
| 8 | C++ binding for LIB-04 | No consumer needs it (Aspose container reads files only) |
| 9 | Naming-convention alignment (`docuploader-*` vs org's `doc-uploader-sandbox-*`) | Org-level architectural decision pending |
| 10 | VPN split-tunnel fix (so kubectl works via office IPs) | Operator IT-team task |
| 11 | GitHub auth setup + `git push` to publish branch | Operator action (one-off) |

## Live evidence (run any of these now without AWS / cluster)

```bash
# 76 LIB-04 tests
cd libs/data-access/go && /tmp/go/bin/go test ./...
cd libs/data-access/py && /tmp/da-pylibs/bin/pytest -q
pnpm -C libs/data-access/ts test

# 17 deployable charts render
helm template <release> units/<unit>/helm \
  --set iamRoleArn=arn:aws:iam::000000000000:role/test \
  --set image.repository=test/repo

# Phase C kustomize render
kubectl kustomize deploy/argocd-dev05/

# Preview the full deploy (no AWS calls)
./aidlc-docs/operations/dev05-aws-deployment-2026-05-13/revert.sh --dry-run
```

## Operational considerations going forward

1. **AWS state cleanup needed** (today's state-bucket loss left an unknown number of resources orphaned in account `537462380503`); recommend manual AWS console deletion of any `docuploader-*` survivors via:
   - https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#tables (filter `docuploader`)
   - https://s3.console.aws.amazon.com/s3/buckets?region=eu-west-1 (filter `docuploader`)
   - https://us-east-1.console.aws.amazon.com/iam/home#/roles?search=docuploader-
2. **Local repo work** is still uncommitted: 14 DevOps files + 4 `versions.tf` edits + the new snapshot folders. Worth committing to preserve the rehearsal artefacts.
3. **GitHub push** would make the work publicly verifiable + enable the CI workflows.
4. **Path to a working demo**: re-apply Phase A on a clean state bucket → apply units 3+4 → build + push 22 images → transplant ArgoCD manifests → ArgoCD sync → J1-J4 smoke tests. Estimated ~2-3 hours of mostly mechanical execution.

