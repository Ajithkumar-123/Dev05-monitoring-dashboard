# office-conversion-orchestrator-sidecar — Code Summary

| File | Purpose |
| --- | --- |
| `pyproject.toml` | uv-managed; deps: boto3, httpx (no `requests`), structlog; data-access via local path dep |
| `src/.../__main__.py` | Worker entrypoint. Per message: probe `total_pages` via Aspose `/pages`; loop `CHUNK_PAGES` (default 10) at a time issuing POST `/render` with `(pageStart, pageEnd)`; each chunk PDF lands on local scratch; merge via `qpdf --empty --pages …`; upload merged PDF; hand off to pdf-processing. `httpx.HTTPError` and `qpdf` non-zero exit wrap to `DocumentProcessingError` for the Step Functions Two-Catch slipsheet branch |
| `helm/templates/manifests.yaml` | Two-container Pod: orchestrator + `aspose` container co-deployed; aspose-licence Secret mounted at `/opt/aspose/license`; Pod-scoped ServiceAccount via chassis include |

**Peak RAM bound**: chunked rendering + qpdf streaming merge keep peak RAM bounded by `CHUNK_PAGES` size, not by total document size — validated by `hypothesis` property test in the unit's test gate.
