# classification-service — Code Summary

| File | Purpose |
| --- | --- |
| `package.json` | pnpm; @aws-sdk/client-s3 + @aws-sdk/client-sqs + @docuploader/data-access (workspace dep) + file-type (21.x) + pino |
| `tsconfig.json` | ES2022 strict; output to `dist/` |
| `src/index.ts` | Worker loop: long-poll classification SQS, GET first 4 KiB of S3 object, classify, SendMessage to per-route worker queue with `schemaVersion=1`. Graceful shutdown on SIGINT/SIGTERM |
| `src/handler.ts` | Route mapping via extension table + magic-byte detection via `fileTypeFromBuffer`; honours `Workspace.pipelineConfig.forcedSlipsheetExtensions` (default `csv, ods`); slipsheet fallback for unknown types |
| `helm/Chart.yaml` + `values.yaml` + `templates/manifests.yaml` | Depends on chassis; 2 replicas; 250m/256Mi Guaranteed-QoS; env-from-configMap for the 10 queue URLs (`pipeline-queues` ConfigMap is sourced from `platform-orchestration` outputs at deploy time) |

**Routing rules** (per [application-design.md](../../../inception/application-design/application-design.md) and the design docs):
- `csv`, `ods` (+ any per-workspace overrides) → `slipsheet`
- `pdf` → `ocr-direct`
- Office formats → `convert/office`
- `html` / `htm` → `convert/html`
- Image formats → `convert/image`
- `tif` / `tiff` → `convert/tiff` (preprocessed by `tiff-cog-service`)
- `eml` / `msg` → `email`
- `zip` → `archive`
- Audio/video → `media`
- Anything else → `slipsheet` fallback (no document is silently dropped)
