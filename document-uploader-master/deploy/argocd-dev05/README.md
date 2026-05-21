# dev05 ArgoCD wiring — DRAFT

These manifests are the docuploader stack's Phase C output. They are NOT
deployable from this location — they are meant to be transplanted into the
`argocd-gitops-development` repo at the path noted below.

## Target gitops repo

`https://github.com/opus2-automation/argocd-gitops-development.git`

## Target path inside that repo

```
platform-deployments/environments/dev05/docuploader-dev05/
├── kustomization.yaml          (copy from this dir)
├── project.yaml                (copy from this dir)
├── namespace.yaml              (copy from this dir)
├── docuploader-appset.yaml     (copy from this dir)
└── values/                     (copy from this dir)
    ├── _shared.yaml
    ├── workspace-resolver.yaml
    ├── classification-service.yaml
    └── office-conversion-aspose-container.yaml
```

After transplant, also append a reference to the new tenant in:
- `argo/app-sets/environments/dev05/platform-deployments.yaml`

## What this deploys

An ApplicationSet generates one ArgoCD Application per docuploader unit
that has a Helm chart. As of today that's 19 units (the 4 platform-tier
units are Terraform-only and don't need an Application; the 4 Lambdas
deploy to AWS Lambda not k8s).

Each generated Application:
1. Pulls the unit's Helm chart from the docuploader source repo
   (path `units/<unit-id>/helm/`).
2. Applies a per-unit values override from `values/<unit-id>.yaml` in
   this dir (if present) — otherwise uses the chart's defaults.
3. Applies `values/_shared.yaml` to inject env-level config (region,
   table names, OTLP endpoint, etc.).
4. Deploys to the `docuploader-dev05` namespace.

## Replace before transplanting

| Token | Replace with | Source |
| --- | --- | --- |
| `537462380503` | dev05 AWS account ID | AWS account directory |
| `DOCUPLOADER_SRC_REPO_URL` | docuploader git repo HTTPS URL | git remote of this repo |
| `DOCUPLOADER_TARGET_REVISION` | branch or tag to track for dev05 | release plan (e.g. `main`) |
| `DEV05_PLATFORM_DOMAIN` | dev05 platform DNS root | DNS team |
| `DEV05_ACM_CERT_ARN` | dev05 ACM certificate ARN | platform-iam-and-security TF output |

## Caveats

1. The unit Helm charts depend on `docuploader-chassis` via a relative
   `file://` repository declaration. ArgoCD will need either:
   (a) the chassis chart pushed to a Helm registry and the dep rewritten, or
   (b) Application source pointing at the repo root so relative paths resolve.
   Option (b) is what these manifests use.
2. IRSA role-arns referenced in per-unit values files must already exist
   in dev05 (Phase A2).
3. Each unit's ECR image must already be pushed (Phase B) before its
   Application will reach Healthy.
