# URL List — dev05 AWS Deployment (2026-05-13)

Every URL for inspecting / verifying / managing what was deployed.

## 1. AWS Console — live resource URLs

### EKS

| Resource | URL |
| --- | --- |
| DEV05-EKS-CLUSTER overview | https://eu-west-1.console.aws.amazon.com/eks/home?region=eu-west-1#/clusters/DEV05-EKS-CLUSTER |
| DEV05 networking (CIDR allowlist) | https://eu-west-1.console.aws.amazon.com/eks/home?region=eu-west-1#/clusters/DEV05-EKS-CLUSTER/networking |
| DEV05 add-ons | https://eu-west-1.console.aws.amazon.com/eks/home?region=eu-west-1#/clusters/DEV05-EKS-CLUSTER/add-ons |
| DEV05 resources (k8s objects) | https://eu-west-1.console.aws.amazon.com/eks/home?region=eu-west-1#/clusters/DEV05-EKS-CLUSTER/resources |

### Terraform state bucket

| Resource | URL |
| --- | --- |
| `docuploader-tfstate-537462380503` root | https://eu-west-1.console.aws.amazon.com/s3/buckets/docuploader-tfstate-537462380503?region=eu-west-1 |
| `dev05/` prefix (where state files live) | https://eu-west-1.console.aws.amazon.com/s3/buckets/docuploader-tfstate-537462380503?region=eu-west-1&prefix=dev05/ |
| platform-data state | https://eu-west-1.console.aws.amazon.com/s3/object/docuploader-tfstate-537462380503?region=eu-west-1&prefix=dev05/platform-data/terraform.tfstate |
| platform-iam-and-security state | https://eu-west-1.console.aws.amazon.com/s3/object/docuploader-tfstate-537462380503?region=eu-west-1&prefix=dev05/platform-iam-and-security/terraform.tfstate |

### DynamoDB tables (7)

| Table | URL |
| --- | --- |
| `docuploader-api-workspaces` | https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-api-workspaces |
| `docuploader-api-batches` | https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-api-batches |
| `docuploader-api-documents` | https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-api-documents |
| `docuploader-api-audit-events` | https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-api-audit-events |
| `docuploader-content-hashes` | https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-content-hashes |
| `docuploader-pipeline-files` | https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=docuploader-pipeline-files |
| `textract-task-tokens` | https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#table?name=textract-task-tokens |

### S3 buckets (4 + 1 state)

| Bucket | URL |
| --- | --- |
| `docuploader-api-staging` | https://eu-west-1.console.aws.amazon.com/s3/buckets/docuploader-api-staging?region=eu-west-1 |
| `docuploader-pipeline` | https://eu-west-1.console.aws.amazon.com/s3/buckets/docuploader-pipeline?region=eu-west-1 |
| `docuploader-pipeline-config` | https://eu-west-1.console.aws.amazon.com/s3/buckets/docuploader-pipeline-config?region=eu-west-1 |
| `docuploader-api-audit-archive` | https://eu-west-1.console.aws.amazon.com/s3/buckets/docuploader-api-audit-archive?region=eu-west-1 |
| `docuploader-tfstate-537462380503` | https://eu-west-1.console.aws.amazon.com/s3/buckets/docuploader-tfstate-537462380503?region=eu-west-1 |

### KMS keys (2)

| Key | URL |
| --- | --- |
| Tenant master CMK (`8736ceac-…`) | https://eu-west-1.console.aws.amazon.com/kms/home?region=eu-west-1#/kms/keys/8736ceac-2814-461f-a7eb-bfef665e9218 |
| Audit-archive CMK (`452fba72-…`) | https://eu-west-1.console.aws.amazon.com/kms/home?region=eu-west-1#/kms/keys/452fba72-0419-4c0d-8c16-3beb7b644716 |

### IAM roles (21)

| Role | URL |
| --- | --- |
| List view (filtered `docuploader-`) | https://us-east-1.console.aws.amazon.com/iam/home#/roles?search=docuploader- |
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

### Secrets Manager (3)

| Secret | URL |
| --- | --- |
| `docuploader/aspose-licence` | https://eu-west-1.console.aws.amazon.com/secretsmanager/secret?region=eu-west-1&name=docuploader%2Faspose-licence |
| `docuploader/audit-archive-cmk-arn` | https://eu-west-1.console.aws.amazon.com/secretsmanager/secret?region=eu-west-1&name=docuploader%2Faudit-archive-cmk-arn |
| `docuploader/graphql-internal-auth` | https://eu-west-1.console.aws.amazon.com/secretsmanager/secret?region=eu-west-1&name=docuploader%2Fgraphql-internal-auth |

### GuardDuty

| Resource | URL |
| --- | --- |
| Detector `c55f8911c5a9434c8512f08ecbe15049` findings | https://eu-west-1.console.aws.amazon.com/guardduty/home?region=eu-west-1#/findings |
| Detector settings | https://eu-west-1.console.aws.amazon.com/guardduty/home?region=eu-west-1#/detectors/c55f8911c5a9434c8512f08ecbe15049/settings |

## 2. CloudTrail audit URLs

