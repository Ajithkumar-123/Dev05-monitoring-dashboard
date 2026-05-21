"""Typed access to docuploader-api-batches."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

TABLE_NAME = "docuploader-api-batches"


@dataclass
class Batch:
    batch_id: str
    tenant_id: str
    workspace_id: str
    status: str  # OPEN | CLOSED
    created_at: datetime
    updated_at: datetime


class BatchNotFoundError(LookupError):
    pass


class Client:
    def __init__(self, dynamo_resource):
        self._table = dynamo_resource.Table(TABLE_NAME)

    def get(self, batch_id: str) -> Batch:
        response = self._table.get_item(Key={"batchId": batch_id}, ConsistentRead=True)
        item = response.get("Item")
        if item is None:
            raise BatchNotFoundError(batch_id)
        return _from_item(item)

    def put(self, b: Batch) -> None:
        self._table.put_item(Item=_to_item(b))


def _to_item(b: Batch) -> dict[str, Any]:
    return {
        "batchId": b.batch_id,
        "tenantId": b.tenant_id,
        "workspaceId": b.workspace_id,
        "status": b.status,
        "createdAt": b.created_at.isoformat(),
        "updatedAt": b.updated_at.isoformat(),
    }


def _from_item(item: dict[str, Any]) -> Batch:
    return Batch(
        batch_id=item["batchId"],
        tenant_id=item["tenantId"],
        workspace_id=item["workspaceId"],
        status=item["status"],
        created_at=datetime.fromisoformat(item["createdAt"]),
        updated_at=datetime.fromisoformat(item["updatedAt"]),
    )
