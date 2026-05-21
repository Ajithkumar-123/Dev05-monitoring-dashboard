# Requirements Document: Unified Document Uploader (`docuploader`)

## Document Status

- **Stage**: Inception → Requirements Analysis
- **Depth**: Comprehensive (multi-tenant SaaS, SOC 2 / ISO 27001 alignment, 4 languages, 27-unit decomposition)
- **Project type**: Greenfield
- **Inputs ratified**: `aidlc-inputs/vision.md`, `aidlc-inputs/tech-environment.md`
- **Verification gate**: 42 questions answered in `requirement-verification-questions.md` — all 40 input-document-aligned positions confirmed (option A); Q2 (timeline) treated as "3-month stretch as working target, 6-month as hard ceiling, deliver sooner if possible".

---

## 1. Project Scope and Objectives

### 1.1 Mission

Deliver, to a single AWS sandbox in `eu-west-1`, a multi-tenant, cloud-native document ingestion and processing service exposed as a versioned GraphQL API and an embeddable React module. The service replaces per-product, monolithic document pipelines and becomes the default document-handling layer for every Opus 2 product and AI workflow.

### 1.2 MVP Objective

Ship the **entire designed scope** in a single sandbox release: 6 processing routes, 23 software units + 4 platform units, audit-event compliance pipeline, Grafana observability, OIDC token validation. Establish the baseline metric set. Obtain Product / Security / SRE / Legal sign-off.

### 1.3 Timeline

- **Working target**: deliver sooner than the 3-month stretch where practical.
- **Stretch ceiling**: 3 months from kick-off.
- **Hard external commitment**: 6 months from kick-off.
- Treat both 3-month and 6-month figures as **upper bounds**; the team's working target is to deliver in less time.

### 1.4 Out-of-scope (explicit)

- Host-application code beyond the embeddable React module
- OIDC IdP token issuance (token minting)
- Aspose.Total licence procurement / renewal
- Service mesh
- CI/CD pipeline implementation
- GuardDuty findings other than S3 Malware Protection
- CloudTrail / VPC Flow / DNS analysis pipelines
- Legacy uploader migration tooling
- Customer-facing audit surface
- Multi-region active-active deployment
- CloudWatch as primary audit destination
- Usage-based metering and customer billing
- Inline document preview / annotation in the React module
- Per-tenant audit-event sink configuration
- Test corpus management infrastructure
- Production-readiness deployment milestone
- Project-level dependency-vulnerability scanning, SBOM, CVE-patch SLAs

---

## 2. Functional Requirements

### FR-1 Document Ingestion and Lifecycle

| ID | Requirement |
| --- | --- |
| FR-1.1 | The system shall expose `createBatch`, `createDocument`, and presigned-URL minting via a single GraphQL resolver call. |
| FR-1.2 | The system shall accept direct-to-S3 uploads via presigned URLs to the single `docuploader-api-staging` bucket. |
| FR-1.3 | The system shall track per-document state through `UPLOADED` → `SCANNING` → `QUEUED` → `PROCESSING` (with per-stage `pipelineStage` values) → terminal state (`COMPLETED` or `FAILED`). |
| FR-1.4 | The system shall publish `Document.statusChanged` via WunderGraph WebSocket subscription (`graphql-transport-ws`) so the UI surfaces every state transition in real time. |
| FR-1.5 | The system shall materialise the per-document output set (searchable PDF, plain text, native artefacts, slipsheets) as `Document.outputs`. |
| FR-1.6 | The system shall require an idempotency key on every state-changing mutation (external and internal), enforced via the `idempotency-index` GSI on `docuploader-api-documents`. |

### FR-2 Multi-Route Document Processing

| ID | Requirement |
| --- | --- |
| FR-2.1 | The system shall support route `ocr-direct` for already-PDF inputs needing OCR and text-layer assembly. |
| FR-2.2 | The system shall support route `convert/office` via Aspose.Total-for-C++ chunked conversion + Python orchestrator sidecar + qpdf streaming merge. |
| FR-2.3 | The system shall support route `convert/html` via Gotenberg/Chromium + TypeScript sidecar. |
| FR-2.4 | The system shall support route `convert/image` via sharp + PDFKit (Node). |
| FR-2.5 | The system shall support route `convert/tiff` via sharp + PDFKit + geotiff.js for the image route; gdal-async for TIFF-to-COG pre-processing. |
| FR-2.6 | The system shall support route `email` for EML (Go `net/mail`, `mime/multipart`) and MSG (`mscfb` + `crtf`) with body-and-attachment fan-out. |
| FR-2.7 | The system shall support route `archive` for streaming ZIP extraction with per-entry fan-out. |
| FR-2.8 | The system shall support route `media` for audio/video conversion via FFmpeg/FFprobe. |
| FR-2.9 | The system shall provide a deterministic `slipsheet` fallback for unsupported and forced-slipsheet types. |
| FR-2.10 | The default forced-slipsheet list shall be `csv, ods`, configurable per workspace via `Workspace.pipelineConfig.forcedSlipsheetExtensions`. |
| FR-2.11 | All conversion workers shall be Guaranteed-QoS pods with bounded per-pod RAM independent of input file size (chunked office conversion, streaming PDF merge, ranged TIFF extraction, streaming archive extraction). |

