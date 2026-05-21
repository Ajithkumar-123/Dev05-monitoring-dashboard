// assets/scripts/lib/preflight-unit-construct.js — preflight chain for /aidlc-unit-construct.
// Replaces the bash chain in assets/commands/aidlc-unit-construct.md lines 25–89.
// G4 closure: the 6 checks (D-22, D-23x2, UNIT_PATH extract, WR-04, D-43) all run as JS
// regex/filesystem — no awk, no sed, no $N expansion.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { extractUnitPath } from './extract-unit-path.js';
import { validateUnitPath } from './validate-unit-path.js';
import { currentBranch } from './git-probes.js';
import { unitDescriptionPath, safeJoin } from './paths.js';
import { EXIT_OK, EXIT_DOMAIN, EXIT_USAGE } from './report.js';

// D-43 construct prereqs — 4 directories under ${UNIT_PATH}/aidlc-docs/construction/UNIT_ID/.
// Each maps to a design-stage that may be SKIPPED per AI-DLC adaptive workflow planning
// (recorded in aidlc-docs/aidlc-state.md under the per-unit Construction block).
const CONSTRUCT_PREREQ_DIRS = [
  { dir: 'functional-design',     stage: 'Functional Design' },
  { dir: 'nfr-requirements',      stage: 'NFR Requirements' },
  { dir: 'nfr-design',            stage: 'NFR Design' },
  { dir: 'infrastructure-design', stage: 'Infrastructure Design' },
];

/**
 * Returns true if `path` exists and is a directory.
 * Uses statSync with throwIfNoEntry:false — combines existence + type check in one call (Pattern S1).
 */
function isDirectory(path) {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;
}

// G-04-05: per-unit design-stage SKIP detection. Workflow Planning may mark any of
// the 4 design stages as SKIP for a given unit (per execution-plan.md). When a stage
// is SKIPPED, its prereq directory is correctly absent — drop from required list.
//
// DEF-M1-6 fix (Phase 07.1): primary read from <unitPath>/aidlc-docs/aidlc-state.md
// using AI-DLC's actual FLAT emission format (lines like "Functional Design - SKIP").
// Falls back to project-root Per-Unit Loop format for legacy compat (G-04-05 backward
// compat per CONTEXT line 182).
//
// Flat format (AI-DLC actual emission at <unitPath>/aidlc-docs/aidlc-state.md):
//   Functional Design - SKIP
//   Code Generation - EXECUTE
//
// Per-Unit Loop format (project-root aidlc-docs/aidlc-state.md — legacy/fallback):
//   - [ ] Per-Unit Loop — unit `<unitId>`
//     - [ ] Functional Design — SKIP (rationale)
//     - [ ] Code Generation — EXECUTE
function getSkippedStages(cwd, unitId, unitPath) {
  const skipped = new Set();

  // PRIMARY: unit-path flat-format (DEF-M1-6)
  if (unitPath) {
    let flatContent;
    try {
      const flatPath = safeJoin(cwd, join(unitPath, 'aidlc-docs/aidlc-state.md'));
      if (existsSync(flatPath)) {
        flatContent = readFileSync(flatPath, 'utf8');
      }
    } catch { /* path containment or read error — fall through to legacy */ }

    if (flatContent !== undefined) {
      // Parse flat format: lines like "Functional Design - SKIP"
      // Use this as primary if the file exists (even if it has no SKIPs).
      for (const { dir, stage } of CONSTRUCT_PREREQ_DIRS) {
        // Match: <stage> - SKIP (case-insensitive, hyphen or em-dash)
        const flatRe = new RegExp(`^${stage.replace(/ /g, '\\s+')}\\s*[\\u2014\\-]\\s*SKIP\\s*$`, 'im');
        if (flatRe.test(flatContent)) skipped.add(dir);
      }
      return skipped;
    }
  }

  // FALLBACK: project-root Per-Unit Loop format (G-04-05 legacy compat)
  const statePath = safeJoin(cwd, 'aidlc-docs/aidlc-state.md');
  if (!existsSync(statePath)) return skipped;
  let content;
  try { content = readFileSync(statePath, 'utf8'); }
  catch { return skipped; }

  // Find the per-unit block. Block starts at the unit's "Per-Unit Loop" line and
  // ends at the next "Per-Unit Loop" line, the next "##"/"###" heading, or EOF.
  const escapedId = unitId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blockRe = new RegExp(
    `Per-Unit Loop\\s*[\\u2014\\-]\\s*unit\\s*\`${escapedId}\`([\\s\\S]*?)(?=Per-Unit Loop\\s*[\\u2014\\-]\\s*unit|\\n#{2,}\\s|$)`,
  );
  const match = content.match(blockRe);
  if (!match) return skipped;
  const block = match[1];

  for (const { dir, stage } of CONSTRUCT_PREREQ_DIRS) {
    const stageRe = new RegExp(`${stage.replace(/ /g, '\\s+')}\\s*[\\u2014\\-]\\s*SKIP`, 'i');
    if (stageRe.test(block)) skipped.add(dir);
  }
  return skipped;
}

export async function preflightUnitConstruct({ positional, cwd }) {
  // D-141/D-142 (Phase 07.1 args-contract): unit-id sourced from env-var.
  const unitId = (process.env.AIDLC_ARGS ?? '').trim().split(/\s+/)[0] || undefined;

  // (1) D-23: empty-arg -> USAGE
  if (!unitId) {
    return {
      exitCode: EXIT_USAGE,
      stderr: 'Usage: scaffold preflight-unit-construct UNIT_ID\nProvide the unit identifier (e.g., UOW-API-01).\n',
    };
  }

  // (1a) BL-01: validate unit-id BEFORE feeding it into any path builder.
  // Critical here: unitId is also interpolated into the construct prereq
  // path (`aidlc-docs/construction/${unitId}`), so an unvalidated value
  // could probe arbitrary in-tree directories.
  const idCheck = validateUnitPath(unitId);
  if (idCheck.error) {
    return { exitCode: EXIT_USAGE, stderr: `unit-id ${idCheck.error}\n` };
  }

  // (2) D-22: not on main (BL-04: structured return distinguishes detached HEAD from real branches)
  const branchInfo = currentBranch(cwd);
  if (branchInfo.branch === 'main') {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `Cannot run /aidlc-unit-construct on main. Checkout the ${unitId} branch first.\n`,
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

  // (6) D-43: construct prereq directories under ${UNIT_PATH}/aidlc-docs/construction/UNIT_ID/
  // — state-aware (G-04-05). Stages marked SKIP for this unit in aidlc-state.md are
  // dropped from the required list because adaptive workflow planning correctly
  // does not produce their artifact directories.
  const skipped = getSkippedStages(cwd, unitId, unitPath);
  const missing = [];
  const ctorBase = join(unitPath, 'aidlc-docs', 'construction', unitId);
  for (const { dir } of CONSTRUCT_PREREQ_DIRS) {
    if (skipped.has(dir)) continue;
    const abs = safeJoin(cwd, join(ctorBase, dir));
    if (!isDirectory(abs)) missing.push(`${ctorBase}/${dir}/`);
  }
  if (missing.length > 0) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `D-43 construction prereq directories missing:\n  ${missing.join('\n  ')}\nRun /aidlc-unit-design first to produce these.\n`,
    };
  }

  // Success
  return {
    exitCode: EXIT_OK,
    stdout: `PREFLIGHT_OK ${unitPath}\n`,
  };
}
