---
description: Sync unit branch with main. Detects root inception changes since last sync; writes a 4-route question file (No-op/Inline/Redesign/Escalate). Engineer answers and re-runs. Use on a unit branch only.
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(AIDLC_ARGS=* node:*), Bash(git add:*), Bash(git commit:*), AskUserQuestion, Read, Write, Edit, Task, Agent
argument-hint: <unit-id>
---

# /aidlc-unit-sync [unit-id]

## Pre-flight

```!
AIDLC_ARGS="$ARGUMENTS" node .ai-dlc-bootstrap/scaffold/scaffold.js preflight-unit-sync | node .ai-dlc-bootstrap/scaffold/scaffold.js assert-marker '# MERGE_OK ,PREFLIGHT_OK '
```

If non-zero exit, halt verbatim. Otherwise stdout has `PREFLIGHT_OK <unitPath> <unitId>` (final non-comment line). Bind UNIT_PATH and UNIT_ID. The helper has already:

- Asserted unit branch (D-22)
- Run mid-merge guard (Pitfall 2)
- Scanned escalation markers (D-67) and emitted ESCALATION_PENDING / ESCALATION_RESOLVED diagnostic lines
- Run `git merge main` into the unit branch (D-64 — conflict-free per BRCH-02 invariant when D-60 is honored)

Read the diagnostic lines from stdout (lines starting with `# ESCALATION_`) to inform the assessment narrative below.

The bash block above already wrote the helper's stdout to the conversation. Output ONLY the engineer-actionable portion of that helper stdout — do NOT paraphrase, summarize, restructure, or re-format it. Do NOT ask follow-up questions or offer to proceed; the slash-command's contract is to HALT after the helper runs. If the engineer wants to see the full verbatim helper output, they press `Ctrl+O` (transcript viewer) then `Ctrl+E` (show all content).

HALT.

## Execution

Read `.claude/skills/aidlc-cluster-agent-pattern/SKILL.md` for the orchestrator-side contract (resume state machine, envelope extraction, state-file paths, gate_id naming). The Inline route below dispatches an existing Phase 4 cluster agent and reuses the resume vocabulary from the skill — single-source per AUTH-01.

This command implements **two-phase orchestrator behavior** (mirrors /aidlc-change-request):

- **Phase A** (no answered question file yet): generate scope-assessment narrative and write a 4-question routing file at `<unit-path>/aidlc-docs/construction/sync/sync-N-questions.md`; HALT.
- **Phase B** (engineer answered): parse answer letter and route. **A=No-op**, **B=Inline** (Task dispatch with `resume.kind=request_changes`), **C=Redesign** (verbatim redirect to /aidlc-unit-redesign), **D=Escalate** (degraded escalation per Phase 4 D-56 + writes a new escalation marker via the helper).

State file: `${UNIT_PATH}/.ai-dlc-bootstrap/construction/orchestrator-state.json` (Phase 4 carry-forward).

Phase detection: list `<unit-path>/aidlc-docs/construction/sync/sync-*-questions.md`. If any exists, find LATEST (highest N). Check if `[Answer]:` tag has a non-empty letter. Yes → Phase B. No (or no file) → Phase A.

### Phase A — first invocation (no answered question file yet)

1. Read state file at `${UNIT_PATH}/.ai-dlc-bootstrap/construction/orchestrator-state.json`. If absent, derive active-gate from `<unit-path>/aidlc-docs/audit.md` (D-74 fallback — same approach used by /aidlc-change-request post-construction).
2. Inspect main commits since the unit's merge-base via `git log --oneline $(git merge-base HEAD main)..main` (read-only). Synthesize a 3-10 line assessment narrative covering:
   - What changed on main since the unit branched (release commits + escalate-fix commits + project-inception updates).
   - Whether any of those changes affect THIS unit's scope (per the unit-of-work boundary in `aidlc-docs/inception/units/<unit-id>.md`).
   - Whether any pending escalation markers (from the helper diagnostic) require a fix on main first.