| View | URL |
| --- | --- |
| All my events today | https://eu-west-1.console.aws.amazon.com/cloudtrailv2/home?region=eu-west-1#/events?Username=aravichandran-sso%40opus2.online&StartTime=2026-05-13T00%3A00%3A00Z |
| CreateTable events (DynamoDB) | https://eu-west-1.console.aws.amazon.com/cloudtrailv2/home?region=eu-west-1#/events?EventName=CreateTable&StartTime=2026-05-13T10%3A30%3A00Z |
| CreateBucket events (S3) | https://eu-west-1.console.aws.amazon.com/cloudtrailv2/home?region=eu-west-1#/events?EventName=CreateBucket&StartTime=2026-05-13T10%3A30%3A00Z |
| CreateRole events (IAM) | https://eu-west-1.console.aws.amazon.com/cloudtrailv2/home?region=eu-west-1#/events?EventName=CreateRole&StartTime=2026-05-13T10%3A30%3A00Z |
| CreateKey events (KMS) | https://eu-west-1.console.aws.amazon.com/cloudtrailv2/home?region=eu-west-1#/events?EventName=CreateKey&StartTime=2026-05-13T10%3A30%3A00Z |
| CreateSecret events (Secrets Manager) | https://eu-west-1.console.aws.amazon.com/cloudtrailv2/home?region=eu-west-1#/events?EventName=CreateSecret&StartTime=2026-05-13T10%3A30%3A00Z |
| UpdateClusterConfig (EKS CIDR) | https://eu-west-1.console.aws.amazon.com/cloudtrailv2/home?region=eu-west-1#/events?EventName=UpdateClusterConfig&StartTime=2026-05-13T08%3A00%3A00Z |
| CreateDetector + CreateMalwareProtectionPlan (GuardDuty) | https://eu-west-1.console.aws.amazon.com/cloudtrailv2/home?region=eu-west-1#/events?EventName=CreateDetector&StartTime=2026-05-13T10%3A30%3A00Z |

## 3. Cost / billing URLs

| View | URL |
| --- | --- |
| Cost Explorer | https://us-east-1.console.aws.amazon.com/cost-management/home#/cost-explorer |
| Bills | https://us-east-1.console.aws.amazon.com/billing/home?#/bills |
| Free tier usage | https://us-east-1.console.aws.amazon.com/billing/home?#/freetier |

## 4. Source code URLs (LOCAL — not pushed to GitHub)

All on this machine, branch `dev05-rehearsal`, commit `058adec`. Not yet pushed.

| Source | Local path |
| --- | --- |
| Repo root | `/home/ajithkumarravichandran/Downloads/document-uploader-master(updated)/document-uploader-master/` |
| Applied Terraform — platform-data | `units/platform-data/terraform/` |
| Applied Terraform — platform-iam-and-security | `units/platform-iam-and-security/terraform/` |
| Not-yet-applied Terraform — platform-network-and-compute | `units/platform-network-and-compute/terraform/` |
| Not-yet-applied Terraform — platform-orchestration | `units/platform-orchestration/terraform/` |
| ArgoCD draft manifests | `deploy/argocd-dev05/` |
| Dockerfiles (6 archetypes) | `deploy/dockerfiles/` |
| Operator scripts | `scripts/` |
| CI/CD workflows | `.github/workflows/` |
| Top-level Makefile | `Makefile` |

## 5. Operations documentation (LOCAL)

| Doc | Local path |
| --- | --- |
| Readiness checklist | `aidlc-docs/operations/dev05-readiness-checklist.md` |
| Rehearsal report | `aidlc-docs/operations/dev05-rehearsal-report.md` |
| Deployment runbook | `aidlc-docs/operations/dev05-runbook.md` |
| **This deployment snapshot** | `aidlc-docs/operations/dev05-aws-deployment-2026-05-13/` |
| AI-DLC state tracking | `aidlc-docs/aidlc-state.md` |
| AI-DLC audit trail | `aidlc-docs/audit.md` |

## 6. GitHub URLs (will exist AFTER push, not yet)

| What | Future URL |
| --- | --- |
| docuploader repo | (not yet pushed — would be `https://github.com/opus2-automation/docuploader`) |
| `dev05-rehearsal` branch | (would be `https://github.com/opus2-automation/docuploader/tree/dev05-rehearsal`) |
| argocd-gitops repo | https://github.com/opus2-automation/argocd-gitops-development |

## 7. Cluster URLs (kubectl required)

| Target | URL |
| --- | --- |
| ArgoCD UI (EXPIRED cert — browser warns) | https://argocd.dev05.k8s.opus2dev.com |
| Kubernetes API endpoint | https://4CD18ACA973AEF3E3D289F4092A757EA.gr7.eu-west-1.eks.amazonaws.com |

Access requires:
- Your IP allowlisted (currently `103.82.209.141/32` is in there)
- AWS SSO session active (`aws sso login --profile opus2-dev`)
- kubectl context: `arn:aws:eks:eu-west-1:537462380503:cluster/DEV05-EKS-CLUSTER`

## 8. Reference / external

| What | URL |
| --- | --- |
| AWS Console root (eu-west-1) | https://eu-west-1.console.aws.amazon.com |
| AWS IAM Identity Center (SSO start URL) | https://d-9c6707ec43.awsapps.com/start |
| Terraform AWS provider docs | https://registry.terraform.io/providers/hashicorp/aws/latest/docs |
| AWS CLI reference | https://docs.aws.amazon.com/cli/latest/reference/ |
