// assets/scripts/lib/preflight-unit-sync.js — preflight chain for /aidlc-unit-sync.
// D-63: detect root-level changes since last sync. D-64: git merge main into unit branch.
// D-66: prepare sync-N-questions.md path (orchestrator writes content). D-67: scan escalation markers + validate vs main.
// Pitfall 2 (RESEARCH §): refuse if .git/MERGE_HEAD exists — engineer must abort prior merge first.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { currentBranch } from './git-probes.js';
import { validateUnitPath } from './validate-unit-path.js';
import { extractUnitPath } from './extract-unit-path.js';
import { unitDescriptionPath, unitSyncDir, safeJoin } from './paths.js';
import { scanEscalationMarkers, validateMarkerAgainstMain, deleteMarker } from './escalation-marker.js';
import { EXIT_OK, EXIT_DOMAIN, EXIT_INTERNAL } from './report.js';
import { parseUnitArgs } from './parse-unit-args.js';

export async function preflightUnitSync({ positional, cwd }) {
  // (1) D-22: branch-state assertion (BL-04 detached-HEAD discrimination).
  let branchInfo;
  try {
    branchInfo = currentBranch(cwd);
  } catch (e) {
    return { exitCode: EXIT_INTERNAL, stderr: `${e.message}\n` };
  }
  if (branchInfo.detached) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: 'Cannot derive unit-id: detached HEAD. Checkout the named unit branch.\n',
    };
  }
  if (branchInfo.branch === 'main') {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: 'Cannot run /aidlc-unit-sync on main. Checkout the unit branch first.\n',
    };
  }
  // D-77 cross-check: parse $ARGUMENTS for diagnostic; unitId remains branch-derived (Pitfall 2).
  // D-141/D-142: engineer-typed unit-id is sourced from env-var (Phase 07.1 args-contract).
  const argParse = parseUnitArgs(process.env.AIDLC_ARGS ?? '');
  void argParse; // (informational; unitId derived below from currentBranch — Pitfall 2)
  const unitId = branchInfo.branch;

  // (2) BL-01: validate unit-id (derived from branch name) before feeding it to path builders.
  const idCheck = validateUnitPath(unitId);
  if (idCheck.error) {
    return { exitCode: EXIT_DOMAIN, stderr: `Branch name (used as unit-id) ${idCheck.error}\n` };
  }

  // (3) D-23: unit-description file present.
  const unitFile = unitDescriptionPath(cwd, unitId);
  if (!existsSync(unitFile)) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `Unit description not found at ${unitFile} for branch ${unitId}.\n`,
    };
  }

  // (4) UNIT_PATH extract + validate (WR-04).
  const ext = extractUnitPath(unitFile);
  if (ext.error) return { exitCode: EXIT_DOMAIN, stderr: `${ext.error}\n` };
  const unitPath = ext.value;
  const v = validateUnitPath(unitPath);
  if (v.error) return { exitCode: EXIT_DOMAIN, stderr: `${v.error}\n` };

  // (5) Pitfall 2: mid-merge guard. .git/MERGE_HEAD signals an in-progress merge.
  const mergeHead = safeJoin(cwd, join('.git', 'MERGE_HEAD'));
  if (existsSync(mergeHead)) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: 'Repository in mid-merge state (.git/MERGE_HEAD present). ' +
              "Run 'git merge --abort' to roll back, or resolve conflicts and 'git commit', then re-run /aidlc-unit-sync.\n",
    };
  }

  // (6) D-67: scan escalation markers; validate each pending against main commit log.
  // DEF-M1-17: delete marker file after confirmed ESCALATION_RESOLVED (both already-resolved
  // and newly-confirmed-resolved via validateMarkerAgainstMain). Pending markers are preserved.
  const markers = scanEscalationMarkers(cwd, unitPath);
  const diagnostics = [];
  for (const { name, marker } of markers) {
    if (marker.status === 'resolved') {
      diagnostics.push(`ESCALATION_RESOLVED ${name}`);
      deleteMarker(cwd, unitPath, name);
      continue;
    }
    const result = validateMarkerAgainstMain(cwd, unitId, marker);
    if (result.found) {
      diagnostics.push(`ESCALATION_RESOLVED ${name} -- escalate-fix(${unitId}) commit landed`);
      deleteMarker(cwd, unitPath, name);
    } else {
      diagnostics.push(`ESCALATION_PENDING ${name} -- main has no matching escalate-fix(${unitId}) commit since ${marker.timestamp}`);
    }
  }

  // (7) D-64: git merge main into unit branch.
  // BLK-01: capture pre-merge HEAD SHA so the engineer has a rollback handle if the
  // merge fails or downstream pre-flight rejects after the merge has already landed.
  // This is the minimum mitigation for the side-effect-then-respond hazard described
  // in the Phase 5 review: re-invocation under Phase A/B amplifies the merge if main
  // moves, and engineers answering Route A (No-op) still see main's commits dragged
  // in. A larger refactor (gating behind --apply-merge or moving the merge into Phase B
  // route handlers) is documented as the longer-term fix; for now we surface the SHA
  // so manual `git reset --hard <sha>` is always possible.
  const preMergeR = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd, encoding: 'utf8', timeout: 5000,
  });
  const preMergeSha = (preMergeR.stdout ?? '').trim();
  if (preMergeSha) {
    diagnostics.push(`PRE_MERGE_SHA ${preMergeSha}`);
  }
  const mergeR = spawnSync('git', ['merge', '--no-edit', 'main'], {
    cwd, encoding: 'utf8', timeout: 10000,
  });
  if (mergeR.status !== 0) {
    const rollbackHint = preMergeSha
      ? `Roll back with: git reset --hard ${preMergeSha}\n`
      : `Run 'git merge --abort' to roll back, or resolve conflicts manually.\n`;
    return {
      exitCode: EXIT_DOMAIN,
      stderr:
        `git merge main failed (likely D-60 violation):\n${(mergeR.stderr ?? '').trim()}\n` +
        rollbackHint,
    };
  }
  diagnostics.push('MERGE_OK -- main brought into ' + unitId);

  // (8) D-66: ensure unitSyncDir exists so the orchestrator can compute next-N for sync-N-questions.md.
  // (Orchestrator writes the content; helper just exposes the path.)
  const syncDir = unitSyncDir(cwd, unitPath);
  // We don't pre-create here (mkdir-on-demand happens orchestrator-side when it writes content);
  // emit the resolved path so the orchestrator binds it.
  diagnostics.push(`SYNC_DIR ${syncDir}`);

  const stdout =
    diagnostics.map((d) => `# ${d}`).join('\n') + (diagnostics.length ? '\n' : '') +
    `PREFLIGHT_OK ${unitPath} ${unitId}\n`;
  return { exitCode: EXIT_OK, stdout };
}