3. Compute next N (sequential per-unit). mkdir sync/ if needed.
4. Write the routing question file at `<unit-path>/aidlc-docs/construction/sync/sync-N-questions.md`. Format follows Phase 4 conventions (`common/question-format-guide.md`):

   ```markdown
   # Sync Routing — [unit-id]

   ## Assessment
   <assessment narrative from step 2>

   ## Routing Question
   How should this propagation be handled?

   A) No-op — main moved but no unit-affecting changes; record sync timestamp.
   B) Inline — change fits within current stage; dispatch active cluster agent with request_changes.
   C) Redesign — change affects multiple design stages; redirect to /aidlc-unit-redesign.
   D) Escalate — change requires inception-level fix on main first.

   [Answer]: 
   ```

5. Invoke the **AskUserQuestion** tool to surface the routing question as a structured gate (eliminates classifier false positives — see Phase 05.1 RESEARCH §Pattern 3). Use this schema:

   ```jsonc
   {
     "questions": [{
       "question": "How should this propagation be handled?",
       "header": "Sync route",
       "multiSelect": false,
       "options": [
         { "label": "No-op",    "description": "Main moved but no unit-affecting changes; record sync timestamp." },
         { "label": "Inline",   "description": "Change fits within current stage; dispatch active cluster agent with request_changes." },
         { "label": "Redesign", "description": "Change affects multiple design stages; redirect to /aidlc-unit-redesign." },
         { "label": "Escalate", "description": "Change requires inception-level fix on main first." }
       ]
     }]
   }
   ```

   When AskUserQuestion returns the engineer's selection, map label → letter:
   `No-op` → A, `Inline` → B, `Redesign` → C, `Escalate` → D.

6. **Mirror the engineer's choice back into the question file (D-66 source-of-truth invariant — Pitfall 1).** Use Edit to replace the line `[Answer]:` with `[Answer]: <letter>` in `<unit-path>/aidlc-docs/construction/sync/sync-N-questions.md`. The file remains the persistent artifact across `/clear`; AskUserQuestion is the runtime UX layer.

7. HALT (engineer re-runs `/aidlc-unit-sync [unit-id]` to enter Phase B; the answered file routes per the standard Phase B logic).

   **Fallback (Claude Code <v2.0.21):** If the AskUserQuestion tool is unavailable, surface the prose recommendation verbatim: "I have created `<sync-N-questions-path>` with the route question. My recommendation: `<route>` because `<one-line rationale>`. Please fill in `[Answer]:` and re-run `/aidlc-unit-sync [unit-id]` when complete." This preserves Phase 4's resume contract (the file is still authoritative).

### Phase B — engineer answered (subsequent invocation)

7. Parse the answer letter using regex `^\[Answer\]:\s*([A-D])\b`.

