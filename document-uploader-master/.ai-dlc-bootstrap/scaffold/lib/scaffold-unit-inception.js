// assets/scripts/lib/scaffold-unit-inception.js — D-32 idempotent unit-dir scaffold + starter CLAUDE.md.
// Replaces the heredoc + mkdir bash in assets/commands/aidlc-unit-inception.md lines 103–122.
// G4 closure: directory creation and CLAUDE.md write run as JS — no heredoc, no shell substitution.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { extractUnitPath } from './extract-unit-path.js';
import { validateUnitPath } from './validate-unit-path.js';
import { currentBranch } from './git-probes.js';
import { unitDescriptionPath, safeJoin } from './paths.js';
import { EXIT_OK, EXIT_DOMAIN, EXIT_USAGE } from './report.js';

function starterClaudeMd(unitId, unitPath) {
  return `# Unit: ${unitId}\n\n` +
    `This is a unit-scoped working directory under the ai-dlc-bootstrap workflow.\n` +
    `- Inception artifacts (read-only after stage 7): aidlc-docs/inception/\n` +
    `- Unit description: aidlc-docs/inception/units/${unitId}.md\n` +
    `- This unit's design docs: ${unitPath}/aidlc-docs/\n` +
    `- This unit's code: ${unitPath}/src/, ${unitPath}/tests/, ${unitPath}/infra/\n\n` +
    `Phase 4+ commands: /aidlc-design, /aidlc-construct, /redesign, /request-changes\n`;
}

export async function scaffoldUnitInception({ positional, cwd }) {
  // D-141/D-142 (Phase 07.1 args-contract): unit-id sourced from env-var.
  const unitId = (process.env.AIDLC_ARGS ?? '').trim().split(/\s+/)[0] || undefined;

  // Re-validate args defensively (guard against being invoked without preflight in process A)

  // (1) D-23: empty-arg -> USAGE
  if (!unitId) {
    return {
      exitCode: EXIT_USAGE,
      stderr: 'Usage: scaffold scaffold-unit-inception UNIT_ID\nProvide the unit identifier (e.g., UOW-API-01).\n',
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
      stderr: `Cannot scaffold on main; checkout the ${unitId} branch first.\n`,
    };
  }

  // (3) unit-description file present
  const unitFile = unitDescriptionPath(cwd, unitId);
  if (!existsSync(unitFile)) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `Unit description not found at ${unitFile}.\n`,
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

  // (6) WR-09: D-31 prereq inputs (vision.md + tech-environment.md under ${UNIT_PATH}/aidlc-inputs/).
  // Defensive parity with preflightUnitInception: previously this scaffold re-checked 5/6 preflight
  // checks but dropped D-31, leaving a confused contract — either trust the && chain in the slash-
  // command or re-run ALL six. Going with the latter so the comment "guard against being invoked
  // without preflight" stays truthful.
  const inputsDir = safeJoin(cwd, join(unitPath, 'aidlc-inputs'));
  const visionMd = join(inputsDir, 'vision.md');
  const techEnvMd = join(inputsDir, 'tech-environment.md');
  const missing = [];
  if (!existsSync(visionMd)) missing.push(`${unitPath}/aidlc-inputs/vision.md`);
  if (!existsSync(techEnvMd)) missing.push(`${unitPath}/aidlc-inputs/tech-environment.md`);
  if (missing.length > 0) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `D-31 prereq inputs missing:\n  ${missing.join('\n  ')}\nAuthor these files before running unit inception.\n`,
    };
  }

  // D-32 idempotent scaffold
  const unitDir = safeJoin(cwd, unitPath);
  for (const sub of ['src', 'tests', 'infra', 'aidlc-docs']) {
    mkdirSync(join(unitDir, sub), { recursive: true });
  }

  // Starter CLAUDE.md — only written if absent (D-32: do not clobber user-edited file)
  const claudeMdPath = join(unitDir, 'CLAUDE.md');
  if (!existsSync(claudeMdPath)) {
    writeFileSync(claudeMdPath, starterClaudeMd(unitId, unitPath));
  }

  return { exitCode: EXIT_OK, stdout: `SCAFFOLD_OK ${unitPath}\n` };
}
