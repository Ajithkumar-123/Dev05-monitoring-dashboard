# URL List — dev05 Redeployment (2026-05-14)

Console URLs for verifying every resource currently live in account `537462380503`, eu-west-1.

## 1. EKS cluster

| Resource | URL |
| --- | --- |
| DEV05-EKS-CLUSTER overview | https://eu-west-1.console.aws.amazon.com/eks/home?region=eu-west-1#/clusters/DEV05-EKS-CLUSTER |
| DEV05 networking (CIDR allowlist — 18 entries, your IP NOT added today) | https://eu-west-1.console.aws.amazon.com/eks/home?region=eu-west-1#/clusters/DEV05-EKS-CLUSTER/networking |
| DEV05 add-ons | https://eu-west-1.console.aws.amazon.com/eks/home?region=eu-west-1#/clusters/DEV05-EKS-CLUSTER/add-ons |

## 2. Terraform state bucket

| Resource | URL |
| --- | --- |
| `docuploader-tfstate-537462380503` root | https://eu-west-1.console.aws.amazon.com/s3/buckets/docuploader-tfstate-537462380503?region=eu-west-1 |
| `dev05/` prefix (where state files live) | https://eu-west-1.console.aws.amazon.com/s3/buckets/docuploader-tfstate-537462380503?region=eu-west-1&prefix=dev05/ |
| platform-data state | https://eu-west-1.console.aws.amazon.com/s3/object/docuploader-tfstate-537462380503?region=eu-west-1&prefix=dev05/platform-data/terraform.tfstate |
| platform-iam-and-security state | https://eu-west-1.console.aws.amazon.com/s3/object/docuploader-tfstate-537462380503?region=eu-west-1&prefix=dev05/platform-iam-and-security/terraform.tfstate |

## 3. DynamoDB tables (7)

| Table | URL |
| --- | --- |
| `docuploader-api-workspaces` | https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-api-workspaces |
| `docuploader-api-batches` | https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-api-batches |
| `docuploader-api-documents` | https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-api-documents |
| `docuploader-api-audit-events` | https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-api-audit-events |
| `docuploader-content-hashes` | https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-content-hashes |
| `docuploader-pipeline-files` | https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-pipeline-files |
| `textract-task-tokens` | https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=textract-task-tokens |

## 4. S3 buckets (4 + 1 state)

| Bucket | URL |
| --- | --- |
| `docuploader-api-staging` | https://eu-west-1.console.aws.amazon.com/s3/buckets/docuploader-api-staging?region=eu-west-1 |
| `docuploader-pipeline` | https://eu-west-1.console.aws.amazon.com/s3/buckets/docuploader-pipeline?region=eu-west-1 |
| `docuploader-pipeline-config` | https://eu-west-1.console.aws.amazon.com/s3/buckets/docuploader-pipeline-config?region=eu-west-1 |
| `docuploader-api-audit-archive` | https://eu-west-1.console.aws.amazon.com/s3/buckets/docuploader-api-audit-archive?region=eu-west-1 |
| `docuploader-tfstate-537462380503` | https://eu-west-1.console.aws.amazon.com/s3/buckets/docuploader-tfstate-537462380503?region=eu-west-1 |

## 5. KMS keys (2 — NEW UUIDs from today's apply)

| Key | URL |
| --- | --- |
| **Tenant master CMK** (`9084254d-bd52-46be-a0a1-4850200458d5`) | https://eu-west-1.console.aws.amazon.com/kms/home?region=eu-west-1#/kms/keys/9084254d-bd52-46be-a0a1-4850200458d5 |
| **Audit-archive CMK** (`e0a0d49f-9c25-46f6-8db6-cbf61c8108f5`) | https://eu-west-1.console.aws.amazon.com/kms/home?region=eu-west-1#/kms/keys/e0a0d49f-9c25-46f6-8db6-cbf61c8108f5 |

(The old `8736ceac-...` and `452fba72-...` keys from 2026-05-13 are in pending-deletion until 2026-06-12.)

## 6. IAM roles (21)

| Resource | URL |
| --- | --- |
| Filtered list (`docuploader-`) | https://us-east-1.console.aws.amazon.com/iam/home#/roles?search=docuploader- |
| `docuploader-router` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-router |
| `docuploader-workspace-resolver` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-workspace-resolver |
| `docuploader-batch-resolver` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-batch-resolver |
| `docuploader-document-resolver` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-document-resolver |
| `docuploader-classification-service` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-classification-service |
| `docuploader-ocr-service` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-ocr-service |
| `docuploader-zip-extraction-service` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-zip-extraction-service |
| `docuploader-output-assembly-service` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-output-assembly-service |
| `docuploader-slipsheet-service` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-slipsheet-service |
| `docuploader-html-conversion-typescript-sidecar` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-html-conversion-typescript-sidecar |
| `docuploader-tiff-cog-service` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-tiff-cog-service |
| `docuploader-image-tiff-conversion-service` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-image-tiff-conversion-service |
| `docuploader-media-conversion-service` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-media-conversion-service |
| `docuploader-email-extraction-service` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-email-extraction-service |
| `docuploader-pdf-processing-service` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-pdf-processing-service |
| `docuploader-office-conversion-orchestrator-sidecar` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-office-conversion-orchestrator-sidecar |
| `docuploader-pre-token-generation-lambda` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-pre-token-generation-lambda |
| `docuploader-document-event-handler-lambda` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-document-event-handler-lambda |
| `docuploader-audit-event-storage-lambda` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-audit-event-storage-lambda |
| `docuploader-update-document-state-lambda` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-update-document-state-lambda |
| `docuploader-guardduty-malware-protection` | https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/docuploader-guardduty-malware-protection |

