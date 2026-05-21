# UOW-LIB-04 — AWS Data Access Module · Design

**Unit ID**: LIB-04
**Type**: Shared library (no runtime workload)
**Languages**: Go · Python · TypeScript
**Status**: Authored, tested, in service of 21 consumer units

---

## 1. Overview

LIB-04 is the **typed AWS data-access library** that every docuploader workload uses to read and write the 7 DynamoDB tables, derive idempotency keys, and access shared AWS clients. It is **deliberately minimal**: pure data-access primitives, no business logic, no policy decisions, no external service calls. The same conceptual API is implemented in **three languages** so that any docuploader service — Go resolver, Python pipeline worker, TypeScript sidecar — calls into it idiomatically while producing bit-identical behaviour on cross-language algorithms (most critically, idempotency-key derivation).

### One-line description

> One library. Three languages. Bit-identical behaviour. Zero business logic.

---

## 2. Goals & Non-Goals

### Goals

1. **Single source of truth** for table names, GSI names, TTL values, and entity types across the 21 consumer units
2. **Idiomatic per-language API** — Go structs, Python `@dataclass`, TypeScript `interface`
3. **Bit-identical cross-language behaviour** on hash-based algorithms (specifically `deriveUpdateStatusKey`) so retries from any emitter dedupe correctly via the `idempotency-index` GSI
4. **Collision-safe encoding** under adversarial input (length-prefix, not delimiter join)
5. **No business logic in the library** — consumers compose the primitives into application logic
6. **IRSA-only credentials** — library never accepts static keys or env-var credentials
7. **Library is silent** — no logs, no spans, no metrics from library code; consumers add observability at call sites
8. **Easy to evolve** — adding a new table is local to one language at a time, then cross-language parity tests verify alignment

### Non-Goals

1. ❌ Web framework / HTTP transport — library is in-process function calls only
2. ❌ ORM / query DSL — direct DDB attribute marshaling, no abstraction
3. ❌ Schema migration tooling — not in scope until a real schema change requires it
4. ❌ Business logic (workspace creation, batch transitions, etc.) — that lives in consumers
5. ❌ Multi-region replication — single-region (eu-west-1) by design
6. ❌ Caching layer — consumers cache if they need to
7. ❌ Transactional helpers (`TransactWriteItems`) beyond what AWS SDK exposes — premature

---

## 3. Architecture

### High-level diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│  21 consumer units                                                  │
│                                                                     │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐         │
│   │ Go services  │  │ Python svcs  │  │ TypeScript svcs  │         │
│   │ (10 units)   │  │ (2 units)    │  │ (9 units)        │         │
│   └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘         │
│          │                  │                   │                   │
│          ▼                  ▼                   ▼                   │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │     LIB-04 — libs/data-access/{go, py, ts}/                 │  │
│   │                                                             │  │
│   │   Shared primitives:                                        │  │
│   │     · dynamoclient (IRSA-only AWS SDK setup)                │  │
│   │     · idempotency  (SHA-256 + length-prefix encoding)       │  │
│   │                                                             │  │
│   │   7 typed table clients (per language):                     │  │
│   │     · workspaces   · batches      · documents               │  │
│   │     · auditevents  · contenthashes                          │  │
│   │     · pipelinefiles · tasktokens                            │  │
│   │                                                             │  │
│   │   Pure data-access — no business logic, no logging          │  │
│   └─────────────────────────┬───────────────────────────────────┘  │
│                              │                                      │
│                              ▼ (AWS SDK v2 / v3 / boto3)            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AWS substrate (provisioned by platform-data Terraform stack)       │
│                                                                     │
│    7 DynamoDB tables    4 S3 buckets       2 KMS keys               │
└─────────────────────────────────────────────────────────────────────┘
```

### Repo layout

```text
libs/data-access/
├── go/                              # Go module: github.com/opus2/docuploader/libs/data-access/go
│   ├── go.mod
│   ├── dynamoclient/                # Shared DDB client setup (IRSA)
│   ├── idempotency/                 # deriveUpdateStatusKey, golden parity tests
│   ├── workspaces/                  # Workspace entity + Client.Get/Put
│   ├── batches/
│   ├── documents/                   # + FindByIdempotencyKey (GSI scan)
│   ├── auditevents/                 # + TTLForEvent (90 days)
│   ├── contenthashes/               # + TTLForHash (90 days)
│   ├── pipelinefiles/               # + ListByFolder (GSI scan), TTLForFile (7 days)
│   └── tasktokens/                  # + TTLForToken (1 day)
│
├── py/                              # uv-managed package: docuploader-data-access
│   ├── pyproject.toml
│   ├── data_access/
│   │   ├── _dynamo.py               # boto3 DDB resource setup
│   │   ├── _idempotency.py          # derive_update_status_key
│   │   ├── workspaces/__init__.py   # Workspace dataclass + Client.get/put
│   │   ├── batches/__init__.py
│   │   ├── documents/__init__.py
│   │   ├── auditevents/__init__.py
│   │   ├── contenthashes/__init__.py
│   │   ├── pipelinefiles/__init__.py
│   │   └── tasktokens/__init__.py
│   └── tests/                       # pytest + hypothesis property tests
│
└── ts/                              # pnpm workspace member: @docuploader/data-access
    ├── package.json
    ├── src/
    │   ├── _dynamo.ts               # DynamoDBDocumentClient v3 setup
    │   ├── _idempotency.ts          # deriveUpdateStatusKey
    │   ├── workspaces/index.ts      # Workspace interface + Client.get/put
    │   ├── batches/index.ts
    │   ├── documents/index.ts
    │   ├── auditevents/index.ts
    │   ├── contenthashes/index.ts
    │   ├── pipelinefiles/index.ts
    │   └── tasktokens/index.ts
    └── tests/                       # vitest + fast-check property tests
