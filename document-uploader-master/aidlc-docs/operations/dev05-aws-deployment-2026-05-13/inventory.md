# Inventory — 76 AWS resources

Every successful mutation on 2026-05-13, with ARNs and console links.

## 0. Pre-Phase A bootstrap (2 changes)

| Time (IST) | Resource | Identifier |
| --- | --- | --- |
| 13:55:29 | EKS `publicAccessCidrs` modification | `103.82.209.141/32` added to `DEV05-EKS-CLUSTER` (17 → 18 CIDRs) |
| 16:38:14 | Terraform state bucket | `s3://docuploader-tfstate-537462380503` |

[EKS networking console](https://eu-west-1.console.aws.amazon.com/eks/home?region=eu-west-1#/clusters/DEV05-EKS-CLUSTER/networking)
[State bucket console](https://eu-west-1.console.aws.amazon.com/s3/buckets/docuploader-tfstate-537462380503?region=eu-west-1&prefix=dev05/)

## 1. platform-data — 28 resources (16:39-16:42 IST)

### KMS keys (2)

| ARN | Console |
| --- | --- |
| `arn:aws:kms:eu-west-1:537462380503:key/8736ceac-2814-461f-a7eb-bfef665e9218` | [open](https://eu-west-1.console.aws.amazon.com/kms/home?region=eu-west-1#/kms/keys/8736ceac-2814-461f-a7eb-bfef665e9218) — tenant master CMK |
| `arn:aws:kms:eu-west-1:537462380503:key/452fba72-0419-4c0d-8c16-3beb7b644716` | [open](https://eu-west-1.console.aws.amazon.com/kms/home?region=eu-west-1#/kms/keys/452fba72-0419-4c0d-8c16-3beb7b644716) — audit-archive CMK |

### DynamoDB tables (7)

| Table | Console |
| --- | --- |
| `docuploader-api-workspaces` | [open](https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-api-workspaces) |
| `docuploader-api-batches` | [open](https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-api-batches) |
| `docuploader-api-documents` (with `idempotency-index` GSI) | [open](https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-api-documents) |
| `docuploader-api-audit-events` (90d TTL) | [open](https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-api-audit-events) |
| `docuploader-content-hashes` (90d TTL) | [open](https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-content-hashes) |
| `docuploader-pipeline-files` (with `folderPath-index` GSI, 7d TTL) | [open](https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-pipeline-files) |
| `textract-task-tokens` (1d TTL) | [open](https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=textract-task-tokens) |

### S3 buckets (4)

| Bucket | Notes |
| --- | --- |
| `docuploader-api-staging` | 7-day lifecycle, SSE-KMS tenant, BPA, deny-non-TLS policy |
| `docuploader-pipeline` | SSE-KMS tenant, BPA, deny-non-TLS |
| `docuploader-pipeline-config` | SSE-KMS tenant, BPA, deny-non-TLS |
| `docuploader-api-audit-archive` | Object Lock Compliance 7y, Glacier IR transition, SSE-KMS audit, BPA |

### Supporting (15)

- 2 × `aws_kms_alias`
- 2 × `aws_kms_key` rotation configs
- 4 × `aws_s3_bucket_public_access_block`
- 4 × `aws_s3_bucket_server_side_encryption_configuration`
- 4 × `aws_s3_bucket_policy` (deny non-TLS)
- 2 × `aws_s3_bucket_lifecycle_configuration` (staging + audit-archive)
- 1 × `aws_s3_bucket_object_lock_configuration` (audit-archive)

## 2. platform-iam-and-security — 43 resources (16:46-16:49 IST) + 15 failed retries

### IAM roles (21) — all `docuploader-*`

Each has one inline policy named `permissions`.

**Resolvers + router (4)**
- `docuploader-router`
- `docuploader-workspace-resolver`
- `docuploader-batch-resolver`
- `docuploader-document-resolver`

**Pipeline workers (12)** — IRSA trust for k8s ns `docuploader-dev05`
- `docuploader-classification-service`
- `docuploader-email-extraction-service`
- `docuploader-html-conversion-typescript-sidecar`
- `docuploader-image-tiff-conversion-service`
- `docuploader-media-conversion-service`
- `docuploader-ocr-service`
- `docuploader-office-conversion-orchestrator-sidecar`
- `docuploader-output-assembly-service`
- `docuploader-pdf-processing-service`
- `docuploader-slipsheet-service`
- `docuploader-tiff-cog-service`
- `docuploader-zip-extraction-service`

**Lambda execution (4)** — Lambda service trust
- `docuploader-pre-token-generation-lambda`
- `docuploader-document-event-handler-lambda`
- `docuploader-audit-event-storage-lambda`
- `docuploader-update-document-state-lambda`

**Service-level (1)** — GuardDuty service trust
- `docuploader-guardduty-malware-protection`

[Filtered IAM console](https://us-east-1.console.aws.amazon.com/iam/home#/roles?search=docuploader-)

### Secrets Manager (3 secrets + 1 value)

| Secret | Console |
| --- | --- |
| `docuploader/aspose-licence` | [open](https://eu-west-1.console.aws.amazon.com/secretsmanager/secret?region=eu-west-1&name=docuploader%2Faspose-licence) |
| `docuploader/audit-archive-cmk-arn` | [open](https://eu-west-1.console.aws.amazon.com/secretsmanager/secret?region=eu-west-1&name=docuploader%2Faudit-archive-cmk-arn) |
| `docuploader/graphql-internal-auth` | [open](https://eu-west-1.console.aws.amazon.com/secretsmanager/secret?region=eu-west-1&name=docuploader%2Fgraphql-internal-auth) |

### GuardDuty (1 detector + 1 failed)

| Resource | Status |
| --- | --- |
| `aws_guardduty_detector` ID `c55f8911c5a9434c8512f08ecbe15049` | ✅ Created |
| `aws_guardduty_malware_protection_plan.staging` | ❌ Failed (S3 EventBridge perms) — retried 15× |

[GuardDuty console](https://eu-west-1.console.aws.amazon.com/guardduty/home?region=eu-west-1)

## 3. NOT applied — would have created ~54 more resources

| Stack | Resources it WOULD create | Status |
| --- | --- | --- |
| `platform-network-and-compute` | 22 ECR repos + 1 ACM certificate | ⏸ Not applied |
| `platform-orchestration` | 14 SQS queues + 14 DLQ queues + 14 redrive policies + EventBridge bus + EventBridge rules + Step Functions Standard state machine (21-state ASL) | ⏸ Not applied |

## Cost projection

| Resource type | Daily cost (idle) | Daily cost (under workload) |
| --- | --- | --- |
| 7 DynamoDB tables (pay-per-request) | ~$0 | depends on req volume |
| 4 S3 buckets (empty) | < $0.01 | depends on stored bytes |
| 1 State bucket | < $0.01 | + small for versions |
| 2 KMS keys ($1/mo + $0.03/10k requests) | ~$0.07 | + usage |
| 3 Secrets Manager entries ($0.40/mo each) | ~$0.04 | + small per API call |
| 1 GuardDuty detector (Basic, no malware) | $0–$0.50 | + log analysis cost |
| EKS endpoint config | $0 | $0 |
| **Estimated total** | **~$0.20–$0.70 / day** | **~$2–5 / day** |

## CloudTrail audit

[All my events today](https://eu-west-1.console.aws.amazon.com/cloudtrailv2/home?region=eu-west-1#/events?Username=aravichandran-sso%40opus2.online&StartTime=2026-05-13T00%3A00%3A00Z)

Filter by `EventSource`:
- `dynamodb.amazonaws.com` → 7 × `CreateTable`
- `s3.amazonaws.com` → 5 × `CreateBucket` + lifecycle/policy puts
- `kms.amazonaws.com` → 2 × `CreateKey` + aliases + rotation
- `iam.amazonaws.com` → 21 × `CreateRole` + 21 × `PutRolePolicy`
- `secretsmanager.amazonaws.com` → 3 × `CreateSecret` + 1 × `PutSecretValue`
- `guardduty.amazonaws.com` → 1 × `CreateDetector` + 15 × failed `CreateMalwareProtectionPlan`
- `eks.amazonaws.com` → 1 × `UpdateClusterConfig`
