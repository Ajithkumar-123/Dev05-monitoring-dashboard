# tiff-cog-service — Code Summary

| File | Purpose |
| --- | --- |
| `src/index.ts` | Worker loop on `tiff-cog` queue; `gdal-async` opens TIFF, uses the COG driver with `GoogleMapsCompatible` tiling scheme, BLOCKSIZE 256, LZW compression; writes COG-formatted TIFF to pipeline bucket; hands off to `convert/image` queue with the new S3 location |

**Property invariant**: COG output must enable ranged reads (validated by `geotiff.js` from `image-tiff-conversion-service`). Resource budget bumped to 1 vCPU / 2 GiB to handle GDAL memory peaks.
