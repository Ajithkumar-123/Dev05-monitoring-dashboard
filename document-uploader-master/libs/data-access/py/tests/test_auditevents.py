from __future__ import annotations

from datetime import datetime, timedelta, timezone

from data_access.auditevents import TABLE_NAME, AuditEvent, _from_item, _to_item, ttl_for_event


def test_table_name_is_binding():
    assert TABLE_NAME == "docuploader-api-audit-events"


def test_ttl_for_event_is_90_days_out():
    occurred = datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)
    expected = int((occurred + timedelta(days=90)).timestamp())
    assert ttl_for_event(occurred) == expected


def test_audit_event_roundtrip():
    occurred = datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)
    original = AuditEvent(
        event_id="evt-001",
        tenant_id="tenant-a",
        workspace_id="ws-001",
        user_id="user-1",
        request_id="req-1",
        mutation="createDocument",
        payload={"documentId": "doc-001"},
        occurred_at=occurred,
        idempotency_key="deadbeef",
    )
    round = _from_item(_to_item(original))
    assert round.event_id == "evt-001"
    assert round.mutation == "createDocument"
    assert round.payload == {"documentId": "doc-001"}
    assert round.occurred_at == occurred
