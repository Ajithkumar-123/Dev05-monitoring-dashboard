# ocr-service — Code Summary

| File | Purpose |
| --- | --- |
| `package.json` | @aws-sdk/client-textract for async OCR; data-access for task-tokens |
| `tsconfig.json` | Standard TS pipeline-worker config |
| `src/index.ts` | Worker loop: dequeue `ocr-direct-queue`, start async Textract analysis (FORMS+TABLES), persist task-token row (1-day TTL) for SNS callback correlation, hand off to `pdf-processing-queue` |
| `helm/` | Chassis-based chart; 2 replicas; 500m/512Mi Guaranteed-QoS; env-from `pipeline-queues` ConfigMap |

**Wiring**: IAM role `docuploader-ocr-service`; `TEXTRACT_SNS_TOPIC_ARN` + `TEXTRACT_ROLE_ARN` from a separate `ocr-config` ConfigMap (Textract SNS topic for async completion callbacks; pipeline orchestration delivers results back via SQS).

**Notable behaviour**: async path is the design's primary OCR variant; sync path is added per-request when `ContentLength` is below the Textract sync threshold (future refinement).
