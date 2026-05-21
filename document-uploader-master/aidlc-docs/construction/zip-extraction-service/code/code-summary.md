# zip-extraction-service — Code Summary

| File | Purpose |
| --- | --- |
| `package.json` | `unzipper` 0.12.x for streaming extraction |
| `tsconfig.json` | Standard |
| `src/index.ts` | Worker loop: stream-GET ZIP from S3, pipe through `unzipper.Parse()`, per-entry: PUT to staging at `<tenantId>/<batchId>/<childId>` and SendMessage to classification queue for re-entry. Peak RAM bounded by per-entry chunk size, NOT archive size or nesting depth |
| `helm/` | Chassis chart; 2 replicas; 500m/512Mi Guaranteed-QoS |

**Property invariant**: bounded peak RAM irrespective of ZIP size + nesting (validated by `fast-check` property test in the unit's test gate).
