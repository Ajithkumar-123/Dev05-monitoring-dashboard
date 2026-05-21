from __future__ import annotations

from datetime import datetime, timedelta, timezone

from data_access.tasktokens import TABLE_NAME, TaskToken, _from_item, _to_item, ttl_for_token


def test_table_name_is_binding():
    assert TABLE_NAME == "textract-task-tokens"


def test_ttl_for_token_is_1_day_out():
    created = datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)
    expected = int((created + timedelta(days=1)).timestamp())
    assert ttl_for_token(created) == expected


def test_task_token_roundtrip():
    created = datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)
    original = TaskToken(
        task_token="textract-callback-token-001",
        document_id="doc-001",
        execution_id="exec-001",
        job_id="textract-job-001",
        created_at=created,
    )
    round = _from_item(_to_item(original))
    assert round.task_token == "textract-callback-token-001"
    assert round.job_id == "textract-job-001"
