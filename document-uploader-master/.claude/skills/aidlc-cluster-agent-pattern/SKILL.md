---
description: Standing rules for AI-DLC cluster agents (Shape A re-entrant). Documents the resume state machine, <aidlc-envelope> contract, gate_id naming, AI-DLC common-rules pre-Read, and question-file format. Read on demand by aidlc-* cluster agents.
---

# aidlc-cluster-agent-pattern

Standing rules for any cluster agent participating in Shape A's gate loop. Applies to all `aidlc-*` cluster agents (requirements-analyst, story-writer, architect, planner) dispatched by `/aidlc-project-inception` or `/aidlc-unit-inception`.

## On invocation: ALWAYS Read first (before any branch)

1. `.aidlc-rule-details/common/process-overview.md`
2. `.aidlc-rule-details/common/question-format-guide.md`
3. `.aidlc-rule-details/common/content-validation.md`
4. `.aidlc-rule-details/inception/<your-current-stage>.md` (or `design/`, `construction/` in later phases)

Cluster agents do NOT inherit the parent session's loaded AI-DLC rules. These four Reads are unconditional — they happen every invocation, before the `resume.kind` branch.

## Resume state machine — branch on resume.kind

| resume.kind | Source | Behavior | Typical envelope |
|---|---|---|---|
| `null` | First invocation for `current_stage` | Run stage from start per its rule file | `GATE_QUESTIONS`, `GATE_APPROVAL`, or `STAGE_COMPLETE` |
| `answered_questions` | User filled `[Answer]:` tags in the artifact at `last_envelope.artifact_path` | Validate per `question-format-guide.md`; detect contradictions; emit clarification `GATE_QUESTIONS` or stage artifact + `GATE_APPROVAL` | `GATE_QUESTIONS` or `GATE_APPROVAL` |
| `approved` | User explicitly approved the artifact at `last_envelope.artifact_path` | Log approval per the AI-DLC stage rule; advance to the next gate in this stage or the next stage in this cluster | Next gate's envelope or `STAGE_COMPLETE` |
| `request_changes` | User requested modifications; `resume.details` = description | Re-run the relevant segment with `resume.details`; regenerate artifact; re-emit the SAME `gate_id` with updated `artifact_path` | Same `status` and `gate_id` as the rejected gate |

Multi-gate stages (`user-stories`, `units-generation`, `requirements-analysis`, `application-design`) cycle through multiple `gate_id` values within one `current_stage`. Use `resume.gate_id` plus on-disk artifact state to pick the correct re-entry segment.

## Resume vocabulary

Maps user input to `resume.kind` values consumed by cluster agents. The orchestrator interprets this table; cluster agents see only the resolved `resume.kind`.

| User says | resume.kind | resume.details | When |
|-----------|-------------|----------------|------|
| (filled `[Answer]:` tags in the artifact at `last_envelope.artifact_path` and replied) `done` or `answered` or just submits | `answered_questions` | (omit) | After a `GATE_QUESTIONS` envelope |
| `approved` or `looks good` or `ship it` | `approved` | (omit) | After a `GATE_APPROVAL` envelope |
| `request changes: <description>` or `revise: <description>` | `request_changes` | the description | After any gate envelope |
| (anything else / first invocation) | `null` | (omit) | First time entering `current_stage` |
| (orchestrator, after assert-marker BT_OK) | `bt_ok` | (omit) | Phase 06.1 — orchestrator-only signal; sent after `AWAITING_BUILD_TEST` envelope when the build-and-test helper exits 0; consumed by `aidlc-coder` stage-13 to emit `GATE_APPROVAL` |

## Envelope contract (D-36)

The LAST output block of every cluster-agent invocation must be exactly one envelope:

<aidlc-envelope>
```json
{
  "status": "GATE_QUESTIONS|GATE_APPROVAL|STAGE_COMPLETE|ERROR",
  "scope": "project|unit",
  "unit_id": "<id or null>",
  "current_stage": "<AI-DLC stage name>",
  "gate_id": "<see naming below, or null>",
  "artifact_path": "<rel path>",
  "message": "<verbatim user-facing prompt>",
  "next_stage": "<AI-DLC stage name or null>"
}
```
</aidlc-envelope>

Status semantics:

| Status | Meaning | Orchestrator action |
|--------|---------|---------------------|
| `GATE_QUESTIONS` | Agent wrote a `*-questions.md` file; user must fill `[Answer]:` tags | Surface `message`; halt slash-command turn |
| `GATE_APPROVAL` | Agent produced a stage artifact; user must approve per AI-DLC stage rule | Surface `message` (verbatim AI-DLC approval prompt); halt slash-command turn |
| `STAGE_COMPLETE` | No gate pending; orchestrator advances to `next_stage` or next cluster | Loop within same turn; no user wait |
| `ERROR` | Unrecoverable error | Surface and halt; no auto-retry |

`gate_id` is REQUIRED when `status ∈ {GATE_QUESTIONS, GATE_APPROVAL}`; null for `STAGE_COMPLETE` and `ERROR`.

## Envelope extraction (D-36)

Extract the LAST `<aidlc-envelope>...</aidlc-envelope>` block from the agent's final message. Strip the optional ```json fence. `JSON.parse` the inner content. If parse fails, surface "Cluster agent did not emit a valid envelope. Output: <text>" and HALT (no auto-retry).

