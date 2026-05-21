---
description: Close out an escalation marker on main. Writes a 3-question file (Phase A); re-run to parse answers and dispatch the inception cluster (Phase B). After cluster returns, run /aidlc-escalate-fix-finalize to stamp the commit. Use on main only.
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(AIDLC_ARGS=* node:*), Bash(git add:*), Bash(git commit:*), Read, Write, Edit, Task
argument-hint: <unit-id> ["<description>"]
---

# /aidlc-escalate-fix [unit-id] ["description"]

## Pre-flight + Phase B (single combined block — gap-closure 06-11 harness-incompat fix)

Note: Plan 06-11 (gap-closure 4 / harness-incompat) collapsed the prior multi-helper bash chain into a single-line pipe. Plan 05.3-08 Gap 6 closure intent (halt before escalate-fix on fresh question-file write) is preserved helper-side via `escalate-fix-orchestrate`.

```!
AIDLC_ARGS="$ARGUMENTS" node .ai-dlc-bootstrap/scaffold/scaffold.js escalate-fix-orchestrate | node .ai-dlc-bootstrap/scaffold/scaffold.js assert-marker 'PHASE_A_HALT_OK ,# PHASE_A_HALT ,DISPATCH_PAYLOAD '
```

The bash block above already wrote the helper's stdout to the conversation. Output ONLY the engineer-actionable portion of that helper stdout — do NOT paraphrase, summarize, restructure, or re-format it. Do NOT ask follow-up questions or offer to proceed; the slash-command's contract is to HALT after the helper runs. If the engineer wants to see the full verbatim helper output, they press `Ctrl+O` (transcript viewer) then `Ctrl+E` (show all content).

HALT.

If the block exited because preflight wrote a fresh question file (stdout contains `# QUESTION_FILE <path>` AND the bash chain halted before invoking `escalate-fix`) OR because `escalate-fix` itself emitted `# PHASE_A_HALT` (existing pending file with incomplete answers): the engineer must fill the file before any dispatch can happen. Substitute runtime values into the surface message before showing it.

1. Read the bash-block stdout. Extract the actual question-file path:
   - Prefer the line `# QUESTION_FILE <relative-path>` emitted by `preflight-escalate-fix` on a fresh write (e.g. `# QUESTION_FILE aidlc-docs/inception/escalate-fix-1-questions.md`).
   - Fall back to `# QUESTION_FILE_PENDING <relative-path>` if preflight surfaced an existing partially-filled file.
   - Last-resort fallback: if only `# PHASE_A_HALT <filename>:` is present, prefix with `aidlc-docs/inception/`.
2. Read `$ARGUMENTS`. The unit-id is the first whitespace-separated token (e.g. `api` from `/aidlc-escalate-fix api` or `/aidlc-escalate-fix api "fix oauth"`).
3. Surface to the engineer with the placeholders REPLACED by the values bound above (this is a CHECKPOINT — show it as a clearly-formatted block so the engineer notices it, not as inline text mixed with the bash output):

   ```
   ┌─ Phase A Complete — Manual Action Required ─────────────────┐
   │  Question file: <PATH>
   │  Fill the three [Answer]: tags (stage / mode / desc-override)
   │  Then re-run: /aidlc-escalate-fix <UNIT_ID>
   │
   │  Description recovery: any description you typed on the first
   │  invocation was persisted into the question-file frontmatter
   │  — you do NOT need to retype it on re-invocation.
   └──────────────────────────────────────────────────────────────┘
   ```

4. HALT — do not invoke any further tools.

Do NOT surface the literal placeholder strings `N`, `<PATH>`, or `<UNIT_ID>` — the engineer needs resolved values to act on the message.

If the block exited cleanly with `DISPATCH_PAYLOAD` markers, bind from stdout:

