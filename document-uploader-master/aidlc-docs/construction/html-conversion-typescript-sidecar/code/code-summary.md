# html-conversion-typescript-sidecar — Code Summary

Two-container Pod: this TS sidecar + `gotenberg/gotenberg:8` (config-only sister unit).

| File | Purpose |
| --- | --- |
| `src/index.ts` | Worker loop on `convert/html`; stream HTML from S3, POST to local Gotenberg `/forms/chromium/convert/html`, write resulting PDF to pipeline bucket, hand off to `output-assembly` |
| `helm/templates/manifests.yaml` | Custom Deployment (not just chassis include) because of the **two-container Pod**; ts-sidecar (from chassis env block) + gotenberg sister container on port 3000 |

Errors from Gotenberg are wrapped in `DocumentProcessingError`-named errors so the Step Functions Two-Catch routes them to the slipsheet fallback.