### FR-3 Multi-Tenancy and Encryption Isolation

| ID | Requirement |
| --- | --- |
| FR-3.1 | The system shall use a single `docuploader-api-staging` bucket with prefix-scoped IAM and per-tenant KMS aliases bound to a customer-managed key (A27 override; per-tenant buckets eliminated). |
| FR-3.2 | Per-workspace `EncryptionConfig` and `pipelineConfig` shall be administered via the GraphQL `Workspace` schema. |
| FR-3.3 | Object retention on the staging bucket shall be TTL-driven via S3 Lifecycle, governed by `Workspace.retentionPolicy.inputRetentionDays` (default 7 days). |
| FR-3.4 | Tenant identity shall be resolved at token-mint time from `docuploader-api-workspaces`. Client-supplied `tenantId` shall **never** be trusted by any resolver, Lambda, or worker. |
| FR-3.5 | The `docuploader-api-audit-archive` bucket shall use a separate operator-managed CMK distinct from the per-tenant KMS infrastructure. |
| FR-3.6 | KMS key rotation cadence shall default to 6 months and be configurable per workspace. |

### FR-4 Audit and Compliance

| ID | Requirement |
| --- | --- |
| FR-4.1 | The WunderGraph audit-emission custom module shall capture every mutation. |
| FR-4.2 | Audit events shall flow: WunderGraph → SQS (`docuploader-api-audit-events`) → `AuditEventStorage` Lambda → DynamoDB hot store (`docuploader-api-audit-events`, 90-day TTL) + S3 Glacier IR cold store (`docuploader-api-audit-archive`, Object Lock Compliance, 7-year default retention). |
| FR-4.3 | The always-on `/aws/docuploader/api/audit-fallback` CloudWatch log group shall be provisioned as an emergency outlet only (used when SQS is unreachable). |
| FR-4.4 | The `/aws/docuploader/api/audit-security` CloudWatch log group shall be provisioned but gated `AUDIT_CLOUDWATCH_SECURITY_ENABLED=false` at MVP. |
| FR-4.5 | The `AuditEventStorage` Lambda shall use partial-batch failure semantics on the SQS event source mapping. |
| FR-4.6 | Audit access at MVP shall be operator-only; no customer-facing audit surface or GraphQL audit queries are exposed. |
| FR-4.7 | Cold-store object keys shall follow the deterministic key shape `audit/{tenantId}/{yyyy}/{MM}/{dd}/{eventId}.json`. |

### FR-5 Observability and Operations

| ID | Requirement |
| --- | --- |
| FR-5.1 | Every unit shall emit OpenTelemetry Logs, Metrics, and Traces over OTLP to the sandbox-resident Grafana Alloy collector. |
| FR-5.2 | W3C Trace Context (`traceparent`, `tracestate`) shall propagate on every internal hop: HTTP, gRPC, SQS message attributes, Step Functions task input. |
| FR-5.3 | One trace per `Document` shall span `UPLOADED` to terminal state and join to child traces for fan-out (ZIP extraction, email body re-entry). |
| FR-5.4 | Each unit shall ship dashboards-as-code (Grafana JSON) committed in `units/<unit-id>/observability/` (or in the relevant `platform-*` unit for cross-cutting dashboards). |
| FR-5.5 | Each Sev-1 alert defined in `units/<unit-id>/runbooks/` shall have a corresponding runbook. |

### FR-6 Authentication and Authorisation

| ID | Requirement |
| --- | --- |
| FR-6.1 | Public API authentication shall be OIDC Client Credentials grant with custom claims `userID`, `workspaceID`, `tenantId`. |
| FR-6.2 | Tokens shall be minted externally at MVP; `PreTokenGenerationLambda` shall validate inbound tokens and shall be replaceable by a future Opus 2 IdP's pre-token-generation hook without code changes. |
| FR-6.3 | Internal service-to-service authentication shall use a GraphQL service-account JWT stored in Secrets Manager as `GRAPHQL_INTERNAL_AUTH_SECRET_ARN`. |
| FR-6.4 | AWS service identity shall use IRSA. No static AWS credentials may exist in the cluster or in code. |
| FR-6.5 | Tokens lacking required claims or with invalid signatures shall be rejected with 401/403. |

