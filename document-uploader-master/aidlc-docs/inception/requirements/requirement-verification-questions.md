# Requirements Verification Questions

The Vision (`aidlc-inputs/vision.md`) and Technical Environment (`aidlc-inputs/tech-environment.md`) inputs are unusually complete for a greenfield inception. The questions below verify positions that are stated in the inputs but should be ratified explicitly at the requirements gate, plus a small number of areas where the inputs leave room for interpretation. Please answer every question by filling in the letter choice after each `[Answer]:` tag. Use option `X) Other` and a free-text description if none of the supplied choices fit.

When you've answered every question, reply `done` (or re-run the slash command) and the requirements analyst will validate, generate `requirements.md`, and present it for approval.

---

## Question 1: MVP delivery scope confirmation
The Vision states MVP encompasses the **entire designed scope** in a single delivery (all 6 routes, all 23 software + 4 platform units, audit-event compliance pipeline, Grafana observability, OIDC token validation), with nothing deferred. Please confirm.

A) Confirmed — MVP delivers the entire designed scope in a single sandbox release; no in-scope feature is deferred
B) Reduce scope — defer one or more in-scope features to post-MVP (please describe which after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 2: Timeline commitment
The Vision states a 3-month internal stretch and 6-month hard external commitment for sandbox delivery. Which timeline should requirements treat as binding for downstream stages?

A) 3-month stretch is the working target; 6-month is the hard external commitment (both stated; treat as Vision says)
B) 3-month stretch only — escalate if the stretch slips
C) 6-month hard commitment only — drop the 3-month stretch language
X) Other (please describe after [Answer]: tag below)

[Answer]: These are actually more like upper limits on the time we want to deliver this project. Ideally, we'd like to deliver to the sandbox is much less thime.

---

## Question 3: Success-metric numeric thresholds
The Vision declares this is a baseline-establishing release: numeric SLO thresholds (latency p50/p95/p99, throughput floors, availability targets, MTTR) are **deferred** until post-MVP, with the MVP establishing the baseline. Please confirm.

A) Confirmed — no numeric SLO thresholds at MVP; baseline is established and trended post-MVP per the Success Metrics table
B) Set numeric thresholds now — please supply them after `X) Other`
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 4: Risk register and open-questions deferral
The Vision states a formal risks register and open-questions list are **deferred** out of inception (downstream stages produce them at construction kick-off). Please confirm this stance.

A) Confirmed — risk register and open-questions deferred to construction kick-off
B) Produce a risk register now — please describe expected format after `X) Other`
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 5: Region and disaster-recovery posture for MVP
The Vision states MVP runs in `eu-west-1` only with no DR/failover region in scope; multi-region active-active is post-MVP. Please confirm.

A) Confirmed — single region (`eu-west-1`); no DR/failover region; multi-region post-MVP
B) Add a passive DR region at MVP (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 6: Multi-tenancy isolation model (A27 override)
The design's A27 override eliminates per-tenant buckets and enforces tenant isolation via a single staging bucket plus per-tenant KMS aliases bound to a customer-managed key, with prefix-scoped IAM. Please confirm this is the binding isolation model for MVP.

A) Confirmed — single staging bucket + per-tenant KMS aliases + prefix-scoped IAM is the binding isolation model
B) Revert to per-tenant buckets — drop A27
C) Hybrid — per-tenant buckets for some workloads, alias model for others (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 7: Tenant identity resolution
The Vision states tenant identity is resolved at token-mint time from `docuploader-api-workspaces`; client-supplied `tenantId` is **never trusted**. Please confirm this requirement is binding for all resolvers and Lambdas.

A) Confirmed — tenancy resolved at token-mint time only; client-supplied `tenantId` is never trusted anywhere in the system
B) Allow client-supplied `tenantId` in selected internal calls — please describe after `X) Other`
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 8: OIDC token issuance posture for MVP
The Vision states tokens are minted externally for MVP; the `PreTokenGenerationLambda` validates them. Token issuance by an Opus 2 IdP is post-MVP. Please confirm.

