# image-tiff-conversion-service — Code Summary

| File | Purpose |
| --- | --- |
| `src/index.ts` | Worker loop on `convert/image` (handles direct image inputs and post-COG TIFF outputs from `tiff-cog-service`); sharp normalises orientation + re-encodes JPEG; PDFKit wraps the bytes in a 1-page PDF |
| `helm/` | Chassis chart; 2 replicas; 1 vCPU / 1 GiB Guaranteed-QoS |

**Property invariant**: bounded peak RAM regardless of input dimensions (validated via property tests on sharp streaming).

`geotiff.js` is in the dependency set but not yet exercised by this scaffold — it's the ranged-read path for very large TIFFs (used in the unit's follow-on test suite).
