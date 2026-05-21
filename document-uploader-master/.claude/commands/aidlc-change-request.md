---
description: Route a change request inline / redesign / escalate. Writes a 1-question routing file with AI recommendation; engineer confirms. Inline re-enters active cluster; redesign redirects to /aidlc-unit-redesign; escalate writes ESCALATION and clears state.
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(AIDLC_ARGS=* node:*), Bash(git add:*), Bash(git commit:*), Bash(rm:*), AskUserQuestion, Read, Write, Edit, Task, Agent
argument-hint: <description>
---

# /aidlc-change-request [description]

## Pre-flight

```!
AIDLC_ARGS="$ARGUMENTS" node .ai-dlc-bootstrap/scaffold/scaffold.js preflight-change-request
```

If non-zero exit, halt verbatim. Otherwise stdout has `PREFLIGHT_OK <unitPath> <unitId>`; bind both. `UNIT_ID` was derived inside the helper from the current branch (D-41); the helper has already verified Q6 fallback (state file exists).

## Execution

Read `.claude/skills/aidlc-cluster-agent-pattern/SKILL.md` for the orchestrator-side contract (resume state machine, envelope extraction, state-file paths, gate_id naming).

This command implements **two-phase orchestrator behavior**:

- **Phase A** (no answered question file yet): generate scope-assessment narrative and write a 1-question 3-option routing file; HALT.
- **Phase B** (engineer answered): parse answer letter and route. **A=Inline** dispatches `Task(subagent_type=state.current_cluster)` with `resume.kind="request_changes"` (D-54). **B=Redesign** emits a redirect message and does NOT modify state and does NOT auto-invoke `/aidlc-unit-redesign` (D-55). **C=Escalate** runs the 5-step degraded form (D-56).

State file: `${UNIT_PATH}/.ai-dlc-bootstrap/construction/orchestrator-state.json`

Phase detection: list `<unit-path>/aidlc-docs/construction/change-requests/change-request-*-questions.md`. If any exists, find LATEST (highest N). Check if `[Answer]:` tag has a non-empty letter. Yes → Phase B. No (or no file) → Phase A.

Resume vocabulary applies only to the Inline path's continuation gate-loop turn. See skill for resume vocabulary table.

### Phase A — first invocation (no answered question file yet)

1. Read state file → identify `state.current_cluster`, `state.current_stage`, `state.last_envelope.artifact_path`.
2. Read most-recently-produced stage doc at `state.last_envelope.artifact_path`.
3. Generate scope-assessment narrative (3-10 lines) categorizing `<description>` against three patterns: Inline / Redesign / Escalate.
4. Compute next N; mkdir change-requests/ if needed.
5. Write 1-question routing file at `<unit-path>/aidlc-docs/construction/change-requests/change-request-N-questions.md` (3 options; AskUserQuestion auto-injects an "Other" free-text fallback at runtime per RESEARCH State of the Art — no manually-authored fourth-letter "Other" entry needed); single-letter `[Answer]:` tag:

   ```markdown
   # Change Request — Routing — [unit-id]
   ...A) Inline, B) Redesign, C) Escalate...
   ```

6. Invoke the **AskUserQuestion** tool to present the routing question as a structured gate (eliminates classifier false positives — RESEARCH §Pattern 3). Schema:

   ```jsonc
   {
     "questions": [{
       "question": "How should this change be handled?",
       "header": "CR route",
       "multiSelect": false,
       "options": [
         { "label": "Inline",   "description": "Change fits within current stage; re-dispatch active cluster agent with request_changes." },
         { "label": "Redesign", "description": "Change affects multiple design stages; redirect to /aidlc-unit-redesign." },
         { "label": "Escalate", "description": "Change requires inception-level fix on main first." }
       ]
     }]
   }
   ```

   When AskUserQuestion returns: map label → letter — `Inline` → A, `Redesign` → B, `Escalate` → C. If the engineer chose the auto-injected "Other", treat as Letter D (the existing Letter D handler in Phase B surfaces the re-classify help).

