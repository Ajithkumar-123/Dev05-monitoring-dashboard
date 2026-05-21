# platform-network-and-compute

**Tier**: Platform
**Language**: Terraform + Helm + Kustomize
**Compute**: Cross-cutting infrastructure (no runtime workload)

## Purpose
Owns EKS cluster integration scaffolding and the cluster-edge network surface (ALB Ingress, ACM, ECR repositories). Provides the K8s "service chassis" library scaffolding consumed by every API and pipeline unit.

## Responsibilities
- EKS namespace, ConfigMap, ServiceAccount + IRSA binding manifests for each runtime workload
- ALB Ingress configuration (TLS termination via ACM)
- ACM certificate(s) for the API hostname
- ECR repositories for all built images
- K8s service chassis scaffolding (shared Helm chart + Kustomize bases)

## Inputs (consumed)
- Sandbox-managed: ALB Controller, External Secrets Operator, Kyverno, KEDA, Karpenter
- IAM roles from `platform-iam-and-security`

## Outputs (produced)
- ALB Ingress + ACM cert serving the public GraphQL hostname
- Per-unit namespace + ServiceAccount scaffolding
- ECR repository ARNs consumed by every image-shipping unit

## Dependencies
- `platform-iam-and-security` (IRSA roles must exist before SA binding)

## Test gate
Three-tier — Local: `terraform plan` + `helm template` lint + `kustomize build` validation. LocalStack: limited (IAM, basic). Sandbox: real `terraform apply` + `kubectl apply` against sandbox cluster.

## Construction-stage artefacts
- Infrastructure design: `aidlc-docs/construction/platform-network-and-compute/infrastructure-design/`
- Code summary: `aidlc-docs/construction/platform-network-and-compute/code/`
- Source: `units/platform-network-and-compute/`
