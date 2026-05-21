# html-conversion-gotenberg-container — Code Summary

Configuration-only unit. The third-party `gotenberg/gotenberg:8` image runs as container #1 inside the `html-conversion-typescript-sidecar` Pod (see that unit's `manifests.yaml`).

| File | Purpose |
| --- | --- |
| `helm/Chart.yaml` | Library-style chart, version pinning Gotenberg 8 |
| `helm/values.yaml` | Documents the standard image/resource budget so the sister unit references it via copy or import in CI |
| `helm/templates/notes.txt` | Operator-readable explainer that this unit is non-standalone |

No source code authored. ECR repo `docuploader/html-conversion-gotenberg-mirror` (mirrors the upstream image for VPC-endpoint pull); per-tier security posture covered by the sandbox-managed ALB Controller policy.
