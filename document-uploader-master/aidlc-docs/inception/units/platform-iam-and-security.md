# platform-iam-and-security

**Tier**: Platform
**Language**: Terraform
**Compute**: Cross-cutting infrastructure

## Purpose
Owns the IAM role library (~17 roles spanning API and pipeline tiers) with IRSA bindings, GuardDuty Malware Protection for S3 configuration, and Secrets Manager bootstrap.

## Responsibilities
- IAM role library: one role per Lambda, one role per resolver, one role per worker; per-role policy bound by least privilege (IAM-prefix scoping for tenant isolation)
- IRSA bindings: every K8s ServiceAccount in `platform-network-and-compute` is associated with its IAM role
- GuardDuty Malware Protection for S3 enrolment for the `docuploader-api-staging` bucket
- Secrets Manager bootstrap: audit-archive operator-managed CMK secret reference; `GRAPHQL_INTERNAL_AUTH_SECRET_ARN`; Aspose licence Secret skeleton (operator fills value)

## Inputs (consumed)
- Sandbox-managed External Secrets Operator (consumer of Secrets Manager bootstrap)
- S3 bucket ARNs from `platform-data` (GuardDuty enrolment target; IAM resource ARNs)

## Outputs (produced)
- IAM role ARNs consumed by every runtime unit's K8s ServiceAccount or Lambda
- GuardDuty detector + S3 scan configuration
- Secrets Manager secret ARNs

## Dependencies
- `platform-data` (S3 bucket ARNs as policy resources)

## Test gate
Three-tier — Local: IAM policy linting + `terraform plan`; LocalStack: limited (IAM basic, Secrets Manager); Sandbox: real GuardDuty scan with a benign EICAR test object; IAM permission tests via SCP-style probes.

## Construction-stage artefacts
- Infrastructure design: `aidlc-docs/construction/platform-iam-and-security/infrastructure-design/`
- Code summary: `aidlc-docs/construction/platform-iam-and-security/code/`
- Source: `units/platform-iam-and-security/`