```

---

## 4. API Surface

### Per-table client shape (same in all 3 languages)

Each of the 7 tables exposes a `Client` with the same conceptual operations:

| Operation | Required? | Notes |
| --- | --- | --- |
| `Get(id)` / `get(id)` | always | Returns entity or `ErrNotFound` |
| `Put(entity)` / `put(entity)` | always | Idempotent (overwrite semantics) |
| `FindByIdempotencyKey(key)` | only documents | Queries `idempotency-index` GSI |
| `ListByFolder(folderPath)` | only pipelinefiles | Queries `folderPath-index` GSI |
| `Delete(id)` | only tasktokens | One-shot cleanup |
| `TTLFor*` helper | tables with TTL | Returns Unix epoch seconds |

### Shared primitives (cross-cutting)

| Function | All 3 languages | Purpose |
| --- | --- | --- |
| `deriveUpdateStatusKey(executionId, toState, phase)` | ✅ | SHA-256 hex; bit-identical across languages |
| `newDynamoDocumentClient(region)` | ✅ | IRSA-only AWS SDK setup |
| Entity types (Workspace, Batch, Document, ...) | ✅ idiomatic | Go: struct; Python: dataclass; TS: interface |

### Language-idiomatic examples

**Go** — explicit error returns, pointer receivers
```go
client := workspaces.NewClient(ddbClient)
ws, err := client.Get(ctx, "ws-abc123")
if err != nil { /* handle */ }
```

**Python** — exceptions on error
```python
client = workspaces.Client(table)
ws = client.get("ws-abc123")  # raises if not found
```

**TypeScript** — async / Promise-based
```ts
const client = new workspaces.Client(ddbClient);
const ws = await client.get("ws-abc123");
```

---

## 5. Data Model — 7 DynamoDB tables

| # | Table | PK | GSI | TTL | Purpose |
| --- | --- | --- | --- | --- | --- |
| 1 | `docuploader-api-workspaces` | `workspaceId` | none | none | Per-tenant config, KMS alias mapping |
| 2 | `docuploader-api-batches` | `batchId` | none | none | Open → Closed state machine |
| 3 | `docuploader-api-documents` | `documentId` | `idempotency-index` (PK `idempotencyKey`) | none | Document state; idempotent retries |
| 4 | `docuploader-api-audit-events` | `eventId` | none | **90 days** | Audit trail (compliance) |
| 5 | `docuploader-content-hashes` | `hashSha256` | none | **90 days** | SHA-256 deduplication |
| 6 | `docuploader-pipeline-files` | `fileId` | `folderPath-index` (PK `folderPath`) | **7 days** | Pipeline file ledger |
| 7 | `textract-task-tokens` | `taskToken` | none | **1 day** | Async Textract callback correlation |

### Entity-type contract (all 3 languages agree on these fields)

For example, the **Workspace** entity:
- `workspaceId: string` (PK)
- `tenantId: string`
- `name: string`
- `kmsAliasName: string` (per-tenant alias, e.g., `alias/docuploader-tenant-{id}`)
- `retentionPolicy: { inputRetentionDays: int }` (default 7)
- `pipelineConfig: { forcedSlipsheet: bool, ... }`
- `createdAt: ISO-8601 string`

Each language emits this with idiomatic naming (Go `WorkspaceID`, Python `workspace_id`, TS `workspaceId`) but the JSON/DDB attribute names are identical so DDB items written from Go are readable by Python and vice versa.

---

## 6. Cross-Language Parity Contract

### The hardest invariant

> Same `(executionId, toState, phase)` triple → **identical 64-char hex SHA-256 digest** in Go, Python, and TypeScript.

### Why it matters

When a document goes through the pipeline:
1. `update-document-state-lambda` (Go) calls `UpdateDocumentStatus` with key K1
2. Network blip; orchestrator retries from `wundergraph-router` (Go) — same triple → same K1, DDB GSI dedupes
3. A pipeline worker (TypeScript) replays the same triple — same K1
4. A batch reconciler (Python) computes K1 to look up the record

If any language produced a different hash, retries would create duplicate records and the `idempotency-index` GSI guarantees would silently break.

### Algorithm — length-prefix encoding

```text
hash = SHA-256(
   uint32_be(len(executionId.utf8)) || executionId.utf8
|| uint32_be(len(toState.utf8))     || toState.utf8
|| uint32_be(len(phase.utf8))       || phase.utf8
)
```

Why length-prefix (not delimiter join):

**Delimiter join is broken** under adversarial input. The bug we caught early:

```text
("a", "b\x1fc", "d")   →  "a\x1fb\x1fc\x1fd"
("a", "b",     "c\x1fd") →  "a\x1fb\x1fc\x1fd"
                            ^^^^^^^^^^^^^^^^^^
                            same string → same SHA-256 → COLLISION
