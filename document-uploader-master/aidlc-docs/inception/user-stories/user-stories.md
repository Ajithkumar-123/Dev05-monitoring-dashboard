# User Stories: Unified Document Uploader (MVP)

Stories below are scoped to the **MVP** delivery. Each story maps to one or more functional requirements (`FR-*`) in `requirements.md` and one of the four MVP user journeys in `vision.md`. Each story carries acceptance criteria expressed as Given/When/Then; numeric SLO thresholds are not asserted (deferred to post-MVP per ratified position).

Personas referenced (`personas.md`): P1 Product Integrator, P2 Customer, P3 Workspace Admin, P4 Hearings-Ops, P5 SRE, P6 Compliance Reviewer.

---

## Epic A — Workspace Provisioning (Journey: Tenant administrator)

### US-A1 — Provision a new Workspace via GraphQL

**As** a Workspace Administrator (P3)
**I want** to call `createWorkspace` supplying retention policy, encryption configuration (KMS alias, per A27), and `pipelineConfig`
**So that** a new Workspace is persisted in `docuploader-api-workspaces` with status `ACTIVE` and strong logical isolation in a single API call.

**Acceptance criteria**
- Given a valid OIDC token carrying `userID`, `workspaceID`, `tenantId`,
  When the admin calls `createWorkspace` with valid input,
  Then the Workspace record is persisted, a per-tenant KMS alias is created bound to the customer-managed key, prefix-scoped IAM is seeded, and the response returns `status=ACTIVE`.
- Given the same input replayed with the same idempotency key,
  When `createWorkspace` is called again,
  Then no duplicate Workspace is created and the original record is returned.
- Given a request lacking required claims or with an invalid signature,
  When `createWorkspace` is called,
  Then the request is rejected with 401/403.

**Maps to**: FR-3.1, FR-3.2, FR-3.4, FR-3.6, FR-6.1, FR-6.5, FR-7.1, FR-7.2.

### US-A2 — Read back the Workspace configuration

**As** a Workspace Administrator (P3)
**I want** to query the Workspace I just created
**So that** I can verify retention policy, encryption configuration, and `pipelineConfig` are persisted as specified.

**Acceptance criteria**
- Given a Workspace exists,
  When the admin queries `Workspace(id: …)`,
  Then the response surfaces `retentionPolicy.inputRetentionDays` (default 7), `encryptionConfig` (per-tenant KMS alias), `pipelineConfig.forcedSlipsheetExtensions` (default `csv, ods`), and `status=ACTIVE`.

**Maps to**: FR-3.2, FR-3.3, FR-7.2, FR-2.10.

---

## Epic B — Single-Document Upload Lifecycle (Journey 2)

### US-B1 — Initiate an upload with a presigned URL

**As** a Customer (P2) using the embedded React module
**I want** to obtain a presigned S3 URL for my document
**So that** I can PUT the file directly to staging without proxying bytes through the API.

**Acceptance criteria**
- Given the host application has issued a valid token,
  When the module calls `createBatch` then `createDocument`,
  Then the response returns a presigned URL with a server-set TTL and server-set content-type (not client-set), and a `documentId` referencing the new `docuploader-api-documents` row in state `UPLOADED` (post-PUT).

**Maps to**: FR-1.1, FR-1.2, NFR-3.2.

### US-B2 — Observe per-stage status in real time

**As** a Customer (P2)
**I want** my upload's status to update live without polling
**So that** I see `UPLOADED` → `SCANNING` → `QUEUED` → `PROCESSING` (with per-stage `pipelineStage`) → `COMPLETED` as it happens.

**Acceptance criteria**
- Given a subscriber on `Document.statusChanged(documentId: …)` over `graphql-transport-ws`,
  When the document transitions through its lifecycle,
  Then every state transition is delivered to the subscriber, including the terminal state, with no missed events.

**Maps to**: FR-1.3, FR-1.4.

### US-B3 — Retrieve the output set on completion

**As** a Customer (P2)
**I want** to download the searchable PDF and plain text (and other outputs as applicable)
**So that** I can attach them to my hearing pack.

**Acceptance criteria**
- Given the document is in `COMPLETED` state,
  When the module reads `Document.outputs`,
  Then it surfaces the per-route output set materialised at terminal state.

**Maps to**: FR-1.5.

### US-B4 — Reject malicious uploads

**As** an SRE / Compliance Reviewer (P5/P6)
**I want** GuardDuty Malware Protection for S3 to scan every upload pre-pipeline
**So that** documents with detected threats are not processed.

**Acceptance criteria**
- Given GuardDuty surfaces a malware finding for an uploaded object,
  When `DocumentEventHandler` consumes the EventBridge finding,
  Then no Step Functions execution is started for that `documentId`, and `Document.status` transitions to a terminal state reflecting the scan outcome.

