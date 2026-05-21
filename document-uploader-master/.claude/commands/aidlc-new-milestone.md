---
description: Start a new milestone cycle. Surfaces a continue-vs-new prompt and clears project-orchestrator state. Use on `main` only, after all prior-milestone units are released.
disable-model-invocation: true
allowed-tools: Bash(node:*), AskUserQuestion, Read, Write, Edit, Task, Agent
argument-hint: (none)
---

# /aidlc-new-milestone

## Pre-flight

```!
node .ai-dlc-bootstrap/scaffold/scaffold.js preflight-new-milestone "$ARGUMENTS"
```

If non-zero exit, halt verbatim. Helper has verified: on main; no active unit branches (every prior unit branch is renamed `archive/<ts>/<unit-id>`); orchestrator state file exists OR clean main.

## Execution

Read `.claude/skills/aidlc-cluster-agent-pattern/SKILL.md` for state-file paths.

State file: `.ai-dlc-bootstrap/inception/project-orchestrator-state.json` (project root, on main).

### Phase A — first invocation (no answered question file yet)

1. Compute next milestone N (count of prior `## New Milestone` audit entries + 1; OR start at 2 if any release-commits exist on main and no milestone-N-question.md yet).

2. Write the question file at `aidlc-docs/inception/milestone-N-question.md`:

   ```markdown
   # Start New Milestone — Milestone N

   ## Routing Question
   How should the new milestone be scoped?

   A) Continue with new units — same project, more scope (extend the existing requirements/units).
   B) Start fresh cycle — new project intent (clear orchestrator state and re-run inception).

   [Answer]: 
   ```

3. Invoke **AskUserQuestion** with schema:

   ```jsonc
   {
     "questions": [{
       "question": "How should the new milestone be scoped?",
       "header": "New milestone",
       "multiSelect": false,
       "options": [
         { "label": "Continue with new units", "description": "Same project, more scope. Existing requirements stay; orchestrator dispatches into requirements analysis with prior context loaded." },
         { "label": "Start fresh cycle",       "description": "New project intent. Bootstrap orchestrator state cleared so the next /aidlc-project-inception starts from workspace detection." }
       ]
     }]
   }
   ```

4. Mirror engineer's choice into the question file (D-66). Use Edit to replace `[Answer]: ` with `[Answer]: <letter>` in `aidlc-docs/inception/milestone-N-question.md`. Map label → letter: `Continue with new units` → A, `Start fresh cycle` → B.

5. HALT. Engineer re-runs `/aidlc-new-milestone`.

### Phase B — engineer answered

6. Read latest `aidlc-docs/inception/milestone-N-question.md`; parse `[Answer]: ([AB])`.

7. Branch on letter:

   **Route A (Continue):**
   - Surface verbatim: "Run `/aidlc-project-inception` to extend the existing requirements with new scope. The orchestrator will resume per `session-continuity.md`'s Welcome Back Prompt."
   - HALT.

   **Route B (Fresh):**
   - Run the state-clear helper:
     ```bash
     node .ai-dlc-bootstrap/scaffold/scaffold.js new-milestone "$ARGUMENTS"
     ```
   - Surface verbatim: "Orchestrator state cleared. Run `/aidlc-project-inception` to start the new milestone."
   - HALT.

### Notes

- Idempotency: re-running on already-cleared state is a no-op.
- `aidlc-state.md` is NEVER rotated (D-84) — append-only audit history preserved.
