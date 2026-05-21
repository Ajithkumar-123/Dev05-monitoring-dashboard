---
description: Run AI-DLC inception (stages 1-7) for unit [unit-id] on its dedicated branch. Performs branch + directory scaffolding (D-32), then walks the four cluster agents with scope=unit. Skips units-generation in architect (D-28). Use on a unit branch only.
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(AIDLC_ARGS=* node:*), Read, Write, Edit, Task, Agent
argument-hint: <unit-id>
---

# /aidlc-unit-inception [unit-id]

## Pre-flight

```!
AIDLC_ARGS="$ARGUMENTS" node .ai-dlc-bootstrap/scaffold/scaffold.js preflight-unit-inception && AIDLC_ARGS="$ARGUMENTS" node .ai-dlc-bootstrap/scaffold/scaffold.js scaffold-unit-inception
```

If non-zero exit, halt and surface stderr verbatim. Otherwise stdout has two lines: `PREFLIGHT_OK <unitPath>` then `SCAFFOLD_OK <unitPath>`. Bind `UNIT_PATH` from the second line.

## Execution

Read `.claude/skills/aidlc-cluster-agent-pattern/SKILL.md` for the orchestrator-side contract (resume state machine, envelope extraction, state-file paths, gate_id naming).

State file: `${UNIT_PATH}/.ai-dlc-bootstrap/inception/orchestrator-state.json`
Cluster sequence: `aidlc-requirements-analyst -> aidlc-story-writer -> aidlc-architect -> aidlc-planner`

Note: `aidlc-architect` is dispatched with `scope=unit`, which causes it to skip `units-generation` internally (D-28). The orchestrator does NOT need to special-case this.

> **Note:** ai-dlc-bootstrap runs Build and Test per-unit during `/aidlc-unit-construct` (stage 13, hard-block on test failure). AI-DLC's vanilla rules describe Build and Test at project level (after all units complete) — that conceptual stage is currently deferred to a future phase. The unit-execution-plan above MAY say "Build and Test runs at the project level"; you can approve it as-is — bootstrap will run per-unit Build and Test during construction.

### Gate loop

**If unit state file is ABSENT (first dispatch):**

Dispatch `aidlc-requirements-analyst` via Task:
```
Task(subagent_type="aidlc-requirements-analyst", prompt=<assembled input>)
```
Input fields: `scope=unit`, `unit_id=<unit-id from $ARGUMENTS>`, `current_stage=workspace-detection`, `resume={kind: null, gate_id: null, details: null}`, `last_envelope=null`.

Write the initial state file to `${UNIT_PATH}/.ai-dlc-bootstrap/inception/orchestrator-state.json`.

**If unit state file is PRESENT (resume):**

Read `${UNIT_PATH}/.ai-dlc-bootstrap/inception/orchestrator-state.json`.

Derive resume signal from the user's most recent message using the skill's resume vocabulary table. If unrecognized: surface help message and HALT.

Dispatch the cluster agent named by `state.current_cluster` via Task with assembled input.

**After every dispatch:**

1. Extract the envelope from the agent's return (per skill's envelope-extraction section).
2. Update state file: set `current_cluster`, `current_stage`, `last_envelope`, `last_updated`.
3. Branch on `envelope.status`:

   **STAGE_COMPLETE:**
   - If `envelope.next_stage` is set: re-dispatch same cluster with `current_stage=envelope.next_stage, resume.kind=null`. Continue looping.
   - If `envelope.next_stage` is null AND `current_cluster` is not `aidlc-planner`: advance to next cluster in the chain and dispatch its first stage. Continue looping.
   - If `envelope.next_stage` is null AND `current_cluster` is `aidlc-planner`: clear the state file. Announce: "Unit inception complete for [unit-id]: stages 1-7 done. Unit's design and construction can proceed (Phase 4+)." HALT.

   **GATE_QUESTIONS or GATE_APPROVAL:**
   Surface `envelope.message` verbatim. HALT this turn. User re-runs `/aidlc-unit-inception [unit-id]`.

   **ERROR:**
   Surface `envelope.message` verbatim. HALT.

### Notes

- Phase 3 only operates on the current branch and never modifies other branches (D-33).
- The unit state file lives inside `${UNIT_PATH}/` ensuring no two unit branches ever share a state path.
