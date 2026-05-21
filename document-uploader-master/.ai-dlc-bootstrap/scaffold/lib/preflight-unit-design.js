// assets/scripts/lib/preflight-unit-design.js — preflight chain for /aidlc-unit-design.
// Replaces the bash chain in assets/commands/aidlc-unit-design.md lines 25–93.
// G4 closure: the 6 checks (D-22, D-23x2, UNIT_PATH extract, WR-04, D-43) all run as JS
// regex/file-existence — no awk, no sed, no $N expansion.
//
// DEF-M1-6 sibling audit: design-stage SKIP detection correctly reads project-root
// `aidlc-docs/aidlc-state.md` because User Stories SKIP is project-scope (set during
// /aidlc-project-inception). NO parallel fix needed here. See preflight-unit-construct.js
// for the unit-path FLAT-format read on construction-stage SKIP.
import { existsSync, readFileSync } from 'node:fs';
import { extractUnitPath } from './extract-unit-path.js';
import { validateUnitPath } from './validate-unit-path.js';
import { currentBranch } from './git-probes.js';
import { unitDescriptionPath, safeJoin } from './paths.js';
import { EXIT_OK, EXIT_DOMAIN, EXIT_USAGE } from './report.js';

// D-43 design prereqs — files at PROJECT ROOT (produced by /aidlc-project-inception
// architect units-generation + story-writer; NOT produced under <unit-path> because
// D-28 skips units-generation for scope=unit per assets/agents/aidlc-architect.md:74-89).
const STORIES_PATH = 'aidlc-docs/inception/user-stories/stories.md';
const UOW_PATH = 'aidlc-docs/inception/application-design/unit-of-work.md';
const UOW_STORY_MAP_PATH = 'aidlc-docs/inception/application-design/unit-of-work-story-map.md';

// G-04-04: User Stories may be SKIPPED per the AI-DLC adaptive workflow assessment
// (see aidlc-story-writer.md intelligent-assessment rule). When SKIPPED, stories.md
// is correctly absent and unit-of-work-story-map.md carries a "no-stories note"
// referencing plans/user-stories-assessment.md. Detect SKIP from aidlc-state.md
// so D-43 doesn't false-block correctly-trivial projects.
function isUserStoriesSkipped(cwd) {
  const statePath = safeJoin(cwd, 'aidlc-docs/aidlc-state.md');
  if (!existsSync(statePath)) return false;
  try {
    const content = readFileSync(statePath, 'utf8');
    // Stage Progress checkbox line: "- [ ] User Stories (skipped ...)" => SKIP
    return /^\s*-\s*\[\s*\]\s*User Stories\s*\(skipped/m.test(content);
  } catch {
    return false;
  }
}

export async function preflightUnitDesign({ positional, cwd }) {
  // D-141/D-142 (Phase 07.1 args-contract): unit-id sourced from env-var.
  const unitId = (process.env.AIDLC_ARGS ?? '').trim().split(/\s+/)[0] || undefined;

  // (1) D-23: empty-arg -> USAGE
  if (!unitId) {
    return {
      exitCode: EXIT_USAGE,
      stderr: 'Usage: scaffold preflight-unit-design UNIT_ID\nProvide the unit identifier (e.g., UOW-API-01).\n',
    };
  }

  // (1a) BL-01: validate unit-id BEFORE feeding it into any path builder.
  const idCheck = validateUnitPath(unitId);
  if (idCheck.error) {
    return { exitCode: EXIT_USAGE, stderr: `unit-id ${idCheck.error}\n` };
  }

  // (2) D-22: not on main (BL-04: structured return distinguishes detached HEAD from real branches)
  const branchInfo = currentBranch(cwd);
  if (branchInfo.branch === 'main') {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `Cannot run /aidlc-unit-design on main. Checkout the ${unitId} branch first.\n`,
    };
  }

  // (3) D-23: unit-description file present
  const unitFile = unitDescriptionPath(cwd, unitId);
  if (!existsSync(unitFile)) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `Unit description not found at ${unitFile}. Run /aidlc-unit-inception first.\n`,
    };
  }

  // (4) UNIT_PATH extract
  const ext = extractUnitPath(unitFile);
  if (ext.error) {
    return { exitCode: EXIT_DOMAIN, stderr: `${ext.error}\n` };
  }
  const unitPath = ext.value;

  // (5) WR-04: char-class allow-list
  const v = validateUnitPath(unitPath);
  if (v.error) {
    return { exitCode: EXIT_DOMAIN, stderr: `${v.error}\n` };
  }

  // (6) D-43: design prereq files at PROJECT ROOT — state-aware (G-04-04).
  // unit-of-work.md and unit-of-work-story-map.md are always required (architect
  // emits both even when stories were skipped). stories.md is conditional: drop
  // it from the required list when aidlc-state.md records User Stories as SKIPPED.
  const required = [UOW_PATH, UOW_STORY_MAP_PATH];
  if (!isUserStoriesSkipped(cwd)) required.unshift(STORIES_PATH);

  const missing = [];
  for (const rel of required) {
    const abs = safeJoin(cwd, rel);
    if (!existsSync(abs)) missing.push(rel);
  }
  if (missing.length > 0) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `D-43 design prereqs missing:\n  ${missing.join('\n  ')}\nRun /aidlc-project-inception first to produce these.\n`,
    };
  }

  // Success
  return {
    exitCode: EXIT_OK,
    stdout: `PREFLIGHT_OK ${unitPath}\n`,
  };
}
