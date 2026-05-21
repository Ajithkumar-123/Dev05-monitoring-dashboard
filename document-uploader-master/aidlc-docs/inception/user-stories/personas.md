# Personas: Unified Document Uploader

Source: `aidlc-inputs/vision.md` § Target Users and Stakeholders. Personas below are the user-types-of-record for downstream user stories.

## P1 — Product Integrator (Opus 2 application developer)

- **Role**: Engineer building new AI capabilities (vectorisation, retrieval, summarisation, agentic workflows) or product enhancements that need uniform processed-document access.
- **Goal**: Integrate document handling without re-implementing per-product pipelines.
- **Needs**: Stable, versioned, well-documented GraphQL API and React module; reliable processed outputs read from `Document.outputs`; WebSocket subscriptions for status surfacing.
- **Frustrations today**: Per-product pipelines block AI feature work; each integration is bespoke.

## P2 — Customer (legal end user)

- **Role**: Legal practitioner uploading documents to the Opus 2 cases platform.
- **Goal**: Reliable upload of arbitrary-size, mixed-format submissions ahead of court hearings.
- **Needs**: Predictable, observable processing outcomes; per-document and per-stage status feedback; output downloads (searchable PDF, plain text) for hearing packs.
- **Frustrations today**: Inconsistent upload UX across Opus 2 products; black-box pipelines.

## P3 — Tenant / Workspace Administrator

- **Role**: Internal Opus 2 platform admin acting on behalf of a customer tenant.
- **Goal**: Provision a `Workspace`, set `pipelineConfig`, retention policy, encryption.
- **Needs**: A small, clear set of knobs that map to compliance and operational requirements. Workspace state visible and verifiable.
- **MVP UX constraint**: No in-product UX for workspace configuration at MVP — calls are GraphQL-direct or via host-application admin tools.

## P4 — Hearings-Operations Specialist

- **Role**: Opus 2 client-support staff managing document uploads before, during, after court hearings.
- **Goal**: Advise customers on upload, OCR, conversion quotas; manage live hearings.
- **Needs**: Per-workspace `pipelineConfig` controls; clear visibility of `Document.status` and `Document.pipelineStage` during live customer sessions.

## P5 — SRE / Operator

- **Role**: Engineer responsible for uptime, autoscaling, incident response so customers meet hard external deadlines (court-submission cut-offs).
- **Goal**: Diagnose a slow or failed document end-to-end from one trace ID; scale and remediate from one observability surface.
- **Needs**: Actionable Grafana dashboards; per-document traces joining API and pipeline tiers; runbooks for every Sev-1 alert; predictable KEDA-driven autoscaling.

## P6 — Compliance Reviewer (Security)

- **Role**: Staff verifying tenant data isolation, encryption posture, audit completeness for SOC 2 / ISO 27001 alignment.
- **Goal**: Confirm every mutation has a corresponding audit record; verify per-tenant logical isolation across API, S3 prefix, and KMS layers.
- **Needs**: Operator-only read access to the audit hot store (DynamoDB) and cold store (S3 Glacier IR Object Lock); documented control mapping.

## P7 — Finance Stakeholder

- **Role**: Owner of usage-based cost attribution to tenants.
- **Goal**: Per-tenant, per-pipeline-stage usage signals for cost attribution (pipeline runs, OCR pages, conversion minutes, storage).
- **MVP scope**: Counters are emitted; the metering pipeline that turns them into invoices is **post-MVP**. Finance is a stakeholder, not a primary MVP user.
