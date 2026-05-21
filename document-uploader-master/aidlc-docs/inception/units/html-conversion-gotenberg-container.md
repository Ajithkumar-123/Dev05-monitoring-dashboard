# html-conversion-gotenberg-container

**Tier**: Pipeline (sidecar-pattern Pod, container #1 of 2)
**Language**: Third-party (Gotenberg 8.x / Chromium image)
**Compute**: EKS Deployment (co-deployed with `html-conversion-typescript-sidecar`)

## Purpose
Headless Chromium server providing the Gotenberg conversion API to the TypeScript sidecar. Configuration-only unit — no source code is authored beyond Helm chart and Kustomize overlays for the third-party image.

## Responsibilities
- Run the `gotenberg/gotenberg:8.x` container
- Expose Gotenberg HTTP API on `localhost` to the sidecar
- Resource budget: Guaranteed-QoS

## Inputs (consumed)
- HTTP requests from `html-conversion-typescript-sidecar` (`localhost`)

## Outputs (produced)
- PDF bytes over `localhost` HTTP

## Dependencies
- `platform-network-and-compute` (namespace + ServiceAccount), ECR image cache

## Test gate
Three-tier — Local: Helm chart lint + Kustomize build verification + container smoke test; LocalStack: N/A; Sandbox: end-to-end via sidecar.

## Construction-stage artefacts
- Infrastructure design + code summary → `aidlc-docs/construction/html-conversion-gotenberg-container/`
- Source: `units/html-conversion-gotenberg-container/` (Helm + Kustomize only)
