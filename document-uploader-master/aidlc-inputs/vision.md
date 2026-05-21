# Vision Document: Unified Document Uploader

## Executive Summary

The Unified document uploader is a multi-tenant, cloud-native document ingestion and processing service that gives every product in the Opus 2 portfolio a single, scalable surface for accepting, normalising, and observing customer documents. It replaces the per-product, monolithic pipelines that today block AI feature development, fragment the customer experience across products, and impose high cognitive load on engineers attempting to mature handling of the long tail of real-world legal documents. The expected outcome is a platform-grade service — exposed via a versioned GraphQL API and an embeddable React module — that all Opus 2 products and emerging AI use cases (vectorisation, retrieval, summarisation, agentic workflows) consume uniformly, delivered to a sandbox environment within a 3-month internal stretch / 6-month hard external commitment.

---

## Business Context

### Problem Statement

Opus 2's product portfolio currently relies on per-product document pipelines that were not designed to scale across the multitenanted footprint the business now operates in. Each pipeline is monolithic, opaque, and product-specific. The consequences are concrete and recurring:

- **Scalability ceiling.** Existing per-product pipelines are not architected to process documents efficiently at scale; throughput is bound by monolithic, per-product implementations that cannot scale horizontally on the long tail of real-world client document workloads.
- **Black-box opacity.** The current pipelines behave as black boxes to the engineering organisation. They cannot be matured easily to handle the long tail of real-world client documents — non-standard formats, third-party-application output, corruption, password-protection, malformed metadata.
- **High cognitive load and slow velocity.** The monolithic design imposes high cognitive load on contributing engineers and inflates lead time for any document-feature enhancement. Design changes propagate slowly across the product teams that depend on them.
- **No reuse.** Document handling is buried inside individual products. New products in the portfolio cannot consume an existing pipeline. The company's emerging AI use cases (vectorisation, semantic search, summarisation, agentic workflows over case files) require a uniform document surface that none of the existing pipelines provides.
- **Late, product-specific error attribution.** Errors surface late and in product-specific ways, making root-cause analysis expensive and inconsistent across teams.

### Business Drivers

- **Competitive parity in AI.** Competitors are introducing AI-enhanced, document-driven business workflows at pace. Without a platform-grade document service, Opus 2 cannot ship comparable AI features over its own customer data.
- **Portfolio modernisation.** Opus 2 is moving its portfolio to a domain-oriented, modular, composable platform-services model so customers can move fluidly between products. A shared document ingestion service is a foundational capability for that model.
- **Customer-experience consistency.** Customers operating across more than one Opus 2 product today see inconsistent document handling. A single intake and processing service standardises behaviour, status surfacing, and audit posture across products.
- **Engineering velocity.** Consolidating document handling into one service unlocks engineering velocity on document features and removes an entire class of duplicated, divergent investment.

### Target Users and Stakeholders

| User Type | Description | Primary Need |
| --- | --- | --- |
| Opus 2 application developers (AI and product teams) | Engineers building new AI capabilities (vectorisation, retrieval, summarisation, agentic workflows) and existing product enhancements that need uniform access to processed document data | A stable, versioned, well-documented GraphQL API and React module that they can integrate without re-implementing document handling |
| Opus 2 client-support / hearings-operations teams | Internal staff who manage document uploads before, during, and after court hearings and advise customers on upload, OCR, and conversion quotas | Per-workspace `pipelineConfig` controls and clear visibility of `Document.status` / `Document.pipelineStage` so they can manage live hearings |
| Customers (legal end users) | Legal practitioners uploading documents to the Opus 2 cases platform to manage legal work | Reliable upload of arbitrary-size, mixed-format submissions with predictable, observable processing outcomes and per-document status feedback |
| Tenant / workspace administrators | Internal Opus 2 platform admins (acting on behalf of a customer tenant) who configure a `Workspace`, its `pipelineConfig`, retention policy, and encryption settings | A small, clear set of knobs that map to compliance and operational requirements without exposing internal pipeline mechanics |
| Operations / SRE | Staff responsible for uptime, autoscaling, and incident response so customers meet hard external deadlines (e.g., court-submission cut-offs) | Actionable observability, predictable autoscaling behaviour, and runbooks for every Sev-1 alert |
| Security and compliance reviewers | Staff verifying tenant data isolation, encryption posture, and audit completeness for SOC 2 / ISO 27001 alignment | An immutable, queryable audit-event store and a documented control mapping |
| Finance | Stakeholders responsible for usage-based cost attribution to tenants (pipeline runs, OCR pages, conversion minutes, storage) | Per-tenant, per-pipeline-stage usage signals exported from the platform's metering surface (counters are emitted at MVP; metering pipeline is post-MVP) |

### Business Constraints

