---
description: Canonical bootstrap-owned aidlc-* Skill exemplar. Demonstrates MCP-portable frontmatter (D-12), the 250-char description budget (D-19), the code-over-prose ratio (GUID-03), and directory-name-as-source-of-truth. Copy into aidlc-<topic>/.
---

# aidlc-skill-template

The canonical Claude Code Skill exemplar shipped by ai-dlc-bootstrap. This file is content-neutral on purpose: it's a copy-from reference, not a real guidance entry. Phases 3-6 add real topics (cycle-driven; no prescribed roster). For the rules this exemplar embodies, Read `.claude/skills/aidlc-authoring/SKILL.md`.

## Frontmatter — what to set, what to omit

| Field | Status | Reason |
|-------|--------|--------|
| `description` | REQUIRED | Loaded into context at session start for discovery. Cap at 250 chars (bootstrap-owned soft cap; 1,536 platform cap combined with `when_to_use`). |
| `when_to_use` | ALLOWED | Use only when description alone leaves trigger phrases ambiguous. Counts toward the 1,536-char budget. |
| `allowed-tools` | ALLOWED | Use only when the Skill runs scripts and you want to skip per-invocation approval. |
| `name` | OMIT | Directory name (`aidlc-skill-template`) IS the name. Setting `name:` creates rename-drift risk. |
| `context`, `agent`, `model`, `effort`, `hooks`, `paths`, `disable-model-invocation`, `user-invocable` | FORBIDDEN | Loader-specific. Breaks the MCP-migration discipline (D-12). The body of this Skill is plain markdown so an MCP server can wrap it later without rewriting content. |

## Filename + path — invocation contract

```text
.claude/skills/aidlc-<topic>/SKILL.md       # bootstrap-owned (aidlc- prefix mandatory; D-13)
```

Invoked as `/aidlc-<topic>` — the directory name. Lowercase letters, numbers, and hyphens only; max 64 chars.

## Body shape — code-over-prose (GUID-03)

Aim for ≥50% of body content to be concrete artifacts (code blocks, tables, command lists). Prose paragraphs explain only what the artifacts cannot.

Bad — prose-heavy:

```text
"When you need to deploy, you should first check the manifest, then run the deploy command,
and verify the output matches what you expected. Be careful about edge cases."
```

Good — concrete:

```bash
# 1. Check manifest
cat .ai-dlc-bootstrap/manifest.json | jq '.aidlcVersion'
# 2. Deploy
npx ai-dlc-bootstrap
# 3. Verify (exit 0 = clean)
echo $?
```

## Body lifecycle — write standing instructions, not procedurals

Verified against https://code.claude.com/docs/en/skills (Skill content lifecycle): "When you or Claude invoke a skill, the rendered SKILL.md content enters the conversation as a single message and stays there for the rest of the session. Claude Code does not re-read the skill file on later turns."

| Style | Use |
|-------|-----|
| Declarative rules ("X must be Y", "Use Z when …") | YES — they apply throughout the session. |
| Step-1 / step-2 procedurals | NO — once invoked, the body lingers; "step 1" loses meaning when the Skill is consulted later. |

## Description budget — concrete math

| Cap | Value | Source |
|-----|-------|--------|
| Bootstrap-owned soft cap (description+when_to_use combined) | 250 chars | D-19; preserves headroom for project-owned Skills. |
| Platform per-Skill cap (description+when_to_use combined) | 1,536 chars | https://code.claude.com/docs/en/skills (description truncation). |
| Default total Skill listing budget | 8,000 chars (scales to 1% of context window) | https://code.claude.com/docs/en/skills (Skill descriptions are cut short). |

Two bootstrap-owned Skills @ 250 chars = 500 chars consumed; under 7% of the default budget.

## Supporting files (optional)

A Skill directory MAY contain supporting files referenced from the body:

```text
.claude/skills/aidlc-<topic>/
    SKILL.md           # the Skill body (this file's role)
    reference.md       # detailed reference, loaded on demand
    examples.md        # concrete examples, loaded on demand
    scripts/           # executable artifacts the body invokes
```

Reference each file from SKILL.md so Claude knows when to load it. Do not include supporting files in this exemplar — keep the canonical reference single-file for the simplest possible copy-from experience.

## What this exemplar is NOT

- NOT a Phase 3-6 topic. Real topics (CDK patterns, hex architecture, test standards, etc.) are added cycle-driven, not pre-empted by Phase 2.
- NOT a procedural script. Skill bodies are standing instructions.
- NOT a place for `name:` or other loader-specific frontmatter. Plain markdown only.

## When you copy this file

1. Replace the `description` with one declarative sentence about your topic. ≤250 chars.
2. Rename the directory to `aidlc-<your-topic>/`. Do NOT add a `name:` field.
3. Replace the body with code/tables/concrete artifacts for your topic. Keep the code-over-prose ratio.
4. Stay under 500 lines (platform recommendation). Move detail to `reference.md` if you exceed it.
5. Verify against the rules in `.claude/skills/aidlc-authoring/SKILL.md`.
