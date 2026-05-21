---
description: Stamp the canonical escalate-fix(<unit-id>): <desc> commit on main after /aidlc-escalate-fix's dispatched cluster returns. Re-derives description via the Universal Description-Arg Persistence Convention fallback chain. Use on main only.
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(AIDLC_ARGS=* node:*), Bash(git add:*), Bash(git commit:*), Read
argument-hint: <unit-id>
---

# /aidlc-escalate-fix-finalize [unit-id]

## Finalize — helper-stamped commit on main

```!
AIDLC_ARGS="$ARGUMENTS" node .ai-dlc-bootstrap/scaffold/scaffold.js escalate-fix-finalize | node .ai-dlc-bootstrap/scaffold/scaffold.js assert-marker 'RESOLVED_OK '
```

The bash block above already wrote the helper's stdout to the conversation. Output ONLY the engineer-actionable portion of that helper stdout — do NOT paraphrase, summarize, restructure, or re-format it. Do NOT ask follow-up questions or offer to proceed; the slash-command's contract is to HALT after the helper runs. If the engineer wants to see the full verbatim helper output, they press `Ctrl+O` (transcript viewer) then `Ctrl+E` (show all content).

HALT.

The finalize helper has (per Universal Convention — see `assets/scripts/lib/persisted-arg.js`):

- Re-validated branch == main (D-87)
- Re-derived description via fallback chain: `readPersistedArg(qf.path, 'description')` → Question 3 override → marker.description (no `$ARGUMENTS` retype required)
- Re-derived FINALIZE_PATHS from the answered question file
- Staged those paths via `git add`
- Verified `git diff --cached --name-only` is non-empty (Pitfall 4)
- Appended `## Escalate Fix — Resolved` audit block to root `aidlc-docs/audit.md`
- Run `git commit -q -m` with the JS-template-literal-stamped commit message (D-91)

Surface terminal message verbatim: "Escalate-fix landed on main. Switch back to UNIT_ID and run `/aidlc-unit-sync UNIT_ID` — sync's preflight will detect the matching commit via its grep and mark the marker resolved (D-67 contract preserved per D-92)." HALT.

### Notes

- This command is invoked SEPARATELY from `/aidlc-escalate-fix` (gap-closure 05.3-07 split-finalize-out fix). The split exists because Claude Code executes all bash-injection blocks in a slash-command in sequence regardless of intervening prose or non-zero exit codes — putting the post-Task() commit in the same command as the Pre-flight / Phase B chain triggered the original Phase 5 UAT defect (Gap 1 in 05.3-HUMAN-UAT.md).
- The format prefix `escalate-fix(<unit-id>):` is helper-stamped via JS template literal in `escalate-fix.js#escalateFixFinalize`.
- All audit-log writes are APPEND-only via `appendFileSync`.