A) Confirmed — external token minting for MVP; PreTokenGenerationLambda validates only; future Opus 2 IdP slots in post-MVP without code change
B) Mint tokens inside the project at MVP (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 9: Workspace administration UX for MVP
The Vision says "No in-product UX for workspace configuration in MVP; calls are GraphQL-direct or via host-application admin tools." Please confirm the React module does not own a workspace-admin UI in MVP.

A) Confirmed — no workspace-admin UX in the React module at MVP; admins use GraphQL-direct calls or host-application admin tools
B) Add a minimal workspace-admin UI to the React module at MVP (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 10: Audit feed customer access at MVP
The Vision states audit access is operator-only at MVP; no customer-facing audit surface or self-service GraphQL audit queries exist. Please confirm.

A) Confirmed — operator-only audit access at MVP; no customer-facing audit surface
B) Expose a read-only customer audit surface at MVP (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 11: Audit retention split (DynamoDB hot store + S3 Glacier IR cold store)
The design specifies a 90-day TTL DynamoDB hot store for queryable recent audit events, and an S3 Glacier IR cold store with Object Lock Compliance and 7-year default retention for long-term tamper-evident archival. Please confirm both retention values are binding for MVP.

A) Confirmed — 90-day DynamoDB hot store + 7-year Glacier IR Object Lock Compliance cold store
B) Different retention values — please describe after `X) Other`
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 12: CloudWatch use for audit events
The Vision states the always-on `audit-fallback` CloudWatch log group is the emergency outlet only; the dormant `audit-security` log group remains gated `AUDIT_CLOUDWATCH_SECURITY_ENABLED=false` (provisioned but inactive at MVP). Please confirm.

A) Confirmed — `audit-fallback` always-on as emergency outlet only; `audit-security` provisioned but gated false at MVP
B) Promote CloudWatch to a primary audit destination at MVP (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 13: Forced-slipsheet default configuration
The Vision states the default forced-slipsheet list is `csv, ods`, configurable per-workspace via `Workspace.pipelineConfig`. Please confirm this default and that workspace-level override is the only configuration surface at MVP.

A) Confirmed — default `csv, ods`; per-workspace override via `Workspace.pipelineConfig.forcedSlipsheetExtensions` (or equivalent)
B) Different default forced-slipsheet list (please describe after `X) Other`)
C) No per-workspace override at MVP — global default only
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 14: Default `Workspace.retentionPolicy.inputRetentionDays`
The Vision states a 7-day default for staging-bucket TTL retention, governed by `Workspace.retentionPolicy.inputRetentionDays`. Please confirm.

