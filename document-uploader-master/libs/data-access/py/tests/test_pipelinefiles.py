from __future__ import annotations

from datetime import datetime, timedelta, timezone

from data_access.pipelinefiles import (
    FOLDER_PATH_INDEX_NAME,
    TABLE_NAME,
    PipelineFile,
    _from_item,
    _to_item,
    ttl_for_file,
)


def test_table_name_and_index_are_binding():
    assert TABLE_NAME == "docuploader-pipeline-files"
    assert FOLDER_PATH_INDEX_NAME == "folderPath-index"


def test_ttl_for_file_is_7_days_out():
    created = datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)
    expected = int((created + timedelta(days=7)).timestamp())
    assert ttl_for_file(created) == expected


def test_pipeline_file_roundtrip():
    created = datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)
    original = PipelineFile(
        file_id="file-001",
        document_id="doc-001",
        execution_id="exec-001",
        folder_path="doc-001/chunks",
        s3_bucket="docuploader-pipeline",
        s3_key="doc-001/chunks/0.pdf",
        size_bytes=1024,
        created_at=created,
    )
    round = _from_item(_to_item(original))
    assert round.file_id == "file-001"
    assert round.folder_path == "doc-001/chunks"
    assert round.size_bytes == 1024
