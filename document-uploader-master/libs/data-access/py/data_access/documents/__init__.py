"""Typed access to docuploader-api-documents."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from boto3.dynamodb.conditions import Key

TABLE_NAME = "docuploader-api-documents"
IDEMPOTENCY_INDEX_NAME = "idempotency-index"


@dataclass
class Output:
    type: str
    s3_key: str
    native_trigger: str = ""


@dataclass
class ProcessingError:
    code: str
    message: str
    retryable: bool
    detail: str = ""
    extensions: dict[str, str] = field(default_factory=dict)


@dataclass
class Document:
    document_id: str
    tenant_id: str
    workspace_id: str
    batch_id: str
    status: str  # UPLOADED | SCANNING | QUEUED | PROCESSING | COMPLETED | FAILED
    idempotency_key: str
    pipeline_stage: str = ""
    outputs: list[Output] = field(default_factory=list)
    processing_error: ProcessingError | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DocumentNotFoundError(LookupError):
    pass


class Client:
    def __init__(self, dynamo_resource):
        self._table = dynamo_resource.Table(TABLE_NAME)

    def get(self, document_id: str) -> Document:
        response = self._table.get_item(Key={"documentId": document_id}, ConsistentRead=True)
        item = response.get("Item")
        if item is None:
            raise DocumentNotFoundError(document_id)
        return _from_item(item)

    def put(self, d: Document) -> None:
        self._table.put_item(Item=_to_item(d))

    def find_by_idempotency_key(self, key: str) -> Document:
        response = self._table.query(
            IndexName=IDEMPOTENCY_INDEX_NAME,
            KeyConditionExpression=Key("idempotencyKey").eq(key),
            Limit=1,
        )
        items = response.get("Items", [])
        if not items:
            raise DocumentNotFoundError(f"idempotencyKey={key}")
        return _from_item(items[0])


def _to_item(d: Document) -> dict[str, Any]:
    item: dict[str, Any] = {
        "documentId": d.document_id,
        "tenantId": d.tenant_id,
        "workspaceId": d.workspace_id,
        "batchId": d.batch_id,
        "status": d.status,
        "idempotencyKey": d.idempotency_key,
        "pipelineStage": d.pipeline_stage,
        "outputs": [
            {"type": o.type, "s3Key": o.s3_key, "nativeTrigger": o.native_trigger}
            for o in d.outputs
        ],
    }
    if d.processing_error is not None:
        item["processingError"] = {
            "code": d.processing_error.code,
            "message": d.processing_error.message,
            "detail": d.processing_error.detail,
            "retryable": d.processing_error.retryable,
            "extensions": d.processing_error.extensions,
        }
    if d.created_at is not None:
        item["createdAt"] = d.created_at.isoformat()
    if d.updated_at is not None:
        item["updatedAt"] = d.updated_at.isoformat()
    return item


def _from_item(item: dict[str, Any]) -> Document:
    pe = item.get("processingError")
    return Document(
        document_id=item["documentId"],
        tenant_id=item["tenantId"],
        workspace_id=item["workspaceId"],
        batch_id=item["batchId"],
        status=item["status"],
        idempotency_key=item["idempotencyKey"],
        pipeline_stage=item.get("pipelineStage", ""),
        outputs=[
            Output(type=o["type"], s3_key=o["s3Key"], native_trigger=o.get("nativeTrigger", ""))
            for o in item.get("outputs", [])
        ],
        processing_error=(
            ProcessingError(
                code=pe["code"],
                message=pe["message"],
                detail=pe.get("detail", ""),
                retryable=bool(pe["retryable"]),
                extensions=dict(pe.get("extensions", {})),
            )
            if pe
            else None
        ),
        created_at=datetime.fromisoformat(item["createdAt"]) if "createdAt" in item else None,
        updated_at=datetime.fromisoformat(item["updatedAt"]) if "updatedAt" in item else None,
    )