### FR-7 API Surface and Schema

| ID | Requirement |
| --- | --- |
| FR-7.1 | The public API shall be a single GraphQL API fronted by WunderGraph. HTTP shall serve queries/mutations; `graphql-transport-ws` shall serve subscriptions. |
| FR-7.2 | Three resolvers (Workspace, Batch, Document) shall back the three DynamoDB tables and expose CRUD plus state-transition mutations. |
| FR-7.3 | Schema evolution shall be additive-only by default. Breaking changes require a deprecation window with metric-tracked usage and version pinning (`@deprecated` + sunset date). |
| FR-7.4 | Internal control-plane traffic shall use gRPC with proto3 between router and resolvers; `.proto` files committed under each resolver unit. |
| FR-7.5 | SQS message bodies shall carry an explicit `schemaVersion` field; evolution is additive-backward-compatible by default. |

---

## 3. Non-Functional Requirements

### NFR-1 Performance and Scalability

| ID | Requirement |
| --- | --- |
| NFR-1.1 | Throughput per route shall scale approximately linearly with replica count up to sandbox capacity (validated by load test under steady-state injection). |
| NFR-1.2 | Per-pod peak RAM shall not grow with input file size (validated by property-based tests on chunked office conversion, streaming PDF merge, ranged TIFF extraction, streaming ZIP extraction). |
| NFR-1.3 | Numeric SLO thresholds (latency p50/p95/p99, throughput floors, availability %, MTTR) are **deferred** to post-MVP. The MVP establishes the baseline; thresholds are set against observed data thereafter. |
| NFR-1.4 | Rate-limit guards shall exist on resolvers and the ALB / API surface. Specific numeric per-resolver and per-route rate limits are deferred to construction. |
| NFR-1.5 | Step Functions Standard 1-year execution limit is acknowledged and binding; no MVP route is expected to exceed it under realistic load. |

### NFR-2 Reliability

| ID | Requirement |
| --- | --- |
| NFR-2.1 | The Two-Catch error pattern shall be binding: per-service `DocumentProcessingError` routes to a slipsheet-fallback; `States.ALL` failure routes to `HandleError` and `Failed`. |
| NFR-2.2 | Two-Catch behaviour shall be evidenced via synthetic error-injection tests as part of the MVP success criteria. |
| NFR-2.3 | DLQ accumulation shall be zero in steady state across all `*-dlq` queues. |
| NFR-2.4 | Audit-event end-to-end delivery shall be 100% in steady state (no DLQ accumulation; synthetic probes confirm dual-sink writes). |
| NFR-2.5 | No batch-level retry and no inline error remediation in MVP; failures are re-uploaded. |

### NFR-3 Security and Compliance

| ID | Requirement |
| --- | --- |
| NFR-3.1 | Compliance posture is **alignment** with SOC 2 and ISO 27001 (not formal certification) and OWASP Top 10 (2021) controls mapped per category via the `security-baseline` extension. |
| NFR-3.2 | TLS minimum version shall be 1.2 at the edge (ALB / ACM); TLS 1.3 preferred where supported. The project does not implement TLS termination itself. |
| NFR-3.3 | All S3 buckets shall have BPA flags on and a `aws:SecureTransport=false` deny policy; default SSE-KMS. |
| NFR-3.4 | Secrets shall be retrieved at runtime via External Secrets Operator from AWS Secrets Manager. No secrets in source code, `pyproject.toml`, `package.json`, `.env` files, or Lambda environment variables. |
| NFR-3.5 | Per-Lambda secret access shall use IAM-role-scoped `secretsmanager:GetSecretValue` with 12-minute in-Lambda caching. |
| NFR-3.6 | PII may be stored in tenant data and audit events but **must not** appear in logs. The following are never to be logged: presigned URLs (full or signature portion), OIDC tokens (raw or any portion), data keys, API keys, customer document content, AWS access keys, Secrets Manager secret values. Violations are Sev-1 incidents. |
| NFR-3.7 | Open-source dependency licences shall fall on the acceptable list (MIT/BSD/Apache-2.0/ISC and similar). AGPL-3.0, SSPL, BUSL-1.1, Elastic-2.0, CC-BY-NC-4.0 are unacceptable. |
| NFR-3.8 | Vulnerability scanning, SBOM, and CVE-patch SLA are organisation-owned and not part of this project's MVP deliverables. |

