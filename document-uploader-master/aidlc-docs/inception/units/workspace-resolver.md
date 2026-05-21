# workspace-resolver

**Tier**: API
**Language**: Go
**Compute**: EKS Deployment (gRPC backend)

## Purpose
Implements `Workspace` CRUD and per-workspace KMS-alias provisioning (A27 override). On `createWorkspace`, creates a per-tenant KMS alias bound to the shared customer-managed key infrastructure and seeds prefix-scoped IAM.

## Responsibilities
- gRPC handlers: `createWorkspace`, `updateWorkspace`, `getWorkspace`
- KMS-alias creation + prefix-IAM seeding on `createWorkspace`
- Persisting `EncryptionConfig`, `pipelineConfig`, `retentionPolicy` (default `inputRetentionDays=7`, `forcedSlipsheetExtensions=[csv, ods]`)
- Idempotency-keyed mutations

## Inputs (consumed)
- gRPC from `wundergraph-router`
- DynamoDB `docuploader-api-workspaces`
- KMS: alias-creation API

## Outputs (produced)
- DynamoDB rows in `docuploader-api-workspaces`
- KMS aliases bound to the customer-managed key
- gRPC responses to router

## Dependencies
- `platform-data` (table + KMS), `platform-iam-and-security` (IAM role for KMS alias creation)

## Test gate
Three-tier — Local: unit tests + property tests on tenant-isolation invariants; LocalStack: DynamoDB + KMS; Sandbox: real KMS alias creation + per-tenant isolation evidence.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/workspace-resolver/`
- Source: `units/workspace-resolver/`