- **Budget.** Not a binding constraint for inception purposes; deferred from scope.
- **Timeline.** Internal stretch goal: approximately 3 months. Hard external commitment: 6 months from project kick-off to sandbox delivery.
- **Team.** Six senior engineers with mixed specialisation covering all in-scope languages (Go, Python, TypeScript, C++) and platforms (AWS, EKS, GraphQL). Each engineer is competent in at least two of these areas. No skill backfill is required.
- **Organisational platform reuse.** The system must reuse the organisation's existing platform stack: pre-provisioned AWS sandbox account, EKS cluster, Grafana Cloud observability backend (via Grafana Alloy), External Secrets Operator, IAM, and ACM/ALB. No greenfield platform; no service mesh.
- **Pricing / metering.** Usage-based metering and customer-facing billing are not required for MVP delivery. The design exposes the underlying counters so a metering pipeline can be added later as a post-MVP follow-on.

### Success Metrics

This is a baseline-establishing release. The MVP is the company's first scalable document pipeline, so initial-release measurements **define the baseline** against which all future improvements are judged. Numeric thresholds are deliberately **not** committed pre-launch; the table below names the metric set and measurement method, with target state qualified as "baseline established post-MVP".

| Metric | Current State | Target State (12 months post-MVP) | Measurement Method |
| --- | --- | --- | --- |
| Documents ingested per minute and per day, per route and per tenant | Not measured (per-product, non-comparable) | Baseline established post-MVP; trend monotone non-decreasing | `Notify_<X>` SQS state-change events drained by `UpdateDocumentState`, exported to Grafana Cloud via OTLP |
| End-to-end processing latency (p50 / p95 / p99) per route, from `UPLOADED` to terminal state | Not measured | Baseline established post-MVP; route-specific targets set after baseline | API `Document` audit timestamps; OTLP histograms |
| Per-stage latency (p50 / p95) per `pipelineStage` | Not measured | Baseline established post-MVP | ASL-emitted state-change events |
| Output quality: % of documents producing a non-slipsheet output set | Not measured | Baseline established post-MVP; trend non-decreasing | Per-route pipeline metrics; `nativeTrigger != SLIPSHEET` |
| Per-route `FAILED` rate and slipsheet-fallback rate | Not measured | Baseline established post-MVP | Per-route pipeline metrics |
| Audit-event end-to-end delivery success | N/A (no shared audit feed exists) | 100% (no DLQ accumulation in steady state) | Synthetic mutation probes; comparison of WunderGraph audit emissions to DynamoDB hot store and S3 Glacier IR cold store records |
| Malware-scan outcome distribution | N/A | Baseline established post-MVP | GuardDuty `GuardDutyMalwareScanStatus` counters |
| Deduplication efficiency (% of submissions hitting existing SHA-256 in `docuploader-content-hashes`) | N/A | Baseline established post-MVP | Hash-table hit counter |
| Per-pod CPU / memory utilisation against Guaranteed-QoS budget | N/A | Stays within budget under steady-state and peak | OTLP metrics from each unit |
| KEDA-driven scale-out / scale-in events and time-to-scale per service | N/A | Baseline established post-MVP | KEDA HPA events; OTLP metrics |
| SQS queue depth and oldest-message-age per worker queue (12 worker queues) | N/A | Baseline established post-MVP; oldest-message-age monotone bounded under steady state | CloudWatch SQS metrics → Grafana via OTLP |
| Step Functions execution start-to-completion duration distribution | N/A | Baseline established post-MVP | Step Functions execution history |
| Linear-scalability evidence: throughput vs replicas per route | N/A | Approximately linear up to sandbox capacity | Steady-load injection; per-replica throughput curves |
| Service availability per WunderGraph router and per worker | N/A | Baseline established post-MVP | Health-probe up/down series |
| MTTR for Sev-1 incidents | N/A | Baseline established post-MVP | Incident management records |
| DLQ accumulation rate (`*-dlq` queues) | N/A | Zero in steady state | CloudWatch SQS metrics |

---

## Full Scope Vision

### Product Vision Statement

The Unified document uploader becomes the **default document-handling layer** for every Opus 2 product and AI workflow — the way Stripe became the default for payments — by providing a single, scalable, observable, multi-tenant ingestion and processing service consumed via a versioned GraphQL API and an embeddable React module, replacing per-product pipelines and unblocking the AI roadmap.

### Feature Areas

#### Feature Area 1: Document Ingestion and Lifecycle

- **Description.** Multi-tenant document ingestion with per-tenant isolation, batch and per-document state tracking, and observable lifecycle from upload through processing to terminal state.
- **Key capabilities.**
  - Embeddable React module fronting the GraphQL API for upload UX inside host Opus 2 web applications.
  - GraphQL `createBatch`, `createDocument`, and presigned-URL minting that lets a host application initiate uploads via a single resolver call.
  - WunderGraph-mediated `Document.statusChanged` WebSocket subscription so the UI surfaces status transitions in real time.
  - Per-document terminal state and full output set (searchable PDF, plain text, native artefacts, slipsheets) materialised as `Document.outputs`.
  - Idempotent mutations on every state-changing call, including internal mutations from in-pipeline Lambdas and resolvers.