```

Length-prefix encoding is collision-safe: the length field unambiguously delimits each component byte-for-byte.

### Verification

Each language has a `test_idempotency` suite with:
- **Golden inputs** — `(arn:aws:states:..., PROCESSING, convert)` produces a known hex
- **Determinism** — same input → same output across 1000 invocations
- **Distinct-on-any-component** — changing any one input changes the hash
- **Delimiter safety** — adversarial inputs (containing `\x1f`) MUST NOT collide
- **Property tests** — `hypothesis` (Python) and `fast-check` (TypeScript) generate adversarial inputs

---

## 7. Dependencies & Consumer Wiring

### Library-internal dependencies

| Language | AWS SDK | Hash | Binary encoding | Test framework |
| --- | --- | --- | --- | --- |
| Go | `github.com/aws/aws-sdk-go-v2/service/dynamodb` | `crypto/sha256` (stdlib) | `encoding/binary` (stdlib) | `testing` (stdlib) |
| Python | `boto3 >= 1.34` | `hashlib.sha256` (stdlib) | `struct.pack('>I', n)` (stdlib) | `pytest` + `hypothesis` |
| TypeScript | `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` (v3) | `node:crypto` `createHash('sha256')` | `Buffer.writeUInt32BE` | `vitest` + `fast-check` |

### How consumers depend on the library (idiomatic per language)

**Go** — `replace` directive in consumer's `go.mod`:

```go
require github.com/opus2/docuploader/libs/data-access/go v0.0.0-00010101000000-000000000000
replace github.com/opus2/docuploader/libs/data-access/go => ../../libs/data-access/go
```

**Python** — `uv` path source in consumer's `pyproject.toml`:

```toml
[project]
dependencies = ["docuploader-data-access"]

