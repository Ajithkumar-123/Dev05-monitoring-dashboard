// assets/scripts/lib/preflight-unit-release.js — strict 4-signal D-69 pre-flight + D-60 enforcement for /aidlc-unit-release.
// Reuses Phase 03.1 helper foundation (validate-unit-path, extract-unit-path, paths, git-probes, report).
// New module: escalation-marker for D-69 #2 scan; new code: D-69 #3 sync-question regex; D-69 #4 audit-log state machine; D-60 git diff scan.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { currentBranch } from './git-probes.js';
import { validateUnitPath } from './validate-unit-path.js';
import { extractUnitPath } from './extract-unit-path.js';
import { unitDescriptionPath, unitConstructionStatePath, unitSyncDir, safeJoin } from './paths.js';
import { scanEscalationMarkers, scanStaleHintMarkers } from './escalation-marker.js';
import { EXIT_OK, EXIT_DOMAIN, EXIT_INTERNAL } from './report.js';
import { parseUnitArgs } from './parse-unit-args.js';

// D-69 #3: sync-N-questions.md is "active" (unanswered) when its [Answer]: line is empty.
// Mirrors hasActiveRedesign() in preflight-unit-redesign.js but for the 4-route file (single [Answer]:).
function activeSyncQuestion(cwd, unitPath) {
  const dir = unitSyncDir(cwd, unitPath);
  if (!existsSync(dir)) return null;
  let entries;
  try { entries = readdirSync(dir); } catch { return null; }
  const re = /^sync-(\d+)-questions\.md$/;
  let latestPath = null, latestN = -1;
  for (const name of entries) {
    const m = name.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > latestN) { latestN = n; latestPath = join(dir, name); }
    }
  }
  if (!latestPath) return null;
  let text;
  try { text = readFileSync(latestPath, 'utf8'); } catch { return null; }
  // Empty answer line: `[Answer]:` with no following A/B/C/D letter.
  // Match an [Answer]: line; if its letter group is non-empty, file is answered.
  // BLK-02: regex MUST be uppercase-only ([A-D]) to match the orchestrator-side parsers
  // in aidlc-change-request.md, aidlc-unit-redesign.md, and aidlc-unit-sync.md, which
  // all use `^\[Answer\]:\s*([A-D])\b`. A lowercase letter answered here would mark the
  // file "answered" (helper) but fail to capture in the orchestrator (uppercase-only),
  // producing confusing fall-through behavior. Helper and orchestrator MUST agree.
  const m = text.match(/^\[Answer\]:\s*([A-D]?)\b/m);
  if (!m) return latestPath; // No [Answer]: line at all -> treat as unanswered.
  const letter = (m[1] ?? '').trim();
  return letter.length === 0 ? latestPath : null;
}

// D-69 #4: walk audit.md headings; count unmatched `## ESCALATION` opens.
// Pitfall 6 mitigation: state-machine parser instead of single-regex.
function auditLogClean(cwd, unitPath) {
  const auditPath = safeJoin(cwd, join(unitPath, 'aidlc-docs', 'audit.md'));
  if (!existsSync(auditPath)) return { clean: false, reason: `audit.md not found at ${auditPath}` };
  let text;
  try { text = readFileSync(auditPath, 'utf8'); } catch (e) {
    return { clean: false, reason: `cannot read audit.md: ${e.message}` };
  }
  // WRN-07: orphan-RESOLVED tolerance rationale. The state machine treats a
  // `## ESCALATION RESOLVED` heading with no preceding open as a no-op rather
  // than an error. This is a deliberate engineer-edit-tolerance choice: humans
  // sometimes hand-edit audit.md and the LIFO pairing model would otherwise
  // refuse to release on harmless reordering. The pairing remains correct at
  // end-of-file: if any opens are unmatched, the final unmatched count is
  // > 0 and we fail.
  //
  // Case-insensitive match: engineers occasionally lowercase headers
  // ("## escalation resolved"); the audit-log convention is uppercase but the
  // engineer-edit-tolerance posture extends to header casing.
  let unmatched = 0;
  for (const line of text.split('\n')) {
    if (/^##\s+ESCALATION\s+RESOLVED\b/i.test(line)) {
      if (unmatched > 0) unmatched -= 1;
      // Tolerated orphan: see rationale above.
    } else if (/^##\s+ESCALATION\b/i.test(line)) {
      unmatched += 1;
    }
  }
  if (unmatched > 0) {
    return { clean: false, reason: `audit.md has ${unmatched} dangling '## ESCALATION' block(s) without matching '## ESCALATION RESOLVED'` };
  }
  return { clean: true };
}