Conceptual regex (orchestrator-side, applied to the cluster agent's final message):

```text
/<aidlc-envelope>\s*(```json\s*)?([\s\S]*?)\s*(```\s*)?<\/aidlc-envelope>/
```

The orchestrator never auto-retries a malformed envelope. Surfacing the verbatim agent output gives the user the diagnostic context to either re-run the command or report a cluster-agent bug.

## gate_id naming convention

| Stage | gate_id sequence |
|-------|------------------|
| `workspace-detection` | n/a (single `STAGE_COMPLETE`) |
| `reverse-engineering` | `approval` |
| `requirements-analysis` | `questions` → `clarification-N` → `approval` |
| `user-stories` | `plan-questions` → `plan-clarification-N` → `plan-approval` → `generated-approval` |
| `application-design` | `questions` → `clarification-N` → `approval` |
| `units-generation` | `plan-questions` → `plan-clarification-N` → `plan-approval` → `generated-approval` |
| `workflow-planning` | `approval` |
| `code-generation` | `plan-approval` → `generated-approval` |
| `build-and-test` | `approval` |
| `audit-review` (aidlc-audit-reviewer — Shape B / one-shot) | n/a — single `STAGE_COMPLETE` envelope; no gates, no `resume.kind` |

The orchestrator persists `last_envelope.gate_id` to the state file (D-37) and passes it back unchanged via `resume.gate_id` on the next invocation.

## Clarification round counting

N = (count of existing files matching `<phase>-clarification-*-questions.md`) + 1.

Example: if `requirement-clarification-1-questions.md` already exists, the next clarification file is `requirement-clarification-2-questions.md` and `gate_id = "clarification-2"`.

## Question-file format

Always per `.aidlc-rule-details/common/question-format-guide.md`:
- Multiple choice with A/B/C lettered options
- Mandatory "X) Other" option on every question
- `[Answer]:` tags for the user to fill in
- Files named `*-questions.md` or `*-clarification-N-questions.md`
- "Never Ask Questions in Chat" — always write a file

## Approval prompt format

Use the verbatim text from the AI-DLC stage rule's "Wait for Explicit Approval" / "Present Completion Message" section as `envelope.message`. Never reword. This preserves AI-DLC's exact approval language (D-39).

## Output discipline

- Exactly one envelope per invocation
- Envelope is the LAST block of output
- Anything before the envelope is informational; the orchestrator may relay or ignore it
- No second envelope, ever
- `next_stage` carries the agent's determination forward across invocations; the orchestrator reads it to dispatch the next cluster or advance within the current one

## State-file paths and BRCH-01

Per-unit state files live inside the unit's working directory:

| Scope | Path |
|-------|------|
| unit-inception | `${UNIT_PATH}/.ai-dlc-bootstrap/inception/orchestrator-state.json` |
| unit-construction | `${UNIT_PATH}/.ai-dlc-bootstrap/construction/orchestrator-state.json` |
| project-inception | `.ai-dlc-bootstrap/inception/project-orchestrator-state.json` (project root, on main) |

Per-unit paths intentionally live UNDER `${UNIT_PATH}/` so no two unit branches ever touch the same state path. This is BRCH-01 forward-compatibility — Phase 5 wires cross-branch state propagation, but the path layout is locked here.

## Shape B — One-shot agents (Phase 6)

Shape A cluster agents (Phases 3-4) are re-entrant: they handle `resume.kind ∈ {clarification, approval, request_changes}` envelopes and emit gate envelopes (`GATE_QUESTIONS`, `GATE_APPROVAL`, `STAGE_COMPLETE`). They drive the AI-DLC stage gate loop.

Shape B agents are one-shot: a single Read → judgment → Write → emit `STAGE_COMPLETE` envelope cycle, with no engineer approval gate and no re-entry. They operate OUTSIDE the AI-DLC stage flow (e.g., audit-review runs after a milestone, not within a stage).

Shape B contract (D-106):
- NO `<input_contract>` section containing `resume.kind` or `last_envelope` keys
- NO "branch on resume.kind" prose
- NO mandatory `Read .aidlc-rule-details/...` preamble (Pattern B Read-on-demand only, default-NO Skills Read)
- Emits a single `<aidlc-envelope>` block at end-of-output with `status: "STAGE_COMPLETE"`, `next_stage: null`, `gate_id: null`
- Dispatched via Task() with file-based handoff (orchestrator helper writes input bundle to disk; agent reads paths from prompt; no inline content per universal-anti-patterns rule #2 / D-107)
- Canonical exemplar: `aidlc-audit-reviewer.md` (Phase 6 — AGNT-03 / AGNT-04)

The cluster-agent-pattern Skill remains the single-source pattern catalog — Shape A and Shape B coexist as table rows; future judgment-heavy one-shot agents (e.g., a hypothetical `aidlc-design-reviewer`) follow Shape B.

## Notes

- AI-DLC stage rule files are read by the cluster agents (INTG-01). The orchestrator never reads `.aidlc-rule-details/` directly.
- Approval prompts emitted by cluster agents in `envelope.message` are surfaced verbatim — the orchestrator does not reword them (D-39).
