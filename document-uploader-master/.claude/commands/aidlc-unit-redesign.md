---
description: Engineer-nominated targeted redesign during construction. Writes a 4-question stage-selection file; on answer, rewinds state to the earliest selected stage and auto-continues into code regeneration. Use on a unit branch only.
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(AIDLC_ARGS=* node:*), Bash(git add:*), Bash(git commit:*), AskUserQuestion, Read, Write, Edit, Task, Agent
argument-hint: <unit-id> <description>
---

# /aidlc-unit-redesign [unit-id] [description]

## Pre-flight

```!
AIDLC_ARGS="$ARGUMENTS" node .ai-dlc-bootstrap/scaffold/scaffold.js preflight-unit-redesign
```

If non-zero exit, halt verbatim. Otherwise stdout has `PREFLIGHT_OK <unitPath>`; bind `UNIT_PATH`. The helper has already verified D-51 (state file exists, `current_cluster=aidlc-coder`).

## Execution

Read `.claude/skills/aidlc-cluster-agent-pattern/SKILL.md` for the orchestrator-side contract (resume state machine, envelope extraction, state-file paths, gate_id naming).

This command implements **two-phase orchestrator behavior**:

- **Phase A** (no answered question file yet): write a 4-question stage-selection file at `<unit-path>/aidlc-docs/construction/redesign/redesign-N-questions.md` and HALT. The engineer fills `[Answer]:` tags and re-runs the command.
- **Phase B** (engineer answered): parse answers → compute `selected_stages` → derive `rewind_target_stage` (earliest selected) and `rewind_target_cluster` → **D-48 state-file rewind** preserving `started_at` → append `## Redesign Triggered` audit entry → enter the gate loop dispatching the rewind target → on last-selected-stage approval, **D-50 auto-continue** into `aidlc-coder`.

State file: `${UNIT_PATH}/.ai-dlc-bootstrap/construction/orchestrator-state.json`

Phase detection: list `<unit-path>/aidlc-docs/construction/redesign/redesign-*-questions.md` files. If any file exists, find the LATEST (highest N). Read it; check whether ALL FOUR `[Answer]:` tags have a non-empty letter. Yes → Phase B. No (or no file) → Phase A.

Resume vocabulary applies only to Phase B's gate-loop continuation turns. See skill for resume vocabulary table.

### Phase A — first invocation (no answered question file yet)

1. Read existing design artifacts at `<unit-path>/aidlc-docs/construction/<unit-id>/` (four design-stage subdirectories).
2. Generate scope-assessment narrative (3-10 lines) from `<description>` plus artifact reading. Recommend specific stages.
3. Compute next N; mkdir redesign/ if needed.
4. Write the 4-question file at `<unit-path>/aidlc-docs/construction/redesign/redesign-N-questions.md` (Yes/No per stage; AskUserQuestion auto-injects an "Other" free-text fallback at runtime — no manually-authored third-letter "Other" per question needed); `[Answer]:` tag for single letter per question:

   ```markdown
   # Redesign Stage Selection — [unit-id]
   ...Q1 Functional Design, Q2 NFR Requirements, Q3 NFR Design, Q4 Infrastructure Design...
   ```

5. Invoke the **AskUserQuestion** tool with FOUR questions in a SINGLE call (one per stage; AskUserQuestion supports up to 4 questions per invocation per RESEARCH §Pattern 3). Schema:

   ```jsonc
   {
     "questions": [
       { "question": "Re-run Functional Design?",     "header": "Q1", "multiSelect": false,
         "options": [ { "label": "Yes" }, { "label": "No" } ] },
       { "question": "Re-run NFR Requirements?",      "header": "Q2", "multiSelect": false,
         "options": [ { "label": "Yes" }, { "label": "No" } ] },
       { "question": "Re-run NFR Design?",            "header": "Q3", "multiSelect": false,
         "options": [ { "label": "Yes" }, { "label": "No" } ] },
       { "question": "Re-run Infrastructure Design?", "header": "Q4", "multiSelect": false,
         "options": [ { "label": "Yes" }, { "label": "No" } ] }
     ]
   }
   ```

   For each of the 4 returned answers, map label → letter: `Yes` → A, `No` → B. Auto-injected "Other" maps to `[Answer]: ` (empty) — Phase B's `selected_stages` derivation at line 54 already treats absence/non-A as "not selected".

6. **Mirror the engineer's 4 choices back into the question file (D-66 — Pitfall 1).** Use Edit to replace each of the 4 `[Answer]:` lines with `[Answer]: <letter>` in `<unit-path>/aidlc-docs/construction/redesign/redesign-N-questions.md`. The file remains the source of truth; AskUserQuestion is the runtime UX layer.

   **Description persistence (Universal Description-Arg Persistence Convention — see `assets/scripts/lib/persisted-arg.js`).** The Pre-flight bash injection block already invoked `node .ai-dlc-bootstrap/scaffold/scaffold.js preflight-unit-redesign "$ARGUMENTS"`, which (Plan 05.3-07) authored the redesign-N-questions.md AND persisted `$ARGUMENTS` into its YAML frontmatter via `writePersistedArg`. The orchestrator's Edit above mirrors the engineer's 4 chosen letters on top of that file. The discrete subcommand `unit-redesign-persist-description` is exposed in `dispatch.js` for orchestrator flows that need to re-persist a corrected description; the default Phase A path does not require a separate invocation.