// D-60 / Pitfall 1: reject if `git diff --name-only main...<unitId>` shows ANY path outside <unitPath>/.
function checkD60(cwd, unitId, unitPath) {
  const r = spawnSync('git', ['diff', '--name-only', `main...${unitId}`], {
    cwd, encoding: 'utf8', timeout: 10000,
  });
  if (r.status !== 0) {
    return { ok: false, reason: `git diff main...${unitId} failed: ${(r.stderr ?? '').trim() || `exit ${r.status}`}` };
  }
  const changed = (r.stdout ?? '').split('\n').filter(Boolean);
  const prefix = `${unitPath}/`;
  const violations = changed.filter((p) => !p.startsWith(prefix));
  if (violations.length > 0) {
    return { ok: false, reason: `D-60 violation: unit branch modifies paths outside ${prefix}:\n  ${violations.join('\n  ')}` };
  }
  return { ok: true };
}

// DEF-M1-14 (Plan 07.1-02): 5th D-69 signal — downstream-stale check.
// Reads stale-hint markers written by escalateFixFinalize in-place mode and checks whether
// a construction-path commit has landed after the hint timestamp. If not, release is refused.
function checkDownstreamStale(cwd, unitId, unitPath, hints) {
  if (hints.length === 0) return { ok: true };
  const latestHint = hints.reduce((a, b) =>
    (a.downstream_stale_since > b.downstream_stale_since ? a : b));
  const sinceSec = Math.floor(new Date(latestHint.downstream_stale_since).getTime() / 1000);
  // BLK-02 (Plan 07.1-04): use git's `:(glob)` magic prefix to make recursive-glob
  // intent explicit at the pathspec layer. Default git pathspec already expands `**`
  // via wildmatch in modern git, but the bare form leaves intent ambiguous and
  // depends on the pathspec parser's default mode (FNM_PATHNAME variants differ
  // across versions). The `:(glob)` prefix pins shell-style `**` recursion in the
  // pathspec contract, which is what the original author intended (see DEF-M1-14).
  const r = spawnSync(
    'git',
    ['log', unitId, `--after=${sinceSec}`, '--format=%H', '--', `:(glob)${unitPath}/aidlc-docs/construction/**`],
    { cwd, encoding: 'utf8', timeout: 10000 },
  );
  if (r.status !== 0) return { ok: false, since: latestHint.downstream_stale_since };
  const commits = (r.stdout ?? '').trim().split('\n').filter(Boolean);
  if (commits.length === 0) return { ok: false, since: latestHint.downstream_stale_since };
  return { ok: true };
}