- **User value.** Host applications integrate one module and one API instead of building bespoke upload, scan, status, and output surfaces per product.

#### Feature Area 2: Multi-Route Document Processing

- **Description.** Six processing routes covering the long tail of real-world legal documents, each backed by an independently-scaling EKS worker plus the Step Functions state machine.
- **Key capabilities.**
  - **`ocr-direct`** for already-PDF inputs that need OCR and text-layer assembly.
  - **`convert`** with four sub-categories — **office** (Aspose.Total-for-C++ chunked conversion + qpdf streaming merge), **html** (Gotenberg/Chromium), **image** (sharp + PDFKit), **tiff** (TIFF-to-COG via gdal-async + ranged extraction).
  - **`email`** for EML and MSG with body-and-attachment fan-out (Go `net/mail`, `mime/multipart`, `mscfb`, `crtf`).
  - **`archive`** for ZIP extraction and per-entry fan-out.
  - **`media`** for audio/video conversion via FFmpeg.
  - **`slipsheet`** as a deterministic fallback for unsupported or forced-slipsheet types (default `csv, ods`).
- **User value.** A uniform, predictable processing contract across the formats Opus 2 customers actually submit, including malformed and exotic inputs.

#### Feature Area 3: Multi-Tenancy and Encryption Isolation

- **Description.** Per-tenant logical isolation across storage, encryption, and access without per-tenant infrastructure proliferation.
- **Key capabilities.**
  - Single staging bucket (`docuploader-api-staging`) with prefix-scoped IAM and per-tenant KMS aliases bound to a customer-managed key.
  - Per-workspace `EncryptionConfig` and `pipelineConfig` administered via the GraphQL `Workspace` schema.
  - TTL-driven object retention governed by `Workspace.retentionPolicy.inputRetentionDays` (default 7 days).
  - Tenant identity resolved at token-mint time from `docuploader-api-workspaces`; client-supplied `tenantId` is never trusted.
- **User value.** Customers and security reviewers get strong logical isolation guarantees with no per-tenant infrastructure operational tax.

#### Feature Area 4: Audit and Compliance

- **Description.** Operator-owned, tamper-evident audit-event pipeline supporting SOC 2 / ISO 27001 alignment.
- **Key capabilities.**
  - WunderGraph audit-emission custom module that captures every mutation.
  - SQS → `AuditEventStorage` Lambda → DynamoDB hot store (90-day TTL) for queryable recent events.
  - S3 Glacier IR cold store with Object Lock Compliance (7-year default retention) for long-term tamper-evident archival.
  - Always-on `audit-fallback` CloudWatch log group as an emergency outlet when SQS is unreachable.
  - Dormant `audit-security` CloudWatch log group reserved post-MVP behind `AUDIT_CLOUDWATCH_SECURITY_ENABLED=false`.
- **User value.** Compliance reviewers get a single, immutable, queryable record of every workspace mutation, traceable to the originating actor and request.

#### Feature Area 5: Observability and Operations

- **Description.** Uniform observability across every unit, with per-document trace correlation that unifies the API tier and the pipeline tier.
- **Key capabilities.**
  - Grafana via Grafana Alloy OTLP endpoint as the canonical aggregator for logs, metrics, and traces.
  - W3C Trace Context propagation on every internal hop (HTTP, gRPC, SQS message attributes, Step Functions task input).
  - Structured JSON log format with a uniform correlation field set across all units.
  - One trace per `Document` from `UPLOADED` to terminal state, joined to child traces for fan-out (zip extraction, email re-entry).
  - Per-unit dashboards-as-code committed alongside the unit's source.
  - Runbooks for every Sev-1 alert.
- **User value.** Operators can answer "what happened to this document, end-to-end?" with one trace ID; SRE can scale, alert, and remediate from a single observability surface.

#### Feature Area 6: Authentication and Authorisation

- **Description.** OIDC-based authentication compatible with a future Opus 2 identity provider, with token validation and custom-claim handling at MVP.
- **Key capabilities.**
  - OIDC Client Credentials grant with custom claims (`userID`, `workspaceID`, `tenantId`).
  - Pre-Token Generation Lambda deployed as a token-validation surface, ready to be re-pointed at a future IdP's pre-token-generation hook without code changes.
  - GraphQL service-account JWT for internal service-to-service calls, stored in Secrets Manager.
  - IRSA-based service identity for AWS access, with no static AWS credentials anywhere in the cluster.
- **User value.** Host applications get a forward-compatible authentication contract that survives the eventual selection of a single Opus 2 IdP.

#### Feature Area 7: API Surface and Schema