A) Confirmed — 7-day default `inputRetentionDays`; configurable per workspace
B) Different default retention (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 15: KMS key rotation cadence
Tech-environment.md states a 6-month default KMS key rotation cadence, configurable per workspace. Please confirm this is the binding default for MVP.

A) Confirmed — 6-month rotation default; configurable per workspace
B) Different rotation cadence (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 16: Idempotency-key requirement scope
The design requires idempotency keys on **every** state-changing internal mutation (not only externally-facing calls), enforced via the `idempotency-index` GSI on `docuploader-api-documents`. Please confirm this requirement is binding for all internal mutations at MVP.

A) Confirmed — idempotency keys required on every state-changing mutation, internal and external; enforced via `idempotency-index` GSI
B) Idempotency only on externally-facing mutations — internal mutations exempted (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 17: Two-Catch error pattern
The design specifies a Two-Catch error pattern: per-service `DocumentProcessingError` produces a slipsheet-route fallback; `States.ALL` failure routes to `HandleError` and `Failed`. Please confirm this is the binding error model for MVP and that it must be evidenced by synthetic-error injection in MVP success criteria.

A) Confirmed — Two-Catch is binding; evidenced via synthetic injection per the success criterion
B) A different error model (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 18: Three-tier test gate (binding for every unit)
Tech-environment.md mandates a three-tier minimum test gate (Local in-process, Local integration via LocalStack, Deployed sandbox against real AWS in `eu-west-1`) for every unit including chassis libraries, before the unit is considered complete. Please confirm this gate is binding for MVP Definition-of-Done.

A) Confirmed — three-tier gate (Local + LocalStack + Sandbox) binding for every unit at MVP DoD
B) Reduce to two tiers (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 19: Allure-format test reporting
Tech-environment.md mandates Allure-format reports from every test runner across all languages. Please confirm this reporting requirement is binding for MVP.

A) Confirmed — Allure-format reports required from every test runner across all four languages
B) Different test-report format (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 20: Naming convention enforcement (binding rule)
Tech-environment.md states "Unified" appears only in prose / human-facing labels; `docuploader` is the only acceptable token in resource identifiers (S3, DynamoDB, SQS, IAM, EventBridge, log groups, env vars, IaC names); the two terms must never be mixed. Please confirm this naming rule is binding for MVP and may block delivery if violated.

A) Confirmed — `docuploader`-only naming in identifiers is a binding rule; violations are blocking
B) Allow `unified` or mixed-form identifiers in some places (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 21: Push-based deployment for MVP
Tech-environment.md states deployment for MVP is push-based via CLI tooling (`terraform apply`, `kubectl apply`, `helm upgrade`); ArgoCD is bypassed; CrossPlane is not used; CI/CD pipeline implementation is post-MVP. Please confirm.

A) Confirmed — push-based CLI deployment for MVP; CI/CD post-MVP; ArgoCD bypassed; CrossPlane not used
B) Use ArgoCD GitOps at MVP (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 22: Per-unit language assignment
Tech-environment.md states the per-unit language assignment is binding for MVP — no per-unit language override is permitted without an explicit inception rerun. Please confirm.

A) Confirmed — per-unit language assignments in tech-environment.md are binding; overrides require an inception rerun
B) Allow per-unit language overrides during construction (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 23: 27-unit decomposition
Tech-environment.md states the inception units-generation stage emits 27 units total: 23 software units + 4 platform units; deviations require an inception rerun. Please confirm this decomposition count is binding.

A) Confirmed — 27 units (23 software + 4 platform) is binding; deviations require an inception rerun
B) Allow units-generation to deviate from the listed 27 units (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 24: AWS service allow-list strictness
Tech-environment.md provides an AWS service allow-list and a disallow-list. Please confirm that any service not on the allow-list requires a project-level decision (PR note + tech-lead review + a tech-environment.md update) before adoption at MVP.

A) Confirmed — allow-list is bounding; new services require PR-note + tech-lead review + tech-environment.md update
B) Looser process — adopt new AWS services without document update (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 25: Dependency-vulnerability scanning ownership
Tech-environment.md states vulnerability scanning is implemented at the organisation level and reused; this project does not own scanning configuration. CVE patch SLAs and SBOM are deferred at MVP. Please confirm.

A) Confirmed — org-level scanning reused; this project does not own scanning, SBOM, or CVE patch SLA at MVP
B) Project owns scanning at MVP (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 26: Reference-corpus ownership
The MVP success criteria require a "reference-corpus regression green" gate across all six routes, but tech-environment.md states the canonical corpus is sourced and maintained outside this project. Please confirm corpus ownership.

A) Confirmed — corpus is sourced and maintained outside the project; the project consumes it but does not own corpus management
B) The project owns the reference corpus at MVP (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 27: Stakeholder sign-off cohort for MVP go-live
The Vision lists Product, Security, SRE, and Legal as the sign-off cohort for the live sandbox release. Please confirm these four are the binding sign-off authorities for MVP closure (and that all four are blocking).

A) Confirmed — Product + Security + SRE + Legal sign-off all required and blocking for MVP go-live
B) Different sign-off cohort (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 28: Usage-based metering and billing scope
The Vision states usage-based metering and customer-facing billing are not required for MVP; the design exposes counters so a metering pipeline can be added post-MVP. Please confirm.

A) Confirmed — counters emitted at MVP; metering pipeline and customer-facing billing are post-MVP
B) Build the metering pipeline at MVP (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 29: Step Functions execution duration ceiling
The Standard 1-year execution limit is inherited and acknowledged as binding for very long-running async OCR / media jobs. Please confirm this is acceptable for MVP and that no Document is expected to exceed this ceiling under realistic load.

A) Confirmed — Step Functions Standard 1-year ceiling is acceptable; no MVP route is expected to exceed it
B) Need a separate strategy for executions approaching the ceiling (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 30: Inline preview / annotation in the React module (MVP boundary)
The Vision states the React module exposes upload UX, status surfacing, and output retrieval at MVP; inline document preview and annotation are post-MVP. Please confirm.

A) Confirmed — React module covers upload + status + output retrieval at MVP only; preview/annotation are post-MVP
B) Add inline preview at MVP (please describe after `X) Other`)
C) Add inline preview AND annotation at MVP (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 31: Batch-level retry / inline error remediation
The Vision states there is no batch-level retry and no inline error remediation in MVP; failures must be re-uploaded. Please confirm.

A) Confirmed — no batch-level retry and no inline error remediation at MVP; failures are re-uploaded
B) Add batch-level retry at MVP (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 32: Aspose licence procurement
Tech-environment.md and the Vision state Aspose.Total commercial licence procurement and renewal are operator-managed and out of engineering scope. Please confirm.

A) Confirmed — Aspose licence procurement and renewal are operator-managed; not an engineering deliverable
B) Engineering owns Aspose licence lifecycle at MVP (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 33: GuardDuty scope
Tech-environment.md states GuardDuty Malware Protection for S3 is the only GuardDuty surface in scope; CloudTrail-finding, VPC-Flow-finding, and DNS-finding analysis are out of scope. Please confirm.

A) Confirmed — GuardDuty Malware Protection for S3 only; other GuardDuty findings are out of scope at MVP
B) Add other GuardDuty findings at MVP (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 34: Service-mesh exclusion
Tech-environment.md states the design explicitly excludes a service mesh; sandbox does not run one; direct TCP/TLS via ALB or cluster-internal CoreDNS is used (with optional private-CA TLS on in-cluster gRPC). Please confirm.

A) Confirmed — no service mesh at MVP; direct TCP/TLS via ALB / CoreDNS; optional private-CA TLS on gRPC
B) Adopt a service mesh at MVP (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 35: Sandbox-resident platform components (do-not-modify list)
Tech-environment.md states the project must integrate with — but must not modify or replace — these sandbox-resident components: ArgoCD, Istio, ALB Controller, External Secrets Operator, Grafana Alloy, Kyverno, KEDA, Metrics Server, Karpenter, Cluster Autoscaler, CrossPlane. Please confirm this is binding.

A) Confirmed — listed sandbox components are integrate-only; the project must not modify or replace them
B) Modify or replace one or more (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 36: Schema evolution policy
Tech-environment.md states the GraphQL schema-evolution default is additive-only; breaking changes require deprecation windows with metric-tracked usage and version pinning. Please confirm.

A) Confirmed — additive-only by default; breaking changes require deprecation + metric-tracked usage + version pinning
B) Allow breaking changes without deprecation at MVP (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 37: PII-in-logs prohibition
Tech-environment.md states PII may be stored in tenant data and audit events but **must not** appear in logs; presigned URLs (full or signature portion), OIDC tokens (raw or any portion), data keys, API keys, customer document content, AWS access keys, and Secrets Manager secret values are never to be logged. Please confirm this redaction policy is binding and Sev-1 if violated.

A) Confirmed — never-log set is binding; violations are Sev-1 incidents
B) Different redaction policy (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 38: Audit-archive CMK separation
The design specifies the `docuploader-api-audit-archive` bucket uses a separate operator-managed CMK (distinct from per-tenant aliases that share key infrastructure). Please confirm.

A) Confirmed — audit-archive uses a separate operator-managed CMK distinct from tenant CMK infrastructure
B) Use the same key infrastructure for audit-archive (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 39: Concurrency / rate-limit boundaries at MVP
Specific per-resolver and per-route rate limits are deferred ("specifics deferred to construction"). Please confirm rate-limit specifics are deferred and the requirement at MVP is "rate-limit guards exist on resolvers and the ALB / API surface" without committed numeric limits.

A) Confirmed — rate-limit guards exist; specific numeric limits deferred to construction
B) Set numeric rate-limit thresholds now (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 40: Linear-scalability evidence as a pass/fail gate
The MVP success criterion states throughput per route scales approximately linearly with replica count up to sandbox capacity, with no per-pod memory growth as input file size increases. Please confirm this is a hard pass/fail gate for MVP.

A) Confirmed — linear-scalability evidence is a hard pass/fail gate; numeric thresholds deferred per the baseline-establishing posture
B) Soft gate only — proceed even if scalability is sub-linear (please describe after `X) Other`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 41: Security Extensions (`security-baseline`) opt-in
Tech-environment.md pre-declares this extension as **Yes — enforce all rules**. Please confirm via this opt-in question (recorded in `aidlc-state.md` per the AI-DLC stage rule).

Should security extension rules be enforced for this project?

A) Yes — enforce all SECURITY rules as blocking constraints (recommended for production-grade applications)
B) No — skip all SECURITY rules (suitable for PoCs, prototypes, and experimental projects)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 42: Property-Based Testing (`property-based-testing`) opt-in
Tech-environment.md pre-declares this extension as **Yes — enforce for all units**. Please confirm via this opt-in question (recorded in `aidlc-state.md` per the AI-DLC stage rule).

Should property-based testing (PBT) rules be enforced for this project?

A) Yes — enforce all PBT rules as blocking constraints (recommended for projects with business logic, data transformations, serialization, or stateful components)
B) Partial — enforce PBT rules only for pure functions and serialization round-trips (suitable for projects with limited algorithmic complexity)
C) No — skip all PBT rules (suitable for simple CRUD applications, UI-only projects, or thin integration layers with no significant business logic)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---