export async function preflightUnitRelease({ positional, cwd }) {
  // (1) D-22 branch-state assertion.
  let branchInfo;
  try { branchInfo = currentBranch(cwd); }
  catch (e) { return { exitCode: EXIT_INTERNAL, stderr: `${e.message}\n` }; }
  if (branchInfo.detached) {
    return { exitCode: EXIT_DOMAIN, stderr: 'Cannot derive unit-id: detached HEAD. Checkout the named unit branch.\n' };
  }
  if (branchInfo.branch === 'main') {
    return { exitCode: EXIT_DOMAIN, stderr: 'Cannot run /aidlc-unit-release on main. Checkout the unit branch first.\n' };
  }
  // D-77 cross-check: parse $ARGUMENTS for diagnostic; unitId remains branch-derived (Pitfall 2).
  // argParse.unitId is informational only. The handler intentionally ignores it because
  // currentBranch(cwd) is the load-bearing source for unitId on this code path.
  // D-141/D-142: engineer-typed unit-id is sourced from env-var (Phase 07.1 args-contract).
  const argParse = parseUnitArgs(process.env.AIDLC_ARGS ?? '');
  void argParse; // explicit no-op marker — value is informational; D-77 ships the import wiring.
  const unitId = branchInfo.branch;

  // (2) BL-01 validate unit-id before path interpolation.
  const idCheck = validateUnitPath(unitId);
  if (idCheck.error) return { exitCode: EXIT_DOMAIN, stderr: `Branch name (used as unit-id) ${idCheck.error}\n` };

  // (3) D-23 unit-description file present.
  const unitFile = unitDescriptionPath(cwd, unitId);
  if (!existsSync(unitFile)) {
    return { exitCode: EXIT_DOMAIN, stderr: `Unit description not found at ${unitFile} for branch ${unitId}.\n` };
  }

  // (4) UNIT_PATH extract + validate (WR-04).
  const ext = extractUnitPath(unitFile);
  if (ext.error) return { exitCode: EXIT_DOMAIN, stderr: `${ext.error}\n` };
  const unitPath = ext.value;
  const v = validateUnitPath(unitPath);
  if (v.error) return { exitCode: EXIT_DOMAIN, stderr: `${v.error}\n` };

  // (5) D-69 #1: orchestrator-state.json MUST be absent (state cleared by stage-13 envelope).
  const statePath = unitConstructionStatePath(cwd, unitPath);
  if (existsSync(statePath)) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `D-69 #1: construction state file still present at ${statePath}. Complete stage 13 first.\n`,
    };
  }

  // (6) D-69 #2: no pending escalation markers.
  const markers = scanEscalationMarkers(cwd, unitPath);
  const pending = markers.filter((e) => e.marker.status !== 'resolved');
  if (pending.length > 0) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `D-69 #2: ${pending.length} pending escalation marker(s) at ${unitPath}/.ai-dlc-bootstrap/escalations/. Run /aidlc-unit-sync to resolve.\n`,
    };
  }

  // (7) D-69 #3: no unresolved sync question file.
  const activeSync = activeSyncQuestion(cwd, unitPath);
  if (activeSync) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `D-69 #3: unanswered sync question at ${activeSync}. Fill in [Answer]: and re-run /aidlc-unit-sync first.\n`,
    };
  }

  // (8) D-69 #4: audit-log clean (no dangling ## ESCALATION).
  const audit = auditLogClean(cwd, unitPath);
  if (!audit.clean) {
    return { exitCode: EXIT_DOMAIN, stderr: `D-69 #4: ${audit.reason}\n` };
  }

  // (9) D-60 / Pitfall 1: no root-path mutations in unit-branch diff against main.
  const d60 = checkD60(cwd, unitId, unitPath);
  if (!d60.ok) {
    return { exitCode: EXIT_DOMAIN, stderr: `${d60.reason}\n` };
  }

  // (10) DEF-M1-14 (Plan 07.1-02): 5th D-69 signal — downstream-stale check.
  // If escalate-fix in-place mode landed after the last construction run, refuse release.
  const staleHints = scanStaleHintMarkers(cwd, unitPath);
  const staleCheck = checkDownstreamStale(cwd, unitId, unitPath, staleHints);
  if (!staleCheck.ok) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr:
        `downstream-stale: escalate-fix in-place mode landed at ${staleCheck.since}. ` +
        `Run /aidlc-unit-design and /aidlc-unit-construct since that timestamp before releasing. ` +
        `(See DEF-M1-14 in 07-04a-SUMMARY.md for rationale.)\n`,
    };
  }

  return { exitCode: EXIT_OK, stdout: `PREFLIGHT_OK ${unitPath} ${unitId}\n` };
}
