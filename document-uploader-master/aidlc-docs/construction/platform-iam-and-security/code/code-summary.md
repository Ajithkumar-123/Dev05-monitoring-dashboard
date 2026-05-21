# Code Generation Summary — platform-iam-and-security

## Status: complete

## Artefacts produced

### Terraform (`units/platform-iam-and-security/terraform/`)

| File | Contents |
| --- | --- |
| `versions.tf` | Terraform 1.10+ + AWS provider ~5.0 + S3-native state locking |
| `variables.tf` | Region, environment, K8s namespaces, EKS cluster name, platform-data remote-state key |
| `data.tf` | Reads platform-data remote state for DDB/S3/KMS ARNs; resolves EKS OIDC provider; IRSA trust-policy helper as `for_each` over a service-account map; Lambda trust policy |
| `iam-api-tier.tf` | 8 roles + permissions: `docuploader-router`, `-workspace-resolver`, `-batch-resolver`, `-document-resolver`, `-pre-token-generation-lambda`, `-document-event-handler-lambda`, `-audit-event-storage-lambda`, `-update-document-state-lambda` |
| `iam-pipeline-tier.tf` | 12 pipeline worker roles via `for_each` over `local.pipeline_workers` map. Per-worker permission profile: queue ARN, S3 buckets, DynamoDB tables, KMS decrypt with tenant CMK |
| `guardduty.tf` | GuardDuty detector + Malware Protection plan targeting `docuploader-api-staging`; supporting IAM role + permissions |
| `secrets.tf` | Skeletons for `docuploader/graphql-internal-auth`, `docuploader/aspose-licence`, `docuploader/audit-archive-cmk-arn` (with version pointing at the audit CMK ARN) |
| `outputs.tf` | API tier role ARNs map, pipeline worker role ARNs map, GuardDuty detector ID, secret ARNs |

## Role count

20 IAM roles total:
- API tier: 8 (1 router + 3 resolvers + 4 Lambdas)
- Pipeline tier: 12 (via `for_each`)
- Plus 1 GuardDuty service role (not in the "20 workload roles" count)

This is on the higher end of the "~17 roles" estimate in `tech-environment.md` but consistent with the design: every distinct workload that needs AWS access has its own least-privilege role.

## Tenant isolation enforcement

- S3 actions are scoped to bucket prefixes; per-tenant prefix scoping is enforced at the **resolver layer** in code (the resolver's authenticated context supplies the `tenantId` used in S3 keys), not in the IAM policy itself. This is consistent with the A27 model where logical isolation is via KMS aliases + prefix-scoped IAM at the path level.
- KMS Encrypt/Decrypt/GenerateDataKey grants resolve to the tenant CMK; per-tenant aliases are created at runtime by `workspace-resolver` via the `kms:CreateAlias` permission and bind to this same key.
- Audit-archive operations use a separate operator-managed CMK; tenant-aliased roles cannot encrypt audit-archive data.

## What's deliberately not here

- The K8s ServiceAccount YAML manifests with the `eks.amazonaws.com/role-arn` annotation — those live in `platform-network-and-compute` (which consumes the role ARNs from this unit's outputs).
- IAM permission tests via SCP-style probes — produced in this unit's test gate during a subsequent test-authoring pass.
- Secret rotation — operator runbook responsibility at MVP.

## Construction next

Tier-1 platform substrate remaining: `platform-network-and-compute`, `platform-orchestration`. After Tier-1 completes, Tier-2 (API stack) unblocks.
