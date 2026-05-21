# tiff-cog-service

**Tier**: Pipeline (preprocessor)
**Language**: TypeScript (Node 22 LTS, pnpm)
**Compute**: EKS Deployment

## Purpose
TIFF-to-COG (Cloud Optimized GeoTIFF) preprocessor enabling ranged extraction by downstream services via `geotiff.js`. Uses `gdal-async` (bundled GDAL ≥ 3.1).

## Responsibilities
- Long-poll the TIFF-COG worker queue
- Convert source TIFFs to COG layout (tiled, with overviews and proper headers)
- Write COG output to S3
- Hand off to `image-tiff-conversion-service` for ranged extraction

## Inputs (consumed)
- SQS `tiff-cog` worker queue
- S3 source TIFF

## Outputs (produced)
- COG-formatted TIFF in S3
- SQS hand-off downstream

## Dependencies
- `platform-orchestration`, `platform-data`, `platform-iam-and-security`; `gdal-async` (in-image)

## Test gate
Three-tier — Local: property tests on COG layout validity and ranged-read enablement; LocalStack: SQS + S3; Sandbox: real-AWS verification with ranged reads.

## Construction-stage artefacts
- Functional design, NFR, infra, code → `aidlc-docs/construction/tiff-cog-service/`
- Source: `units/tiff-cog-service/`
