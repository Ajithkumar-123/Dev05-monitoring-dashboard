# Code Generation Summary — platform-network-and-compute

## Status: complete

## Artefacts produced

### Terraform (`units/platform-network-and-compute/terraform/`)

| File | Contents |
| --- | --- |
| `versions.tf` | Terraform 1.10+ + AWS provider ~5.0 + S3-native state locking |
| `variables.tf` | Region, environment, `api_hostname`, `route53_zone_name`, remote-state keys |
| `data.tf` | Reads platform-data + platform-iam remote state; resolves the sandbox Route53 zone; exposes role ARN maps as locals |
| `acm.tf` | ACM certificate for the API hostname; DNS validation records in the sandbox Route53 zone; certificate validation resource |
| `ecr.tf` | 22 ECR repositories via `for_each` (8 API + 13 pipeline + 1 web bundler); immutable tags; scan-on-push; KMS encryption with the tenant CMK; lifecycle policy: untagged → 7-day expiry, tagged → keep most-recent 50 |
| `outputs.tf` | ACM certificate ARN, API hostname, ECR repository URL map |

### Helm library chart (`units/platform-network-and-compute/helm/docuploader-chassis/`)

| File | Contents |
| --- | --- |
| `Chart.yaml` | Library chart manifest (`type: library`); installed only as a dependency of per-unit charts |
| `values.yaml` | Default values: workload name, IAM role ARN, image (repo/tag), OTLP endpoint + service namespace, resources, probes |
| `templates/_serviceaccount.tpl` | `docuploader-chassis.serviceAccount` include — renders SA with `eks.amazonaws.com/role-arn` IRSA annotation |
| `templates/_otlp-envs.tpl` | `docuploader-chassis.otlpEnvs` include — standard OTLP env-var block |
| `templates/_deployment.tpl` | `docuploader-chassis.deployment` include — Deployment with OTLP envs, IRSA-bound SA, Guaranteed-QoS resources |

### Kustomize (`units/platform-network-and-compute/kustomize/`)

| Path | Contents |
| --- | --- |
| `base/namespaces/` | `docuploader`, `aspose-converter`, `grafana` namespaces; restricted Pod Security labels on the first two |
| `base/service-accounts/` | 16 ServiceAccount resources (15 in `docuploader` ns, 1 in `aspose-converter` ns) — IRSA annotation marked `PATCH_ME` for overlay substitution |
| `base/ingress/` | `docuploader-router` Ingress with AWS Load Balancer Controller annotations (HTTPS 443, TLS 1.2+, ACM ARN `PATCH_ME`, IP target-type, `/healthz` health check) |
| `overlays/sandbox/` | Patches base with sandbox hostname + ACM ARN via JSON-patch; namespace pinned to `docuploader` |

## Consumer pattern (for downstream unit construction)

Per-unit Helm charts depend on the chassis library via `Chart.yaml`:

```yaml
dependencies:
  - name: docuploader-chassis
    version: 0.1.0
    repository: file://../../platform-network-and-compute/helm/docuploader-chassis
```

And consumer templates emit:

```yaml
{{ include "docuploader-chassis.serviceAccount" . }}
---
{{ include "docuploader-chassis.deployment" . }}
```

with consumer `values.yaml` supplying `workloadName`, `iamRoleArn`, `image`, and `resources`.

## What's deliberately not here

- Per-workload Service / Deployment manifests — each consumer unit emits these via its own Helm chart using the chassis library.
- KEDA `ScaledObject` / HPA manifests — produced per-workload in pipeline-tier units (KEDA scaling by SQS queue depth).
- PodDisruptionBudgets — per-workload concern.
- ExternalSecret CRs for Secrets Manager → K8s Secret projection — per-workload concern (or per-secret, when the secret is consumed by multiple workloads).
- VPC endpoints / route tables — sandbox-managed; not in this project's scope.
- The `grafanacloud-alloy-credentials` ExternalSecret — sandbox-managed; this unit only creates the `grafana` namespace it lives in.

## Tier-1 status

- ✅ `platform-data` (DynamoDB + S3 + KMS + tri-language data-access library)
- ✅ `platform-iam-and-security` (20 IAM roles + GuardDuty + Secrets bootstrap)
- ✅ `platform-network-and-compute` (ACM + 22 ECR repos + Helm chassis library + Kustomize base/overlay)
- ⏭ `platform-orchestration` (Step Functions ASL + EventBridge + 14 SQS queues + DLQs + WunderGraph audit-emission wiring)
