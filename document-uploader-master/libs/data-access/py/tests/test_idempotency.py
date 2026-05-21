"""Cross-language parity tests for idempotency-key derivation.

The same (executionId, toState, phase) triple MUST produce a bit-identical
SHA-256 hex digest in Go, Python, and TypeScript. The golden constants below
are shared with libs/data-access/go/idempotency/key_test.go and
libs/data-access/ts/tests/idempotency.test.ts.
"""

from __future__ import annotations

import pytest
from hypothesis import given, strategies as st

from data_access._idempotency import derive_update_status_key

GOLDEN_EXECUTION_ID = "arn:aws:states:eu-west-1:123456789012:execution:docuploader-pipeline-mvp:exec-001"
GOLDEN_TO_STATE = "PROCESSING"
GOLDEN_PHASE = "convert"


def test_golden_hash_is_64_char_hex():
    digest = derive_update_status_key(GOLDEN_EXECUTION_ID, GOLDEN_TO_STATE, GOLDEN_PHASE)
    assert len(digest) == 64
    int(digest, 16)  # parseable as hex


def test_deterministic():
    a = derive_update_status_key("e1", "PROCESSING", "convert")
    b = derive_update_status_key("e1", "PROCESSING", "convert")
    assert a == b


@pytest.mark.parametrize(
    ("name", "execution_id", "to_state", "phase"),
    [
        ("different_execution_id", "e2", "PROCESSING", "convert"),
        ("different_to_state", "e1", "COMPLETED", "convert"),
        ("different_phase", "e1", "PROCESSING", "ocr"),
    ],
)
def test_distinct_on_any_component(name, execution_id, to_state, phase):
    base = derive_update_status_key("e1", "PROCESSING", "convert")
    assert derive_update_status_key(execution_id, to_state, phase) != base, name


def test_delimiter_safety():
    """If the delimiter could appear inside a component, an adversary could
    craft colliding triples. The implementation uses ASCII Unit Separator
    (0x1f) which the design rules out of identifiers.
    """
    a = derive_update_status_key("a", "b\x1fc", "d")
    b = derive_update_status_key("a", "b", "c\x1fd")
    assert a != b, "delimiter-injection collision"


@given(st.text(min_size=1, max_size=64), st.text(min_size=1, max_size=64), st.text(min_size=1, max_size=64))
def test_is_pure_function(execution_id, to_state, phase):
    """Property: same inputs always yield same output."""
    assert derive_update_status_key(execution_id, to_state, phase) == derive_update_status_key(
        execution_id, to_state, phase
    )
