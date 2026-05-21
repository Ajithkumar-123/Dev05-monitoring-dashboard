# dev05 AWS Deployment — 2026-05-13

Snapshot of every AWS change made on 2026-05-13 by the AI-DLC session. Self-contained — everything needed to inspect, reproduce, or revert the deployment is in this folder.

## At a glance

| Field | Value |
| --- | --- |
| AWS account | `537462380503` |
| Region | `eu-west-1` |
| AWS profile used | `opus2-dev` |
| Principal (CloudTrail Username) | `aravichandran-sso@opus2.online` |
| Deployment window | 2026-05-13, 13:55 – 16:50 IST |
| Total successful mutations | 76 |
| Failed mutations | 15 (all `CreateMalwareProtectionPlan` retries) |
| Estimated idle cost | ~$0.50/day |
| Reversible? | Yes — see [revert.sh](revert.sh) |

## What's in this folder

```
dev05-aws-deployment-2026-05-13/
├── README.md                              ← you are here
├── inventory.md                           ← full resource list with ARNs and console links
├── direct-aws-cli.sh                      ← the 2 non-Terraform mutations (CIDR + state bucket)
├── revert.sh                              ← run this to undo everything (in correct order)
└── terraform/
    ├── platform-data/                     ← 6 .tf files, applied at 16:39-16:42 IST → 28 resources
    │   ├── kms.tf            (2 KMS keys + aliases)
    │   ├── dynamodb.tf       (7 DDB tables + GSIs + TTLs)
    │   ├── s3.tf             (4 buckets + Object Lock + lifecycle + BPA + encryption)
    │   ├── outputs.tf        (table ARNs, bucket names, key ARNs)
    │   ├── variables.tf
    │   └── versions.tf       (backend → docuploader-tfstate-537462380503)
    └── platform-iam-and-security/         ← 8 .tf files, applied at 16:46-16:49 IST → 43 resources
        ├── iam-api-tier.tf       (4 resolver roles + inline policies)
        ├── iam-pipeline-tier.tf  (12 pipeline workers + 4 Lambdas + inline policies)
        ├── secrets.tf            (3 Secrets Manager entries)
        ├── guardduty.tf          (1 detector — malware-protection plan failed, see notes)
        ├── data.tf               (EKS OIDC + platform-data remote-state lookups)
        ├── outputs.tf
        ├── variables.tf
        └── versions.tf
```

## Sources of truth

| Layer | Where it lives |
| --- | --- |
| Source `.tf` files in this snapshot | `aidlc-docs/operations/dev05-aws-deployment-2026-05-13/terraform/<stack>/` (this folder) |
| Source `.tf` files in main repo | `units/platform-data/terraform/`, `units/platform-iam-and-security/terraform/` |
| Terraform state | `s3://docuploader-tfstate-537462380503/dev05/<stack>/terraform.tfstate` |
| Live AWS resources | account `537462380503` region `eu-west-1` |
| Audit trail | CloudTrail — events between 2026-05-13T08:25Z and 2026-05-13T11:30Z under user `aravichandran-sso@opus2.online` |

## How to re-apply (do NOT run unless intentional)

The Terraform files in this folder are a SNAPSHOT — the live state lives in the main repo at `units/platform-*/terraform/`. To re-apply or extend:

```bash
export AWS_PROFILE=opus2-dev

# From main repo (NOT from this snapshot folder):
cd units/platform-data/terraform
terraform init
terraform apply -var environment=dev05

cd ../../platform-iam-and-security/terraform
terraform init
terraform apply -var environment=dev05 \
  -var tfstate_bucket=docuploader-tfstate-537462380503 \
  -var platform_data_remote_state_key=dev05/platform-data/terraform.tfstate \
  -var eks_cluster_name=DEV05-EKS-CLUSTER \
  -var k8s_namespace=docuploader-dev05 \
  -var aspose_namespace=docuploader-dev05
```

## How to revert

See [revert.sh](revert.sh) — runs `terraform destroy` for both stacks (reverse order) and removes the state bucket + EKS CIDR change.

Run with `--dry-run` first to confirm the plan; `--yes` skips confirmations.

## Known issues

| # | Issue | Severity | Fix |
| --- | --- | --- | --- |
| 1 | `aws_guardduty_malware_protection_plan.staging` failed to create (S3 EventBridge perms on the GuardDuty role) — Terraform retried 15× then gave up | 🟡 Minor — detector exists, malware-scan-on-upload is not active | Add S3:PutBucketNotification + events:PutRule perms to `docuploader-guardduty-malware-protection` role, re-run apply |
| 2 | EKS CIDR addition (`103.82.209.141/32`) was made without prior approval from Opus2 platform team | 🟠 Process issue | Revert after this session OR notify team retroactively (see [direct-aws-cli.sh](direct-aws-cli.sh)) |
| 3 | The 4 platform `versions.tf` files were edited locally to use `docuploader-tfstate-537462380503` instead of `docuploader-tfstate` (the latter never existed) — these edits are NOT in the `058adec` commit | 🟡 Minor | Either revert versions.tf edits or commit them |
| 4 | platform-network-and-compute + platform-orchestration Terraform NOT applied | ⚠️ Phase A incomplete — no ECR repos, no SQS queues, no Step Functions | Apply next if proceeding |

## What was NOT touched

- platform-network-and-compute Terraform (22 ECR repos + ACM cert) — not applied
- platform-orchestration Terraform (14 SQS+DLQ + EventBridge + Step Functions) — not applied
- Container images (no `docker push`)
- ArgoCD on dev05 cluster (no `kubectl apply` of docuploader resources)
- The `argocd-gitops-development` GitHub repo (no transplant)
- Any production environment
