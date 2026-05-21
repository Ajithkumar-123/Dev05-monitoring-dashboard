# Infrastructure Design — platform-iam-and-security

## Scope

This unit owns three concerns, all delivered as Terraform:

1. **IAM role library** (~20 roles) covering every runtime workload. Each role:
   - Trust policy: IRSA OIDC for K8s workloads (assume-role via the EKS OIDC provider) OR Lambda assume-role for Lambdas
   - Inline policy granting **least-privilege** access to the specific DynamoDB tables, S3 prefixes, SQS queues, KMS keys, and Secrets Manager secrets the workload needs
   - Tenant-isolation enforcement at the policy layer (prefix-scoped S3 conditions on `${aws:PrincipalTag/tenantId}` where applicable; KMS grants reference the role ARN directly)
2. **GuardDuty Malware Protection for S3** enrolment on the `docuploader-api-staging` bucket. No other GuardDuty findings are in scope.
3. **Secrets Manager bootstrap**: secret resources for `GRAPHQL_INTERNAL_AUTH_SECRET_ARN`, the Aspose licence (skeleton; operator populates value), and the audit-archive operator-managed CMK reference.

## Role inventory

### API tier (8 roles)

| Role | Workload type | Key permissions |
| --- | --- | --- |
| `docuploader-router` | EKS Deployment (IRSA) | secretsmanager:GetSecretValue on `GRAPHQL_INTERNAL_AUTH_SECRET_ARN`; sqs:SendMessage on `docuploader-api-audit-events`; kms:Decrypt on audit-archive CMK |
| `docuploader-workspace-resolver` | EKS Deployment (IRSA) | dynamodb:CRUD on workspaces table; kms:CreateAlias / DeleteAlias / TagResource on tenant CMK; iam:PutRolePolicy unsupported — alias-based scoping only |
| `docuploader-batch-resolver` | EKS Deployment (IRSA) | dynamodb:CRUD on batches table |
| `docuploader-document-resolver` | EKS Deployment (IRSA) | dynamodb:CRUD on documents table + Query on idempotency-index GSI; s3:PutObject on staging (presigned URL minting); kms:Encrypt with per-tenant aliases |
| `docuploader-pre-token-generation-lambda` | Lambda | secretsmanager:GetSecretValue (JWK verification material); cloudwatch logs to fallback |
| `docuploader-document-event-handler-lambda` | Lambda | events:* subscribe (consumer); states:StartExecution on the ASL; dynamodb:GetItem on documents |
| `docuploader-audit-event-storage-lambda` | Lambda | sqs:ReceiveMessage/DeleteMessage on audit SQS; dynamodb:PutItem on audit-events; s3:PutObject on audit-archive; kms:Encrypt with audit-archive CMK |
| `docuploader-update-document-state-lambda` | Lambda | sqs:ReceiveMessage/DeleteMessage on state-change-notification-queue; gRPC service-account JWT (read via secretsmanager) |

### Pipeline tier (12 roles)

One IRSA role per pipeline worker. All workers receive:
- sqs:ReceiveMessage/DeleteMessage on their assigned worker queue + DLQ visibility
- s3:GetObject + PutObject on the relevant bucket(s) per route (staging, pipeline, pipeline-config)
- dynamodb access scoped to the tables the worker reads/writes (pipelinefiles, contenthashes, tasktokens, workspaces — per worker)
- kms:Decrypt with the tenant CMK (via per-tenant alias)

Roles: `docuploader-classification-service`, `docuploader-ocr-service`, `docuploader-zip-extraction-service`, `docuploader-output-assembly-service`, `docuploader-slipsheet-service`, `docuploader-pdf-processing-service`, `docuploader-office-conversion-orchestrator-sidecar`, `docuploader-html-conversion-typescript-sidecar`, `docuploader-tiff-cog-service`, `docuploader-image-tiff-conversion-service`, `docuploader-email-extraction-service`, `docuploader-media-conversion-service`.

The `office-conversion-aspose-container` and `html-conversion-gotenberg-container` containers run inside the orchestrator-sidecar Pod's pod-scoped ServiceAccount; they do not have their own IAM roles (no direct AWS access).

## Trust policy template

For IRSA roles, the trust policy assumes the EKS OIDC provider (sandbox-managed; provider ARN consumed via Terraform data source):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "<oidc-provider-arn>" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "<oidc-provider>:sub": "system:serviceaccount:<namespace>:<service-account>",
        "<oidc-provider>:aud": "sts.amazonaws.com"
      }
    }
  }]
}
```

For Lambda roles: `lambda.amazonaws.com` assume role.

## Tenant isolation enforcement

- `docuploader-api-staging` IAM policies use prefix-scoped resources (`arn:aws:s3:::docuploader-api-staging/${tenantId}/*`) — tenant is sourced from the resolver's authenticated context, never from input.
- KMS grants on the tenant CMK use the per-tenant alias name; the resolver-side code resolves `tenantId → aliasName` from `docuploader-api-workspaces`.
- Audit-archive uses the separate operator-managed CMK; tenant aliases do not grant audit-archive access.

## GuardDuty Malware Protection for S3

Single detector + S3 scan configuration targeting `docuploader-api-staging`. Findings flow to EventBridge bus `docuploader-api-events` (owned by `platform-orchestration`). No CloudTrail, VPC Flow Log, or DNS finding analysis.

## Secrets Manager bootstrap

| Secret | Owner | Value populated by |
| --- | --- | --- |
| `docuploader/graphql-internal-auth` | Operator | Terraform sets the resource; secret value rotation is a separate operator runbook |
| `docuploader/aspose-licence` | Operator | Terraform sets the resource skeleton; operator pastes the licence text post-apply |
| `docuploader/audit-archive-cmk-arn` | Operator | Holds the audit-archive CMK ARN; consumed by audit-event-storage-lambda |
