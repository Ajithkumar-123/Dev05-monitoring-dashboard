# dev05 AWS Redeployment — 2026-05-14

This is the **second deployment** of the docuploader substrate to dev05. The first ran yesterday (`dev05-aws-deployment-2026-05-13/`), was fully reverted, and we redeployed today against the same source files.

## What's the same as 2026-05-13

- Account: `537462380503` · Region: `eu-west-1` · Profile: `opus2-dev`
- Source Terraform: `units/platform-data/terraform/` + `units/platform-iam-and-security/terraform/`
- Resource names: identical (7 DDB tables, 4 S3 buckets, 21 IAM roles, 3 secrets, 1 GuardDuty detector)
- Failure mode: same GuardDuty MalwareProtectionPlan failure (S3 EventBridge perms on the GuardDuty role)

## What's different

| Field | 2026-05-13 | 2026-05-14 (today) |
| --- | --- | --- |
| Tenant KMS key UUID | `8736ceac-2814-461f-a7eb-bfef665e9218` | **`9084254d-bd52-46be-a0a1-4850200458d5`** |
| Audit-archive KMS key UUID | `452fba72-0419-4c0d-8c16-3beb7b644716` | **`e0a0d49f-9c25-46f6-8db6-cbf61c8108f5`** |
| GuardDuty detector ID | `c55f8911c5a9434c8512f08ecbe15049` | **`4b6e90014e5b49c4a155d6d8d9b710c8`** |
| Secret ARN suffixes | original `-XxblRC`, `-8UHJQN`, etc. | `audit-archive-cmk-arn-XxblRC` and `graphql-internal-auth-8UHJQN` (restored from 2026-05-13's pending-deletion); `aspose-licence` got new ARN suffix (fresh-created) |
| EKS CIDR allowlist | Added `103.82.209.141/32` then reverted | Did NOT modify (per governance discussion at end of 2026-05-13) |
| Yesterday's old KMS keys | 2 in 7-day pending deletion | 2 still pending (auto-delete 2026-06-12) |

## Path-of-truth

For source `.tf` files, revert script, and direct-aws-cli commands — see [`../dev05-aws-deployment-2026-05-13/`](../dev05-aws-deployment-2026-05-13/). Those did not need to be re-authored — same files produced today's deployment.

## Files in this folder

| File | Purpose |
| --- | --- |
| `README.md` (this file) | Context for the redeploy |
| `urls.md` | Today's AWS console URLs (with current KMS / GuardDuty IDs) |

## Quick verification commands

```bash
export AWS_PROFILE=opus2-dev
aws dynamodb list-tables --region eu-west-1 \
  --query 'TableNames[?starts_with(@, `docuploader`)]'    # → 7 tables
aws iam list-roles \
  --query 'Roles[?starts_with(RoleName, `docuploader-`)].RoleName' \
  --output text | wc -w                                    # → 21
aws s3 ls | grep -c docuploader                            # → 5
aws secretsmanager list-secrets --region eu-west-1 \
  --query 'SecretList[?starts_with(Name, `docuploader/`)].Name' --output text  # → 3 secrets
```

## To revert this redeploy

Use the same revert script as yesterday — it's path-agnostic:

```bash
cd "/home/ajithkumarravichandran/Downloads/document-uploader-master(updated)/document-uploader-master"
./aidlc-docs/operations/dev05-aws-deployment-2026-05-13/revert.sh --dry-run   # preview
./aidlc-docs/operations/dev05-aws-deployment-2026-05-13/revert.sh --yes       # execute
```