- **Description.** A single GraphQL API as the integration surface for every Opus 2 product, with schema, error, and lifecycle contracts that span queries, mutations, and subscriptions.
- **Key capabilities.**
  - Public GraphQL via WunderGraph; HTTP for queries/mutations and `graphql-transport-ws` WebSocket for subscriptions.
  - Three resolvers — Workspace, Batch, Document — each backing one DynamoDB table and exposing CRUD plus state-transition mutations.
  - Idempotency-key handling on every state-changing mutation, enforced by a DynamoDB GSI on the documents table.
  - Versioned schema with additive-only evolution as the default policy.
- **User value.** Product teams integrate against one schema and one transport rather than against a collection of REST shapes that drift per product.

### Integration Points

- **AWS Cognito** — OIDC token validation (token issuance external for MVP; future Opus 2 IdP replaces this).
- **AWS Step Functions (Standard)** — pipeline orchestration (21-state machine with 14 fire-and-forget `Notify_<X>` interstitials).
- **AWS Textract** — sync and async OCR.
- **AWS GuardDuty Malware Protection for S3** — pre-pipeline malware scan.
- **AWS Secrets Manager** (via the sandbox-resident External Secrets Operator) — JWT secret, Aspose licence, future tenant-scoped secrets.
- **Grafana Cloud (via Grafana Alloy OTLP)** — logs, metrics, traces aggregation.
- **Aspose.Total for C++ 26.x** — Office conversion (commercial licence; operator-managed).
- **Gotenberg 8.x / Chromium** — HTML conversion.
- **Host Opus 2 web applications** — embed the React module and call the GraphQL API.

### User Journeys (Full Vision)

#### Journey 1: An Opus 2 product team integrates the React module + GraphQL API

1. Product engineer reads the Unified API reference and the React-module integration guide.
2. They add the module to their host application, wire an OIDC token source, and point the module at the GraphQL endpoint.
3. The host application's existing user-management surfaces the user identity; the module handles upload UX, status surfacing, and output retrieval.
4. The team subscribes to `Document.statusChanged` for documents the user is watching, surfacing per-stage progress in the host UI.
5. The team integrates the AI workflow it was blocked on (e.g., document vectorisation post-OCR) by reading processed outputs from `Document.outputs`.

**Outcome.** A new product capability that previously required a per-product pipeline ships in days, not quarters.

#### Journey 2: A customer uploads a mixed-format submission ahead of a hearing

1. Authenticated customer opens a workspace in the host application.
2. They drop a mixed-format set of documents (PDF, DOCX, XLSX, EML with attachments, ZIP, TIFF) into the React module.
3. Each document is uploaded directly to S3 via a presigned URL, scanned by GuardDuty, then routed through the appropriate pipeline route.
4. The module renders a per-document progress grid with per-stage status; child documents (zip entries, email attachments) appear inline.
5. On completion, the customer downloads the searchable-PDF and plain-text outputs to attach to their hearing pack.

**Outcome.** Customers preparing for a hearing get a single, predictable upload surface that handles the realistic mix of document types they actually submit.

#### Journey 3: A compliance reviewer audits a workspace

1. Reviewer is granted operator-only read access to the audit-event hot store and Glacier IR cold store.
2. For events within the 90-day TTL window, they query the `docuploader-api-audit-events` DynamoDB table by `tenantId` / `workspaceID` and time range.
3. For older events, they fetch the deterministic key `audit/{tenantId}/{yyyy}/{MM}/{dd}/{eventId}.json` from the `docuploader-api-audit-archive` Glacier IR bucket.
4. They cross-reference mutation events against the `Document` lifecycle and confirm every mutation has a corresponding audit record.

**Outcome.** SOC 2 / ISO 27001 alignment is evidenced from a single, tamper-evident audit feed shared by every product.

#### Journey 4: An SRE diagnoses a slow document

1. SRE receives a Sev-3 alert for elevated p95 latency on the `convert/office` route.
2. They open the per-route Grafana dashboard, identify the affected pod replica set, and pull the trace for one slow document by `documentId`.
3. The trace shows the orchestrator-sidecar → Aspose-container hop spending unusual time on a single chunk.
4. They drill into structured logs filtered by `trace_id`, find the slow chunk, and confirm a malformed embedded font.
5. They follow the runbook for "office-conversion slow chunk", capture the fixture into the regression corpus, and close the alert.

**Outcome.** Every document is diagnosable end-to-end from one trace.

### Scalability and Growth

- **Horizontal scalability is the load-bearing property.** Every worker is a Guaranteed-QoS pod whose RAM budget is bounded irrespective of input file size (chunked office conversion, streaming PDF merge, ranged TIFF extraction, streaming archive extraction). Throughput scales with replica count, driven by KEDA on per-queue depth.
- **Tenant growth.** The single-bucket + KMS-alias model scales with tenant count without proliferating buckets or per-tenant infrastructure.
- **Volume growth.** SQS, Step Functions, DynamoDB on-demand, and EKS with KEDA + Karpenter form a stack whose scaling characteristics are well understood and bounded only by sandbox capacity at MVP.
- **Geographic expansion.** MVP runs in `eu-west-1` only; multi-region active-active is post-MVP and explicitly out of scope here.