7. **Mirror the engineer's choice back into the question file (D-66 — Pitfall 1).** Use Edit to replace `[Answer]:` with `[Answer]: <letter>` in `<unit-path>/aidlc-docs/construction/change-requests/change-request-N-questions.md`.

   **Description persistence (Universal Description-Arg Persistence Convention — see `assets/scripts/lib/persisted-arg.js`).** The Pre-flight bash injection block already invoked `node .ai-dlc-bootstrap/scaffold/scaffold.js preflight-change-request "$ARGUMENTS"`, which (Plan 05.3-07) authored the change-request-N-questions.md AND persisted `$ARGUMENTS` into its YAML frontmatter via `writePersistedArg`. The orchestrator's Edit above simply mirrors the chosen `[Answer]:` letter on top of that file. The discrete subcommand `change-request-persist-description` is also exposed in `dispatch.js` for orchestrator flows that need to re-persist a corrected description on a later turn — but the default Phase A path does not require a separate invocation.

8. HALT (engineer re-runs `/aidlc-change-request` to enter Phase B — description is OPTIONAL on re-invocation; the persisted value will be recovered from the question-file frontmatter via the Universal Convention through `readPersistedArg`. Engineer can override by retyping a new description).

   **Fallback (Claude Code <v2.0.21):** If AskUserQuestion is unavailable, surface the prose recommendation: "I've created `<path>` with the route question. My recommendation: `<route>`. Please fill in `[Answer]:` and re-run `/aidlc-change-request '<description>'` when complete." This preserves the Phase 4 resume contract.

**D-73 description persistence:** The helper persists `<description>` into the question file's YAML frontmatter when it's written. On Phase B re-invocation (after `/clear`), if `$ARGUMENTS` is empty, the helper reads the description back from frontmatter — the engineer does not need to re-type it.

### Phase B — engineer answered (subsequent invocation)

8. Parse answer letter using regex `^\[Answer\]:\s*([A-D])\b`.

**Description resolution (D-73):** Use `<description>` from `$ARGUMENTS` if non-empty. Otherwise the helper has already resolved the description from question-file frontmatter; the audit-log entry MUST record whichever description was finally used.

