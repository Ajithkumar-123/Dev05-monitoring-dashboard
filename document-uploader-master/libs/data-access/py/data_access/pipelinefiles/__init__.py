"""Typed access to docuploader-pipeline-files (7-day TTL; folderPath-index)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from boto3.dynamodb.conditions import Key

TABLE_NAME = "docuploader-pipeline-files"
FOLDER_PATH_INDEX_NAME = "folderPath-index"


@dataclass
class PipelineFile:
    file_id: str
    document_id: str
    execution_id: str
    folder_path: str
    s3_bucket: str
    s3_key: str
    size_bytes: int
    created_at: datetime
    expires_at: int = 0


def ttl_for_file(created_at: datetime) -> int:
    return int((created_at + timedelta(days=7)).timestamp())


class PipelineFileNotFoundError(LookupError):
    pass


class Client:
    def __init__(self, dynamo_resource):
        self._table = dynamo_resource.Table(TABLE_NAME)

    def get(self, file_id: str) -> PipelineFile:
        response = self._table.get_item(Key={"fileId": file_id}, ConsistentRead=True)
        item = response.get("Item")
        if item is None:
            raise PipelineFileNotFoundError(file_id)
        return _from_item(item)

    def put(self, f: PipelineFile) -> None:
        if f.expires_at == 0:
            f.expires_at = ttl_for_file(f.created_at)
        self._table.put_item(Item=_to_item(f))

    def list_by_folder(self, folder_path: str) -> list[PipelineFile]:
        response = self._table.query(
            IndexName=FOLDER_PATH_INDEX_NAME,
            KeyConditionExpression=Key("folderPath").eq(folder_path),
        )
        return [_from_item(i) for i in response.get("Items", [])]


def _to_item(f: PipelineFile) -> dict[str, Any]:
    return {
        "fileId": f.file_id,
        "documentId": f.document_id,
        "executionId": f.execution_id,
        "folderPath": f.folder_path,
        "s3Bucket": f.s3_bucket,
        "s3Key": f.s3_key,
        "sizeBytes": f.size_bytes,
        "createdAt": f.created_at.isoformat(),
        "expiresAt": f.expires_at,
    }


def _from_item(item: dict[str, Any]) -> PipelineFile:
    return PipelineFile(
        file_id=item["fileId"],
        document_id=item["documentId"],
        execution_id=item["executionId"],
        folder_path=item["folderPath"],
        s3_bucket=item["s3Bucket"],
        s3_key=item["s3Key"],
        size_bytes=int(item["sizeBytes"]),
        created_at=datetime.fromisoformat(item["createdAt"]),
        expires_at=int(item.get("expiresAt", 0)),
    )