7. HALT (engineer re-runs `/aidlc-unit-redesign [unit-id]` to enter Phase B — description is OPTIONAL on re-invocation; the persisted value will be recovered from the question-file frontmatter via the Universal Convention through `readPersistedArg`. Engineer can override by retyping a new description. Phase B parses each `[Answer]:` letter and computes `selected_stages`).

   **Fallback (Claude Code <v2.0.21):** If AskUserQuestion is unavailable, surface the prose recommendation: "I've created `<path>` with 4 stage-selection questions. My recommendation: [stages]. Please fill in `[Answer]:` tags and re-run `/aidlc-unit-redesign [unit-id] '[description]'` when complete." Phase 4's resume contract is preserved (file is still authoritative).

**D-73 description persistence:** The helper persists `<description>` into the redesign-N-questions.md YAML frontmatter when Phase A writes the file. On Phase B re-invocation with empty `$ARGUMENTS`, the helper reads the description back from frontmatter via `redesignDescriptionFallback`. Legacy Phase 4 question files without frontmatter remain tolerated as long as `$ARGUMENTS` is non-empty on Phase B.

### Phase B — engineer answered (subsequent invocation)

7. Parse answers using regex `^\[Answer\]:\s*([A-C])\b`. Build `selected_stages` list (Q1=A → `functional-design`, Q2=A → `nfr-requirements`, Q3=A → `nfr-design`, Q4=A → `infrastructure-design`; B/C → not selected).

8. If `selected_stages` is empty: exit "No stages selected — nothing to redesign. If the issue is unclear, run `/aidlc-change-request '<description>'` for routing help." HALT.

9. Determine `rewind_target_stage` = earliest selected in stage order: `functional-design` < `nfr-requirements` < `nfr-design` < `infrastructure-design`.

10. Determine `rewind_target_cluster`: `aidlc-functional-designer` if `functional-design` in `selected_stages`; otherwise `aidlc-systems-designer`.

11. **D-48 state-file rewind.** Read existing state file. Extract `started_at` (MUST be preserved — D-48 invariant). If `started_at` is absent (state file pre-dates the started_at contract from G-04-06), backfill from existing `last_updated` and proceed — the backfilled value is then preserved on all subsequent rewinds. Overwrite with rewind state (same `started_at`, `current_cluster=rewind_target_cluster`, `current_stage=rewind_target_stage`, `last_envelope=null`, `last_updated=now`).

12. **Append `## Redesign Triggered` audit entry** to `<unit-path>/aidlc-docs/audit.md` (APPEND only — T-04-04). Block includes: Timestamp, Description, Selected stages, Rewind target, Question file.

13. **Commit the audit append** (path-scoped per T-04-03; commit BEFORE the gate loop dispatch per Pitfall 2 — durable record of the redesign trigger before any cluster work):
    ```bash
    git add "${UNIT_PATH}/aidlc-docs/audit.md"
    git commit -m "redesign(${UNIT_ID}): triggered"
    ```

14. Enter the gate loop. Dispatch `<rewind_target_cluster>` via Task with `current_stage=rewind_target_stage, resume.kind=null`.

**After every dispatch:**

1. Extract the envelope (per skill's envelope-extraction section).
2. Update state file.
3. Branch on `envelope.status`:

   **STAGE_COMPLETE — selected-stage filtering (Pitfall 6 mitigation):**
   - If `envelope.next_stage` is set AND is in `selected_stages`: re-dispatch SAME cluster. Continue looping.
   - If `envelope.next_stage` is set AND NOT in `selected_stages`: skip it; advance to next selected stage (crossing cluster boundary if needed). Continue looping.
   - If `envelope.next_stage` is null AND more selected stages remain: advance to next selected stage. Continue looping.
   - If `envelope.next_stage` is null AND no more selected stages remain: trigger D-50 auto-continue.

   **D-50 auto-continue:** Overwrite state with `current_cluster="aidlc-coder"`, `current_stage="code-generation"`, preserving `started_at`. Dispatch `aidlc-coder` directly. Continue gate loop through stages 12-13. On final STAGE_COMPLETE: clear state file. Announce: "Unit redesign complete for [unit-id]: re-ran [selected_stages] + regenerated code (stages 12-13). Phase 5 will handle unit sync and release." HALT.

   **GATE_QUESTIONS or GATE_APPROVAL:**
   Surface `envelope.message` verbatim. HALT. User re-runs `/aidlc-unit-redesign [unit-id]` to continue the redesign gate loop. Description is NOT required on continuation runs (the audit entry was already written in step 12); passing it again is harmless but unused.

   **ERROR:** Surface `envelope.message` verbatim. HALT.

### Notes

- `selected_stages` is held in orchestrator memory across dispatches within the same turn. Derived from the latest `redesign-N-questions.md` at the top of Phase B; not re-derived during the loop.
- D-50: redesign is a SINGLE end-to-end flow. The orchestrator dispatches `aidlc-coder` directly — does NOT auto-invoke `/aidlc-unit-construct`.
- Audit-log writes are APPEND-only (T-04-04). Per AI-DLC's CLAUDE.md: "ALWAYS append changes to EDIT audit.md file, NEVER use tools and commands that completely overwrite its contents."
- `started_at` is preserved across the D-48 rewind. `last_updated` is refreshed on every state-file mutation.
- Phase 4 only operates on the current unit branch and never modifies other branches (D-33).
