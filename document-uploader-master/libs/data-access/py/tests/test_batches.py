from __future__ import annotations

from datetime import datetime, timezone

from data_access.batches import TABLE_NAME, Batch, _from_item, _to_item


def test_table_name_is_binding():
    assert TABLE_NAME == "docuploader-api-batches"


def test_batch_roundtrip():
    now = datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)
    original = Batch(
        batch_id="batch-001",
        tenant_id="tenant-a",
        workspace_id="ws-001",
        status="OPEN",
        created_at=now,
        updated_at=now,
    )
    round = _from_item(_to_item(original))
    assert round.batch_id == original.batch_id
    assert round.tenant_id == original.tenant_id
    assert round.workspace_id == original.workspace_id
    assert round.status == "OPEN"
    assert round.created_at == original.created_at
