---
description: Release a unit branch to main. Runs sync first (D-65), strict 4-signal pre-flight (D-69), squash-merge into main (D-68), and renames branch to archive/<timestamp>/<unit-id> (D-70). Use on a unit branch only.
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(AIDLC_ARGS=* node:*), Read, Write, Edit, Task, Agent
argument-hint: <unit-id> <release-message>
---

# /aidlc-unit-release [unit-id] [release-message]

## Pre-flight and Execution

```!
AIDLC_ARGS="$ARGUMENTS" node .ai-dlc-bootstrap/scaffold/scaffold.js preflight-unit-release && AIDLC_ARGS="$ARGUMENTS" node .ai-dlc-bootstrap/scaffold/scaffold.js unit-release
```

If non-zero exit, halt verbatim. Otherwise stdout has `RELEASE_OK <unitId> <archiveBranchName>`. The helper has, atomically:

- Run preflight-unit-sync (D-65 sync-first invariant)
- Re-run preflight-unit-release (defense in depth)
- Computed idempotency: if unit branch has no diff against main, returns `RELEASE_OK <unitId> ALREADY_RELEASED`
- Checked out main
- Squash-merged the unit branch (D-68 — single atomic `release(<unitId>): <description>` commit)
- Appended `## Release — <unitId>` block to root `aidlc-docs/audit.md` (append-only per AI-DLC mandate; D-62 contract Phase 5 authors)
- Updated root `aidlc-docs/aidlc-state.md` Stage Progress checkbox row
- Created the squash commit on main
- Renamed unit branch to `archive/<ISO-timestamp>/<unitId>` (D-70; collision-handled with -N suffix per Pitfall 3)

Surface verbatim: "Released unit `<unitId>` to main. Archive branch: `<archiveBranchName>`. Inspect with `git log main -1` and `git branch -l 'archive/*'`."

### Notes

- BRCH-01 enforcement is STRUCTURAL: the helper rejects releases where the unit branch has modified any path outside `<unit-path>/`. The error message names the offending paths. Engineer must rewrite history (interactively rebase to drop the bad commits) or open an escalate fix on main and re-run.
- Phase 5 ships NO system-wide build-and-test command. Per D-71, that lives in Phase 7 (End-to-End Validation). After this release lands, the engineer can continue to operate vanilla AI-DLC at the project level (e.g., next milestone via `/aidlc-project-inception` on main; AI-DLC's `session-continuity.md` offers continue-vs-new).
- Audit log entries are APPEND-only (T-04-04) per AI-DLC `CLAUDE.md`.
- `<description>` is interpolated into a `git commit -m` arg via the helper's spawnSync arg array (NOT a shell-interpolated bash string), so command-injection metacharacters are inert (T-05-07-01 mitigation).
