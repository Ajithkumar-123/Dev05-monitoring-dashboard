// assets/scripts/lib/preflight-project-inception.js — preflight chain for /aidlc-project-inception.
// Replaces the inline bash injections in assets/commands/aidlc-project-inception.md lines 11–15
// and the D-22 / D-31 prose assertions in lines 18–27.
// NOTE: D-22 is INVERTED here — /aidlc-project-inception REQUIRES main (unlike unit commands which forbid main).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { currentBranch } from './git-probes.js';
import { STATE_DIR_NAME, safeJoin } from './paths.js';
import { EXIT_OK, EXIT_DOMAIN } from './report.js';

export async function preflightProjectInception({ cwd }) {
  // D-141 universal scope: env-var present even when unused (project-inception takes no engineer-typed args).
  const _raw = process.env.AIDLC_ARGS ?? '';
  // (1) D-22 inverted: must be on main (project-inception is project-scoped, not unit-scoped)
  // BL-04: structured return distinguishes detached HEAD from real branches.
  const branchInfo = currentBranch(cwd);
  if (branchInfo.detached) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: '/aidlc-project-inception must run on main; current HEAD is detached.\nCheckout main and re-run.\n',
    };
  }
  if (branchInfo.branch !== 'main') {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `/aidlc-project-inception must run on main; current branch: ${branchInfo.branch}.\nCheckout main and re-run.\n`,
    };
  }

  // (2) D-31: vision.md + tech-environment.md must exist at PROJECT root (cwd).
  // BL-03: use safeJoin (not raw path.join) for parity with every other handler — even
  // though these segments are hardcoded literals today, the discipline prevents a
  // future parameterized edit from silently bypassing containment.
  const vision = safeJoin(cwd, join('aidlc-inputs', 'vision.md'));
  const techEnv = safeJoin(cwd, join('aidlc-inputs', 'tech-environment.md'));
  const missing = [];
  if (!existsSync(vision)) missing.push('aidlc-inputs/vision.md');
  if (!existsSync(techEnv)) missing.push('aidlc-inputs/tech-environment.md');
  if (missing.length > 0) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `D-31 prereq inputs missing:\n  ${missing.join('\n  ')}\nAuthor these files at the project root before running.\n`,
    };
  }

  // (3) D-38: probe project state file (informational — does not fail; tells orchestrator create-fresh vs resume)
  // BL-03: use safeJoin for the same reason as above.
  const projStatePath = safeJoin(cwd, join(STATE_DIR_NAME, 'inception', 'project-orchestrator-state.json'));
  const stateLine = existsSync(projStatePath) ? 'STATE_PRESENT\n' : 'STATE_ABSENT\n';

  return {
    exitCode: EXIT_OK,
    stdout: `PREFLIGHT_OK\n${stateLine}`,
  };
}