### Long-Term Roadmap

| Phase | Focus | Timeframe |
| --- | --- | --- |
| MVP | Full design scope shipped to sandbox in a single delivery: all six routes, all 23 software units + 4 platform units, audit-event compliance pipeline, Grafana observability, OIDC token validation | 3-month stretch / 6-month hard target |
| Post-MVP follow-on milestones | CI/CD pipeline implementation; a future Opus 2 IdP that replaces external token issuance; usage-based metering and billing; security-scanning automation under project ownership; production-readiness deployment milestone (fidelity testing, multi-region, WAF, etc.) | Post-MVP |

---

## MVP Scope

### MVP Objective

Deliver the **entire designed scope** of the Unified document uploader to a single sandbox environment in `eu-west-1` within a 3-month internal stretch / 6-month hard external commitment, establish the baseline metric set against which all subsequent improvements are measured, and obtain Product / Security / SRE / Legal sign-off on the live sandbox release.

### MVP Success Criteria

This is a baseline-establishing release. Criteria are functional pass/fail; numeric SLO thresholds are deferred to post-MVP per Success Metrics.

- [ ] Reference-corpus regression green — a curated mixed-format corpus (PDF, DOCX/DOC/RTF/XLSX/PPTX/CSV/ODF, HTML, EML/MSG, ZIP, image/TIFF, audio/video, malformed/corrupt fixtures) processes end-to-end across all six routes, producing the expected output set or expected slipsheet for each item.
- [ ] Linear horizontal scalability evidenced — a load test demonstrates that throughput per route scales approximately linearly with replica count up to sandbox capacity, with no per-pod memory growth as input file size increases (validates streaming/chunking properties).
- [ ] Per-tenant isolation evidenced — uploads to `Workspace`-A are not visible from `Workspace`-B at the API layer, the S3 prefix layer, or the KMS layer (under the single-bucket + KMS-alias model).
- [ ] Audit-event delivery proven — synthetic mutation traffic produces matching records in both the DynamoDB hot store and the S3 Glacier IR cold store with no DLQ accumulation.
- [ ] WebSocket subscription proven — a `Document.statusChanged` subscriber receives every state transition for a watched document during a real upload, including the terminal state.
- [ ] Token validation proven — externally-minted tokens carrying the required custom claims are accepted; tokens lacking required claims or with invalid signatures are rejected with 401/403.
- [ ] Forced-slipsheet behaviour proven — documents matching the configurable forced-slipsheet list (default `csv, ods`) bypass conversion and produce a slipsheet output with `nativeTrigger=SLIPSHEET`.
- [ ] Two-Catch error pattern proven — synthetic per-service `DocumentProcessingError` injections produce a slipsheet-route fallback; synthetic `States.ALL` failures route to `HandleError` and `Failed`.
- [ ] Security review complete — a documented security review against SOC 2 / ISO 27001 control families relevant to MVP scope returns no Sev-1 findings; OWASP Top 10 (10:2021) controls are mapped per category in the security baseline extension.
- [ ] Stakeholder sign-off recorded — Product, Security, SRE, and Legal sign-off captured in writing on the live sandbox release.

### Features In Scope (MVP)

The user has confirmed MVP encompasses the **entire designed scope** in a single delivery; nothing is deferred to a later phase.

