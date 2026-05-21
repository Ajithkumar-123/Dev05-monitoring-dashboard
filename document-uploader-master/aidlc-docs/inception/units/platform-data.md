# platform-data

**Tier**: Platform
**Language**: Terraform + Go + Python + TypeScript (multi-language unit; split-by-language-first per `tech-environment.md` project structure)
**Compute**: Cross-cutting infrastructure + a versioned tri-language data-access library consumed by Go, Python, and TypeScript callers via each language's package manager

## Purpose
Owns all persistence: DynamoDB tables (with GSIs and TTLs), S3 buckets (staging, pipeline, audit-archive, pipeline-config), KMS keys and per-tenant aliases, and S3 Lifecycle rules. Additionally exposes a **tri-language data-access library** at workspace-root `libs/data-access/{go,python,typescript}/` — typed clients and entity types for the seven DynamoDB tables, consumed by every Go, Python, and TypeScript caller via their respective package managers (Go modules, uv, pnpm).

## Layout

The unit's Terraform deliverables live under `units/platform-data/terraform/`. The unit's data-access library is **deliberately placed at the workspace-root path `libs/data-access/`** at user direction (explicit override of `tech-environment.md` § "Root-level shared modules are prohibited"; recorded in `audit.md`). Ownership of the library remains with the `platform-data` unit. The library is **split by language first** per `tech-environment.md` project-structure rules; each language sub-tree follows its own idiomatic layout.

```text
units/platform-data/
└── terraform/                          # all AWS resources (DynamoDB, S3, KMS, S3 Lifecycle)

libs/data-access/                       # tri-language data-access library owned by platform-data
├── go/                                 # Go module — consumed via Go modules
│   ├── workspaces/                     #   docuploader-api-workspaces
│   ├── batches/                        #   docuploader-api-batches
│   ├── documents/                      #   docuploader-api-documents (+ idempotency-index GSI helpers)
│   ├── auditevents/                    #   docuploader-api-audit-events
│   ├── contenthashes/                  #   docuploader-content-hashes
│   ├── pipelinefiles/                  #   docuploader-pipeline-files (+ folderPath-index)
│   ├── tasktokens/                     #   textract-task-tokens
│   ├── go.mod
│   └── go.sum
├── python/                             # uv-managed Python package — consumed via uv path deps
│   ├── data_access/                    #   importable as `from data_access.documents import …`
│   │   ├── workspaces/
│   │   ├── batches/
│   │   ├── documents/
│   │   ├── auditevents/
│   │   ├── contenthashes/
│   │   ├── pipelinefiles/
│   │   └── tasktokens/
│   ├── pyproject.toml
│   ├── uv.lock
│   └── .python-version
└── typescript/                         # pnpm-managed package — consumed via pnpm workspace links
    ├── src/
    │   ├── workspaces/
    │   ├── batches/
    │   ├── documents/
    │   ├── auditevents/
    │   ├── contenthashes/
    │   ├── pipelinefiles/
    │   └── tasktokens/
    ├── package.json
    ├── pnpm-lock.yaml
    └── tsconfig.json
```

All three language packages expose the **same conceptual surface** (one client + one entity type per DynamoDB table) but with idiomatic per-language API shapes. Each is a pure data-access layer — no business logic.

## Responsibilities
- DynamoDB tables: `docuploader-api-workspaces`, `docuploader-api-batches`, `docuploader-api-documents` (with `idempotency-index` GSI), `docuploader-api-audit-events` (90-day TTL), `docuploader-content-hashes` (90-day TTL), `textract-task-tokens` (1-day TTL), `docuploader-pipeline-files` (7-day TTL with `folderPath-index` GSI)
- S3 buckets: `docuploader-pipeline`, `docuploader-api-staging` (single bucket per A27), `docuploader-api-audit-archive` (Glacier IR + Object Lock Compliance, 7-year default), `docuploader-pipeline-config`
- KMS customer-managed keys with per-tenant aliases (A27 override); 6-month default rotation cadence
- Separate operator-managed CMK for `docuploader-api-audit-archive`
- S3 Lifecycle rules implementing `Workspace.retentionPolicy.inputRetentionDays` (default 7 days)
- **Go `pkg/dataaccess/` library**: typed entity structs, table-name constants, GSI helpers, idempotency-key derivation utilities, and thin AWS SDK v2 client wrappers (`workspaces.Client`, `batches.Client`, `documents.Client`, …). Pure data-access layer; no business logic. Versioned via Go modules; consumed by API/pipeline Go callers as a normal Go module dependency

## Inputs (consumed)
- IAM principals from `platform-iam-and-security` (for KMS grants and S3 bucket policies)

## Outputs (produced)
- DynamoDB table ARNs / stream ARNs (consumed by API tier resolvers and Lambdas)
- S3 bucket ARNs (consumed by `document-event-handler-lambda`, pipeline workers, `react-web-module` via presigned URLs)
- KMS key + alias ARNs (consumed by API tier and pipeline workers for SSE-KMS)
- **Tri-language data-access library at `libs/data-access/{go,python,typescript}/`** (owned by `platform-data`; root-level placement is an explicit project-structure override — see Layout note above). Each language sub-package is consumed via its own package manager (Go modules / uv / pnpm); lockfiles committed; lockfile-strict installs in CI for every consumer

## Consumers of the data-access library

### Go (`libs/data-access/go/`)
- `workspace-resolver` (workspaces)
- `batch-resolver` (batches)
- `document-resolver` (documents + idempotency-index)
- `document-event-handler-lambda` (documents)
- `audit-event-storage-lambda` (auditevents)
- `update-document-state-lambda` (documents)
- `pre-token-generation-lambda` (workspaces — tenant resolution at token-mint time)
- `email-extraction-service` (documents — child fan-out)

### Python (`libs/data-access/py/`)
- `pdf-processing-service` (pipelinefiles)
- `office-conversion-orchestrator-sidecar` (pipelinefiles, workspaces for pipelineConfig)

### TypeScript (`libs/data-access/ts/`)
- `classification-service` (workspaces — for pipelineConfig)
- `ocr-service` (tasktokens — async Textract callback correlation)
- `output-assembly-service` (pipelinefiles)
- `slipsheet-service` (workspaces — for forcedSlipsheet config)
- `zip-extraction-service` (pipelinefiles)
- `html-conversion-typescript-sidecar` (pipelinefiles)
- `tiff-cog-service` (pipelinefiles)
- `image-tiff-conversion-service` (pipelinefiles)
- `media-conversion-service` (pipelinefiles)

(`react-web-module` does **not** consume the data-access library; it accesses data only through the public GraphQL API.)

## Dependencies
- `platform-iam-and-security` (KMS grants reference IAM roles)

## Test gate
Three-tier across all three language sub-packages:
- **Local**: `terraform plan` for infra. Per-language unit + property tests on the data-access library: Go (`go test ./...` + `testing/quick`-style property tests), Python (`pytest` + `hypothesis`), TypeScript (`vitest` + `fast-check`). Invariants covered: idempotency-key derivation, key-condition shapes, entity type round-trips. Allure reports from each language's test runner
- **LocalStack**: DynamoDB + S3 + KMS basic; per-language integration tests against LocalStack DynamoDB
- **Sandbox**: real `terraform apply`; per-language integration tests against real DynamoDB; KMS-alias rotation runbook validated end-to-end

## Construction-stage artefacts
- Infrastructure design: `aidlc-docs/construction/platform-data/infrastructure-design/`
- Code summary: `aidlc-docs/construction/platform-data/code/`
- Source: `units/platform-data/`
