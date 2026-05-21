---
description: Read-only resume diagnostic. Reads bootstrap + AI-DLC state + escalation markers + pending question files; recommends the next command per 5-tier priority. Branch-aware (main = roll-up; unit branch = detail). Halts.
disable-model-invocation: true
allowed-tools: Bash(node:*), Read
argument-hint: (none)
---

# /aidlc-resume

Read-only state diagnostic. Reports project / unit state and recommends the next command per the 5-tier priority order (escalation → pending question → gate-prompt → state mismatch → cycle-complete). Does not mutate state. Does not auto-dispatch.

## Diagnostic

```!
node .ai-dlc-bootstrap/scaffold/scaffold.js resume "$ARGUMENTS" | node .ai-dlc-bootstrap/scaffold/scaffold.js assert-marker RESUME_OK
```

The bash block above already wrote the helper's stdout to the conversation. Output ONLY the engineer-actionable portion of that helper stdout — do NOT paraphrase, summarize, restructure, or re-format it. Do NOT ask follow-up questions or offer to proceed; the slash-command's contract is to HALT after the helper runs. If the engineer wants to see the full verbatim helper output, they press `Ctrl+O` (transcript viewer) then `Ctrl+E` (show all content).

HALT.

### Notes

- Read-only: helper does NOT mutate any state file (D-92).
- Branch-aware: from `main` the helper enumerates units via inception artifacts and reads cross-branch state via `git show`. From a unit branch the helper reads working-tree state directly. (D-93)
- Output format: plain-text prose to stdout; no artifact on disk (D-95). Re-run anytime to regenerate.
- 5-tier priority: highest-priority surface wins; lower-priority gates are noted but not re-recommended on the same run.
