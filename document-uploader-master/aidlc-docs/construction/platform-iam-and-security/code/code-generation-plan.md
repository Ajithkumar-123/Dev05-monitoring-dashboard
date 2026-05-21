# Code Generation Plan — platform-iam-and-security

## Scope

Generate Terraform for ~20 IAM roles + GuardDuty Malware Protection for S3 + Secrets Manager bootstrap.

## File list

- [x] `units/platform-iam-and-security/terraform/versions.tf`
- [x] `units/platform-iam-and-security/terraform/variables.tf`
- [x] `units/platform-iam-and-security/terraform/data.tf` — read platform-data remote state for DynamoDB / S3 / KMS ARNs; sandbox EKS OIDC provider
- [x] `units/platform-iam-and-security/terraform/iam-api-tier.tf` — router + 3 resolvers + 4 Lambdas (8 roles)
- [x] `units/platform-iam-and-security/terraform/iam-pipeline-tier.tf` — 12 pipeline worker roles via `for_each`
- [x] `units/platform-iam-and-security/terraform/guardduty.tf`
- [x] `units/platform-iam-and-security/terraform/secrets.tf`
- [x] `units/platform-iam-and-security/terraform/outputs.tf`

## Conventions

- All role names follow `docuploader-<workload>` naming (binding `docuploader` token).
- Each IRSA role has both trust + permission policies inline; no managed-policy attachments (avoids supply-chain blast radius).
- Pipeline worker roles share a common policy skeleton via `aws_iam_policy_document` data sources and `for_each` reduces repetition.
- Secret resources expose **ARNs only**; their values are operator-managed post-apply.