| Feature | Description | Priority | Rationale for Inclusion |
| --- | --- | --- | --- |
| All six processing routes | `ocr-direct`, `convert` (with sub-categories `office`, `html`, `image`, `tiff`), `email`, `archive`, `media`, `slipsheet` | Must Have | The whole point of the platform: a uniform contract across the document types Opus 2 customers actually submit |
| Chunked office conversion | Aspose.Total-for-C++ container + Python chunking-orchestrator sidecar + qpdf streaming merge; chunk-bounded peak RAM is the load-bearing scalability property | Must Have | Office-format coverage at horizontal scale is the dominant route by volume; chunking is non-negotiable for the RAM bound |
| HTML conversion | Gotenberg 8.x / Chromium container + TypeScript sidecar | Must Have | HTML coverage is a customer requirement and is non-trivial to host correctly |
| Image conversion | sharp + PDFKit (Node.js) | Must Have | Image route required for inbound photo/scan submissions |
| TIFF conversion + TIFF-to-COG pre-processing | sharp + PDFKit + geotiff.js for image route; gdal-async for COG conversion | Must Have | TIFF is a high-volume format in legal submissions; ranged extraction depends on COG pre-processing |
| Email extraction | Go `net/mail` + `mime/multipart` (EML); `mscfb` + `crtf` (MSG) with body and attachment fan-out | Must Have | Email is a high-volume customer-submission format with deeply nested attachments |
| Archive extraction | Streaming ZIP extraction with per-entry fan-out into the pipeline | Must Have | ZIP is the dominant compound-document format in customer submissions |
| Media conversion | FFmpeg / FFprobe | Must Have | Customer submissions include audio/video evidence; route must exist at MVP |
| Slipsheet fallback | Deterministic slipsheet PDF output for unsupported and forced-slipsheet documents (default `csv, ods`) | Must Have | The platform's "no document is silently dropped" guarantee depends on a deterministic fallback |
| Per-tenant isolation via single staging bucket + KMS aliases | A27 override of the design's per-tenant bucket model; isolation enforced via KMS aliases + prefix-scoped IAM + TTL-driven object retention | Must Have | Strong logical isolation without per-tenant infrastructure operational tax |
| Audit-event compliance pipeline | WunderGraph audit-emission module → SQS → `AuditEventStorage` Lambda → DynamoDB hot store (90-day TTL) → S3 Glacier IR cold store (Object Lock, 7-year default retention) + always-on `audit-fallback` CloudWatch log group | Must Have | SOC 2 / ISO 27001 alignment requires a tamper-evident, end-to-end audit feed |
| WunderGraph WebSocket subscriptions | `Document.statusChanged` over `graphql-transport-ws` | Must Have | Real-time per-document status surfacing is a foundational UX property |
| Pre-Token Generation Lambda (validation-only) | Lambda is deployed and validates inbound OIDC tokens; token *minting* by an Opus 2 IdP remains external for MVP | Must Have | Forward-compatible OIDC contract; no code change required when an Opus 2 IdP is selected |
| WunderGraph router + 3 resolvers (Workspace, Batch, Document) | Public GraphQL surface; CRUD and state-transition mutations on the three core entities; idempotency-key handling on every state-changing mutation | Must Have | The integration surface for every Opus 2 product |
| `DocumentEventHandler` Lambda | Pre-pipeline Lambda consuming S3 + GuardDuty EventBridge events; starts Step Functions executions | Must Have | Wires the API surface to the pipeline tier |
| `UpdateDocumentState` Lambda | Drains the `state-change-notification-queue` populated by the 14 `Notify_<X>` ASL states; calls `updateDocumentStatus` | Must Have | Surfaces per-stage status to the API tier |
| `AuditEventStorage` Lambda | Drains `docuploader-api-audit-events` SQS; writes to DynamoDB hot store and S3 Glacier IR cold store; partial-batch failure semantics enabled | Must Have | The event sink for the compliance pipeline |
| 21-state Step Functions ASL with 14 `Notify_<X>` interstitials | Pipeline orchestration; Two-Catch error pattern (per-service `DocumentProcessingError` slipsheet fallback; `States.ALL` failure to `HandleError` → `Failed`) | Must Have | The execution backbone for every processing route |
| Embeddable React web module | TypeScript module fronted by the GraphQL API; upload UX, status surfacing, output retrieval | Must Have | The customer-facing upload surface |
| Grafana observability via Grafana Alloy OTLP | Logs, metrics, traces from every unit; per-document trace correlation; per-unit dashboards-as-code | Must Have | Operability is non-optional for a multi-tenant platform service |

### Features Explicitly Out of Scope (MVP)

| Feature | Reason for Deferral | Target Phase |
| --- | --- | --- |
| Host-application code beyond the embeddable React module | Out-of-scope by definition — host applications are owned by their respective product teams | Per-product, ongoing |
| OIDC IdP token issuance (token minting) | MVP validates externally-minted tokens; an Opus 2 IdP that mints them is a separate company programme | Post-MVP follow-on milestone |
| Aspose.Total commercial licence procurement and renewal | Operator-managed; licence lifecycle is not an engineering deliverable | Operator-owned, ongoing |
| Service-mesh deployment | Sandbox does not run a service mesh; design explicitly excludes one | Out of scope |
| CI/CD pipeline implementation | Deployment for MVP is push-based via CLI tooling (`terraform apply`, `kubectl apply`, `helm upgrade`) | Post-MVP follow-on milestone |
| GuardDuty findings other than S3 Malware Protection | No CloudTrail-finding, VPC-Flow-finding, or DNS-finding analysis at MVP | Out of scope |
| CloudTrail / VPC Flow / DNS analysis pipelines | Outside the document-uploader's responsibility | Out of scope |
| Existing legacy uploader migration tooling | Migration is per-product and out of this project's responsibility | Per-product, ongoing |
| Customer-built workflows on top of the audit-log feed | Audit access is operator-only at MVP; no customer-facing audit surface | Post-MVP |
| Multi-region active-active deployment | MVP is single-region (`eu-west-1`); DR/failover is post-MVP | Post-MVP |
| CloudWatch as the **primary** audit-event destination | The always-on `audit-fallback` CloudWatch log group remains in scope as the emergency outlet only; the dormant `audit-security` log group stays gated `AUDIT_CLOUDWATCH_SECURITY_ENABLED=false` | Post-MVP |
| Usage-based metering and customer billing | Counters are emitted; the metering pipeline that turns them into invoices is post-MVP | Post-MVP follow-on milestone |
| Inline document preview / annotation in the React module | MVP exposes status + outputs; richer UX is post-MVP | Post-MVP |
| Per-tenant audit-event sink configuration | Audit storage is operator-uniform per the design | Out of scope |
| Test corpus management infrastructure | Reference corpus is sourced and maintained outside this project | Out of scope |
| Production-readiness deployment milestone (fidelity tests, multi-region, WAF, project-owned security scanning, SBOM, CVE-patch SLAs) | The MVP delivers to a sandbox; full production readiness is a separate milestone | Post-MVP follow-on milestone |
| Project-level dependency-vulnerability scanning and SBOM | Security scanning is implemented at the organisation level and reused; this project does not own scanning configuration | Organisation-owned, ongoing |

