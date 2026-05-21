"""Typed access to textract-task-tokens (async Textract callback correlation;
1-day TTL).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

TABLE_NAME = "textract-task-tokens"


@dataclass
class TaskToken:
    task_token: str
    document_id: str
    execution_id: str
    job_id: str
    created_at: datetime
    expires_at: int = 0


def ttl_for_token(created_at: datetime) -> int:
    return int((created_at + timedelta(days=1)).timestamp())


class TaskTokenNotFoundError(LookupError):
    pass


class Client:
    def __init__(self, dynamo_resource):
        self._table = dynamo_resource.Table(TABLE_NAME)

    def get(self, task_token: str) -> TaskToken:
        response = self._table.get_item(Key={"taskToken": task_token}, ConsistentRead=True)
        item = response.get("Item")
        if item is None:
            raise TaskTokenNotFoundError(task_token)
        return _from_item(item)

    def put(self, t: TaskToken) -> None:
        if t.expires_at == 0:
            t.expires_at = ttl_for_token(t.created_at)
        self._table.put_item(Item=_to_item(t))

    def delete(self, task_token: str) -> None:
        self._table.delete_item(Key={"taskToken": task_token})


def _to_item(t: TaskToken) -> dict[str, Any]:
    return {
        "taskToken": t.task_token,
        "documentId": t.document_id,
        "executionId": t.execution_id,
        "jobId": t.job_id,
        "createdAt": t.created_at.isoformat(),
        "expiresAt": t.expires_at,
    }


def _from_item(item: dict[str, Any]) -> TaskToken:
    return TaskToken(
        task_token=item["taskToken"],
        document_id=item["documentId"],
        execution_id=item["executionId"],
        job_id=item["jobId"],
        created_at=datetime.fromisoformat(item["createdAt"]),
        expires_at=int(item.get("expiresAt", 0)),
    )
