"""Worker entrypoint: drains convert/office queue, chunks the source document,
calls the co-located Aspose container over localhost HTTP per chunk, streams
qpdf merge into a single PDF, and hands off to pdf-processing.

Peak RAM is bounded by the per-chunk size, never by the total input file size.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import tempfile
from pathlib import Path

import boto3
import httpx
import structlog

log = structlog.get_logger(service="office-conversion-orchestrator-sidecar")

REGION = os.environ.get("AWS_REGION", "eu-west-1")
QUEUE_URL = os.environ["CONVERT_OFFICE_QUEUE_URL"]
PDF_PROCESSING_QUEUE_URL = os.environ["PDF_PROCESSING_QUEUE_URL"]
PIPELINE_BUCKET = os.environ["PIPELINE_BUCKET"]
ASPOSE_URL = os.environ.get("ASPOSE_URL", "http://localhost:8081")
CHUNK_PAGES = int(os.environ.get("CHUNK_PAGES", "10"))

sqs = boto3.client("sqs", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)


class DocumentProcessingError(Exception):
    pass


_running = True


def _stop(_signum, _frame):
    global _running
    _running = False


def main() -> None:
    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)
    log.info("starting", queue=QUEUE_URL, aspose=ASPOSE_URL, chunkPages=CHUNK_PAGES)
    while _running:
        resp = sqs.receive_message(QueueUrl=QUEUE_URL, MaxNumberOfMessages=1, WaitTimeSeconds=20)
        for msg in resp.get("Messages", []):
            try:
                _handle(json.loads(msg["Body"]))
                sqs.delete_message(QueueUrl=QUEUE_URL, ReceiptHandle=msg["ReceiptHandle"])
            except DocumentProcessingError as err:
                log.warning("DocumentProcessingError; SF will route to slipsheet", error=str(err))
            except Exception:  # noqa: BLE001
                log.exception("unexpected handler error")


def _handle(msg: dict) -> None:
    document_id = msg["documentId"]
    src_bucket = msg["s3Bucket"]
    src_key = msg["s3Key"]

    with tempfile.TemporaryDirectory() as work:
        work_path = Path(work)
        in_path = work_path / "input.bin"
        s3.download_file(src_bucket, src_key, str(in_path))

        # Probe chunk count (Aspose container exposes /pages).
        try:
            r = httpx.get(f"{ASPOSE_URL}/pages", params={"path": str(in_path)}, timeout=30.0)
            r.raise_for_status()
            total_pages = int(r.json()["pages"])
        except (httpx.HTTPError, KeyError, ValueError) as err:
            raise DocumentProcessingError(f"aspose probe failed: {err}") from err

        chunk_paths: list[Path] = []
        for start in range(1, total_pages + 1, CHUNK_PAGES):
            end = min(start + CHUNK_PAGES - 1, total_pages)
            chunk_path = work_path / f"chunk-{start:05d}-{end:05d}.pdf"
            try:
                r = httpx.post(
                    f"{ASPOSE_URL}/render",
                    json={"path": str(in_path), "pageStart": start, "pageEnd": end},
                    timeout=600.0,
                )
                r.raise_for_status()
            except httpx.HTTPError as err:
                raise DocumentProcessingError(f"aspose render chunk {start}-{end} failed: {err}") from err
            chunk_path.write_bytes(r.content)
            chunk_paths.append(chunk_path)

        merged = work_path / "merged.pdf"
        cmd = ["qpdf", "--empty", "--pages", *map(str, chunk_paths), "--", str(merged)]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            raise DocumentProcessingError(f"qpdf merge failed: {result.stderr.decode()}")

        out_key = f"{document_id}/office.pdf"
        s3.upload_file(str(merged), PIPELINE_BUCKET, out_key, ExtraArgs={"ContentType": "application/pdf"})
        sqs.send_message(
            QueueUrl=PDF_PROCESSING_QUEUE_URL,
            MessageBody=json.dumps(
                {"documentId": document_id, "s3Bucket": PIPELINE_BUCKET, "s3Key": out_key, "schemaVersion": 1}
            ),
        )
        log.info("office converted", documentId=document_id, chunkCount=len(chunk_paths), totalPages=total_pages)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log.exception("fatal")
        sys.exit(1)