Each role has one inline policy named `permissions`.

## 7. Secrets Manager (3)

| Secret | URL |
| --- | --- |
| `docuploader/aspose-licence` | https://eu-west-1.console.aws.amazon.com/secretsmanager/secret?region=eu-west-1&name=docuploader%2Faspose-licence |
| `docuploader/audit-archive-cmk-arn` | https://eu-west-1.console.aws.amazon.com/secretsmanager/secret?region=eu-west-1&name=docuploader%2Faudit-archive-cmk-arn |
| `docuploader/graphql-internal-auth` | https://eu-west-1.console.aws.amazon.com/secretsmanager/secret?region=eu-west-1&name=docuploader%2Fgraphql-internal-auth |

## 8. GuardDuty (1 detector — NEW ID)

| Resource | URL |
| --- | --- |
| Detector settings (`4b6e90014e5b49c4a155d6d8d9b710c8`) | https://eu-west-1.console.aws.amazon.com/guardduty/home?region=eu-west-1#/detectors/4b6e90014e5b49c4a155d6d8d9b710c8/settings |
| Findings (none yet) | https://eu-west-1.console.aws.amazon.com/guardduty/home?region=eu-west-1#/findings |

## 9. CloudTrail — today's deployment events

| View | URL |
| --- | --- |
| All my events today (Create*/Update*/Delete*) | https://eu-west-1.console.aws.amazon.com/cloudtrailv2/home?region=eu-west-1#/events?Username=aravichandran-sso%40opus2.online&StartTime=2026-05-14T00%3A00%3A00Z |
| Just CreateTable | https://eu-west-1.console.aws.amazon.com/cloudtrailv2/home?region=eu-west-1#/events?EventName=CreateTable&StartTime=2026-05-14T00%3A00%3A00Z |
| Just CreateRole | https://eu-west-1.console.aws.amazon.com/cloudtrailv2/home?region=eu-west-1#/events?EventName=CreateRole&StartTime=2026-05-14T00%3A00%3A00Z |
| Just CreateKey | https://eu-west-1.console.aws.amazon.com/cloudtrailv2/home?region=eu-west-1#/events?EventName=CreateKey&StartTime=2026-05-14T00%3A00%3A00Z |
| Just CreateSecret | https://eu-west-1.console.aws.amazon.com/cloudtrailv2/home?region=eu-west-1#/events?EventName=CreateSecret&StartTime=2026-05-14T00%3A00%3A00Z |
| GuardDuty (CreateDetector + failed MalwareProtectionPlan) | https://eu-west-1.console.aws.amazon.com/cloudtrailv2/home?region=eu-west-1#/events?EventName=CreateDetector&StartTime=2026-05-14T00%3A00%3A00Z |
| RestoreSecret (today's import operations) | https://eu-west-1.console.aws.amazon.com/cloudtrailv2/home?region=eu-west-1#/events?EventName=RestoreSecret&StartTime=2026-05-14T00%3A00%3A00Z |

## 10. Cost / billing

| View | URL |
| --- | --- |
| Cost Explorer | https://us-east-1.console.aws.amazon.com/cost-management/home#/cost-explorer |
| Bills | https://us-east-1.console.aws.amazon.com/billing/home?#/bills |
| Estimated daily cost from this deployment | ~$0.50-1/day idle |

## 11. Source code (LOCAL — not pushed)

| Source | Path |
| --- | --- |
| Repo root | `/home/ajithkumarravichandran/Downloads/document-uploader-master(updated)/document-uploader-master/` |
| Applied Terraform — platform-data | `units/platform-data/terraform/` |
| Applied Terraform — platform-iam-and-security | `units/platform-iam-and-security/terraform/` |
| Snapshot of applied .tf files | [`../dev05-aws-deployment-2026-05-13/terraform/`](../dev05-aws-deployment-2026-05-13/terraform/) (unchanged between yesterday and today) |
| Revert script | [`../dev05-aws-deployment-2026-05-13/revert.sh`](../dev05-aws-deployment-2026-05-13/revert.sh) (works for today's redeploy too) |
| Direct AWS CLI bootstrap | [`../dev05-aws-deployment-2026-05-13/direct-aws-cli.sh`](../dev05-aws-deployment-2026-05-13/direct-aws-cli.sh) |

## 12. Cluster (kubectl)

| Target | URL |
| --- | --- |
| Kubernetes API endpoint | https://4CD18ACA973AEF3E3D289F4092A757EA.gr7.eu-west-1.eks.amazonaws.com |
| ArgoCD UI (cert expired — browser warns) | https://argocd.dev05.k8s.opus2dev.com |

kubectl access requires:
- Your IP allowlisted (currently NOT — your home IP `103.82.209.227` is not in the 18 allowed CIDRs)
- AWS SSO session active (`aws sso login --profile opus2-dev`)
- Use AWS CloudShell as workaround: https://eu-west-1.console.aws.amazon.com/cloudshell/home?region=eu-west-1
