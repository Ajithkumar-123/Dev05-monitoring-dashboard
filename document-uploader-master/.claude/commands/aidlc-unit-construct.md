---
description: Run AI-DLC construction (stages 12-13) for unit [unit-id] on its dedicated branch. Walks aidlc-coder (code-generation, build-and-test). Use on a unit branch only after /aidlc-unit-design completes.
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(AIDLC_ARGS=* node:*), Read, Write, Edit, Task, Agent
argument-hint: <unit-id>
---

# /aidlc-unit-construct [unit-id]

## Pre-flight

```!
AIDLC_ARGS="$ARGUMENTS" node .ai-dlc-bootstrap/scaffold/scaffold.js preflight-unit-construct
```

If non-zero exit, halt verbatim. Otherwise stdout has `PREFLIGHT_OK <unitPath>`; bind `UNIT_PATH`.

## Execution

Read `.claude/skills/aidlc-cluster-agent-pattern/SKILL.md` for the orchestrator-side contract (resume state machine, envelope extraction, state-file paths, gate_id naming).

State file: `${UNIT_PATH}/.ai-dlc-bootstrap/construction/orchestrator-state.json`
Cluster sequence: `aidlc-coder` (single cluster; agent emits STAGE_COMPLETE next_stage="build-and-test" between stages 12 and 13).

This is the same path `/aidlc-unit-design` uses; design clears the file on stage-11 STAGE_COMPLETE, and `/aidlc-unit-construct` creates a fresh file with `current_cluster="aidlc-coder"`, `current_stage="code-generation"` on its first dispatch.

> **Note:** ai-dlc-bootstrap runs Build and Test per-unit during `/aidlc-unit-construct` (stage 13, hard-block on test failure). AI-DLC's vanilla rules describe Build and Test at project level (after all units complete) — that conceptual stage is currently deferred to a future phase. The unit-execution-plan above MAY say "Build and Test runs at the project level"; you can approve it as-is — bootstrap will run per-unit Build and Test during construction.

### Gate loop

**If unit state file is ABSENT (first dispatch):**

Dispatch `aidlc-coder` via Task:
```
Task(subagent_type="aidlc-coder", prompt=<assembled input>)
```
Input fields: `scope=unit`, `unit_id=<unit-id from $ARGUMENTS>`, `current_stage=code-generation`, `resume={kind: null, gate_id: null, details: null}`, `last_envelope=null`.

Write the initial state file to `${UNIT_PATH}/.ai-dlc-bootstrap/construction/orchestrator-state.json`. Include all of: `scope="unit"`, `unit_id`, `unit_path`, `current_cluster="aidlc-coder"`, `current_stage="code-generation"`, `last_envelope=null`, `started_at=<ISO timestamp now>`, `last_updated=<same ISO timestamp>`. The `started_at` value is the stable anchor for D-48 redesign rewinds and metrics; once written it MUST NOT change.

If a state file already exists from `/aidlc-unit-design` (chained design→construct), READ it first to inherit `started_at`, then update fields for the construct phase (do not regenerate `started_at`).

**If unit state file is PRESENT (resume):**

Read `${UNIT_PATH}/.ai-dlc-bootstrap/construction/orchestrator-state.json`.

Derive resume signal from the user's most recent message using the skill's resume vocabulary table. If unrecognized: surface help message and HALT.

Dispatch the cluster agent named by `state.current_cluster` via Task with assembled input.

**After every dispatch:**

1. Extract the envelope from the agent's return (per skill's envelope-extraction section).
2. Update state file: set `current_cluster`, `current_stage`, `last_envelope`, `last_updated`. PRESERVE existing `started_at` verbatim — never overwrite. If the file pre-dates the started_at contract and the field is absent, backfill from existing `last_updated` (one-time migration; subsequent updates preserve as normal).
3. Branch on `envelope.status`:

   **STAGE_COMPLETE (single-cluster — only TWO sub-cases, no inter-cluster advance):**
   - If `envelope.next_stage` is set (stage 12 completed with `next_stage="build-and-test"`): re-dispatch SAME cluster with `current_stage=envelope.next_stage, resume.kind=null`. Continue looping.
   - If `envelope.next_stage` is null (stage 13 build-and-test approved): clear the state file. Announce verbatim: "Unit construction complete for [unit-id]: stages 12-13 done. Phase 5 will handle unit sync and release." HALT.

   **AWAITING_BUILD_TEST:**
   The cluster generated build-and-test artifacts (including `run-build-and-test.sh`) and is waiting for the orchestrator to execute them. Use the Bash tool to run the helper piped through assert-marker:

   `node .ai-dlc-bootstrap/scaffold/scaffold.js run-build-and-test ${UNIT_PATH} | node .ai-dlc-bootstrap/scaffold/scaffold.js assert-marker BT_OK`

   The helper writes `${UNIT_PATH}/aidlc-docs/construction/build-and-test/last-run.log` (single overwrite file) on every run; full stdout/stderr stream live to the engineer via assert-marker's stdin→stdout forwarder.

   - If the Bash tool reports non-zero exit (BT_FAIL): the helper's `BT_FAIL <tail>` line is already on screen. HALT this turn. Surface verbatim: "Build and test failed for [unit-id]. Fix the failing tests or unit code, then re-run /aidlc-unit-construct [unit-id]." (D-125 hard-block — the approval gate is NEVER offered on BT failure.)
   - If the Bash tool reports zero exit (BT_OK): update the state file — set `last_envelope` to reflect that BT was confirmed (e.g. set `last_envelope.status` to `null` or remove the field, refresh `last_updated`). PRESERVE `started_at` verbatim. Then re-dispatch the SAME cluster:

     ```
     Task(subagent_type="aidlc-coder", prompt=<assembled input with current_stage="build-and-test", resume={kind: "bt_ok", gate_id: null, details: "BT green"}, last_envelope=<the updated last_envelope>>)
     ```

     Continue the gate loop. The next envelope will be `GATE_APPROVAL gate_id="approval"` (per Plan 01 aidlc-coder stage-13 `bt_ok` CASE).

   Note (D-128): BT always re-runs on every `/aidlc-unit-construct` invocation while `current_stage="build-and-test"`. Nothing about a green BT result is persisted; only the cleared `AWAITING_BUILD_TEST` envelope status. AUTH-04: this helper invocation is orchestrator-side; the `aidlc-coder` agent must NEVER call `run-build-and-test` from its Bash tool (D-134).

   **GATE_QUESTIONS or GATE_APPROVAL:**
   Surface `envelope.message` verbatim. HALT this turn. User re-runs `/aidlc-unit-construct [unit-id]`.

   **ERROR:**
   Surface `envelope.message` verbatim. HALT.

### Notes

- Phase 4 only operates on the current unit branch and never modifies other branches (D-33).
- The unit state file lives inside `${UNIT_PATH}/` ensuring no two unit branches ever share a state path.
- Stage 13 (build-and-test) artifacts are written under `<unit-path>/aidlc-docs/construction/build-and-test/` (D-59 lock — NO `{unit-name}/` segment between `construction/` and `build-and-test/`). The cluster agent enforces this path.