[tool.uv.sources]
docuploader-data-access = { path = "../../libs/data-access/py", editable = true }
```

**TypeScript** — pnpm `workspace:*` in consumer's `package.json`:

```json
{ "dependencies": { "@docuploader/data-access": "workspace:*" } }
```

All three use **standard, idiomatic tooling** — no shell scripts, no symlinks, no copy-on-build.

### 21 consumers across 3 languages

| Language | Count | Units |
| --- | --- | --- |
| **Go** | 10 | workspace-resolver, batch-resolver, document-resolver, wundergraph-router, pre-token-generation-lambda, document-event-handler-lambda, audit-event-storage-lambda, update-document-state-lambda, email-extraction-service, virus-scanning-service |
| **Python** | 2 | pdf-processing-service, office-conversion-orchestrator-sidecar |
| **TypeScript** | 9 | classification, ocr, zip-extraction, output-assembly, slipsheet, html-conversion-typescript-sidecar, tiff-cog, image-tiff-conversion, media-conversion |
| **Excluded** | 2 | `react-web-module` (talks to GraphQL only); `office-conversion-aspose-container` (C++; reads files, no DDB) |

---

## 8. Testing Strategy

### Five test surfaces, replicated across all 3 languages

| Surface | Pattern | Tools |
| --- | --- | --- |
| Per-table round-trip | `Put(entity); Get(id) == entity` for each of 7 tables | stdlib `testing`, `pytest`, `vitest` |
| TTL invariants | `TTLForX(now)` returns now + correct days | same |
| Cross-language SHA-256 parity | Golden inputs → same hex digest in each language | golden test |
| Determinism | Pure function: same input → same output (1000 invocations) | property test |
| Distinct-on-any-component | Adversarial input mutations don't collide | `hypothesis` / `fast-check` |
| Delimiter safety | Inputs containing `\x1f` MUST NOT collide | property test |

### Test totals (verified by execution)

| Language | Tests |
| --- | --- |
| Go | **22** |
| Python | **28** (hypothesis-driven) |
| TypeScript | **26** (fast-check) |
| **Total** | **76 / 76 PASS** |

### Deferred test surfaces

| Surface | Why deferred |
| --- | --- |
| Tier-2 LocalStack integration | Needs `make localstack-up` + `make localstack-bootstrap` harness (not authored) |
| Tier-3 sandbox-deployed integration | Requires Phase E (cluster deploy) to actually run; no pods exist yet |
| J4 cross-tenant isolation evidence | Needs deployed workloads + 2 test tenants |
| Performance benchmarks | No p50/p95/p99 latency or throughput SLOs measured |

---

## 9. Non-Functional Requirements

### Security

- **IRSA-only credentials** — library never reads static AWS keys, never accepts env-var credentials, never falls back to ambient credentials
- **No secrets in code** — license keys, auth tokens, etc. live in Secrets Manager; library doesn't reference them
- **No logging** — library is silent; consumers cannot accidentally leak PII through library spans
- **Audit-archive bucket** uses a separate KMS key (audit-archive-cmk) so even Opus2 platform admins can't trivially read audit trails

### Compliance

- **SOC 2 / ISO 27001** alignment: per-tenant KMS aliases ensure tenant A's documents cannot be decrypted with tenant B's IAM credentials
- **GDPR / data residency**: single-region (eu-west-1)
- **Audit retention**: 90 days TTL on audit-events; Object Lock Compliance 7-year retention on archive bucket

### Performance (current — pending real benchmark)

| Operation | Expected latency (estimated) |
| --- | --- |
| `Get(id)` from a small table | < 10ms p99 |
| `Put(entity)` to a small table | < 15ms p99 |
| `FindByIdempotencyKey` (GSI) | < 20ms p99 (1 RCU) |
| `deriveUpdateStatusKey` (pure CPU) | < 1µs per call |

**Status**: estimates only. No benchmarks have been measured against real dev05 DDB tables.

### Reliability

- **Idempotent writes**: callers compute idempotency keys; library doesn't add layers
- **Retry-safe**: pure functions; consumers handle SDK-level retries via AWS SDK config
- **No hidden state**: library has no module-level mutable state, no singletons, no caches

### Observability (current state)

- **Library emits nothing** — by design
- **Consumers** add OpenTelemetry spans at their own call sites
- The `otlp` endpoint (`grafana-k8s-monitoring-alloy-receiver.grafana.svc:4317`) is wired into consumer Helm charts, not the library

---

## 10. Key Trade-offs & Decisions

| # | Decision | Why | Trade-off |
| --- | --- | --- | --- |
| 1 | Three implementations, not one shared service | Consumers across 3 languages — wrapping in a "data-access service" adds 1 network hop per call | Drift risk — mitigated by cross-language parity tests |
| 2 | Length-prefix encoding (not delimiter join) | Adversarial-input safety — caught real bug in dev | Slightly more bytes per hash input (negligible) |
| 3 | No business logic in library | Auditability, evolvability | Consumers must compose primitives — slight repetition |
| 4 | No logging from library | Consumers control observability | Hard to debug library-internal issues — mitigated by tests |
| 5 | `dynamoclient` and `idempotency` at top level (not `internal/`) | Go's `internal/` rule blocks cross-module imports | Slightly broader API surface |
| 6 | Slug matrix names (`py`, `ts`) over long names (`python`, `typescript`) | Org rule conformance | Cosmetic |
| 7 | DynamoDB DocumentClient (TS) / boto3 Table resource (Py) / SDK v2 attributevalue (Go) — different DDB abstractions per language | Each language's idiomatic patterns | Slight code-shape variance, hidden by client wrapper |
| 8 | No ORM | Pure attribute marshaling is simpler + faster | More code per table client — but consistent pattern |

---

## 11. Operational concerns

### Deployment

- Library is **not deployed** — it's compiled into consumer binaries
- Each consumer's Docker image bakes in the library at `docker build` time
- Updates: consumer rebuilds image after library changes; ArgoCD picks up new image tag

### Versioning

- **No external versioning** — library lives in the same monorepo as consumers; consumer `replace` / `path` / `workspace:*` refs always pull the latest
- Breaking changes require simultaneous consumer updates (single PR across the monorepo)

### Failure modes

| Failure | Detection | Recovery |
| --- | --- | --- |
| Library returns stale data | Consumer caches stale (n/a — library has no cache) | n/a |
| DDB API throttling | AWS SDK retries; library doesn't intercept | Auto-recover; consumer increases retry budget if needed |
| KMS access denied | DDB API returns error; library surfaces it | Verify IRSA role has KMS perms |
| Cross-language hash drift | Golden parity test FAILS in CI | Hold release; investigate which language drifted |

---

## 12. Future work / open questions

| # | Item | Priority |
| --- | --- | --- |
| 1 | Tier-2 LocalStack integration tests | High — closes the validation gap before any deploy |
| 2 | OpenTelemetry tracing inside the library | Medium — design decision needed (span granularity) |
| 3 | Performance benchmarks (p50/p95/p99) | Medium — needed for SLO definition |
| 4 | Schema migration helpers | Low — premature until real schema evolution |
| 5 | C++ binding (currently no consumer needs it) | Low — Aspose container reads files, not DDB |
| 6 | Multi-region replication | Low — not in MVP scope |
| 7 | Server-side transaction helpers (`TransactWriteItems` wrappers) | Low — premature |

---

## 13. References

| Reference | Where |
| --- | --- |
| Original unit spec | `aidlc-docs/inception/units/platform-data.md` (LIB-04 was scoped under platform-data) |
| Construction code summary | `aidlc-docs/construction/platform-data/code/code-summary.md` |
| Rule file (slug matrix, parity contract) | `.aidlc-rule-details/common/multi-language-units.md` |
| Test execution log | `aidlc-docs/aidlc-state.md` § "Test Execution — libs/data-access" |
| Rehearsal report (bugs found + fixed) | `aidlc-docs/operations/dev05-rehearsal-report.md` |
| Deployment snapshot — May 13 | `aidlc-docs/operations/dev05-aws-deployment-2026-05-13/` |
| Deployment snapshot — May 14 | `aidlc-docs/operations/dev05-aws-deployment-2026-05-14/` |
| Live library source | `libs/data-access/{go, py, ts}/` |
| Cross-language parity test (Go) | `libs/data-access/go/idempotency/key_test.go` |

---

## 14. Status (as of 2026-05-15)

| Item | Status |
| --- | --- |
| Library code (Go + Py + TS) | ✅ Authored |
| 7 typed table clients per language | ✅ |
| Shared primitives | ✅ |
| Cross-language SHA-256 parity | ✅ Verified |
| Length-prefix encoding | ✅ Verified by adversarial property tests |
| Real bugs caught + fixed | ✅ 4 (delimiter-injection, Go internal/ visibility ×2, sqstypeshim) |
| 21 consumer integrations wired | ✅ |
| 76 tests passing | ✅ |
| Slug alignment (`py`/`ts`) | ✅ |
| Real AWS DDB tables back the library | ✅ deployed May 13 + 14 |
| Library running in dev05 pods | ❌ Phase E not yet executed |
| Tier-2 LocalStack tests | ⏸ deferred |
| Tier-3 deployed integration tests | ⏸ deferred |
| Performance benchmarks | ⏸ not measured |
