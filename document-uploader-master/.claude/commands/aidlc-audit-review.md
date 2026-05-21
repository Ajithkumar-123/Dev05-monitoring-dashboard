---
description: Run the audit-improvement loop. Helper collects evidence (per-unit audit.md + question files), then dispatches aidlc-audit-reviewer to write a consolidated suggestion log under .ai-dlc-bootstrap/audit-improvements/. Use on main only.
disable-model-invocation: true
allowed-tools: Bash(node:*), Read, Task, Agent
argument-hint: [--since <ref>] [--full]
---

# /aidlc-audit-review [--since ref] [--full]

## Phase 1 — Evidence collect (staging directory)

```!
node .ai-dlc-bootstrap/scaffold/scaffold.js audit-review-collect "$ARGUMENTS" | node .ai-dlc-bootstrap/scaffold/scaffold.js assert-marker 'COLLECT_OK '
```

The helper has: asserted branch == main; found prior cursor (most recent `.ai-dlc-bootstrap/audit-improvements/[ts].md`) OR emitted `# CURSOR_NULL` for first-run full-history mode (D-103); self-cleaned any `.staging/[ts]/` directories older than 24 hours; allocated a fresh `.staging/[ts]/` directory; cross-branch read every unit's `aidlc-docs/audit.md` and `*-questions.md` files (sliced by `Timestamp >= cursor`); written three staging files (`audit-bundle.md`, `question-files-bundle.md`, `prior-suggestions-index.md`); emitted terminal `COLLECT_OK [staging-dir] [output-path]` line.

The bash block above already wrote the helper's stdout to the conversation. Output ONLY the engineer-actionable portion of that helper stdout — do NOT paraphrase, summarize, restructure, or re-format it. Do NOT ask follow-up questions or offer to proceed; the slash-command's contract is to HALT after the helper runs. If the engineer wants to see the full verbatim helper output, they press `Ctrl+O` (transcript viewer) then `Ctrl+E` (show all content).

## Phase 2 — Dispatch aidlc-audit-reviewer

Bind from stdout (the bash block already echoed the helper's stdout to the conversation):

- `STAGING_DIR` — second token of the `COLLECT_OK [staging-dir] [output-path]` line
- `OUTPUT_PATH` — third token of the same line

Build a single-line JSON dispatch payload:

```
DISPATCH_PAYLOAD = {"staging_dir": "STAGING_DIR_HERE", "output_path": "OUTPUT_PATH_HERE"}
```

Substitute the bound `STAGING_DIR` and `OUTPUT_PATH` values into the payload (replace the placeholders).

Now invoke the reviewer:

`Task(subagent_type="aidlc-audit-reviewer", prompt=DISPATCH_PAYLOAD)` — the agent reads the three staging files, detects recurring patterns (per its 7-category catalog), writes the consolidated suggestion log to `OUTPUT_PATH`, and emits a single STAGE_COMPLETE envelope.

Per D-107: NEVER inline the bundle text into the Task prompt. The dispatch payload is JSON-encoded paths only — universal anti-pattern rule (no large file content in subagent prompts).

When the envelope reports `STAGE_COMPLETE`, proceed to Phase 3.

If the envelope reports any non-terminal state (which Shape B agents must NOT produce), surface the message verbatim and HALT — that is a contract violation.

## Phase 3 — Finalize (cleanup staging)

Run the finalize helper as a regular `Bash(node:*)` call (NOT a new !-block — per gap-closure 05.3-07's rule that all !-blocks execute in sequence regardless of intervening prose):

```bash
node .ai-dlc-bootstrap/scaffold/scaffold.js audit-review-finalize "$STAGING_DIR"
```

Substitute the bound `STAGING_DIR` value into the command before invoking. The finalize helper verifies the output log exists at `OUTPUT_PATH` and is non-empty (Pitfall 4 analog), `rmSync` the staging dir (Pitfall 11 cleanup-on-success), and emits `FINALIZE_OK [output-path]` (or `FINALIZE_OK [output-path] (already-cleaned)` if idempotent re-run).

Surface to the engineer:

```
Suggestion log written to OUTPUT_PATH.
Engineer triages. The directory `.ai-dlc-bootstrap/audit-improvements/` is the append-only ledger; delete or archive applied entries from individual log files.
```

The bash block above already wrote the helper's stdout to the conversation. Output ONLY the engineer-actionable portion of that helper stdout — do NOT paraphrase, summarize, restructure, or re-format it. Do NOT ask follow-up questions or offer to proceed; the slash-command's contract is to HALT after the helper runs. If the engineer wants to see the full verbatim helper output, they press `Ctrl+O` (transcript viewer) then `Ctrl+E` (show all content).

HALT.

### Notes

- Read-only against evidence sources (`aidlc-docs/audit.md`, `*-questions.md`); the only writes are to staging dir + final output log under `.ai-dlc-bootstrap/audit-improvements/`.
- Append-only ledger: each invocation produces a fresh `[ts].md` file. Idempotent against same input window — re-running without engineer-applied fixes produces substantially same content (D-104).
- Default scope: cycle-since-last-run. Override via `--since [ref]` or `--full` to audit a wider window (D-103).
- Audit-improvements log files are NOT manifest-tracked (D-101); engineer may commit them to main or leave them uncommitted as triage scratch.
- This command runs on `main` only. Audit-review is project-scope.
