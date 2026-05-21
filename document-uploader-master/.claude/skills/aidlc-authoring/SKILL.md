---
description: Authoring conventions for bootstrap-owned aidlc-* Skills and agents. Use when creating, reviewing, or migrating aidlc-* artifacts. Documents frontmatter shape, the 250-char description budget, and the code-over-prose ratio (GUID-03).
---

# aidlc-authoring

Standing rules for bootstrap-owned aidlc-* artifacts. Read this Skill before creating, reviewing, or migrating any file under `.claude/skills/aidlc-*` or `.claude/agents/aidlc-*`.

## When this Skill applies

- You are creating a new file under `.claude/skills/aidlc-*` or `.claude/agents/aidlc-*`
- You are reviewing an existing aidlc-* artifact for compliance
- You are deciding whether content belongs in a Skill body, supporting file, or agent body

## Naming

| Artifact | Path | Frontmatter `name` |
|----------|------|--------------------|
| Skill | `.claude/skills/aidlc-<topic>/SKILL.md` | OMIT — directory name is the source of truth |
| Agent | `.claude/agents/aidlc-<role>.md` | REQUIRED — must equal filename stem |

The `aidlc-` prefix is mandatory. Lowercase letters, numbers, and hyphens only.

## Frontmatter — Skills

REQUIRED:
- `description`: declarative single sentence; ≤250 chars (soft cap; preserves headroom for project-owned Skills under the 8,000-char default total budget).

ALLOWED (sparingly):
- `when_to_use`: only when description alone leaves trigger phrases ambiguous. Counts toward the 1,536-char per-Skill platform cap.
- `allowed-tools`: only for Skills that run scripts.

FORBIDDEN (MCP-migration discipline — keep SKILL.md content + minimal frontmatter so a future MCP server can wrap it without rewriting):
- `name`, `context`, `agent`, `model`, `effort`, `hooks`, `paths`, `disable-model-invocation`, `user-invocable`

## Frontmatter — agents

REQUIRED:
- `name`: lowercase letters and hyphens only. Must equal the filename stem.
- `description`: declarative; when to delegate. Front-load trigger keywords.

ALLOWED:
- `tools`, `disallowedTools`, `color`.

CAUTION:
- `tools:` may strip MCP tools (claude-code#13898). If the agent needs MCP, omit `tools:` or include `mcp__context7__*` explicitly.
- `skills:` injects FULL Skill bodies at startup. Use ONLY when the agent ALWAYS needs that Skill's content from token-zero. For lazy guidance lookup, use Pattern B below.

## Pattern B — Read-on-demand (the lazy-guidance convention)

Subagents do NOT inherit Skill descriptions from the parent session. Listing Skills in `skills:` injects the full body at startup. Pattern B keeps GUID-01's lazy intent literal:

```markdown
<relevant_skills>
When you need:
- Authoring conventions → Read `.claude/skills/aidlc-authoring/SKILL.md`
- Skill body shape    → Read `.claude/skills/aidlc-skill-template/SKILL.md`
</relevant_skills>
```

The agent uses its Read tool when the topic comes up. Zero context cost up front.

## Body — code-over-prose (GUID-03)

| Rule | Apply to |
|------|----------|
| Concrete examples > explanations | Skills and agents |
| Code blocks, command lists, tables > paragraphs | Skills and agents |
| Standing instructions > step-1/step-2 procedurals | Skills (bodies linger and are never re-read) |
| ≤500 lines (platform recommendation) | Skill bodies |
| ≤200 lines (canonical exemplar soft target) | Bootstrap-owned exemplars |
| Move detail to `reference.md` / `examples.md` / `scripts/` | Skill directories |

## Canonical exemplars — copy from these

| Artifact | Path | Demonstrates |
|----------|------|--------------|
| Skill | `.claude/skills/aidlc-skill-template/SKILL.md` | Frontmatter shape, GUID-03 ratio, MCP-portable body |
| Agent | `.claude/agents/aidlc-agent-template.md` | Native subagent fields (D-14), Pattern B Read-on-demand |

## Description budget — concrete math

| Cap | Value |
|-----|-------|
| Bootstrap-owned soft cap | 250 chars per Skill (description + when_to_use combined) |
| Platform per-Skill hard cap | 1,536 chars (description + when_to_use combined) |
| Default total Skill listing budget | 8,000 chars (scales to 1% of context window) |

## Hand-off

When you author a new aidlc-* artifact, drop it under `assets/agents/` or `assets/skills/<topic>/` in this repo. The deploy machinery (Phase 1 D-09) tracks new bootstrap-owned paths automatically — the manifest grows; no module change needed.
