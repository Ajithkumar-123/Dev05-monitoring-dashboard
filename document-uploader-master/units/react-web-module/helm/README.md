# react-web-module — helm chart

Static React SPA (Vite-built, nginx-served) packaging the docuploader monitoring + admin dashboard. Composes the `docuploader-chassis` library for the Deployment skeleton and adds:

- Plain `ServiceAccount` (no IRSA — pod makes no AWS API calls)
- `ClusterIP Service` on port 80
- Optional ALB `Ingress` for external HTTPS access

## Render manifests locally (no deploy)

```bash
cd units/react-web-module/helm
helm dep build
helm template release-name . \
  -f values.yaml \
  -f values-dev05.yaml \
  --namespace docuploader-dev05
```

The render is pure YAML — nothing reaches the cluster.

## Values reference

### Required for any environment

| Key | Description | Default |
| --- | --- | --- |
| `image.repository` | Full ECR URI or other registry path | `""` (must override) |
| `image.tag` | Image tag (e.g. `dev05`, `v1.0.0`) | `0.1.0` |
| `workloadName` | K8s resource name | `react-web-module` |

### Ingress (set to expose externally)

| Key | Description | Default |
| --- | --- | --- |
| `ingress.enabled` | Render the Ingress resource | `false` |
| `ingress.host` | External hostname | `""` |
| `ingress.certificateArn` | ACM cert ARN — required for TLS | `""` |
| `ingress.className` | IngressClass name | `alb` |
| `ingress.annotations` | Annotations for the ALB controller | scheme=internet-facing, listen on HTTPS only |

When `ingress.enabled` is false the dashboard is reachable only inside the cluster via `react-web-module.<namespace>.svc.cluster.local`.

### Probes

`/healthz` returns 200 from the nginx config baked into [deploy/dockerfiles/ts-web.Dockerfile](../../../deploy/dockerfiles/ts-web.Dockerfile). The defaults poll it every 10 s for readiness and every 30 s for liveness.

### Resources

Defaults are intentionally small (100m CPU / 128Mi memory) — nginx serving a few hundred kilobytes of static assets is cheap. Bump if you front-end heavy proxy traffic via this pod.

## Deploying (manual reference — don't run from here)

```bash
# Build dep tree (vendors docuploader-chassis into ./charts/)
helm dep build

# Deploy to dev05
helm upgrade --install docuploader-monitor . \
  --namespace docuploader-dev05 --create-namespace \
  -f values.yaml \
  -f values-dev05.yaml \
  --set ingress.certificateArn=arn:aws:acm:eu-west-1:537462380503:certificate/<id>
```

Or via ArgoCD: drop this chart's path into `deploy/argocd-dev05/applicationset.yaml` alongside the existing units — the AppSet matrix will pick it up.

## Build-time vs runtime config

Vite bakes `import.meta.env.VITE_*` values **at build time**, so to point the dashboard at different `/healthz` URLs per environment you must:

1. Build the image with the right env: `VITE_HEALTH_URL_PATTERN='https://{unit}.dev05.k8s.opus2dev.com' pnpm build`
2. Tag the resulting image per environment (e.g. `:dev05`, `:prod`)
3. The helm chart references that tag in `image.tag`

A future iteration could fetch runtime config from a mounted `ConfigMap` at `/config.json` — would let one image span multiple environments. Not implemented yet.

## Files in this chart

```
helm/
├── Chart.yaml              chart metadata, depends on docuploader-chassis 0.1.0
├── values.yaml             defaults (small resources, ingress disabled)
├── values-dev05.yaml       dev05 overlay (ingress enabled, ECR URI, dev05 hostname)
└── templates/
    └── manifests.yaml      ServiceAccount + Deployment (chassis) + Service + optional Ingress
```
