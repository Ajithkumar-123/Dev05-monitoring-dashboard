// assets/scripts/lib/preflight-new-milestone.js — strict pre-flight for /aidlc-new-milestone (D-83 invariants).
// Asserts: on main; no active unit branches (every non-main, non-archive branch is rejected).
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { currentBranch } from './git-probes.js';
import { safeJoin, STATE_DIR_NAME } from './paths.js';
import { EXIT_OK, EXIT_DOMAIN, EXIT_INTERNAL } from './report.js';

export async function preflightNewMilestone({ positional, cwd }) {
  // (1) Must be on main.
  let branchInfo;
  try { branchInfo = currentBranch(cwd); }
  catch (e) { return { exitCode: EXIT_INTERNAL, stderr: `${e.message}\n` }; }
  if (branchInfo.branch !== 'main') {
    return { exitCode: EXIT_DOMAIN, stderr: `/aidlc-new-milestone runs on main only. Currently on ${branchInfo.branch}.\n` };
  }

  // (2) D-83 trigger gate: no active unit branches.
  const branchListR = spawnSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], {
    cwd, encoding: 'utf8', timeout: 5000,
  });
  if (branchListR.status !== 0) {
    return { exitCode: EXIT_INTERNAL, stderr: `git for-each-ref failed: ${(branchListR.stderr ?? '').trim()}\n` };
  }
  const branches = (branchListR.stdout ?? '').split('\n').filter(Boolean);
  const active = branches.filter(b => b !== 'main' && !b.startsWith('archive/'));
  if (active.length > 0) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `D-83: cannot start new milestone — active branches found: ${active.join(', ')}.\nRelease or archive them first.\n`,
    };
  }

  // (3) Detect orchestrator-state presence (informational; surface to orchestrator).
  const statePath = safeJoin(cwd, join(STATE_DIR_NAME, 'inception', 'project-orchestrator-state.json'));
  const stateMarker = existsSync(statePath) ? 'STATE_PRESENT' : 'STATE_ABSENT';

  return { exitCode: EXIT_OK, stdout: `PREFLIGHT_OK new-milestone ${stateMarker}\n` };
}
