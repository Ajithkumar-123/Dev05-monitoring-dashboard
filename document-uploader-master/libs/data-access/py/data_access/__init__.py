"""Typed data-access library for docuploader DynamoDB tables.

Sub-packages: workspaces, batches, documents, auditevents, contenthashes,
pipelinefiles, tasktokens. Each exposes a Client class plus an entity
dataclass. Pure data-access — no business logic.
"""

from data_access._dynamo import dynamo_resource
from data_access._idempotency import derive_update_status_key

__all__ = ["dynamo_resource", "derive_update_status_key"]