### NFR-4 Maintainability and Testability

| ID | Requirement |
| --- | --- |
| NFR-4.1 | Every unit (including chassis and golden-path libraries) shall pass a three-tier test gate before being considered complete: (1) Local in-process; (2) Local integration via LocalStack; (3) Deployed sandbox against real AWS in `eu-west-1`. |
| NFR-4.2 | Property-based testing shall be enforced for all units per the `property-based-testing` extension (hypothesis, fast-check, Go property tests, GoogleTest property patterns). |
| NFR-4.3 | Test reports across all four languages shall be Allure-format (`allure-pytest`, `allure-vitest`, `go-allure`, `gtest-allure-adapter`). |
| NFR-4.4 | Sensible-default unit-test coverage: ≥80% line and ≥70% branch (refined post-MVP). |
| NFR-4.5 | Naming convention is binding: `docuploader` is the only acceptable token in resource identifiers (S3, DynamoDB, SQS, IAM, EventBridge, log groups, env vars, IaC names); "Unified" appears only in prose and human-facing labels. Violations are blocking. |
| NFR-4.6 | Cross-unit code sharing through root-level shared modules is prohibited. Shared code is exposed by the producing unit as a versioned package consumed via the language-specific package manager. |

### NFR-5 Observability

| ID | Requirement |
| --- | --- |
| NFR-5.1 | All log output shall be structured JSON over OTLP to Grafana Alloy. Human-readable console output is permitted only for local development. |
| NFR-5.2 | Required resource attributes (set once per process): `service.name`, `service.version`, `service.namespace`, `deployment.environment` (`sandbox`). |
| NFR-5.3 | Required log fields (every line): `timestamp` (ISO 8601 ms), `level`, `logger`, `message`, `trace_id`, `span_id`. |
| NFR-5.4 | Required domain correlation IDs on any Document-scoped log: `tenant_id`, `workspace_id`, `batch_id`, `document_id`, `execution_id`, `pipeline_stage`, `request_id`, `idempotency_key`, `user_id` (or `system:<lambda>`). |
| NFR-5.5 | Default log level shall be `info` for resolvers, the router, all Lambdas, and worker services. `debug` is gated per-unit env var; `trace` reserved for performance profiling, off by default. |

### NFR-6 Deployment Posture (MVP)

| ID | Requirement |
| --- | --- |
| NFR-6.1 | Deployment for MVP shall be push-based via CLI tooling (`terraform apply`, `kubectl apply`, `helm upgrade`). ArgoCD is bypassed; CrossPlane is not used. |
| NFR-6.2 | AWS resource IaC shall be Terraform only. No CDK, Pulumi, CloudFormation, or CrossPlane. |
| NFR-6.3 | Kubernetes manifests shall be Helm and Kustomize (Helm for parameterisable workloads; Kustomize overlays for environment-specific patching). |
| NFR-6.4 | Terraform state shall use S3 with native S3 locking (Terraform 1.10+). No DynamoDB lock table. |
| NFR-6.5 | CI/CD pipeline implementation is descoped from MVP. Each unit's CI is limited to language-standard lint + unit tests + lockfile-strict install. |

---

## 4. Constraints

### 4.1 Technology Constraints

- **Single sandbox AWS account** in `eu-west-1`. No DR/failover region. No per-environment or per-tenant accounts at MVP.
- **Languages binding by unit**: Go (latest stable, 1.23+), Python (latest stable, 3.13+), TypeScript / Node 22 LTS, C++20. No additional languages permitted without an explicit inception rerun.
- **Package managers binding by language**: Go modules; uv (Python — `pip`, `poetry`, `pipenv`, `conda` prohibited); pnpm (TypeScript — `npm`, `yarn` lockfiles prohibited); CMake + Conan manifest-mode (C++).
- **No service mesh.** Direct TCP/TLS via ALB / CoreDNS; optional private-CA TLS on in-cluster gRPC.
- **Pre-existing sandbox components are integrate-only.** ArgoCD, Istio, ALB Controller, External Secrets Operator, Grafana Alloy, Kyverno, KEDA, Metrics Server, Karpenter, Cluster Autoscaler, CrossPlane must not be modified or replaced by this project.
- **AWS service allow-list bounds the design space.** New services require a project-level PR-note + tech-lead review + a `tech-environment.md` update.

### 4.2 Decomposition Constraint

- The inception units-generation stage emits **27 units total**: 23 software units + 4 platform units. Deviations require an inception rerun.

