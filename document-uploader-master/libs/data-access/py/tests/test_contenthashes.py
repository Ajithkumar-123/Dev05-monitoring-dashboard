from __future__ import annotations

from datetime import datetime, timedelta, timezone

from data_access.contenthashes import TABLE_NAME, ContentHash, _from_item, _to_item, ttl_for_hash


def test_table_name_is_binding():
    assert TABLE_NAME == "docuploader-content-hashes"


def test_ttl_for_hash_is_90_days_out():
    seen = datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)
    expected = int((seen + timedelta(days=90)).timestamp())
    assert ttl_for_hash(seen) == expected


def test_content_hash_roundtrip():
    seen = datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)
    original = ContentHash(
        sha256="a" * 64,
        document_id="doc-001",
        tenant_id="tenant-a",
        seen_at=seen,
    )
    round = _from_item(_to_item(original))
    assert round.sha256 == "a" * 64
    assert round.document_id == "doc-001"
    assert round.seen_at == seen
