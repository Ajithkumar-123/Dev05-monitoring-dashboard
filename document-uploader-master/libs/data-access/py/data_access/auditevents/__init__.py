"""Typed access to docuploader-api-audit-events (90-day TTL hot store)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

TABLE_NAME = "docuploader-api-audit-events"


@dataclass
class AuditEvent:
    event_id: str
    tenant_id: str
    workspace_id: str
    user_id: str
    request_id: str
    mutation: str
    payload: dict[str, Any]
    occurred_at: datetime
    idempotency_key: str = ""
    expires_at: int = 0  # unix seconds; defaulted on put if 0


def ttl_for_event(occurred_at: datetime) -> int:
    return int((occurred_at + timedelta(days=90)).timestamp())


class AuditEventNotFoundError(LookupError):
    pass


class Client:
    def __init__(self, dynamo_resource):
        self._table = dynamo_resource.Table(TABLE_NAME)

    def get(self, event_id: str) -> AuditEvent:
        response = self._table.get_item(Key={"eventId": event_id})
        item = response.get("Item")
        if item is None:
            raise AuditEventNotFoundError(event_id)
        return _from_item(item)

    def put(self, e: AuditEvent) -> None:
        if e.expires_at == 0:
            e.expires_at = ttl_for_event(e.occurred_at)
        self._table.put_item(Item=_to_item(e))


def _to_item(e: AuditEvent) -> dict[str, Any]:
    return {
        "eventId": e.event_id,
        "tenantId": e.tenant_id,
        "workspaceId": e.workspace_id,
        "userId": e.user_id,
        "requestId": e.request_id,
        "idempotencyKey": e.idempotency_key,
        "mutation": e.mutation,
        "payload": e.payload,
        "occurredAt": e.occurred_at.isoformat(),
        "expiresAt": e.expires_at,
    }


def _from_item(item: dict[str, Any]) -> AuditEvent:
    return AuditEvent(
        event_id=item["eventId"],
        tenant_id=item["tenantId"],
        workspace_id=item["workspaceId"],
        user_id=item["userId"],
        request_id=item["requestId"],
        idempotency_key=item.get("idempotencyKey", ""),
        mutation=item["mutation"],
        payload=dict(item.get("payload", {})),
        occurred_at=datetime.fromisoformat(item["occurredAt"]),
        expires_at=int(item.get("expiresAt", 0)),
    )