### 4.3 Organisational Constraints

- **Team**: 6 senior engineers; each competent in at least two of {Go, Python, TypeScript, C++, K8s, AWS, GraphQL}. No skill backfill required.
- **Sign-off authorities for MVP go-live (all blocking)**: Product, Security, SRE, Legal.
- **Aspose.Total licence procurement / renewal** is operator-managed; not an engineering deliverable.
- **Reference corpus** is sourced and maintained outside this project; the project consumes it but does not own corpus management.

---

## 5. Assumptions

| ID | Assumption | Risk if wrong | Mitigation |
| --- | --- | --- | --- |
| A1 | Six senior engineers covering the language and platform mix can deliver the full designed scope in 3–6 months. | 6-month commitment slips. | 27-unit decomposition (23 software + 4 platform) parallelises construction. |
| A2 | Sandbox capacity in `eu-west-1` is sufficient to evidence linear horizontal scalability per route. | Linear-scalability success criterion cannot be validated at MVP. | Steady-load injection at varying replica counts; per-route reporting; document cut-off explicitly if sandbox capacity is the bound. |
| A3 | External token minting is acceptable for MVP and the future Opus 2 IdP can be slotted in without code changes. | Auth integration churns at IdP-selection time. | `PreTokenGenerationLambda` is implemented as a validation surface re-pointable at the chosen IdP's pre-token-generation hook. |
| A4 | The single-bucket + KMS-alias tenant-isolation model meets compliance review without per-tenant buckets. | Compliance review demands per-tenant buckets. | Document the KMS-grant + IAM-prefix isolation model up front; review with Security before construction reaches `platform-data`. |
| A5 | Aspose.Total-for-C++-based chunked office conversion delivers the RAM bound and throughput the design assumes under realistic load. | Office route does not meet the per-pod memory budget. | Property-based tests assert the RAM bound; load tests evidence the bound at scale; slipsheet fallback ensures no document is silently dropped. |

---

## 6. Success Criteria (MVP — Functional Pass/Fail; Numeric Thresholds Deferred)

1. Reference-corpus regression green across all six routes (PDF, DOCX/DOC/RTF/XLSX/PPTX/CSV/ODF, HTML, EML/MSG, ZIP, image/TIFF, audio/video, malformed/corrupt fixtures) — each item produces the expected output set or expected slipsheet.
2. Linear horizontal scalability evidenced — throughput per route scales approximately linearly with replica count up to sandbox capacity; no per-pod memory growth with input file size. **Hard pass/fail gate.**
3. Per-tenant isolation evidenced — uploads to `Workspace`-A not visible from `Workspace`-B at the API layer, S3 prefix layer, or KMS layer (single-bucket + alias model).
4. Audit-event delivery proven — synthetic mutation traffic produces matching records in DynamoDB hot store and S3 Glacier IR cold store; no DLQ accumulation.
5. WebSocket subscription proven — a `Document.statusChanged` subscriber receives every state transition for a watched document, including terminal state.
6. Token validation proven — externally-minted tokens with required custom claims are accepted; tokens lacking required claims or with invalid signatures are rejected with 401/403.
7. Forced-slipsheet behaviour proven — documents matching the configurable forced-slipsheet list (default `csv, ods`) bypass conversion and produce a slipsheet output with `nativeTrigger=SLIPSHEET`.
8. Two-Catch error pattern proven — synthetic per-service `DocumentProcessingError` injections produce slipsheet-route fallback; synthetic `States.ALL` failures route to `HandleError` and `Failed`.
9. Security review complete — no Sev-1 findings against SOC 2 / ISO 27001 control families relevant to MVP scope; OWASP Top 10 (2021) controls mapped via `security-baseline` extension.
10. Stakeholder sign-off recorded in writing — Product, Security, SRE, Legal.

---

## 7. Extension Configuration (AI-DLC Opt-ins)

| Extension | Opt-in choice |
| --- | --- |
| `security-baseline` | **Yes — enforce all rules** as blocking constraints |
| `property-based-testing` | **Yes — enforce for all units** as blocking constraints |

---

## 8. Risks and Open Questions

A formal risks register and open-questions list are **deferred** out of inception per ratified position; downstream stages produce them at construction kick-off.

---

## 9. Traceability

Every requirement in this document is traceable to a position in `aidlc-inputs/vision.md` or `aidlc-inputs/tech-environment.md`. The 42 verification questions in `requirement-verification-questions.md` are the ratification record; this document supersedes them as the authoritative requirements artefact for downstream Inception stages.