- `DISPATCH_MODE` — `in-place` or `full-restart`
- `DISPATCH_CLUSTER` — the subagent_type for Task()
- `DISPATCH_STAGE` — informational
- `DISPATCH_PAYLOAD` — single-line JSON; this is the `prompt` for Task()
- `FINALIZE_PATHS` — paths the engineer will pass to /aidlc-escalate-fix-finalize after Task returns

The helper has already (per Universal Convention — see `assets/scripts/lib/persisted-arg.js`):

- Asserted branch == main (D-87)
- Read the chosen marker from the unit branch via `git show` (D-92 — no branch switching, no marker write)
- Written `aidlc-docs/inception/escalate-fix-N-questions.md` (Phase A first run) OR detected a prior unanswered file (Phase A re-run)
- Persisted the engineer's $ARGUMENTS description into the question-file frontmatter via `writePersistedArg` (skipped if $ARGUMENTS is empty — falls back to marker.description)
- Parsed three `[Answer]:` tags from the latest `escalate-fix-N-questions.md` (Phase B)
- For full-restart mode (D-90): archived COMPLETED downstream artifacts as `<artifact>.backup.<iso-ts>`, reset `aidlc-docs/aidlc-state.md` rows to PENDING, cleared plan-file checkboxes
- Appended audit blocks to root `aidlc-docs/audit.md`

Now invoke the cluster:

`Task(subagent_type=DISPATCH_CLUSTER, prompt=DISPATCH_PAYLOAD)` — the cluster's `request_changes` branch (in-place) or fresh-start branch (full-restart) modifies the canonical inception artifact in place and returns its terminal envelope.

When the envelope reports `STAGE_COMPLETE` or `GATE_APPROVAL`, substitute runtime values and surface to the engineer as a clearly-formatted action gate (`<FINALIZE_PATHS>`, `<UNIT_ID>`, and `<DESCRIPTION>` resolved from stdout / `$ARGUMENTS` / the question-file frontmatter respectively):

```
┌─ Phase B Complete — Run Finalize Manually ──────────────────┐
│  Cluster modified: <FINALIZE_PATHS>
│  Next step (engineer-invoked): /aidlc-escalate-fix-finalize <UNIT_ID>
│  This will stamp the canonical commit on main:
│      escalate-fix(<UNIT_ID>): <DESCRIPTION>
│
│  /aidlc-escalate-fix-finalize is gated with
│  `disable-model-invocation: true` — the orchestrator (you)
│  CANNOT invoke it via Skill / tool. Engineer must type the
│  slash-command in their CLI directly.
└──────────────────────────────────────────────────────────────┘
```

4. HALT — do not invoke any further tools. If the engineer responds "approve", "approved", "go", or any acknowledgement, treat as a no-op acknowledgement and remind them once that they need to type `/aidlc-escalate-fix-finalize <UNIT_ID>` in the CLI themselves; do NOT attempt to invoke `/aidlc-escalate-fix-finalize` via the Skill tool, Task, or any other mechanism — the slash-command's `disable-model-invocation: true` will refuse.

If the envelope reports `GATE_QUESTIONS` or any non-terminal state, surface the cluster message verbatim and HALT.

### Notes

- Helper does NOT touch the marker file on the unit branch (D-92). Marker resolution stays sync's exclusive responsibility.
- The `escalate-fix(<unit-id>):` commit format prefix is a JS template literal in `escalate-fix.js#escalateFixFinalize` — engineer cannot misspell it (D-91).
- All audit-log writes are APPEND-only via `appendFileSync` per AI-DLC's mandatory contract.
- Description flows through the question-file Question 3 override (or persisted frontmatter, or marker.description as fallback). When typed in `$ARGUMENTS`, it is persisted to the question file via `persisted-arg` and re-used on subsequent invocations — engineer does not need to retype.
- Phase 05.3 introduces ZERO new envelope statuses, ZERO new cluster behavior, and ZERO modifications to `assets/aidlc/` (INTG-01 + D-49 invariant).
