---
description: Read-only progress dashboard. Renders POC-style plain text — project header, Phase Summary table, per-unit Design / Code / Test status. Cross-branch via `git show` (no checkout). Released units marked RELEASED with archive timestamp.
disable-model-invocation: true
allowed-tools: Bash(node:*), Read
argument-hint: (none)
---

# /aidlc-progress

POC-style cross-branch progress dashboard. Reads project-inception artifacts as the unit roster (D-98), reads each unit's state via `git show <unit-branch>:<path>` (no checkout), renders one screen of plain text with header + Phase Summary + per-unit rows. Released units are marked RELEASED with their archive timestamp (D-99).

## Render

```!
node .ai-dlc-bootstrap/scaffold/scaffold.js progress "$ARGUMENTS" | node .ai-dlc-bootstrap/scaffold/scaffold.js assert-marker PROGRESS_OK
```

The bash block above already wrote the helper's stdout to the conversation. Output ONLY the engineer-actionable portion of that helper stdout — do NOT paraphrase, summarize, restructure, or re-format it. Do NOT ask follow-up questions or offer to proceed; the slash-command's contract is to HALT after the helper runs. If the engineer wants to see the full verbatim helper output, they press `Ctrl+O` (transcript viewer) then `Ctrl+E` (show all content).

HALT.

### Notes

- Read-only: no state file mutated; no working-tree change.
- Cross-branch: `git show <unit-branch>:<path>` is the only branch-traversal mechanism; safe under parallel work (D-97).
- Source of truth for the unit roster + phase grouping: `aidlc-docs/inception/units/*.md` + `aidlc-docs/inception/application-design/unit-of-work-dependency.md` (D-98). NOT `git branch -l` (which would surface phantom feature branches).
- Output is plain ASCII; no color codes. CI- and Slack-pasteable. (D-96)
- Re-run anytime to refresh.