9. Branch on letter:

   **Route A (Inline) per D-54:**
   - Read state file → identify `state.current_cluster`, `state.current_stage`, `state.last_envelope.gate_id`.
   - **Append `## Change Request — Inline` audit entry** to `<unit-path>/aidlc-docs/audit.md` (APPEND only — T-04-04): includes Timestamp, Description, Affected stage, Active gate, Question file.
   - Commit the audit append (path-scoped per T-04-03; commit BEFORE dispatch per Pitfall 2):
     ```bash
     git add "${UNIT_PATH}/aidlc-docs/audit.md"
     git commit -m "cr(${UNIT_ID}): inline change request"
     ```
   - Dispatch via Task: `Task(subagent_type="<state.current_cluster>", prompt=<assembled input>)` with `resume={kind: "request_changes", details: "<description>", gate_id: state.last_envelope.gate_id}`.
   - Update state file with new envelope; surface `envelope.message` verbatim per standard gate loop.

   **Route A — Post-Construction variant (D-74) per stdout payload `POST_CONSTRUCTION <gate>`:**
   - When the helper's PREFLIGHT_OK line includes `POST_CONSTRUCTION <gate>` (state files absent; gate derived from audit.md `## Approved` heading), the Inline route still runs but uses the derived gate instead of `state.last_envelope.gate_id`.
   - Append `## Change Request — Inline (Post-Construction)` audit entry to `<unit-path>/aidlc-docs/audit.md` (APPEND only; new heading distinguishes from in-progress Inline). Includes Timestamp, Description, Derived gate, Question file.
   - Commit the audit append (path-scoped per T-04-03; commit BEFORE dispatch per Pitfall 2):
     ```bash
     git add "${UNIT_PATH}/aidlc-docs/audit.md"
     git commit -m "cr(${UNIT_ID}): inline change request (post-construction)"
     ```
   - Dispatch via Task with `resume={kind: "request_changes", details: <description>, gate_id: <derived gate>}`.

   **Route B (Redesign) per D-55 (pure redirect, no Task dispatch, no state modification):**
   - **Append `## Change Request — Redesign` audit entry** to `<unit-path>/aidlc-docs/audit.md` (APPEND only — T-04-04): includes Timestamp, Description, Suggested command, Question file.
   - Commit the audit append (path-scoped per T-04-03):
     ```bash
     git add "${UNIT_PATH}/aidlc-docs/audit.md"
     git commit -m "cr(${UNIT_ID}): redesign redirect"
     ```
   - Surface verbatim: "This change affects multiple design stages. Run `/aidlc-unit-redesign [unit-id] '[description]'` to fix. The redesign command will write a stage-selection question file and rewind the state file accordingly."
   - DO NOT modify the state file. DO NOT auto-invoke `/aidlc-unit-redesign` (Pitfall 4 mitigation).
   - HALT.

   **Route C (Escalate) per D-56 + D-67 (degraded form; helper writes the marker atomically):**

   - Step 1 — wip pre-escalate commit (unit-path-scoped per T-04-03):
     ```bash
     git add -A "${UNIT_PATH}/"
     git commit -m "wip(${UNIT_ID}): save state before escalation"
     ```
   - Step 2 — invoke the escalate-aware helper subcommand. The helper re-runs the full preflight chain THEN writes the escalation marker (D-67) atomically — marker is only written when preflight succeeds:
     ```!
     AIDLC_ARGS="$ARGUMENTS" node .ai-dlc-bootstrap/scaffold/scaffold.js preflight-change-request-escalate
     ```
     Stdout includes `ESCALATION_MARKER_WRITTEN <markerPath>` on success. Bind MARKER_PATH from that line.
   - Step 3 — append `## ESCALATION` block to `${UNIT_PATH}/aidlc-docs/audit.md` (APPEND only — T-04-04): includes Timestamp, Unit, Blocked Stage, Issue, Impact, Suggested Fix, Question file, Marker path.
   - Step 4 — clear orchestrator state, stage everything path-scoped, commit (Plan 05.3-08 Gap 11b: the prior split between Step 4's audit-only commit and Step 5's untracked `rm -f` left a dirty working tree on the unit branch — the deletion was never recorded in git, so subsequent `/aidlc-unit-sync` saw the file present on api but absent on main and produced confusing diffs. Fix: clear the state file FIRST, then `git add -A` the unit-path so both the audit append AND the orchestrator-state deletion land in one atomic escalate commit):
     ```bash
     SHORT_ISSUE="$(echo "${DESCRIPTION}" | head -c 60 | tr -d '\n')"
     rm -f "${UNIT_PATH}/.ai-dlc-bootstrap/construction/orchestrator-state.json"
     git add -A "${UNIT_PATH}/"
     git commit -m "escalate(${UNIT_ID}): ${SHORT_ISSUE}"
     ```
     Using `git add -A "${UNIT_PATH}/"` (path-scoped — NOT bare `-A`) is mandatory: it preserves T-04-03 (no repo-wide staging) while still capturing both the audit modification and the orchestrator-state deletion. `git commit -am` is FORBIDDEN — it would not capture the deletion of a tracked file via `rm`.
   - Step 5 — surface terminal message verbatim: "Escalated. Marker written at `<MARKER_PATH>`. Switch to `main` and run `/aidlc-escalate-fix <unit-id> \"<description>\"`. Then switch back to this branch and run `/aidlc-unit-sync [unit-id]` — sync will detect the matching commit and route propagation through the standard 4-route question file."
   - HALT.

   **Letter D (Other):** re-classify. Surface help naming three valid routes; remind engineer to re-run with A, B, or C. HALT.

### Notes

- BOTH escalate-path commits are scoped to `<unit-path>/` per T-04-03. The wip(${UNIT_ID}) commit (Step 1) uses `git add -A "${UNIT_PATH}/"`; the escalate(${UNIT_ID}) commit (Step 4) uses `git add -A "${UNIT_PATH}/"` to capture both audit append AND orchestrator-state deletion atomically (Plan 05.3-08 Gap 11b). Using bare `git commit -am` is FORBIDDEN on either step — it would re-stage tracked files repo-wide AND fail to capture explicit `rm` deletions.
- All audit-log writes (Inline / Redesign / Escalate) are APPEND-only (T-04-04). Per AI-DLC's CLAUDE.md: "ALWAYS append changes to EDIT audit.md file, NEVER use tools and commands that completely overwrite its contents."
- `<description>` is NEVER directly interpolated into a bash command; passed to Task prompts as JSON string field (T-04-02 mitigation).
- `UNIT_ID` is derived from the current branch name via the helper (D-41) — eliminating user-input vector for unit-id.
- No active orchestrator state for unit: If Q6 check fails inside the helper, it surfaces "No active orchestrator state for unit ${UNIT_ID}" and exits non-zero — pre-flight halts before any routing logic runs.
- All three routes write distinct audit-log entries — WORK-06 "chosen route is recorded for later audit review" satisfied.