**Maps to**: FR-1.3 (state transitions), NFR-2.4 (audit-event coverage of state changes).

---

## Epic C — Batch Mixed-Format Upload (Journey 3)

### US-C1 — Upload a mixed-format batch

**As** a Customer (P2)
**I want** to drop a mixed-format set (PDF, DOCX, XLSX, EML, ZIP, TIFF) into the React module
**So that** each file is uploaded in parallel, each gets a presigned URL, and each independently triggers its own Step Functions execution after malware scan.

**Acceptance criteria**
- Given a batch of N mixed-format documents,
  When the module calls `createBatch` and `createDocument` per item,
  Then N independent Step Functions executions are started after each upload completes its malware scan, each routed to its appropriate pipeline route (`ocr-direct`, `convert/office`, `email`, `archive`, etc.).

**Maps to**: FR-1.1, FR-1.2, FR-2.1–FR-2.9.

### US-C2 — Per-document progress grid

**As** a Customer (P2)
**I want** to see a per-document progress grid driven by `Document.statusChanged`
**So that** I can track each document's `pipelineStage` and final status, including child fan-out (ZIP entries, email attachments) inline.

**Acceptance criteria**
- Given an uploaded ZIP whose contents trigger fan-out,
  When the archive route processes the ZIP,
  Then each extracted child document appears as its own `Document` row and surfaces its own `pipelineStage` and status alongside the parent.

**Maps to**: FR-1.4, FR-2.7, FR-5.3 (one trace per Document joined to child traces).

### US-C3 — Slipsheet fallback for unsupported items

**As** a Customer (P2)
**I want** unsupported or forced-slipsheet types (default `csv, ods`) to produce a deterministic slipsheet PDF
**So that** no document in my batch is silently dropped.

**Acceptance criteria**
- Given a `csv` file in the batch and a workspace with default `pipelineConfig`,
  When the document is processed,
  Then it bypasses conversion and produces a slipsheet output with `nativeTrigger=SLIPSHEET`.
- Given a workspace override that adds `xls` to `forcedSlipsheetExtensions`,
  When an `xls` is uploaded,
  Then it also produces a slipsheet output.

**Maps to**: FR-2.9, FR-2.10.

### US-C4 — Inspect a per-document processing error

**As** a Customer (P2)
**I want** to drill into a failed document and see its `processingError`
**So that** I know why it failed (no batch-level retry; failures must be re-uploaded per ratified MVP position).

**Acceptance criteria**
- Given a document in terminal `FAILED` state with a per-service `DocumentProcessingError`,
  When the module reads `Document(id: …)`,
  Then `processingError` carries `code`, `message`, `detail`, `retryable=false`, and any unit-specific `extensions`.

**Maps to**: FR-1.5, NFR-2.1, NFR-2.5.

---

## Epic D — Audit and Compliance (Journey 4)

### US-D1 — Query recent audit events in the hot store

**As** a Compliance Reviewer (P6) with operator-only access
**I want** to query the DynamoDB `docuploader-api-audit-events` table by `tenantId` / `workspaceID` / time range
**So that** I can confirm recent mutation events (within the 90-day TTL window).

**Acceptance criteria**
- Given audit events have been emitted for mutations on a workspace,
  When the reviewer queries the hot store within the 90-day TTL,
  Then the events are returned with full mutation context (`tenantId`, `workspaceID`, actor `user_id`, mutation name, request_id, idempotency_key).

**Maps to**: FR-4.1, FR-4.2, FR-4.6.

### US-D2 — Retrieve archived events from the cold store

**As** a Compliance Reviewer (P6)
**I want** to fetch archived audit objects from the `docuploader-api-audit-archive` Glacier IR bucket by deterministic key
**So that** I can review events older than 90 days.

**Acceptance criteria**
- Given an archived `eventId`,
  When the reviewer reads `audit/{tenantId}/{yyyy}/{MM}/{dd}/{eventId}.json`,
  Then the JSON object is returned (subject to Glacier IR retrieval semantics) and is byte-identical to the originating mutation event.

**Maps to**: FR-4.2, FR-4.7.

### US-D3 — Cross-reference mutations against Document lifecycle

**As** a Compliance Reviewer (P6)
**I want** to confirm every state-changing mutation has a corresponding audit record
**So that** I can evidence SOC 2 / ISO 27001 alignment with no audit gaps.

**Acceptance criteria**
- Given synthetic mutation traffic,
  When the synthetic probes complete,
  Then matching records appear in both the DynamoDB hot store and the S3 Glacier IR cold store with no DLQ accumulation on `docuploader-api-audit-events` SQS.

**Maps to**: FR-4.1, FR-4.2, NFR-2.4.

---

