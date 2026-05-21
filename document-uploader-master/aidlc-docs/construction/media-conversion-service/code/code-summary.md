# media-conversion-service — Code Summary

| File | Purpose |
| --- | --- |
| `src/index.ts` | Worker loop on `media` queue; FFmpeg via `spawn` with H.264 (libx264 veryfast crf23) + AAC; bounded RAM via streaming via tmp files; FFmpeg-side failures throw `DocumentProcessingError`-named errors so Step Functions routes them to slipsheet |
| `helm/` | 2 replicas; 2 vCPU / 2 GiB Guaranteed-QoS (media transcode is CPU-heavy) |

FFmpeg binary is provided by the container image base (e.g., `jrottenberg/ffmpeg` derivative under `docuploader/media-conversion-service` ECR repo).
