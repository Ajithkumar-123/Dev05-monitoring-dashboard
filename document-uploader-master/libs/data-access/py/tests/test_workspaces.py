from __future__ import annotations

from datetime import datetime, timezone

from data_access.workspaces import (
    EncryptionConfig,
    PipelineConfig,
    RetentionPolicy,
    TABLE_NAME,
    Workspace,
    _from_item,
    _to_item,
)


def test_table_name_is_binding():
    assert TABLE_NAME == "docuploader-api-workspaces"


def test_workspace_roundtrip_preserves_all_fields():
    now = datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)
    original = Workspace(
        workspace_id="ws-001",
        tenant_id="tenant-a",
        status="ACTIVE",
        retention_policy=RetentionPolicy(input_retention_days=7),
        encryption_config=EncryptionConfig(kms_alias_name="alias/docuploader-tenant-ws-001"),
        pipeline_config=PipelineConfig(
            allowed_extensions=["pdf", "docx"],
            forced_slipsheet_extensions=["csv", "ods"],
        ),
        created_at=now,
        updated_at=now,
    )
    item = _to_item(original)
    round = _from_item(item)
    assert round.workspace_id == original.workspace_id
    assert round.tenant_id == original.tenant_id
    assert round.status == original.status
    assert round.retention_policy.input_retention_days == 7
    assert round.encryption_config.kms_alias_name == "alias/docuploader-tenant-ws-001"
    assert round.pipeline_config.forced_slipsheet_extensions == ["csv", "ods"]
    assert round.created_at == original.created_at


def test_pipeline_config_default_forced_slipsheet():
    """Per requirements.md FR-2.10: default forced-slipsheet list is ['csv','ods']."""
    pc = PipelineConfig()
    assert pc.forced_slipsheet_extensions == ["csv", "ods"]


def test_retention_policy_default_is_7_days():
    """Per requirements.md FR-3.3."""
    assert RetentionPolicy().input_retention_days == 7
