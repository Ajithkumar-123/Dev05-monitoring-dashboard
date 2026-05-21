"""Typed access to docuploader-api-workspaces."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

TABLE_NAME = "docuploader-api-workspaces"


@dataclass
class RetentionPolicy:
    input_retention_days: int = 7


@dataclass
class EncryptionConfig:
    kms_alias_name: str = ""


@dataclass
class PipelineConfig:
    allowed_extensions: list[str] = field(default_factory=list)
    forced_slipsheet_extensions: list[str] = field(default_factory=lambda: ["csv", "ods"])


@dataclass
class Workspace:
    workspace_id: str
    tenant_id: str
    status: str  # ACTIVE | ARCHIVED
    retention_policy: RetentionPolicy
    encryption_config: EncryptionConfig
    pipeline_config: PipelineConfig
    created_at: datetime
    updated_at: datetime


class WorkspaceNotFoundError(LookupError):
    pass


class Client:
    def __init__(self, dynamo_resource):
        self._table = dynamo_resource.Table(TABLE_NAME)

    def get(self, workspace_id: str) -> Workspace:
        response = self._table.get_item(Key={"workspaceId": workspace_id}, ConsistentRead=True)
        item = response.get("Item")
        if item is None:
            raise WorkspaceNotFoundError(workspace_id)
        return _from_item(item)

    def put(self, ws: Workspace) -> None:
        self._table.put_item(Item=_to_item(ws))


def _to_item(ws: Workspace) -> dict[str, Any]:
    return {
        "workspaceId": ws.workspace_id,
        "tenantId": ws.tenant_id,
        "status": ws.status,
        "retentionPolicy": {"inputRetentionDays": ws.retention_policy.input_retention_days},
        "encryptionConfig": {"kmsAliasName": ws.encryption_config.kms_alias_name},
        "pipelineConfig": {
            "allowedExtensions": ws.pipeline_config.allowed_extensions,
            "forcedSlipsheetExtensions": ws.pipeline_config.forced_slipsheet_extensions,
        },
        "createdAt": ws.created_at.isoformat(),
        "updatedAt": ws.updated_at.isoformat(),
    }


def _from_item(item: dict[str, Any]) -> Workspace:
    rp = item.get("retentionPolicy", {})
    ec = item.get("encryptionConfig", {})
    pc = item.get("pipelineConfig", {})
    return Workspace(
        workspace_id=item["workspaceId"],
        tenant_id=item["tenantId"],
        status=item["status"],
        retention_policy=RetentionPolicy(input_retention_days=int(rp.get("inputRetentionDays", 7))),
        encryption_config=EncryptionConfig(kms_alias_name=ec.get("kmsAliasName", "")),
        pipeline_config=PipelineConfig(
            allowed_extensions=list(pc.get("allowedExtensions", [])),
            forced_slipsheet_extensions=list(pc.get("forcedSlipsheetExtensions", ["csv", "ods"])),
        ),
        created_at=datetime.fromisoformat(item["createdAt"]),
        updated_at=datetime.fromisoformat(item["updatedAt"]),
    )
