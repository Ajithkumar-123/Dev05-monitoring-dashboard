# output-assembly-service — Code Summary

| File | Purpose |
| --- | --- |
| `package.json` | `pdf-lib` for searchable-PDF assembly |
| `src/index.ts` | Worker loop on `output-assembly` queue; load intermediate PDF pages from `pipeline` bucket, merge via `pdf-lib`, write `<documentId>/searchable.pdf` |
| `helm/` | Chassis chart; 2 replicas; 500m/512Mi |

Final per-route stage; writes the searchable PDF under `pipeline` bucket and (in production) calls `document-resolver.UpdateDocumentStatus` with terminal COMPLETED + outputs payload (the resolver call is added in a subsequent test-authoring pass).