### MVP User Journeys

#### Journey 1: Tenant administrator configures a new Workspace and pipeline rules

1. Admin authenticates via the host application and is issued a token bearing `userID`, `workspaceID`, `tenantId` claims.
2. Admin calls `createWorkspace`, supplying retention policy, encryption configuration (KMS alias, per A27), and `pipelineConfig` (allowed file extensions, forced-slipsheet list overrides).
3. The Workspace record is persisted in `docuploader-api-workspaces`; status is `ACTIVE`.
4. Admin verifies the configuration by reading the Workspace back via the GraphQL API.

**Outcome.** A new Workspace is provisioned with strong logical isolation in a single API call.
**Limitation vs Full Vision.** No in-product UX for workspace configuration in MVP; calls are GraphQL-direct or via host-application admin tools.

#### Journey 2: End user uploads a single document and sees it complete

1. The host application embeds the React module; the user is already authenticated.
2. User initiates an upload; the module calls `createBatch` then `createDocument`, receives a presigned S3 URL, and PUTs the file directly to the staging bucket.
3. GuardDuty scans the object; on `NO_THREATS_FOUND`, `DocumentEventHandler` starts a Step Functions execution.
4. The module subscribes to `Document.statusChanged`; status transitions surface in real time (`UPLOADED` → `SCANNING` → `QUEUED` → `PROCESSING` with per-stage `pipelineStage` values → `COMPLETED`).
5. On completion, the module presents the output set (searchable PDF, plain text, etc.) sourced from `Document.outputs`.

**Outcome.** End-to-end upload-to-output in one user-visible flow.
**Limitation vs Full Vision.** No inline preview, annotation, or downstream-consumer integrations in MVP; just status + outputs.

#### Journey 3: End user uploads a batch of mixed-format documents and sees per-document statuses progress

1. User selects a mixed-format set (e.g., PDF + DOCX + ZIP + image).
2. The module creates one `Batch` and N `Document` records, each receiving a presigned URL.
3. Files upload in parallel; each triggers an independent Step Functions execution after malware scan.
4. The module renders a per-document progress grid driven by `Document.statusChanged`, showing per-document `pipelineStage` and final status (including slipsheet fallbacks for unsupported items and child fan-out from ZIP / email).
5. User can drill into any document to see its `processingError` if any.

**Outcome.** Mixed-format batches yield per-document, per-stage visibility from a single upload action.
**Limitation vs Full Vision.** No batch-level retry, no inline error remediation; failures must be re-uploaded.

#### Journey 4: Compliance reviewer queries the audit-log feed for a workspace and verifies events

1. Reviewer is granted operator-only read access to the `docuploader-api-audit-events` DynamoDB hot store and the `docuploader-api-audit-archive` S3 Glacier IR cold store.
2. Reviewer queries the hot store for recent events scoped to the target workspace (within the 90-day TTL window) by `tenantId` / `workspaceID` / time range.
3. Reviewer retrieves any matching archive object from S3 by deterministic key `audit/{tenantId}/{yyyy}/{MM}/{dd}/{eventId}.json` for events older than 90 days.
4. Reviewer cross-references mutation events against expected `Document` lifecycle and confirms every mutation has a corresponding audit event.

**Outcome.** Tamper-evident audit visibility for any workspace, end-to-end.
**Limitation vs Full Vision.** No GraphQL surface or self-service UI for audit queries in MVP; access is operator-tooling only.

### MVP Constraints and Assumptions

