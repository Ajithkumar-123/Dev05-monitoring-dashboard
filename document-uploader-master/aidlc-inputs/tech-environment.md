# Technical Environment Document: Unified Document Uploader

## Project Technical Summary

- **Project Name**: Unified document uploader (resource identifier: `docuploader`)
- **Project Type**: Greenfield (no prior application code at the workspace root; design-only documentation present)
- **Primary Runtime Environment**: Cloud
- **Cloud Provider**: AWS (single pre-existing sandbox account)
- **Primary Region**: `eu-west-1` only; no DR/failover region in scope
- **Account Topology**: Single sandbox account; no per-environment or per-tenant accounts at MVP
- **Network Topology**: Shared platform VPC pre-provisioned in the sandbox; no dedicated VPC creation
- **Target Deployment Model**: EKS-centric for stateful and worker compute; AWS Lambda for event handlers and pre-token validation; static asset bundle for the React module
- **IaC Tooling**: Terraform for AWS resources; Helm + Kustomize for Kubernetes manifests
- **Deployment Method (MVP)**: Push-based via CLI tooling (`terraform apply`, `kubectl apply`, `helm upgrade`); ArgoCD bypassed; CrossPlane not used
- **Observability**: Grafana via Grafana Alloy OTLP endpoint (logs, metrics, traces); CloudWatch reserved only for two named audit-event log groups
- **Naming Convention**: "Unified" appears only in prose and human-facing labels; "docuploader" is the only acceptable token in resource identifiers — never mixed (binding rule)
- **Team Size**: 6 senior engineers
- **Team Experience**: All required skills (Go, Python, TypeScript, C++, K8s, AWS, GraphQL) are covered; each engineer is competent in at least two of these areas; no skill backfill required
- **Pre-existing sandbox components NOT managed by this project**: ArgoCD, Istio, ALB Controller, External Secrets Operator, Grafana Alloy, Kyverno, KEDA, Metrics Server, Karpenter, Cluster Autoscaler, CrossPlane (must integrate with; must not modify or replace)

---

## Programming Languages

The design assigns languages per unit. The assignment is binding for MVP — no per-unit language override is permitted without an explicit inception rerun.

### Required Languages

| Language | Version | Purpose | Rationale |
| --- | --- | --- | --- |
| Go | Latest stable (currently 1.23+) | WunderGraph router; Workspace, Batch, Document resolvers; `PreTokenGenerationLambda`; `DocumentEventHandler`; `AuditEventStorage` Lambda; `UpdateDocumentState` Lambda; Email Extraction service | Strong AWS SDK ecosystem; `provided.al2023` Lambda runtime; idiomatic concurrency model for resolvers and Lambdas; standard-library MIME and email parsing |
| Python | Latest stable (currently 3.13+) | PDF Processing service; Office Conversion orchestrator sidecar | `pikepdf`, `PyMuPDF`, and `Ghostscript` bindings are best in class; chunking orchestrator benefits from async streaming primitives |
| TypeScript / Node.js | Latest LTS (currently Node 22 LTS) | HTML Conversion sidecar; Output Assembly; Image/TIFF Conversion; TIFF-to-COG; Slipsheet; Classification; Zip Extraction; Media Conversion; React web module | `pdf-lib`, `sharp`, `PDFKit`, `gdal-async`, `geotiff.js`, `file-type`, `unzipper`, FFmpeg bindings concentrate in the Node ecosystem |
| C++ | C++20 | Aspose.Total-for-C++ converter container | Aspose.Total for C++ is the only suitable Office-conversion engine for the chunked-conversion design |

### Permitted Languages

None. No additional languages are permitted at MVP. Adding a new language requires an explicit inception rerun.

### Prohibited Languages