## Epic E — Product Integration (Journey: full-vision Journey 1)

### US-E1 — Integrate the React module + GraphQL API

**As** a Product Integrator (P1)
**I want** to add the React module to my host application and point it at the GraphQL endpoint
**So that** my product gains upload UX, status surfacing, and output retrieval without re-implementing document handling.

**Acceptance criteria**
- Given the host application provides an OIDC token source,
  When the module is configured with a GraphQL endpoint and tenant context (from the token),
  Then upload, status, and output flows function end-to-end without product-specific code beyond wiring.

**Maps to**: FR-1.1–FR-1.5, FR-6.1, FR-6.2, FR-7.1.

### US-E2 — Read processed outputs for downstream AI workflows

**As** a Product Integrator (P1)
**I want** to read `Document.outputs` for documents my product cares about
**So that** my downstream AI workflow (vectorisation, retrieval, summarisation, agentic) consumes a uniform processed surface.

**Acceptance criteria**
- Given a document in `COMPLETED` state,
  When the integrator queries `Document(id).outputs`,
  Then a uniform output structure (searchable PDF, plain text, native artefacts, slipsheets) is returned independent of route.

**Maps to**: FR-1.5, FR-7.3.

---

## Epic F — Operations (full-vision Journey 4)

### US-F1 — Diagnose a slow document end-to-end

**As** an SRE (P5) responding to a Sev-3 latency alert on `convert/office`
**I want** to open the per-route Grafana dashboard, pull the trace for one slow `documentId`, and drill into structured logs filtered by `trace_id`
**So that** I can identify the slow stage (e.g., a single Aspose chunk on a malformed embedded font) and follow the runbook.

**Acceptance criteria**
- Given a document with elevated end-to-end latency,
  When the SRE pulls its trace by `documentId`,
  Then one trace spans `UPLOADED` to terminal state, joined to child traces for fan-out, with W3C Trace Context propagated across HTTP, gRPC, SQS message attributes, and Step Functions task input.
- Given the slow stage identified,
  When the SRE filters logs by `trace_id`,
  Then structured logs surface unit-specific `attrs` (e.g., `chunk_index`, `aspose_render_ms`) sufficient to identify the offending input.

**Maps to**: FR-5.1, FR-5.2, FR-5.3, NFR-5.3, NFR-5.4.

### US-F2 — Follow a runbook for a Sev-1 alert

**As** an SRE (P5)
**I want** every Sev-1 alert to have a corresponding committed runbook
**So that** remediation is deterministic and on-call training is reproducible.

**Acceptance criteria**
- Given a Sev-1 alert fires,
  When the SRE opens the alert,
  Then the alert links to a runbook in `units/<unit-id>/runbooks/` with diagnosis steps, remediation actions, and rollback criteria.

**Maps to**: FR-5.5.

---

## Epic G — Authentication

### US-G1 — Validate an externally-minted token

**As** the system (`pre-token-generation-lambda`)
**I want** to validate inbound OIDC tokens carrying `userID`, `workspaceID`, `tenantId` custom claims
**So that** only legitimate callers reach the GraphQL surface, and the lambda can be re-pointed at a future Opus 2 IdP without code changes.

**Acceptance criteria**
- Given a token with required claims and a valid signature,
  When `pre-token-generation-lambda` evaluates it,
  Then the token is accepted and tenancy is resolved at this point (never trusted from caller input downstream).
- Given a token lacking required claims or with an invalid signature,
  When `pre-token-generation-lambda` evaluates it,
  Then the request is rejected with 401/403.

**Maps to**: FR-6.1, FR-6.2, FR-6.5, FR-3.4.

---

## Coverage Matrix

| Functional Requirement | Stories |
| --- | --- |
| FR-1.1 createBatch / createDocument / presigned URL | US-B1, US-C1, US-E1 |
| FR-1.2 direct-to-S3 upload | US-B1, US-C1 |
| FR-1.3 state transitions | US-B2, US-B4 |
| FR-1.4 statusChanged subscription | US-B2, US-C2 |
| FR-1.5 Document.outputs | US-B3, US-C4, US-E2 |
| FR-1.6 idempotency keys | US-A1, embedded across mutations |
| FR-2.1–FR-2.9 six routes | US-C1, US-C3 |
| FR-2.10 forced-slipsheet defaults | US-C3, US-A2 |
| FR-3.x multi-tenancy | US-A1, US-A2, US-G1 |
| FR-4.x audit | US-D1, US-D2, US-D3 |
| FR-5.x observability | US-F1, US-F2 |
| FR-6.x auth | US-G1, US-A1, US-B1 |
| FR-7.x API surface | US-A1, US-A2, US-B1, US-E1, US-E2 |

Numeric SLO assertions are deliberately absent per `requirements.md` NFR-1.3.
