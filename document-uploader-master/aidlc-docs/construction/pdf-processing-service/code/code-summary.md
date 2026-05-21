# pdf-processing-service — Code Summary

| File | Purpose |
| --- | --- |
| `pyproject.toml` | uv-managed; deps: boto3, pikepdf, pymupdf, structlog; dev: pytest + hypothesis + allure-pytest; data-access via local path dep |
| `.python-version` | 3.13 |
| `src/pdf_processing_service/__main__.py` | Worker entrypoint: long-poll SQS, `pikepdf.open()` + `save(linearize=True)` to repair/normalise, upload to pipeline bucket, hand off to `output-assembly`. `pikepdf.PdfError` is wrapped in `DocumentProcessingError` so Step Functions Two-Catch routes to the slipsheet branch |
| `helm/` | Chassis chart; 2 replicas; 1 vCPU / 1 GiB Guaranteed-QoS |

**Property invariants** (for the test gate): page count preserved across repair; output PDF parses; no orphaned XObjects.
