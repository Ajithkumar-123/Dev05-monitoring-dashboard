from __future__ import annotations

from datetime import datetime, timezone

from data_access.documents import (
    IDEMPOTENCY_INDEX_NAME,
    TABLE_NAME,
    Document,
    Output,
    ProcessingError,
    _from_item,
    _to_item,
)


def test_table_name_and_index_are_binding():
    assert TABLE_NAME == "docuploader-api-documents"
    assert IDEMPOTENCY_INDEX_NAME == "idempotency-index"


def test_document_roundtrip_with_outputs_and_error():
    now = datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)
    original = Document(
        document_id="doc-001",
        tenant_id="tenant-a",
        workspace_id="ws-001",
        batch_id="batch-001",
        status="PROCESSING",
        idempotency_key="deadbeef",
        pipeline_stage="convert",
        outputs=[
            Output(type="searchable-pdf", s3_key="doc-001/searchable.pdf"),
            Output(type="text", s3_key="doc-001/text.txt", native_trigger="NATIVE"),
        ],
        processing_error=ProcessingError(
            code="CONVERT_FAILED",
            message="Aspose threw a renderer exception",
            retryable=False,
        ),
        created_at=now,
        updated_at=now,
    )
    round = _from_item(_to_item(original))
    assert round.document_id == "doc-001"
    assert round.idempotency_key == "deadbeef"
    assert len(round.outputs) == 2
    assert round.outputs[1].native_trigger == "NATIVE"
    assert round.processing_error is not None
    assert round.processing_error.code == "CONVERT_FAILED"
    assert round.processing_error.retryable is False


def test_completed_document_has_no_processing_error():
    """A COMPLETED document carries no processingError."""
    now = datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)
    original = Document(
        document_id="doc-002",
        tenant_id="tenant-a",
        workspace_id="ws-001",
        batch_id="batch-001",
        status="COMPLETED",
        idempotency_key="deadbeef-2",
        created_at=now,
        updated_at=now,
    )
    round = _from_item(_to_item(original))
    assert round.processing_error is None
