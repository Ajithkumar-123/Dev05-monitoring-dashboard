// assets/scripts/lib/preflight-unit-inception.js — preflight chain for /aidlc-unit-inception.
// Replaces the bash chain in assets/commands/aidlc-unit-inception.md lines 27–101.
// G4 closure: the 6 checks (D-22, D-23x2, UNIT_PATH extract, WR-04, D-31) all run as JS
// regex/file-existence — no awk, no sed, no $N expansion.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { extractUnitPath } from './extract-unit-path.js';
import { validateUnitPath } from './validate-unit-path.js';
import { currentBranch } from './git-probes.js';
import { unitDescriptionPath, safeJoin } from './paths.js';
import { EXIT_OK, EXIT_DOMAIN, EXIT_USAGE } from './report.js';

export async function preflightUnitInception({ positional, cwd }) {
  // D-141/D-142 (Phase 07.1 args-contract): unit-id sourced from env-var.
  const unitId = (process.env.AIDLC_ARGS ?? '').trim().split(/\s+/)[0] || undefined;

  // (1) D-23: empty-arg -> USAGE
  if (!unitId) {
    return {
      exitCode: EXIT_USAGE,
      stderr: 'Usage: scaffold preflight-unit-inception UNIT_ID\nProvide the unit identifier (e.g., UOW-API-01).\n',
    };
  }

  // (1a) BL-01: validate unit-id BEFORE feeding it into any path builder.
  // Reuses validateUnitPath's allow-list + structural checks; safeJoin alone
  // does NOT reject in-tree values like 'aidlc-docs/inception/units' that
  // would otherwise be used to probe arbitrary directories.
  const idCheck = validateUnitPath(unitId);
  if (idCheck.error) {
    return { exitCode: EXIT_USAGE, stderr: `unit-id ${idCheck.error}\n` };
  }

  // (2) D-22: not on main (BL-04: structured return distinguishes detached HEAD from real branches)
  const branchInfo = currentBranch(cwd);
  if (branchInfo.branch === 'main') {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `Cannot run /aidlc-unit-inception on main. Checkout or create the ${unitId} branch first.\n`,
    };
  }

  // (3) D-23: unit-description file present
  const unitFile = unitDescriptionPath(cwd, unitId);
  if (!existsSync(unitFile)) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `Unit description not found at ${unitFile}. Run /aidlc-project-inception first to generate unit descriptions.\n`,
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

  // (6) D-31: prereq inputs (vision.md + tech-environment.md under ${UNIT_PATH}/aidlc-inputs/)
  const inputsDir = safeJoin(cwd, join(unitPath, 'aidlc-inputs'));
  const vision = join(inputsDir, 'vision.md');
  const techEnv = join(inputsDir, 'tech-environment.md');
  const missing = [];
  if (!existsSync(vision)) missing.push(`${unitPath}/aidlc-inputs/vision.md`);
  if (!existsSync(techEnv)) missing.push(`${unitPath}/aidlc-inputs/tech-environment.md`);
  if (missing.length > 0) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `D-31 prereq inputs missing:\n  ${missing.join('\n  ')}\nAuthor these files before running unit inception.\n`,
    };
  }

  // Success
  return {
    exitCode: EXIT_OK,
    stdout: `PREFLIGHT_OK ${unitPath}\n`,
  };
}