8. Branch on letter:

   **Route A (No-op):**
   - Append a one-line `## Sync — No-op` audit entry to `<unit-path>/aidlc-docs/audit.md` (APPEND only — T-04-04). Includes Timestamp, Question file. No state-file mutation. No cluster dispatch.
   - Commit the audit append (path-scoped per T-04-03):
     ```bash
     git add "${UNIT_PATH}/aidlc-docs/audit.md"
     git commit -m "sync(${UNIT_ID}): no-op"
     ```
   - HALT.

   **Route B (Inline) per D-54 (re-dispatch active cluster with request_changes):**
   - Read state file → identify `state.current_cluster`, `state.current_stage`, `state.last_envelope.gate_id`. If state file absent, use the D-74-derived gate from Pre-flight.
   - Synthesize a request_changes details string from main's diff since merge-base (e.g., "Propagate main updates: [list of release/escalate-fix commits]; align unit's stage artifacts").
   - Append `## Sync — Inline` audit entry to `<unit-path>/aidlc-docs/audit.md` (APPEND only — T-04-04). Includes Timestamp, Active cluster, Active stage, Synthesized details, Question file.
   - Commit the audit append (path-scoped per T-04-03; commit BEFORE dispatch per Pitfall 2 — orphaned audit entries are recoverable, but a dispatch that runs without a durable audit record is not):
     ```bash
     git add "${UNIT_PATH}/aidlc-docs/audit.md"
     git commit -m "sync(${UNIT_ID}): inline propagation"
     ```
   - Dispatch via Task: `Task(subagent_type=state.current_cluster, prompt=<assembled input>)` with `resume={kind: "request_changes", details: <synthesized details>, gate_id: <gate>}`.
   - Update state file with the new envelope; surface `envelope.message` verbatim per the standard gate loop.

   **Route C (Redesign) per D-55 (pure redirect; no Task dispatch; no state modification — Pitfall 4 mitigation):**
   - Append `## Sync — Redesign` audit entry to `<unit-path>/aidlc-docs/audit.md` (APPEND only — T-04-04). Includes Timestamp, Suggested command, Question file.
   - Commit the audit append (path-scoped per T-04-03):
     ```bash
     git add "${UNIT_PATH}/aidlc-docs/audit.md"
     git commit -m "sync(${UNIT_ID}): redesign redirect"
     ```
   - Surface verbatim: "This propagation affects multiple design stages. Run `/aidlc-unit-redesign [unit-id] '<assessment summary>'` to fix. The redesign command will write a stage-selection question file and rewind the state file accordingly."
   - DO NOT modify state file. DO NOT auto-invoke another slash-command.
   - HALT.

   **Route D (Escalate) per D-56 + D-67 (degraded form, marker via helper):**
   - Invoke the escalate-aware helper subcommand: `node .ai-dlc-bootstrap/scaffold/scaffold.js preflight-change-request-escalate "$ARGS"`. Helper writes the escalation marker atomically (only on preflight success).
   - Append `## ESCALATION` block to `${UNIT_PATH}/aidlc-docs/audit.md` (APPEND only — T-04-04). Block includes Timestamp, Unit, Question file path, Suggested Fix, Marker path.
   - Commit the audit append (path-scoped per T-04-03):
     ```bash
     git add "${UNIT_PATH}/aidlc-docs/audit.md"
     git commit -m "sync(${UNIT_ID}): escalate"
     ```
   - Surface to engineer: "Escalated. A marker was written at `<unit-path>/.ai-dlc-bootstrap/escalations/escalation-N.json`. Switch to main and run `/aidlc-escalate-fix <unit-id> \"<description>\"`. Then switch back and re-run `/aidlc-unit-sync [unit-id]` — the sync helper will detect the matching commit and route propagation."
   - HALT.

### Notes

- All audit-log writes (No-op / Inline / Redesign / Escalate) are APPEND-only (T-04-04) per AI-DLC `CLAUDE.md`: "ALWAYS append changes to EDIT audit.md file, NEVER use tools and commands that completely overwrite its contents."
- Redesign route is a verbatim REDIRECT message — it MUST NOT auto-invoke `/aidlc-unit-redesign` (Pitfall 4). The engineer runs the redirect command themselves; the redesign command rewinds state independently.
- After sync completes, the unit branch tree may contain files from recently released units (e.g., `units/<other>/` directories from a beta release). This is expected — the eventual `/aidlc-unit-release` squash diff against main excludes those paths, so they do not ship as part of this unit's release commit (Pitfall 5 documented behavior).
- Phase 5 introduces NO new cluster agents. The Inline route dispatches existing Phase 3/4 cluster agents (aidlc-coder for stage 13; aidlc-functional-designer / aidlc-systems-designer for active design stages). The Pattern B Read-on-demand contract is preserved.
- BRCH-01 is satisfied STRUCTURALLY (D-60): unit branches never write to root paths, so `git merge main` (D-64) into the unit branch is conflict-free across realistic concurrent scenarios (BRCH-02 — empirically validated by the helper's vitest suite).
