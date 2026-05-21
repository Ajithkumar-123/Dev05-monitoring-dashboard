"""Worker entrypoint: drains pdf-processing SQS, repairs/assembles PDFs."""

from __future__ import annotations

import json
import os
import signal
import sys
import tempfile
from pathlib import Path

import boto3
import pikepdf
import structlog

log = structlog.get_logger(service="pdf-processing-service")

REGION = os.environ.get("AWS_REGION", "eu-west-1")
QUEUE_URL = os.environ["PDF_PROCESSING_QUEUE_URL"]
OUTPUT_ASSEMBLY_QUEUE_URL = os.environ["OUTPUT_ASSEMBLY_QUEUE_URL"]
PIPELINE_BUCKET = os.environ["PIPELINE_BUCKET"]

sqs = boto3.client("sqs", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)


class DocumentProcessingError(Exception):
    """Maps to the Step Functions per-service Two-Catch branch."""


_running = True


def _stop(_signum, _frame):
    global _running
    _running = False


def main() -> None:
    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)
    log.info("starting", queue=QUEUE_URL)
    while _running:
        resp = sqs.receive_message(QueueUrl=QUEUE_URL, MaxNumberOfMessages=1, WaitTimeSeconds=20)
        for msg in resp.get("Messages", []):
            try:
                _handle(json.loads(msg["Body"]))
                sqs.delete_message(QueueUrl=QUEUE_URL, ReceiptHandle=msg["ReceiptHandle"])
            except DocumentProcessingError as err:
                log.warning("DocumentProcessingError; SF Two-Catch will route to slipsheet", error=str(err))
                # visibility expiry will redrive; Step Functions catches surface the named error
            except Exception:  # noqa: BLE001
                log.exception("unexpected handler error")


def _handle(msg: dict) -> None:
    document_id = msg["documentId"]
    src_bucket = msg["s3Bucket"]
    src_key = msg["s3Key"]

    with tempfile.TemporaryDirectory() as work:
        in_path = Path(work) / "input.pdf"
        out_path = Path(work) / "repaired.pdf"
        s3.download_file(src_bucket, src_key, str(in_path))

        try:
            with pikepdf.open(in_path) as src:
                # Touch / re-save to repair malformed PDFs and normalise.
                src.save(out_path, linearize=True)
        except pikepdf.PdfError as err:
            raise DocumentProcessingError(f"pikepdf repair failed: {err}") from err

        out_key = f"{document_id}/repaired.pdf"
        s3.upload_file(str(out_path), PIPELINE_BUCKET, out_key, ExtraArgs={"ContentType": "application/pdf"})

        sqs.send_message(
            QueueUrl=OUTPUT_ASSEMBLY_QUEUE_URL,
            MessageBody=json.dumps(
                {"documentId": document_id, "intermediateKeys": [out_key], "schemaVersion": 1}
            ),
        )
        log.info("pdf repaired", documentId=document_id, outKey=out_key)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log.exception("fatal")
        sys.exit(1)