- **Assumption.** Six senior engineers covering the language and platform mix can deliver the full designed scope in 3-6 months. **Risk if wrong.** The 6-month commitment slips. **Mitigation.** Inception-driven unit decomposition (27 inception units; 23 software + 4 platform) is the basis for parallelisable construction.
- **Assumption.** Sandbox capacity in `eu-west-1` is sufficient to evidence linear horizontal scalability per route. **Risk if wrong.** The linear-scalability success criterion cannot be validated at MVP. **Mitigation.** Steady-load injection at varying replica counts and per-route reporting; if sandbox capacity is the bound, document the cut-off explicitly.
- **Assumption.** External token minting is acceptable for MVP and the future Opus 2 IdP can be slotted in without code changes. **Risk if wrong.** Auth integration churns at IdP-selection time. **Mitigation.** The Pre-Token Generation Lambda is implemented as a validation surface designed to re-point at the chosen IdP's pre-token-generation hook.
- **Assumption.** The single-bucket + KMS-alias tenant-isolation model meets compliance review without a per-tenant bucket. **Risk if wrong.** Compliance review demands per-tenant buckets. **Mitigation.** Document the KMS-grant + IAM-prefix isolation model up front and review with Security before construction reaches `platform-data`.
- **Assumption.** Aspose.Total-for-C++-based chunked office conversion delivers the RAM bound and throughput the design assumes under realistic load. **Risk if wrong.** Office route does not meet the per-pod memory budget under chunking. **Mitigation.** Property-based tests assert the RAM bound; load tests evidence the bound at scale; the slipsheet fallback ensures no document is silently dropped.
- **Accepted limitation.** Single-region (`eu-west-1`) deployment; no DR/failover region in MVP.
- **Accepted limitation.** Push-based deployment via CLI tooling; no GitOps or CI/CD pipeline in MVP.
- **Accepted limitation.** Sandbox-only target; production-readiness milestone is post-MVP and out of scope.

### MVP Definition of Done

- [ ] All in-scope features built and integrated end-to-end against the sandbox environment.
- [ ] `aidlc-docs/inception/units/` contains a unit-of-work file for every shipped unit (per the inception units-generation stage).
- [ ] Reference-corpus regression test green across all six routes.
- [ ] Load test demonstrates throughput scales approximately linearly with replica count, per route, within sandbox capacity.
- [ ] Security review complete (no Sev-1 findings; SOC 2 / ISO 27001 alignment evidenced; OWASP Top 10 controls mapped via the `security-baseline` extension).
- [ ] KMS-alias rotation runbook validated end-to-end under the single-bucket + alias-based-KMS model (rotation cadence default 6 months).
- [ ] Audit-event delivery validated end-to-end into both sinks (DynamoDB hot store + S3 Glacier IR cold store) with synthetic probes; the always-on `audit-fallback` CloudWatch log group is provisioned.
- [ ] Observability stack instrumented: Grafana Alloy OTLP emission verified for logs, metrics, and traces from every shipped unit; correlation IDs propagate across hops.
- [ ] Runbooks for each Sev-1 alert authored.
- [ ] Property-based test suites pass for every unit (per the `property-based-testing` extension); Allure-format test reports generated by every test runner.
- [ ] Three-tier test gate green for every unit: local, local integration (LocalStack), deployed sandbox (real AWS).
- [ ] Product / Security / SRE / Legal sign-off recorded.

---

## Risks and Dependencies

### Key Risks

A formal risks register (likelihood / impact / mitigation per item) is **deferred** out of inception. The user has confirmed risk-and-open-questions content is not available at inception time; downstream stages will produce it during construction kick-off.

### External Dependencies

| Dependency | Status |
| --- | --- |
| Aspose.Total for C++ 26.x | Commercial licence; procurement and renewal are operator-managed (out of scope) |
| AWS Textract availability and quota in `eu-west-1` | Available; quota provisioning is sandbox-account-managed |
| AWS GuardDuty Malware Protection for S3 | Regional GA in `eu-west-1`; available |
| AWS Step Functions Standard 1-year execution limit | Inherited; binding for very long-running async OCR / media jobs |
| AWS Cognito | Token-validation surface only at MVP; token issuance external |
| Gotenberg 8.x / Chromium | Open-source; available |
| qpdf binary | Open-source; available |
| pikepdf, PyMuPDF, Ghostscript | Python PDF tooling; open-source; available |
| pdf-lib (Node) | Open-source; available |
| sharp + PDFKit | Node.js image tooling; open-source; available |
| gdal-async + geotiff.js | Node.js GDAL bindings + ranged TIFF access; open-source; available |
| FFmpeg / FFprobe | Open-source; available |
| `mscfb` + `crtf` | Go MSG parsing; open-source; available |
| Go `net/mail` + `mime/multipart` | Go standard library |
| Pre-existing sandbox components (managed elsewhere; not by this project) | ArgoCD, Istio, ALB Controller, External Secrets Operator, Grafana Alloy, Kyverno, KEDA, Metrics Server, Karpenter, Cluster Autoscaler, CrossPlane |
| Grafana Cloud tenant + credentials | Provisioned externally; credentials surfaced via the `grafanacloud-alloy-credentials` ExternalSecret in the `grafana` namespace, syncing from Secrets Manager `/grafanacloud/alloy-credentials` |

### Open Questions

Open-questions content is **deferred**; downstream stages will surface and resolve them during construction.
