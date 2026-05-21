---
description: Run AI-DLC inception (stages 1-7) for the project on `main`. Walks the four cluster agents in sequence with strict per-stage gating (Shape A). Use only on the main branch with vision.md and tech-environment.md prepared.
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(AIDLC_ARGS=:*), Bash(AIDLC_ARGS=*), Read, Write, Edit, Task, Agent
---

# /aidlc-project-inception

## Pre-flight

```!
AIDLC_ARGS="$ARGUMENTS" node .ai-dlc-bootstrap/scaffold/scaffold.js preflight-project-inception
```

If non-zero exit, halt verbatim. Otherwise stdout has two lines: `PREFLIGHT_OK` then `STATE_PRESENT` or `STATE_ABSENT`. Branch: if `STATE_ABSENT`, create a fresh inception state file. If `STATE_PRESENT`, resume per the skill's resume state machine.

## Execution

Read `.claude/skills/aidlc-cluster-agent-pattern/SKILL.md` for the orchestrator-side contract (resume state machine, envelope extraction, state-file paths, gate_id naming).

State file: `.ai-dlc-bootstrap/inception/project-orchestrator-state.json` (project root, on main)
Cluster sequence: `aidlc-requirements-analyst -> aidlc-story-writer -> aidlc-architect -> aidlc-planner`

### Gate loop

**If "State file" is ABSENT (first dispatch):**

Dispatch `aidlc-requirements-analyst` via Task:
```
Task(subagent_type="aidlc-requirements-analyst", prompt=<assembled input>)
```
Input fields: `scope=project`, `unit_id=null`, `current_stage=workspace-detection`, `resume={kind: null, gate_id: null, details: null}`, `last_envelope=null`.

Write the initial state file to `.ai-dlc-bootstrap/inception/project-orchestrator-state.json`.

**If "State file" is PRESENT (resume):**

Read `.ai-dlc-bootstrap/inception/project-orchestrator-state.json`.

Derive resume signal from the user's most recent message using the skill's resume vocabulary table. If unrecognized: surface help message and HALT.

Dispatch the cluster agent named by `state.current_cluster` via Task with assembled input.

**After every dispatch:**

1. Extract the envelope from the agent's return (per skill's envelope-extraction section).
2. Update state file: set `current_cluster`, `current_stage`, `last_envelope`, `last_updated`.
3. Branch on `envelope.status`:

   **STAGE_COMPLETE:**
   - If `envelope.next_stage` is set: re-dispatch same cluster with `current_stage=envelope.next_stage, resume.kind=null`. Continue looping.
   - If `envelope.next_stage` is null AND `current_cluster` is not `aidlc-planner`: advance to next cluster in the chain and dispatch its first stage. Continue looping.
   - If `envelope.next_stage` is null AND `current_cluster` is `aidlc-planner`: clear the state file. Announce: "Project inception complete: stages 1-7 done. Unit descriptions written to aidlc-docs/inception/units/." HALT.

   **GATE_QUESTIONS or GATE_APPROVAL:**
   Surface `envelope.message` verbatim. HALT this turn. User re-runs `/aidlc-project-inception`.

   **ERROR:**
   Surface `envelope.message` verbatim. HALT.

### Notes

- The state file lives at `.ai-dlc-bootstrap/inception/project-orchestrator-state.json` — bootstrap-namespaced runtime state, not an AI-DLC output (D-30).
