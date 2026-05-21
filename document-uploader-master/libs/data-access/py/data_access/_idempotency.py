"""Idempotency-key derivation for state-changing mutations on
docuploader-api-documents.
"""

from __future__ import annotations

import hashlib
import struct


def derive_update_status_key(execution_id: str, to_state: str, phase: str) -> str:
    """Return the deterministic idempotency key for updateDocumentStatus.

    The key is a hex-encoded SHA-256 digest. Each component is **length-
    prefixed** (big-endian uint32 byte-length, then UTF-8 bytes) before being
    fed to the hash. This is collision-safe under adversarial inputs —
    concatenating components with a delimiter is NOT, because an attacker can
    move characters across the delimiter boundary. Safe to log directly.

    Bit-identical across Go / Python / TypeScript because all three encode
    length as 4-byte big-endian and feed UTF-8 bytes.
    """
    h = hashlib.sha256()
    for component in (execution_id, to_state, phase):
        encoded = component.encode("utf-8")
        h.update(struct.pack(">I", len(encoded)))
        h.update(encoded)
    return h.hexdigest()
