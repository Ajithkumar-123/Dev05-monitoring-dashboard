---
description: Run AI-DLC design (stages 8-11) for unit [unit-id] on its dedicated branch. Walks aidlc-functional-designer (stage 8) then aidlc-systems-designer (stages 9-11). Use on a unit branch only.
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(AIDLC_ARGS=* node:*), Read, Write, Edit, Task, Agent
argument-hint: <unit-id>
---

# /aidlc-unit-design [unit-id]

## Pre-flight

```!
AIDLC_ARGS="$ARGUMENTS" node .ai-dlc-bootstrap/scaffold/scaffold.js preflight-unit-design
```

If non-zero exit, halt verbatim. Otherwise stdout has `PREFLIGHT_OK <unitPath>`; bind `UNIT_PATH`.

## Execution

Read `.claude/skills/aidlc-cluster-agent-pattern/SKILL.md` for the orchestrator-side contract (resume state machine, envelope extraction, state-file paths, gate_id naming).

State file: `${UNIT_PATH}/.ai-dlc-bootstrap/construction/orchestrator-state.json`
Cluster sequence: `aidlc-functional-designer -> aidlc-systems-designer`

Phase 4's per-unit construction state file lives in the `construction/` sibling directory. Phase 3 cleared its `inception/` state at end-of-stage-7; Phase 4 creates this `construction/` state at first dispatch.

### Gate loop

**If unit state file is ABSENT (first dispatch):**

Dispatch `aidlc-functional-designer` via Task:
```
Task(subagent_type="aidlc-functional-designer", prompt=<assembled input>)
```
Input fields: `scope=unit`, `unit_id=<unit-id from $ARGUMENTS>`, `current_stage=functional-design`, `resume={kind: null, gate_id: null, details: null}`, `last_envelope=null`.

Write the initial state file to `${UNIT_PATH}/.ai-dlc-bootstrap/construction/orchestrator-state.json`. Include all of: `scope="unit"`, `unit_id`, `unit_path`, `current_cluster="aidlc-functional-designer"`, `current_stage="functional-design"`, `last_envelope=null`, `started_at=<ISO timestamp now>`, `last_updated=<same ISO timestamp>`. The `started_at` value is the stable anchor for D-48 redesign rewinds and metrics; once written it MUST NOT change.

**If unit state file is PRESENT (resume):**

Read `${UNIT_PATH}/.ai-dlc-bootstrap/construction/orchestrator-state.json`.

Derive resume signal from the user's most recent message using the skill's resume vocabulary table. If unrecognized: surface help message and HALT.

Dispatch the cluster agent named by `state.current_cluster` via Task with assembled input.

**After every dispatch:**

1. Extract the envelope from the agent's return (per skill's envelope-extraction section).
2. Update state file: set `current_cluster`, `current_stage`, `last_envelope`, `last_updated`. PRESERVE existing `started_at` verbatim — never overwrite. If the file pre-dates the started_at contract and the field is absent, backfill from existing `last_updated` (one-time migration; subsequent updates preserve as normal).
3. Branch on `envelope.status`:

   **STAGE_COMPLETE:**
   - If `envelope.next_stage` is set: re-dispatch SAME cluster with `current_stage=envelope.next_stage, resume.kind=null`. Continue looping. (Handles `aidlc-systems-designer`'s in-cluster chain `nfr-requirements -> nfr-design -> infrastructure-design`.)
   - If `envelope.next_stage` is null AND `current_cluster` is not `aidlc-systems-designer`: advance to `aidlc-systems-designer` with `current_stage="nfr-requirements"`. Continue looping.
   - If `envelope.next_stage` is null AND `current_cluster` is `aidlc-systems-designer`: clear the state file. Announce verbatim: "Unit design complete for [unit-id]: stages 8-11 done. Run /aidlc-unit-construct [unit-id] to proceed to code generation." HALT.

   **GATE_QUESTIONS or GATE_APPROVAL:**
   Surface `envelope.message` verbatim. HALT this turn. User re-runs `/aidlc-unit-design [unit-id]`.

   **ERROR:**
   Surface `envelope.message` verbatim. HALT.

### Notes

- Phase 4 only operates on the current unit branch and never modifies other branches (D-33).
- The unit state file lives inside `${UNIT_PATH}/` ensuring no two unit branches ever share a state path.