| Language | Reason | Use Instead |
| --- | --- | --- |
| Java, Kotlin, Scala | Not in the team's mix; JVM cold starts on Lambda are a poor fit | Go (Lambdas, resolvers, services); TypeScript (sidecars, services) |
| Ruby | Not in the team's mix | TypeScript or Python |
| Rust | Not on the per-unit assignment list; introduction is a separate inception decision | Go or C++ depending on layer |
| .NET (C#, F#) | Not in the team's mix | Go or TypeScript |
| PHP | Not in the team's mix; not appropriate for any unit in the design | Go or TypeScript |
| All other languages | Not on the per-unit assignment list | The required language for the unit |

---

## Package and Environment Management

### Per-language standards

| Language | Tool | Committed dependency files | Prohibited alternatives |
| --- | --- | --- | --- |
| Go | Go modules (built-in) | `go.mod`, `go.sum` | Vendor directory not required (use module proxy) |
| Python | uv | `pyproject.toml`, `uv.lock`, `.python-version` | `pip`, `poetry`, `pipenv`, `conda`, `pip-tools` are prohibited |
| TypeScript / Node.js | pnpm | `package.json`, `pnpm-lock.yaml` | `npm` and `yarn` lockfiles are prohibited (mixing lockfiles is a known source of drift) |
| C++ | CMake + Conan (manifest mode) | `CMakeLists.txt`, `conanfile.txt` | The Aspose container additionally vendors proprietary Aspose `.so` files via a mounted Kubernetes Secret |

### Pinning and lockfile rules

- Lockfiles are authoritative.
- CI must run lockfile-strict installs (`go mod download`, `uv sync --locked`, `pnpm install --frozen-lockfile`).
- Direct dependency upgrades require a lockfile commit reviewed in PR.

### Private artefact repositories

Not required at MVP. Public registries (proxy.golang.org, PyPI, npm registry, ConanCenter) are sufficient. AWS CodeArtifact may be introduced post-MVP if internal artefact publishing is required.

### pnpm workspaces

pnpm workspaces are used only where a unit's design legitimately exposes a TypeScript library to another unit. Cross-unit shared TypeScript code is otherwise prohibited (see Project Structure).

---

## Frameworks and Libraries

### Required Frameworks and Libraries (binding — design-named)

| Library / Framework | Version | Domain | Rationale |
| --- | --- | --- | --- |
| WunderGraph router | (latest stable) | Public GraphQL gateway | Public API surface; schema composition; subscription fan-out; audit-event emission custom module |
| Aspose.Total for C++ | 26.x | Office Conversion converter container | Only viable engine for the chunked Office-conversion design |
| Gotenberg (Chromium) | 8.x | HTML Conversion converter container | Headless Chromium server with a uniform conversion API |
| pikepdf, PyMuPDF, Ghostscript | (latest stable) | PDF Processing service | Repair, page-level operations, OCR text-layer assembly |
| qpdf binary | (latest stable) | Office Conversion orchestrator sidecar | Streaming PDF concatenation with bounded RAM |
| pdf-lib | (latest) | Output Assembly searchable PDF generation; Slipsheet template overlay | Standard Node PDF generation library |
| sharp + PDFKit | (latest) | Image/TIFF Conversion | Performant image transcoding and PDF wrapping |
| gdal-async (bundled GDAL ≥ 3.1) | (latest) | TIFF-to-COG conversion | COG conversion needed for ranged TIFF access |
| geotiff.js | (latest) | TIFF S3 range-request frame extraction | Cooperates with COG layout for streaming reads |
| FFmpeg, FFprobe | (latest stable) | Media Conversion | Standard for audio/video conversion |
| Go `net/mail`, `mime/multipart` (stdlib); `mscfb`, `crtf` (Go) | (Go stdlib + latest stable) | Email Extraction (EML and MSG) | EML via stdlib; MSG via the Compound File Binary Format readers |
| `file-type` (npm) | 21.x | Classification magic-byte detection | Standard magic-byte classifier |
| `unzipper` (npm) | 0.12.x | Zip Extraction streaming | Streaming archive extractor with a bounded memory footprint |
| AWS SDK | Single major version per language: AWS SDK v2 (Go), AWS SDK for Python (boto3) latest, AWS SDK for JavaScript v3 | AWS service access | Single-major-version policy avoids per-unit drift |

### Preferred (sensible defaults; team may override via an inception rerun)

| Layer | Choice | Notes |
| --- | --- | --- |
| Go HTTP / routing | `chi` (lightweight, `net/http`-compatible) where the WunderGraph router does not own the surface | `net/http` standard library where routing needs are minimal |
| Go gRPC | `google.golang.org/grpc` with `protoc-gen-go-grpc` | Router ↔ resolver control plane |
| Go structured logging | `log/slog` | Go 1.21+ standard library |
| Go testing | `testing` (stdlib) + `testify/assert` + `testify/require` for assertions; `testify/mock` or `gomock` for mocks; `go-cmp` for deep comparisons | |
| Python web framework (sidecar HTTP if needed) | `FastAPI` | Never `Flask` or `Django` |
| Python HTTP client | `httpx` | Sync and async; never `requests` (blocks event loops) |
| Python structured logging | `structlog` | |
| Python testing | `pytest` + `pytest-cov` + `hypothesis` | Property-based testing enforced (see Testing Requirements) |
| TypeScript HTTP server (sidecar HTTP if needed) | `fastify` | `express` permitted only where a third-party SDK requires it |
| TypeScript structured logging | `pino` | |
| TypeScript testing | `vitest` + `fast-check` + `msw` | Property-based testing enforced (see Testing Requirements) |
| C++ testing | `GoogleTest` + `GoogleMock` | C++ unit tests run in a parallel CI job |

### Prohibited (explicit deny list)

| Language | Library | Reason | Alternative |
| --- | --- | --- | --- |
| Go | `gin` | Heavyweight router not aligned with `net/http` | `chi` or `net/http` |
| Go | `gorilla/mux` | Project archived | `chi` or `net/http` |
| Go | `logrus`, `zap` | Structured-logging convergence on stdlib | `log/slog` |
| Python | `requests` | Synchronous-only; blocks event loops | `httpx` |
| Python | `Flask`, `Django` | Project does not run a synchronous web framework | `FastAPI` (only where a sidecar legitimately needs HTTP) |
| Python | `pip`, `poetry`, `pipenv`, `conda` | Project uses `uv` exclusively | `uv` |
| Python | `pytest-mock` | Superseded by `monkeypatch` and explicit injection | `monkeypatch` |
| TypeScript | `npm`, `yarn` lockfiles | Project uses `pnpm` exclusively | `pnpm` |
| TypeScript | `Jest` | Standardising on `vitest` | `vitest` |
| TypeScript | `winston`, `bunyan` | Standardising on `pino` | `pino` |
| TypeScript | `axios` | Native `fetch` (or `undici` for richer needs) is sufficient | `fetch` / `undici` |
| All | Any GPL/AGPL-licensed runtime dependency | License policy (see Security Requirements) | An MIT/BSD/Apache-2.0/ISC alternative |

### Library Approval Process

For MVP, additions outside the lists above must be flagged in the PR description and reviewed by at least one peer; a lightweight project-level approval process (PR description + tech-lead review) will be formalised post-MVP.

---

## Cloud Environment

### Service Allow List

| Service | Approved Use Cases | Constraints |
| --- | --- | --- |
| AWS Step Functions (Standard) | 21-state pipeline machine with 14 fire-and-forget `Notify_<X>` interstitials | 1-year execution limit binding for long-running async OCR/media jobs |
| Amazon SQS (Standard) | All worker queues (12) + DLQs; `state-change-notification-queue`; `docuploader-api-audit-events` | 4-day retention (14 days for DLQs); long-poll 20 s; per-queue `maxReceiveCount` per design |
| Amazon S3 | `docuploader-pipeline`, `docuploader-api-staging` (single bucket per A27 — per-tenant logical isolation via KMS aliases + prefix-scoped IAM), `docuploader-api-audit-archive` (Glacier IR + Object Lock Compliance, 7-year default retention), `docuploader-pipeline-config` | All buckets: BPA flags ON; deny `aws:SecureTransport=false`; default SSE-KMS |
| Amazon DynamoDB (on-demand) | `docuploader-api-workspaces`, `docuploader-api-batches`, `docuploader-api-documents` (with `idempotency-index` GSI), `docuploader-api-audit-events` (90-day TTL hot store), `docuploader-content-hashes` (90-day TTL), `textract-task-tokens` (1-day TTL), `docuploader-pipeline-files` (7-day TTL with `folderPath-index` GSI) | On-demand capacity; single-table design where applicable; TTLs as specified |
| Amazon EKS | Existing sandbox cluster; pipeline workers, WunderGraph router, resolvers | Guaranteed-QoS pods; IRSA for all roles; no service mesh |
| Amazon EventBridge | Bus `docuploader-api-events`; rules for S3 PutObject and GuardDuty scan-result events | DLQ on rule targets |
| AWS GuardDuty | Malware Protection for S3 only | No CloudTrail-finding, VPC-Flow-finding, or DNS-finding analysis |
| AWS Textract | Sync and async; SNS bridge to `textract-completion-queue` | Async path uses SNS as the only SNS use in scope |
| AWS Lambda | `provided.al2023` runtime for Go Lambdas (`PreTokenGenerationLambda`, `DocumentEventHandler`, `AuditEventStorage`, `UpdateDocumentState`) | Per-Lambda memory / timeout / reserved concurrency per design |
| Amazon SNS | Textract async-completion notifications only | No general-purpose pub/sub use |
| AWS IAM (IRSA) | Per-component role | No env-var credentials anywhere |
| AWS Application Load Balancer | TLS termination via ACM | ALB Controller is sandbox-managed |
| AWS Certificate Manager | TLS certificate(s) for the API hostname | Private CA optional for in-cluster gRPC |
| AWS KMS | Customer-managed keys with per-tenant aliases (per A27 override) | 6-month rotation default; configurable per workspace |
| AWS Secrets Manager | GraphQL service-account JWT secret (`GRAPHQL_INTERNAL_AUTH_SECRET_ARN`); Aspose licence (mounted via External Secrets Operator); future tenant-scoped secrets | Retrieved via External Secrets Operator and projected as Kubernetes Secrets |
| AWS Cognito (token validation only) | Token-validator role; tokens minted externally for MVP | Token issuance is post-MVP |
| Amazon CloudWatch | Two log groups only: `/aws/docuploader/api/audit-fallback` (always-on emergency outlet) and `/aws/docuploader/api/audit-security` (provisioned post-MVP only; gated `false` in MVP) | Primary observability pipeline is Grafana via OTLP, not CloudWatch metrics |
| AWS VPC Endpoints | S3, DynamoDB, SQS, Step Functions, KMS, Secrets Manager, ECR | Eliminates NAT egress on those calls |
| Amazon ECR | Container image registry for all built images | |

### Service Disallow List

| Service | Reason | Alternative |
| --- | --- | --- |
| Amazon RDS / Aurora | Relational store not needed | DynamoDB |
| Amazon ECS / Fargate / App Runner | Compute is EKS, not container-managed services | EKS |
| Amazon ElastiCache / MemoryDB | No caching tier in MVP | In-process caches only (e.g., JWT token cache in Lambda) |
| Amazon OpenSearch / Elasticsearch | Search built into the design's output set | None needed |
| Amazon EFS / FSx | Workers stream via S3; no shared file system | S3 |
| AWS Elastic Beanstalk | Incompatible with IaC posture (Terraform-only) | Terraform + EKS / Lambda |
| Amazon Kinesis / MSK / Kafka | Task distribution is SQS; streaming is not in scope | SQS |
| AWS App Mesh / service mesh | Design explicitly excludes service mesh | Direct TCP/TLS via ALB or cluster-internal CoreDNS |
| AWS WAF | Not in MVP scope | ALB request-shape protection only |
| AWS Backup | TTL-driven retention is sufficient | S3 Lifecycle + DynamoDB TTL |
| AWS CloudFormation | Terraform is the IaC tool of record | Terraform |
| AWS CrossPlane (sandbox-installed) | Terraform is used instead | Terraform |
| CloudWatch as primary log/metric aggregator | Grafana is primary | Grafana via Grafana Alloy OTLP; CloudWatch only for the two named audit-event log groups |

### Service Approval Process

For MVP, services not on the allow list require a project-level decision: a PR-description note + tech-lead review and an update to this document. A formalised approval process (cost / security / operational review) will be introduced post-MVP.

---

## Infrastructure as Code

| Concern | Choice | Notes |
| --- | --- | --- |
| AWS resource IaC | Terraform | No CDK, Pulumi, CloudFormation, or CrossPlane. CrossPlane is present in the sandbox but not used by this project |
| Kubernetes manifests | Helm and Kustomize | Helm for parameterisable workloads; Kustomize overlays for environment-specific patching |
| GitOps | None for MVP | Push-based deployment from CLI tooling; ArgoCD bypassed |
| Drift detection / policy | Deferred | No `cdk-nag`, `Checkov`, `tfsec`, or OPA / Conftest gates configured for MVP. Sandbox-resident Kyverno applies cluster-level policy externally; project-level policy automation is post-MVP |
| Terraform state backend | S3 with native S3 locking | Terraform 1.10+ S3-native state locking; no DynamoDB lock table |
| Module / construct sharing | Per-unit standalone | Each service / Lambda owns its IaC. Cross-cutting infrastructure lives in dedicated platform units. No internal artefact registry in MVP |

---

## Repository Topology and Project Structure

### Topology

One monorepo for the whole project.

### Top-level layout

```text
document-uploader/
  units/                                # one subdirectory per inception unit
    <unit-id>/                          # single-language units follow that language's idiomatic layout directly
    <unit-id>/<language>/               # multi-language units split-by-language-first
  aidlc-docs/                           # AI-DLC documentation tree (per CLAUDE.md)
    inception/
      units/                            # per-unit metadata files (one per shipped unit, per units-generation stage)
      ...
    construction/
    ...
  aidlc-inputs/                         # vision.md and tech-environment.md
  doc-uploader-design/                  # design documents (existing; reference)
```

### Per-language scaffolding rules (split-by-language-first, then idiomatic)

| Language | Layout |
| --- | --- |
| Go units | `cmd/<binary>/main.go`, `internal/`, `pkg/` (only if a unit legitimately exposes a library), `go.mod`, `go.sum` |
| Python units | `src/<package>/`, `tests/`, `pyproject.toml`, `uv.lock`, `.python-version` |
| TypeScript units | `src/`, `tests/`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json` |
| C++ units | `src/`, `include/`, `tests/`, `CMakeLists.txt`, `conanfile.txt` |

### Cross-unit code sharing

- Libraries are scoped to their owning unit and language directory.
- **Root-level shared modules are prohibited.**
- Where two units legitimately need to share code (e.g., a chassis library), the producing unit exposes a versioned package consumed via the language-specific package manager.
- `pkg/` (Go), pnpm workspace links (TypeScript), uv path dependencies (Python) are the supported sharing mechanisms; in all cases the producer is a named unit, not an untracked root directory.

### Infrastructure code placement

- Per-unit Terraform / Helm / Kustomize lives under `units/<unit-id>/infra/` (or analogous).
- **Cross-cutting infrastructure** (VPC integration, EKS cluster wiring, shared DynamoDB tables, KMS keys, EventBridge bus, Step Functions ASL, IAM library, GuardDuty configuration, Secrets Manager bootstrap) lives in dedicated platform units.

### Inception unit decomposition

The inception units-generation stage emits **27 units total**: 23 software units + 4 platform units. The list below is binding for the units-generation stage; deviations require an inception rerun.

#### API stack (7 software units)

| Unit ID | Language | Compute Target |
| --- | --- | --- |
| `wundergraph-router` | Go | EKS Deployment |
| `workspace-resolver` | Go | EKS Deployment |
| `batch-resolver` | Go | EKS Deployment |
| `document-resolver` | Go | EKS Deployment |
| `pre-token-generation-lambda` | Go | AWS Lambda (Sync variant) |
| `document-event-handler-lambda` | Go | AWS Lambda (Event-Driven variant) |
| `audit-event-storage-lambda` | Go | AWS Lambda (Event-Driven variant) |

#### Pipeline stack (15 units: 12 worker services with sidecar-pattern pods split by container, plus 1 in-pipeline Lambda)

| Unit ID | Language | Compute Target |
| --- | --- | --- |
| `classification-service` | TypeScript | EKS Deployment |
| `ocr-service` | TypeScript | EKS Deployment |
| `zip-extraction-service` | TypeScript | EKS Deployment |
| `output-assembly-service` | TypeScript | EKS Deployment |
| `slipsheet-service` | TypeScript | EKS Deployment |
| `pdf-processing-service` | Python | EKS Deployment |
| `office-conversion-aspose-container` | C++ | EKS Deployment (sidecar-pattern Pod, container #1; co-deployed with the orchestrator sidecar) |
| `office-conversion-orchestrator-sidecar` | Python | EKS Deployment (sidecar-pattern Pod, container #2; co-deployed with the Aspose container) |
| `html-conversion-gotenberg-container` | Third-party Gotenberg image | EKS Deployment (sidecar-pattern Pod, container #1; co-deployed with the TypeScript sidecar). Configuration/operations unit only — no source code authored beyond Helm/Kustomize for the third-party image |
| `html-conversion-typescript-sidecar` | TypeScript | EKS Deployment (sidecar-pattern Pod, container #2; co-deployed with the Gotenberg container) |
| `tiff-cog-service` | TypeScript | EKS Deployment |
| `image-tiff-conversion-service` | TypeScript | EKS Deployment |
| `email-extraction-service` | Go | EKS Deployment |
| `media-conversion-service` | TypeScript | EKS Deployment |
| `update-document-state-lambda` | Go | AWS Lambda (Event-Driven variant) |

#### Web (1 software unit)

| Unit ID | Language | Compute Target |
| --- | --- | --- |
| `react-web-module` | TypeScript | Static asset bundle served from CloudFront/S3 or embedded directly in host applications |

#### Platform (4 units)

| Unit ID | Owns |
| --- | --- |
| `platform-network-and-compute` | EKS cluster integration (ConfigMaps, Namespaces, ServiceAccounts, IRSA bindings); ALB Ingress configuration; ACM certificates; ECR repositories; the K8s "service chassis" library scaffolding for both API and pipeline tiers |
| `platform-data` | All DynamoDB tables (workspaces, batches, documents, audit-events, content-hashes, pipeline-files, textract-task-tokens) with their GSIs and TTLs; the `docuploader-pipeline` S3 bucket; the single `docuploader-api-staging` bucket (per A27); the `docuploader-api-audit-archive` Glacier IR bucket (Object Lock Compliance, 7-year default); the `docuploader-pipeline-config` slipsheet-template bucket; KMS keys with per-tenant aliases; S3 lifecycle rules |
| `platform-orchestration` | Step Functions state machine (21-state ASL with 14 `Notify_<X>` interstitials); the `docuploader-api-events` EventBridge bus and rules; all SQS queues (12 worker queues + `state-change-notification-queue` + `docuploader-api-audit-events`) with their DLQs; the WunderGraph audit-emission module wiring (router-side ConfigMap and SQS sender configuration) |
| `platform-iam-and-security` | The IAM role library (~17 roles spanning API and pipeline tiers) with their IRSA bindings; GuardDuty Malware Protection for S3 configuration; Secrets Manager bootstrap (operator-managed audit-archive CMK; GraphQL service-account JWT secret; Aspose licence Secret skeleton) |

### A27 tenant-isolation override

- Per-tenant *bucket* provisioning is **eliminated**.
- Tenant isolation is enforced via **alias-based KMS keys + prefix-scoped IAM**.
- Per-workspace KMS-alias creation and prefix policy seeding live inside the `workspace-resolver` unit (called on `createWorkspace`).
- The underlying KMS keys, the staging bucket itself, and the GuardDuty enrolment live in `platform-data` and `platform-iam-and-security`.
- Object retention is TTL-driven via S3 Lifecycle, governed by `Workspace.retentionPolicy.inputRetentionDays` (default 7 days).
- There is **no separate `tenant-provisioning-lambda` unit**.

---

## Preferred Technologies and Patterns

### Architecture Pattern

- **Pipeline tier.** A set of independently-scaling EKS workers, one per processing route or sub-route, fed by SQS Claim-Check messages from a Step Functions Standard state machine.
- **API tier.** A WunderGraph router fronting three Go gRPC resolvers (Workspace, Batch, Document), with three Go Lambdas covering OIDC token validation (`PreTokenGenerationLambda`), pre-pipeline event handling (`DocumentEventHandler`), and audit-event storage (`AuditEventStorage`).
- **In-pipeline state surfacing.** A fire-and-forget `Notify_<X>` interstitial after every domain state transition emits to a single `state-change-notification-queue`, drained by the `UpdateDocumentState` Lambda which calls back into the Document resolver to update `Document.status` / `Document.pipelineStage`.
- **Sidecar-pattern Pods.** Office and HTML conversion are deployed as two-container Pods: a stateless renderer (Aspose; Gotenberg/Chromium) and an orchestrator sidecar (Python; TypeScript) that owns the worker-loop, queue interaction, S3 IO, and chunking. Each container is its own inception unit.
- **No service mesh.** Direct TCP/TLS via ALB or cluster-internal CoreDNS; optional private-CA TLS on in-cluster gRPC.

### API Design Standards

| Concern | Standard |
| --- | --- |
| Public API protocol | GraphQL via WunderGraph; HTTP for queries/mutations; `graphql-transport-ws` WebSocket subprotocol for `Document.statusChanged` subscription |
| Internal control plane | gRPC with proto3 between router and resolvers; `.proto` files committed under each resolver unit |
| Sidecar → container hop | REST + JSON over `localhost`; uniform error-envelope shape (precise field set deferred to construction) |
| SQS message schema versioning | Every SQS message body carries an explicit `schemaVersion` field; backward-compatible additive evolution is the default |
| Idempotency keys | Required on every state-changing internal mutation; `createDocument` already uses one; `updateDocumentStatus` carries an idempotency key derived from `(executionId, toState, phase)`; the `idempotency-index` GSI on `docuploader-api-documents` enforces de-duplication |
| Trace / correlation header propagation | W3C Trace Context (`traceparent`, `tracestate`) on every internal hop (HTTP, gRPC, SQS message attributes, Step Functions task input). X-Ray header propagation is not required at MVP |
| Error envelope (non-GraphQL surfaces) | Uniform shape `{ "code", "message", "detail", "retryable", "extensions" }`; precise schema deferred to construction |
| Schema evolution / breaking change | Additive-only by default; deprecation window with metric-tracked usage; version pinning (`@deprecated` + sunset date) for any breaking change. Specific window length deferred |

### Data Patterns

- **Primary data store.** DynamoDB on-demand. Single-table design where applicable.
- **Access pattern.** All reads and writes are by primary key (and the explicit `idempotency-index` and `folderPath-index` GSIs). No scans. No complex queries.
- **No external cache.** Lambda reuses DynamoDB connections across warm invocations. JWT validation and Aspose licence material are cached in-Lambda (12-minute TTL where applicable).
- **No relational database.** If relational analytics become necessary, evaluate DynamoDB export to S3 + Athena before adding RDS.

### Logging Pattern

All log output is structured JSON, emitted via OpenTelemetry Logs over OTLP to the sandbox-resident Grafana Alloy collector. Human-readable console output is permitted only for local development.

#### Required resource attributes (set once per process)

`service.name`, `service.version`, `service.namespace`, `deployment.environment` (`sandbox`).

#### Required log record fields (every line)

`timestamp` (ISO 8601 with milliseconds), `level` (`debug | info | warn | error`), `logger`, `message`, `trace_id`, `span_id` (from W3C Trace Context).

#### Domain correlation IDs (required on any Document-scoped log)

`tenant_id`, `workspace_id`, `batch_id`, `document_id`, `execution_id` (Step Functions), `pipeline_stage`, `request_id`, `idempotency_key`, `user_id` (or `system:<lambda>` for service accounts).

#### Error fields (when `level >= error`)

`error.code`, `error.message`, `error.kind` (`transient | document-domain | infrastructure`), `error.retryable` (boolean), `error.cause_chain` (string array).

#### Free-form attributes

`attrs` map for unit-specific context (e.g., `chunk_index`, `aspose_render_ms`, `qpdf_pages_in`, `qpdf_pages_out`).

#### Redaction / never-log fields

Never log: presigned URLs (full or signature portion), OIDC tokens (raw, refresh, or any portion that looks like a JWT), raw API keys, KMS data keys, customer document content (bytes or extracted text), customer-supplied document metadata that may contain PII, AWS access keys, Secrets Manager secret values. Log only the *hash* of an idempotency key derived from sensitive material if the raw key would otherwise be sensitive.

#### Log level thresholds

- Default level is `info` for resolvers, the router, all Lambdas, and worker services.
- `warn` and `error` always emit.
- `debug` is gated by an env var per unit (`<unit>_LOG_LEVEL=debug`); enabled on demand.
- `trace`-level logs are reserved for performance profiling and are off by default.

### Observability Stack

| Signal | Standard |
| --- | --- |
| Logs | OpenTelemetry Logs over OTLP to Grafana Alloy → Grafana Cloud; retention governed by Grafana Cloud tenant configuration (managed externally) |
| Metrics | OpenTelemetry Metrics over OTLP. Histograms for latency; counters for throughput / error rates / per-stage events; gauges for queue depth and pod resource utilisation. Per-route, per-tenant, per-workspace dimensions where the cardinality budget allows |
| Traces | OpenTelemetry Traces over OTLP. W3C Trace Context propagation on every internal hop. One trace per `Document` from `UPLOADED` to terminal state, joined to child traces for fan-out (zip extraction, email body re-entry) |
| Dashboards-as-code | Grafana JSON committed in per-unit `observability/` directories (or in the relevant `platform-*` unit for cross-cutting dashboards) |
| Alert routing | Grafana Alerting → email / on-call channel (specific recipients deferred); PagerDuty integration is post-MVP |
| Correlation | Per-document trace correlation joins on `documentId`; per-execution joins on `executionId`; per-tenant rollups join on `tenantId` and `workspaceId`; idempotency keys (`idempotencyKey`) are correlation-bearing for internal mutation replays |
| Grafana credentials | ExternalSecret `grafanacloud-alloy-credentials` in the `grafana` namespace, syncing from Secrets Manager `/grafanacloud/alloy-credentials` |

### Naming Convention (binding)

- "Unified" appears only in prose and human-facing labels.
- "docuploader" is the only acceptable token in resource identifiers (S3 bucket names, DynamoDB table names, SQS queue names, IAM role names, EventBridge bus names, CloudWatch log groups, env vars, IaC names).
- Casing rules per entity follow `doc-uploader-design/api/appendices/naming-glossary.md` and `doc-uploader-design/pipeline/appendices/naming-glossary.md`.
- The two terms must never be mixed in either direction.

---

## Security Requirements

### Authentication and Authorisation

- **Public API authentication.** OIDC Client Credentials grant. Tokens are minted externally for MVP; the `PreTokenGenerationLambda` is deployed as a token-validation surface and will be re-pointed at a future Opus 2 IdP's pre-token-generation hook without code changes.
- **Custom claims.** `userID`, `workspaceID`, `tenantId` carried in the access token; injected by the issuer (external for MVP), validated by the `PreTokenGenerationLambda`.
- **Internal service-to-service.** GraphQL service-account JWT (stored in Secrets Manager as `GRAPHQL_INTERNAL_AUTH_SECRET_ARN`); IRSA-based AWS service identity for AWS access.
- **Authorisation model.** Tenancy is resolved at token-mint time from `docuploader-api-workspaces`. Caller-supplied `tenantId` is **never trusted**.

### Data Protection

| Concern | Standard |
| --- | --- |
| TLS minimum version | 1.2; TLS 1.3 preferred where supported. Existing sandbox infrastructure (ALB, ACM) governs the precise version; the project does not implement TLS termination itself |
| In-transit between Pods | Direct TCP/TLS via ALB or cluster-internal CoreDNS; no service mesh. Optional private-CA TLS on in-cluster gRPC |
| At-rest | Single-bucket + alias-based KMS keys (A27 override). Per-tenant KMS *aliases* bound to a shared key infrastructure; isolation enforced via KMS grant policies + prefix-scoped IAM. The `docuploader-api-audit-archive` bucket uses a separate operator-managed CMK |
| Key rotation cadence | 6-month default; configurable per workspace |
| Compliance framework | SOC 2 + ISO 27001 alignment (not enforcement); OWASP Top 10 (10:2021) controls mapped per category via the `security-baseline` extension |
| Data classification | Confidential / Restricted; precise per-field classification matrix deferred to construction |
| PII handling | PII may be **stored** in tenant data and audit events but **must not appear in logs** (redaction rules apply) |

### Input Validation at the API Edge

- GraphQL schema validation enforces type / shape / required-field constraints.
- Resolver-level validation enforces business rules (batch must be `OPEN`, workspace must be `ACTIVE`, status transitions must be legal, idempotency keys must match).
- Caller-supplied `tenantId` is never trusted; tenancy is resolved at token-mint time.
- Presigned-URL TTLs and content-type are server-set, not client-set.
- Filename / extension validation against `Workspace.pipelineConfig.allowedExtensions` before the document enters the pipeline.

### Secrets Management

- **Strong preference for IRSA-based service identity.** No static AWS credentials anywhere in the cluster.
- **When secrets must be stored.** AWS Secrets Manager, retrieved via the sandbox-resident **External Secrets Operator** and projected as Kubernetes Secrets.
- **Per-Lambda secret access.** IAM-role-scoped `secretsmanager:GetSecretValue`; in-Lambda 12-minute caching (per `api/07-authentication.md`).
- **Aspose commercial licence.** Stored as a Kubernetes Secret in the `aspose-converter` namespace, projected into the converter container at `/opt/aspose/license/Aspose.Total.Cpp.lic`. Procurement and renewal are operator-managed and out of scope.
- **Prohibited practices.** No secrets in source code, `pyproject.toml`, `package.json`, or `.env` files committed to Git. No secrets in Lambda environment variables (Secrets Manager at runtime). No AWS access keys in code.

### Dependency Security

- **Vulnerability scanning.** Implemented at the organisation level (outside this project's repository) and reused. This project does not own scanning configuration.
- **Open-source licence policy.**
  - **Acceptable.** MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, ISC, Zlib, Boost-1.0, 0BSD, PSF-2.0, MPL-2.0, EPL-2.0, CDDL-1.0, CDDL-1.1, GPL-2.0-with-classpath-exception, CC0-1.0, CC-BY-4.0.
  - **Case-by-case.** LGPL-2.1, LGPL-3.0, GPL-2.0, GPL-3.0, Unlicense, CC-BY-SA-4.0.
  - **Unacceptable.** AGPL-3.0, SSPL, JSON, WTFPL, Commons-Clause, BUSL-1.1, Elastic-2.0, CC-BY-NC-4.0.
- **CVE patch SLA.** Deferred — no project-level SLA declared at MVP; aligned with whatever the organisation's central security operations specify.
- **SBOM tooling.** Deferred — no project-level SBOM generation in MVP.
- **Lockfile integrity.** Lockfiles are committed; CI runs lockfile-strict installs (see Package and Environment Management).

### OWASP Top 10 (2021) Mapping

OWASP Top 10 controls are mapped per category by the `security-baseline` extension, which is **opted in (enforce all rules)** at MVP. Project-level controls are summarised below; per-unit specifics live with each unit's design.

| Category | Project-level control |
| --- | --- |
| A01 Broken Access Control | OIDC token validation in `pre-token-generation-lambda` and resolver middleware; tenancy resolved at token-mint time, never trusted from input; per-workspace KMS aliases + prefix-scoped IAM enforce data isolation; rate limiting via ALB / API Gateway analogue and per-resolver guards (specifics deferred to construction) |
| A02 Cryptographic Failures | TLS 1.2+ at the edge; SSE-KMS at rest with per-tenant aliases; audit-archive CMK separate from tenant CMKs; raw OIDC tokens / data keys / API keys never logged |
| A03 Injection | GraphQL schema + Pydantic / Zod / Go validators in resolvers; never concatenate user input into DynamoDB key conditions; expression / classification inputs validated via magic-byte detection (`file-type`); structlog/pino/slog escape special characters in log values |
| A04 Insecure Design | Idempotency keys on every state-changing internal mutation; the Two-Catch error pattern (per-service `DocumentProcessingError` slipsheet fallback; `States.ALL` failure to `HandleError` → `Failed`); chunked office conversion bounds peak RAM independently of input size |
| A05 Security Misconfiguration | All AWS infrastructure in Terraform; no manual console changes; ALB-managed TLS; BPA + `aws:SecureTransport=false` deny on all S3 buckets; Lambda configurations follow the design's per-Lambda memory / timeout / reserved-concurrency settings |
| A06 Vulnerable and Outdated Components | Dependency scanning is implemented at the organisation level and reused; lockfiles committed; lockfile-strict installs in CI |
| A07 Identification and Authentication Failures | OIDC validation only at MVP; future Opus 2 IdP slots into the `pre-token-generation-lambda` hook without code change; service-account JWT for internal calls; IRSA for AWS service identity |
| A08 Software and Data Integrity Failures | Lockfile integrity enforced; deployment artefacts built from clean lockfile-strict installs; Step Functions ASL is the single source of orchestration truth |
| A09 Security Logging and Monitoring Failures | Compliance-grade audit-event pipeline (SQS → `AuditEventStorage` Lambda → DynamoDB hot store + S3 Glacier IR cold store with Object Lock); always-on `audit-fallback` CloudWatch log group as an emergency outlet; Grafana for general logs/metrics/traces with W3C Trace Context across hops |
| A10 SSRF | Low risk for MVP. The pipeline does not make outbound HTTP requests based on user input. The only outbound network calls are to AWS services via the AWS SDK with hardcoded service endpoints. Any future feature that fetches a user-controlled URL must be reviewed and added to this matrix before launch |

---

## Testing Requirements

### Test Strategy Overview

A **three-tier minimum gate** applies to every deliverable. Before any unit (including chassis libraries and golden-path libraries) is considered complete, it must pass tests at **all three** of:

1. **Local** — developer machine, in-process.
2. **Local integration** — LocalStack + locally-spun dependencies.
3. **Deployed sandbox** — running against real AWS in `eu-west-1`.

| Test Type | Required | Coverage Target | Tooling |
| --- | --- | --- | --- |
| Unit | Yes | Sensible defaults: 80% line + 70% branch (refined post-MVP) | Per language (see below) |
| Property-based | Yes (per `property-based-testing` extension; opted in) | Preferred strategy for PDF / OCR / conversion / classification correctness | `hypothesis` (Python), `fast-check` (TypeScript), property tests in Go via `testing/quick` or hand-rolled, GoogleTest property patterns (C++) |
| Integration (LocalStack + in-process) | Yes | All public surfaces (GraphQL operations, gRPC RPCs, Lambda handlers) covered | Per language + LocalStack |
| Sandbox-deployed integration (real AWS) | Yes | All public surfaces validated against real AWS | Per language + real AWS in `eu-west-1` |
| Contract (gRPC proto, GraphQL schema) | Yes | All cross-unit boundaries | Schema diffing in CI |
| E2E (journey level) | Yes | The four MVP journeys against the sandbox | HTTP / WebSocket clients per language |
| Chaos / fault injection | Conditional | As needed for resiliency proofs | Per case |
| Load | Descoped for MVP | Linear-scalability evidence only; no numeric SLO targets at MVP | Steady-load injection per route |
| Accuracy / correctness suites for binary-fidelity routes | Descoped for MVP | Pre-production-deploy-only (out of scope at MVP) | n/a at MVP |

### AWS-Service Stubbing Policy

- **Local & local-integration tests.** Use **LocalStack** and language-native AWS-SDK mocks where LocalStack lacks coverage. The set of design-used services that need LocalStack coverage: S3, SQS, DynamoDB, EventBridge, Lambda, IAM (basic), Secrets Manager, Step Functions, KMS, SNS. **Textract and GuardDuty** are LocalStack-coverage gaps and must be mocked at the SDK boundary.
- **Sandbox-deployed tests.** Use **real AWS resources** in the sandbox account (no LocalStack). Textract and GuardDuty integration is exercised here.

### PDF / OCR / Conversion Strategy

- **Property-based preferred over golden-file.** Outputs are validated by *properties* (page count preserved, text extractable, structural seams respected, RAM bound holds, no orphaned XObjects, output is a valid PDF per `pikepdf`/`pdf-lib` parse) rather than byte-for-byte golden files.
- **Where golden-file tests are still useful** (e.g., pixel-stable slipsheet template), they live alongside the property-based suite.

### Test Corpus / Fixtures

- A canonical reference corpus is sourced and maintained outside this project.
- Per-unit unit-test and integration-test fixtures live under `units/<unit-id>/tests/fixtures/` and **must not** depend on cross-unit fixtures other than chassis / golden-path libraries.

### Test Reporting

All test runners across all languages must produce **Allure-format** test reports (e.g., via `allure-pytest`, `allure-vitest`, `go-allure`, `gtest-allure-adapter`).

### CI/CD Testing Gates

CI/CD pipeline implementation is **descoped from MVP** (deferred to a follow-on milestone). At MVP, each unit's CI is limited to the language's standard lint + unit tests + lockfile-strict install. Branch model, container registry policy beyond ECR existing, artefact storage, deploy strategy (blue/green/canary), per-environment promotion gating, build cache, post-deploy smoke tests, and auto-rollback are all post-MVP concerns.

---

## Extension Configuration (AI-DLC opt-ins)

| Extension | Opt-in choice | Rationale |
| --- | --- | --- |
| `security-baseline` (`extensions/security/baseline/security-baseline.opt-in.md`) | **Yes — enforce all rules** | Aligned with the per-workspace alias-based KMS isolation, audit-event compliance pipeline, OIDC token validation, and the SOC 2 / ISO 27001 alignment posture stated above |
| `property-based-testing` (`extensions/testing/property-based/property-based-testing.opt-in.md`) | **Yes — enforce for all units** | The PDF / OCR / conversion / classification correctness suites are best expressed as properties; property-based testing is the preferred strategy across all units |

---

## How This Document Feeds Into AI-DLC

| Section | AI-DLC Stage | How It Is Used |
| --- | --- | --- |
| Project Technical Summary | Workspace Detection | Greenfield classification; team and platform context |
| Programming Languages | Code Generation | Per-unit language assignment; binding |
| Package and Environment Management | Code Generation | Per-language tool, lockfile, and pinning rules |
| Frameworks and Libraries | Code Generation, NFR Design | Required / preferred / prohibited libraries |
| Cloud Environment | Infrastructure Design | Allow-list bounds the design space; disallow-list prevents drift |
| Repository Topology and Project Structure | Workflow Planning, Units Generation, Code Generation | Monorepo layout; per-unit scaffolding rules; binding 27-unit decomposition |
| Preferred Technologies and Patterns | Application Design, Functional Design, Code Generation | Architecture pattern; API design standards; data patterns; logging pattern; observability stack; naming convention |
| Security Requirements | NFR Requirements, NFR Design, Code Generation | Auth pattern; encryption rules; input validation; secrets handling; OWASP mapping |
| Testing Requirements | Code Generation, Build and Test | Three-tier gate; per-language tool stack; AWS stubbing policy; property-based preference; Allure reporting |
| Extension Configuration | Requirements Analysis | Pre-decided opt-ins skip the interactive opt-in cycle |
