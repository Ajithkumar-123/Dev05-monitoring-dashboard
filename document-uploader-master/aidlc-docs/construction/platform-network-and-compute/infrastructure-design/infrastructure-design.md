# Infrastructure Design — platform-network-and-compute

## Scope

This unit owns the cluster-edge surface (ALB Ingress + ACM + ECR) and the K8s service chassis scaffolding (namespaces, ServiceAccounts with IRSA bindings, Helm library chart for shared workload templates).

Sandbox-managed components (must integrate with; must not modify): ALB Controller, External Secrets Operator, Kyverno, KEDA, Karpenter, Cluster Autoscaler.

## Deliverables

### 1. Terraform (cluster-edge AWS resources)

- ACM certificate for the API hostname (TLS termination at ALB)
- ECR repositories — one per workload image (~22 repos)
- Reads platform-iam-and-security remote state for role ARNs (used in ServiceAccount IRSA annotations rendered downstream)

### 2. Helm library chart `docuploader-chassis`

A library chart that provides shared K8s manifest templates consumed by every per-unit Helm chart. Library charts cannot be installed standalone — they expose `_helpers.tpl`-style includes:

| Template | Purpose |
| --- | --- |
| `_serviceaccount.tpl` | Renders a ServiceAccount with the `eks.amazonaws.com/role-arn` IRSA annotation |
| `_deployment.tpl` | Renders a Deployment with required OTLP env vars (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`), required resource attributes, Guaranteed-QoS resource requests/limits |
| `_otlp-envs.tpl` | Standard OTLP environment variable block; reused inside `_deployment.tpl` and by sidecar containers |

### 3. Kustomize base (`kustomize/base/`)

- `namespaces/` — `docuploader` (primary), `aspose-converter` (Office sidecar Pod), `grafana` (where the alloy credentials ExternalSecret lives)
- `service-accounts/` — one ServiceAccount per workload with its IRSA annotation pointing at the matching IAM role ARN
- `ingress/` — single `docuploader-router` Ingress targeting the WunderGraph router Service, with AWS Load Balancer Controller annotations (`alb.ingress.kubernetes.io/scheme=internet-facing`, `alb.ingress.kubernetes.io/target-type=ip`, `alb.ingress.kubernetes.io/listen-ports=[{"HTTPS":443}]`, `alb.ingress.kubernetes.io/certificate-arn=<ACM>`, `alb.ingress.kubernetes.io/ssl-policy=ELBSecurityPolicy-TLS-1-2-Ext-2018-06`)

### 4. Kustomize overlay (`kustomize/overlays/sandbox/`)

Patches the base with sandbox-specific values (ACM cert ARN substitution; cluster-specific hostname).

## Sandbox-managed dependencies

| Component | Owned by | This unit's relationship |
| --- | --- | --- |
| ALB Controller | Sandbox | Consumes via Ingress annotations only; does not install/modify |
| External Secrets Operator | Sandbox | Consumes via ExternalSecret CRs declared in workload charts |
| Grafana Alloy | Sandbox | Consumes via the `grafanacloud-alloy-credentials` ExternalSecret in `grafana` namespace; this unit creates the namespace, not the secret |
| KEDA, Karpenter, Cluster Autoscaler, Kyverno | Sandbox | Consumed implicitly by workloads' KEDA ScaledObjects and PodDisruptionBudgets (defined per workload, not here) |

## TLS

- Public TLS terminated at the ALB via ACM. The unit creates and validates the ACM cert via DNS validation against the sandbox-managed Route53 zone (zone existence assumed; record creation done by Terraform here).
- In-cluster gRPC may use private-CA TLS optionally; that's deferred to per-resolver-unit construction.

## ECR repository inventory

22 repositories — one per built image:

| Tier | Repository names |
| --- | --- |
| API (8) | `docuploader/wundergraph-router`, `docuploader/workspace-resolver`, `docuploader/batch-resolver`, `docuploader/document-resolver`, `docuploader/pre-token-generation-lambda`, `docuploader/document-event-handler-lambda`, `docuploader/audit-event-storage-lambda`, `docuploader/update-document-state-lambda` |
| Pipeline (13) | `docuploader/classification-service`, `docuploader/ocr-service`, `docuploader/zip-extraction-service`, `docuploader/output-assembly-service`, `docuploader/slipsheet-service`, `docuploader/pdf-processing-service`, `docuploader/office-conversion-aspose-container`, `docuploader/office-conversion-orchestrator-sidecar`, `docuploader/html-conversion-gotenberg-mirror` (mirror of `gotenberg/gotenberg:8.x`), `docuploader/html-conversion-typescript-sidecar`, `docuploader/tiff-cog-service`, `docuploader/image-tiff-conversion-service`, `docuploader/email-extraction-service`, `docuploader/media-conversion-service` |
| Web (1) | `docuploader/react-web-module-bundler` (build-time only; static assets land on CloudFront/S3) |

(That's 22; `react-web-module-bundler` is the build-time image used to compile the static asset bundle.)

All ECR repositories: image scanning on push enabled; immutable tags policy; encryption with the tenant CMK.
