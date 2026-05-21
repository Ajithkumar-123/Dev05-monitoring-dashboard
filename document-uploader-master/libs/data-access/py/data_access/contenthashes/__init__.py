"""Typed access to docuploader-content-hashes (SHA-256 dedup table; 90-day TTL)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

TABLE_NAME = "docuploader-content-hashes"


@dataclass
class ContentHash:
    sha256: str
    document_id: str
    tenant_id: str
    seen_at: datetime
    expires_at: int = 0


def ttl_for_hash(seen_at: datetime) -> int:
    return int((seen_at + timedelta(days=90)).timestamp())


class ContentHashNotFoundError(LookupError):
    pass


class Client:
    def __init__(self, dynamo_resource):
        self._table = dynamo_resource.Table(TABLE_NAME)

    def get(self, sha256: str) -> ContentHash:
        response = self._table.get_item(Key={"sha256": sha256}, ConsistentRead=True)
        item = response.get("Item")
        if item is None:
            raise ContentHashNotFoundError(sha256)
        return _from_item(item)

    def put(self, h: ContentHash) -> None:
        if h.expires_at == 0:
            h.expires_at = ttl_for_hash(h.seen_at)
        self._table.put_item(Item=_to_item(h))


def _to_item(h: ContentHash) -> dict[str, Any]:
    return {
        "sha256": h.sha256,
        "documentId": h.document_id,
        "tenantId": h.tenant_id,
        "seenAt": h.seen_at.isoformat(),
        "expiresAt": h.expires_at,
    }


def _from_item(item: dict[str, Any]) -> ContentHash:
    return ContentHash(
        sha256=item["sha256"],
        document_id=item["documentId"],
        tenant_id=item["tenantId"],
        seen_at=datetime.fromisoformat(item["seenAt"]),
        expires_at=int(item.get("expiresAt", 0)),
    )
