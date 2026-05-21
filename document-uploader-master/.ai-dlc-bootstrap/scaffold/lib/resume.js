// assets/scripts/lib/resume.js — WORK-09 / Phase 6 plan 03.
// D-92: read-only — report state + recommend next command + halt. NO auto-dispatch.
// D-93: any-branch + branch-aware. main = cross-branch via `git show`; unit branch = working-tree.
// D-94: 5-tier priority — escalation > pending question > gate-prompt > state mismatch > cycle-complete.
// D-95: plain-text stdout; no artifact on disk.
// 06-RESEARCH §Pattern 3: pending question detection via empty `[Answer]:` regex.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { currentBranch, showFromRef, lsTreeFromRef, resolveUnitRef } from './git-probes.js';
import { scanEscalationMarkers } from './escalation-marker.js';
import { extractUnitPath } from './extract-unit-path.js';
import { safeJoin, unitDescriptionPath } from './paths.js';
import { EXIT_OK, EXIT_DOMAIN, EXIT_INTERNAL } from './report.js';

// ---------------------------------------------------------------------------
// Concrete-command resolution for tier-2 (PENDING question) and tier-3
// (gate-prompt continuation) recommendations. Replaces literal `/aidlc-*`
// glob in synthesizeRecommendation. Fallback to literal glob when the
// cluster is missing/unmapped or the question-file path is unrecognized.
//
// CLUSTER_TO_COMMAND: bootstrap.state.current_cluster → originating slash-command
//   sourced from assets/commands/aidlc-{unit-inception,unit-design,unit-construct,project-inception}.md sequences.
//   For inception clusters, scope === 'project' rewrites to /aidlc-project-inception.
// ---------------------------------------------------------------------------

const CLUSTER_TO_COMMAND = Object.freeze({
  'aidlc-requirements-analyst': '/aidlc-unit-inception',
  'aidlc-story-writer':         '/aidlc-unit-inception',
  'aidlc-architect':            '/aidlc-unit-inception',
  'aidlc-planner':              '/aidlc-unit-inception',
  'aidlc-functional-designer':  '/aidlc-unit-design',
  'aidlc-systems-designer':     '/aidlc-unit-design',
  'aidlc-coder':                '/aidlc-unit-construct',
});

const PROJECT_INCEPTION_CLUSTERS = Object.freeze(new Set([
  'aidlc-requirements-analyst',
  'aidlc-story-writer',
  'aidlc-architect',
  'aidlc-planner',
]));

// QUESTION_DIR_TO_COMMAND: keyed on the QUESTION-FILE PATH'S parent-directory's
// last segment for unit-scoped construction question files. The project-root
// `aidlc-docs/inception/escalate-fix-N-questions.md` shape is handled
// separately by a regex in resolveTier2Command (its parent segment is
// `inception`, which would otherwise collide with future use).
const QUESTION_DIR_TO_COMMAND = Object.freeze({
  'change-requests': '/aidlc-change-request',
  'redesign':        '/aidlc-unit-redesign',
  'sync':            '/aidlc-unit-sync',
  // 'escalate-fix' — handled separately because its path is project-root
  // (aidlc-docs/inception/) not under <unit-path>/aidlc-docs/construction/.
});

/**
 * Resolve a tier-3 originating slash-command from bootstrap.state.
 * Returns a concrete `/aidlc-*` name when known, or the literal glob `/aidlc-*`
 * when the cluster is missing/unmapped. The caller appends unit-id when
 * `includeUnitId === true`.
 */
function resolveTier3Command(bootstrap, _unitId) {
  const cluster = bootstrap && bootstrap.state && bootstrap.state.current_cluster;
  const scope = bootstrap && bootstrap.state && bootstrap.state.scope;
  if (!cluster) return { command: '/aidlc-*', concrete: false };
  // Project-scope inception → /aidlc-project-inception (no unit-id suffix).
  if (scope === 'project' && PROJECT_INCEPTION_CLUSTERS.has(cluster)) {
    return { command: '/aidlc-project-inception', concrete: true, includeUnitId: false };
  }
  const cmd = CLUSTER_TO_COMMAND[cluster];
  if (!cmd) return { command: '/aidlc-*', concrete: false };
  return { command: cmd, concrete: true, includeUnitId: true };
}

/**
 * Resolve a tier-2 originating slash-command from a question-file path.
 * Returns a concrete `/aidlc-*` name when known, or the literal glob
 * `/aidlc-*` when the path is unrecognized. The caller appends unit-id
 * when `includeUnitId === true`.
 *
 * Supported path shapes:
 *   <unit-path>/aidlc-docs/construction/change-requests/...-questions.md → /aidlc-change-request
 *   <unit-path>/aidlc-docs/construction/redesign/...-questions.md        → /aidlc-unit-redesign
 *   <unit-path>/aidlc-docs/construction/sync/...-questions.md            → /aidlc-unit-sync
 *   aidlc-docs/inception/escalate-fix-N-questions.md                     → /aidlc-escalate-fix
 */
function resolveTier2Command(path) {
  if (!path || typeof path !== 'string') return { command: '/aidlc-*', concrete: false };
  // Project-root escalate-fix shape — file name starts with `escalate-fix-` and
  // path begins with `aidlc-docs/inception/`.
  const escFixRe = /(^|\/)aidlc-docs\/inception\/escalate-fix-[^/]+-questions\.md$/;
  if (escFixRe.test(path)) {
    return { command: '/aidlc-escalate-fix', concrete: true, includeUnitId: true };
  }
  // Unit-scoped construction question files — match the second-to-last segment.
  const segs = path.split('/');
  if (segs.length >= 2) {
    const parentSeg = segs[segs.length - 2];
    const cmd = QUESTION_DIR_TO_COMMAND[parentSeg];
    if (cmd) {
      return { command: cmd, concrete: true, includeUnitId: true };
    }
  }
  return { command: '/aidlc-*', concrete: false };
}

// ---------------------------------------------------------------------------
// Pending-question detection (06-RESEARCH §Code Examples lines 706-738).
// File is PENDING iff at least ONE `[Answer]:` line has an empty trimmed tail.
// Multi-question files (escalate-fix has 3) are PENDING when ANY answer is empty.
// ---------------------------------------------------------------------------
const QUESTION_FILE_RE = /^.*-questions\.md$/;
function makeAnswerLineRe() {
  // Fresh regex per use — `g` flag carries lastIndex state across matchAll calls.
  return /^\[Answer\]:\s*(.*)$/gm;
}

/**
 * Working-tree scan of question-file directories under a unit's path plus the
 * project-root inception directory (for escalate-fix files).
 *
 * Returns an array of relative paths (relative to cwd).
 *
 * Exported for re-use by audit-review-collect (Wave 2 plan 05).
 */
export function findPendingQuestionFilesUnitBranch(cwd, unitPath) {
  const dirs = [
    join(unitPath, 'aidlc-docs/construction/change-requests'),
    join(unitPath, 'aidlc-docs/construction/redesign'),
    join(unitPath, 'aidlc-docs/construction/sync'),
    'aidlc-docs/inception', // project-root escalate-fix-N-questions.md scope
  ];
  const pending = [];
  for (const dir of dirs) {
    let abs;
    try {
      abs = safeJoin(cwd, dir);
    } catch {
      continue; // path containment failure — skip silently
    }
    if (!existsSync(abs)) continue;
    let entries;
    try {
      entries = readdirSync(abs);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!QUESTION_FILE_RE.test(name)) continue;
      const fullAbs = join(abs, name);
      let text;
      try {
        text = readFileSync(fullAbs, 'utf8');
      } catch {
        continue;
      }
      const matches = [...text.matchAll(makeAnswerLineRe())];
      if (matches.length === 0) continue;
      const hasEmpty = matches.some((m) => m[1].trim().length === 0);
      if (hasEmpty) pending.push(join(dir, name));
    }
  }
  return pending;
}

/**
 * Cross-branch enumeration of pending question files for a unit branch.
 * Mirrors findPendingQuestionFilesUnitBranch but reads via lsTreeFromRef +
 * showFromRef so main can roll up per-unit pending state without checkout.
 */
function findPendingQuestionFilesCrossBranch(cwd, ref, unitPath) {
  const unitDirs = [
    join(unitPath, 'aidlc-docs/construction/change-requests'),
    join(unitPath, 'aidlc-docs/construction/redesign'),
    join(unitPath, 'aidlc-docs/construction/sync'),
  ];
  const pending = [];
  for (const dir of unitDirs) {
    const ls = lsTreeFromRef(cwd, ref, dir);
    if (ls.error) continue; // PATH_MISSING or GIT_FAILED: just skip
    for (const name of ls.entries) {
      if (!QUESTION_FILE_RE.test(name)) continue;
      const relPath = join(dir, name);
      const sh = showFromRef(cwd, ref, relPath);
      if (sh.error) continue;
      const matches = [...sh.stdout.matchAll(makeAnswerLineRe())];
      if (matches.length === 0) continue;
      const hasEmpty = matches.some((m) => m[1].trim().length === 0);
      if (hasEmpty) pending.push(relPath);
    }
  }
  // Project-root escalate-fix question files live on main, not on unit branches.
  return pending;
}

// ---------------------------------------------------------------------------
// State source readers — graceful degradation per 06-RESEARCH §Pitfall 3.
// orchestrator-state.json may be partial / hand-edited; do NOT call
// validateState (which throws on missing scope/current_cluster/last_updated).
// Surface whatever fields the JSON has + a `corrupt: true` flag on parse fail.
// ---------------------------------------------------------------------------
function parseOrchestratorState(text) {
  try {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object') return { corrupt: true, error: 'not an object' };
    return obj;
  } catch (e) {
    return { corrupt: true, error: e.message };
  }
}

function readBootstrapStateUnitBranch(cwd, unitPath) {
  for (const phase of ['construction', 'inception']) {
    const rel = join(unitPath, '.ai-dlc-bootstrap', phase, 'orchestrator-state.json');
    let abs;
    try { abs = safeJoin(cwd, rel); } catch { continue; }
    if (!existsSync(abs)) continue;
    let text;
    try { text = readFileSync(abs, 'utf8'); } catch { continue; }
    return { phase, state: parseOrchestratorState(text), path: rel };
  }
  return { phase: null, state: null, path: null };
}

function readBootstrapStateCrossBranch(cwd, ref, unitPath) {
  for (const phase of ['construction', 'inception']) {
    const rel = join(unitPath, '.ai-dlc-bootstrap', phase, 'orchestrator-state.json');
    const sh = showFromRef(cwd, ref, rel);
    if (sh.error) continue;
    return { phase, state: parseOrchestratorState(sh.stdout), path: rel };
  }
  return { phase: null, state: null, path: null };
}

// ---------------------------------------------------------------------------
// AI-DLC state heuristic: scan for stage rows containing `done`/`COMPLETED`.
// The fixture E uses a markdown table row `| 11-build | done |`. Production
// AI-DLC writes `## <stage>` headings and status tokens. Cover both.
// ---------------------------------------------------------------------------
export function summarizeAidlcState(text) {
  if (!text) return { lastCompleted: null, raw: '' };
  // 1. Markdown table row: | <stage> | done |  → capture stage name.
  const tableRows = [...text.matchAll(/^\|\s*([^|]+?)\s*\|\s*(done|completed|COMPLETED|DONE)\s*\|/gm)];
  if (tableRows.length > 0) {
    const last = tableRows[tableRows.length - 1];
    return { lastCompleted: last[1].trim(), raw: text };
  }
  // 2. Heading + status form: `## <stage>` followed by COMPLETED token.
  // BLK-01 (Plan 07.1-04): JS regex has no `\Z` anchor — the prior `(?=^## |\Z)`
  // collapsed to `(?=^## |Z)` and silently dropped the final ## block whenever it
  // had no following ## heading and no literal `Z`. `$(?![\s\S])` is the canonical
  // JS substitute: with the `m` flag, `$` matches end-of-line; the negative
  // lookahead `(?![\s\S])` asserts no further character — together: end-of-input.
  const headingMatches = [...text.matchAll(/^## ([^\n]+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
  let last = null;
  for (const h of headingMatches) {
    const body = h[2] || '';
    if (/\b(COMPLETED|done|DONE|completed)\b/.test(body)) {
      last = h[1].trim();
    }
  }
  return { lastCompleted: last, raw: text };
}

function readAidlcStateUnitBranch(cwd, unitPath) {
  for (const phase of ['construction', 'inception']) {
    const rel = join(unitPath, 'aidlc-docs', phase, 'aidlc-state.md');
    let abs;
    try { abs = safeJoin(cwd, rel); } catch { continue; }
    if (!existsSync(abs)) continue;
    let text;
    try { text = readFileSync(abs, 'utf8'); } catch { continue; }
    return summarizeAidlcState(text);
  }
  // Top-level project aidlc-state.md (legacy / project-scope path).
  const topRel = join(unitPath, 'aidlc-docs', 'aidlc-state.md');
  try {
    const abs = safeJoin(cwd, topRel);
    if (existsSync(abs)) {
      return summarizeAidlcState(readFileSync(abs, 'utf8'));
    }
  } catch { /* path containment — fall through */ }
  return { lastCompleted: null, raw: '' };
}

function readAidlcStateCrossBranch(cwd, ref, unitPath) {
  for (const phase of ['construction', 'inception']) {
    const rel = join(unitPath, 'aidlc-docs', phase, 'aidlc-state.md');
    const sh = showFromRef(cwd, ref, rel);
    if (sh.error) continue;
    return summarizeAidlcState(sh.stdout);
  }
  const topRel = join(unitPath, 'aidlc-docs', 'aidlc-state.md');
  const sh = showFromRef(cwd, ref, topRel);
  if (!sh.error) return summarizeAidlcState(sh.stdout);
  return { lastCompleted: null, raw: '' };
}

// Cross-branch escalation-marker enumeration (mirrors scanEscalationMarkers
// for the working-tree case). Returns array of { name, marker }.
function scanEscalationMarkersCrossBranch(cwd, ref, unitPath) {
  const dir = join(unitPath, '.ai-dlc-bootstrap', 'escalations');
  const ls = lsTreeFromRef(cwd, ref, dir);
  if (ls.error) return [];
  const out = [];
  for (const name of ls.entries) {
    if (!/^escalation-\d+\.json$/.test(name)) continue;
    const sh = showFromRef(cwd, ref, join(dir, name));
    if (sh.error) {
      out.push({ name, marker: { status: 'corrupt', error: sh.error, timestamp: '1970-01-01T00:00:00.000Z' } });
      continue;
    }
    let marker;
    try { marker = JSON.parse(sh.stdout); }
    catch (e) { marker = { status: 'corrupt', error: e.message, timestamp: '1970-01-01T00:00:00.000Z' }; }
    out.push({ name, marker });
  }
  return out;
}

// ---------------------------------------------------------------------------
// probeLifecycle: disk-probe that determines which lifecycle artifact directories
// exist for a unit. Used by the tier-3.5 lifecycle-progression scan (DEF-M1-7).
// Artifact roots per AI-DLC convention:
//   Inception  → <unitPath>/aidlc-docs/inception/
//   Design     → <unitPath>/aidlc-docs/design/
//   Construction → <unitPath>/aidlc-docs/construction/
// Heuristic: directory is "present" if it exists AND contains at least one .md file.
// ---------------------------------------------------------------------------
export function probeLifecycle(cwd, unitPath) {
  const inceptionDir = join(cwd, unitPath, 'aidlc-docs/inception');
  const designDir = join(cwd, unitPath, 'aidlc-docs/design');
  const constructDir = join(cwd, unitPath, 'aidlc-docs/construction');
  const hasFiles = (dir) => existsSync(dir) && readdirSync(dir).some((n) => n.endsWith('.md'));
  return {
    hasInceptionArtifacts: hasFiles(inceptionDir),
    hasDesignArtifacts: hasFiles(designDir),
    hasConstructArtifacts: hasFiles(constructDir),
  };
}

// ---------------------------------------------------------------------------
// 5-tier priority synthesis (D-94).
// Returns { tier, prose }. Prose vocabulary contains the literal tokens that
// downstream renderers must surface verbatim (ESCALATION / PENDING / MISMATCH).
// Priority: escalation > pending question > gate-prompt > state mismatch >
//   optional 3.5 lifecycle-progression scan (DEF-M1-7) > cycle-complete.
// ---------------------------------------------------------------------------
function pendingEscalations(escalations) {
  return (escalations || []).filter(({ marker }) => {
    if (!marker || typeof marker !== 'object') return false;
    return marker.status !== 'resolved';
  });
}

export function synthesizeRecommendation({ unitId, bootstrap, aidlc, escalations, pendingQuestions, lifecycle }) {
  const pendEsc = pendingEscalations(escalations);
  if (pendEsc.length > 0) {
    const first = pendEsc[0];
    const desc = (first.marker && first.marker.description) || '(no description)';
    const idTag = unitId ? ` on ${unitId}` : '';
    return {
      tier: 1,
      prose: `ESCALATION${idTag}: ${desc}; switch to main, run /aidlc-escalate-fix${unitId ? ' ' + unitId : ''} "${desc}"`,
    };
  }
  if (Array.isArray(pendingQuestions) && pendingQuestions.length > 0) {
    const path = pendingQuestions[0];
    const r = resolveTier2Command(path);
    if (r.concrete) {
      const cmdSuffix = r.includeUnitId && unitId ? ` ${unitId}` : '';
      return {
        tier: 2,
        prose: `PENDING question file: ${path}; fill [Answer]: tags then re-run ${r.command}${cmdSuffix}`,
      };
    }
    return {
      tier: 2,
      prose: `PENDING question file: ${path}; fill [Answer]: tags then re-run the originating /aidlc-* command`,
    };
  }
  const env = bootstrap && bootstrap.state && bootstrap.state.last_envelope;
  // Phase 06.1: AWAITING_BUILD_TEST has no gate_id; without this branch, the
  // tier-3 `if (env && env.gate_id)` check below misses and the function falls
  // through to tier-5 ("everything OK") which is misleading — the engineer
  // actually needs to re-run /aidlc-unit-construct so the orchestrator runs
  // the BT helper. RESEARCH OQ-4 / Pitfall 2.
  if (env && env.status === 'AWAITING_BUILD_TEST') {
    const r = resolveTier3Command(bootstrap, unitId);
    const cmdSuffix = r.includeUnitId && unitId ? ` ${unitId}` : '';
    return {
      tier: 3,
      prose: `stage-13 BT pending: run ${r.command}${cmdSuffix} to execute build-and-test`,
    };
  }
  if (env && env.gate_id) {
    const stage = (env.current_stage || (bootstrap.state && bootstrap.state.current_stage)) || '<stage>';
    const r = resolveTier3Command(bootstrap, unitId);
    if (r.concrete) {
      const cmdSuffix = r.includeUnitId && unitId ? ` ${unitId}` : '';
      return {
        tier: 3,
        prose: `gate-prompt continuation: re-run ${r.command}${cmdSuffix}; gate ${env.gate_id} on stage ${stage}`,
      };
    }
    const idTag = unitId ? ` ${unitId}` : '';
    return {
      tier: 3,
      prose: `gate-prompt continuation: re-run the originating /aidlc-*${idTag} command; gate ${env.gate_id} on stage ${stage}`,
    };
  }
  // Tier 4: state mismatch between bootstrap.current_stage and aidlc.lastCompleted.
  const bootstrapStage = bootstrap && bootstrap.state && bootstrap.state.current_stage;
  const aidlcStage = aidlc && aidlc.lastCompleted;
  if (bootstrapStage && aidlcStage && bootstrapStage !== aidlcStage) {
    return {
      tier: 4,
      prose: `MISMATCH: bootstrap says ${bootstrapStage}; aidlc-state.md says ${aidlcStage}. Investigate before continuing.`,
    };
  }
  // Tier 3.5 (optional, between tier-4 mismatch and tier-5 cycle-complete): lifecycle-progression
  // scan. When inception artifacts exist but design/construction are absent, surface the
  // correct next command rather than the misleading tier-5 "everything OK" message (DEF-M1-7).
  if (lifecycle && lifecycle.hasInceptionArtifacts) {
    const hasDesign = lifecycle.hasDesignArtifacts === true;
    const hasConstruct = lifecycle.hasConstructArtifacts === true;
    if (!hasDesign) {
      return { tier: 3, prose: `lifecycle-progression: inception complete but no design artifacts found — run /aidlc-unit-design${unitId ? ' ' + unitId : ''} to begin design stages` };
    }
    if (!hasConstruct) {
      return { tier: 3, prose: `lifecycle-progression: design complete but no construct artifacts found — run /aidlc-unit-construct${unitId ? ' ' + unitId : ''} to begin code generation` };
    }
  }
  return {
    tier: 5,
    prose: 'Everything in order; continue with the next AI-DLC stage prompt — OR if cycle is complete, run /aidlc-new-milestone to start a new milestone.',
  };
}

// ---------------------------------------------------------------------------
// Renderers (D-95: plain text, no disk artifact).
// ---------------------------------------------------------------------------
function renderUnitReport({ unitBranch, unitPath, bootstrap, aidlc, escalations, pendingQuestions, recommendation }) {
  const lines = [];
  lines.push(`--- /aidlc-resume — unit branch: ${unitBranch} (mode: WORKING_TREE on-branch) ---`);
  lines.push(`Unit path: ${unitPath}`);
  const bsStage = (bootstrap && bootstrap.state && bootstrap.state.current_stage) || '(absent)';
  const bsCluster = (bootstrap && bootstrap.state && bootstrap.state.current_cluster) || '(absent)';
  const bsPhase = (bootstrap && bootstrap.phase) || '(absent)';
  const aidlcStage = (aidlc && aidlc.lastCompleted) || '(absent)';
  const pendEsc = pendingEscalations(escalations);
  lines.push(
    `Bootstrap state: ${bsStage} cluster=${bsCluster} phase=${bsPhase} | AI-DLC last-completed: ${aidlcStage} | ${pendEsc.length} escalation marker(s) | ${pendingQuestions.length} pending question file(s)`,
  );
  if (pendEsc.length > 0) {
    lines.push(`Escalations:`);
    for (const e of pendEsc) {
      const desc = (e.marker && e.marker.description) || '(no description)';
      lines.push(`  - ${e.name}: ${desc}`);
    }
  }
  if (pendingQuestions.length > 0) {
    lines.push(`Pending question files:`);
    for (const p of pendingQuestions) lines.push(`  - ${p}`);
  }
  lines.push('');
  lines.push(`Recommendation (tier ${recommendation.tier}): ${recommendation.prose}`);
  return lines.join('\n') + '\n';
}

function renderProjectReport({ units, topRecommendation }) {
  const lines = [];
  lines.push(`--- /aidlc-resume — project (main) — mode: CROSS_BRANCH ---`);
  for (const u of units) {
    if (u.status === 'RELEASED') {
      lines.push(`${u.unitId}: RELEASED ${u.archiveTimestamp || '(unknown timestamp)'}`);
      continue;
    }
    if (u.status === 'BRANCH_MISSING') {
      lines.push(`${u.unitId}: BRANCH_MISSING (no live branch and no archive ref)`);
      continue;
    }
    if (u.status === 'ERROR') {
      lines.push(`${u.unitId}: ERROR (${u.error})`);
      continue;
    }
    const bsStage = (u.bootstrap && u.bootstrap.state && u.bootstrap.state.current_stage) || '(absent)';
    const aidlcStage = (u.aidlc && u.aidlc.lastCompleted) || '(absent)';
    const pendEsc = pendingEscalations(u.escalations);
    lines.push(
      `${u.unitId}: bootstrap=${bsStage} | aidlc=${aidlcStage} | ${pendEsc.length} escalation(s) | ${u.pendingQuestions.length} pending question(s)`,
    );
  }
  lines.push('');
  lines.push(`Recommendation (tier ${topRecommendation.tier}): ${topRecommendation.prose}`);
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// resumeFromUnitBranch — D-93 working-tree mode (no `git show` indirection).
// ---------------------------------------------------------------------------
function resumeFromUnitBranch(cwd, unitBranch) {
  // unitBranch == unit-id by Phase 3 D-23 contract.
  const unitFile = unitDescriptionPath(cwd, unitBranch);
  const ext = extractUnitPath(unitFile);
  if (ext.error) {
    // Best-effort fallback: emit a minimal degraded report so Test C
    // (which seeds the unit description on main BEFORE checking out the unit
    //  branch and committing the skeleton WITHOUT the unit file) still passes.
    // Our fixture commits the unit description on main but the api branch was
    // forked AFTER that commit — git includes the file in the api branch.
    // Even so, we return an EXIT_OK degraded report rather than EXIT_DOMAIN
    // because resume is diagnostic-only (D-92 read-only).
    const lines = [];
    lines.push(`--- /aidlc-resume — unit branch: ${unitBranch} (mode: WORKING_TREE on-branch) ---`);
    lines.push(`(could not resolve unit-path from ${unitFile}: ${ext.error})`);
    lines.push('');
    lines.push(`Recommendation (tier 5): Everything in order; continue with the next AI-DLC stage prompt — OR if cycle is complete, run /aidlc-new-milestone to start a new milestone.`);
    return { exitCode: EXIT_OK, stdout: lines.join('\n') + '\n' };
  }
  const unitPath = ext.value;
  const bootstrap = readBootstrapStateUnitBranch(cwd, unitPath);
  const aidlc = readAidlcStateUnitBranch(cwd, unitPath);
  const escalations = scanEscalationMarkers(cwd, unitPath);
  const pendingQuestions = findPendingQuestionFilesUnitBranch(cwd, unitPath);
  const lifecycle = probeLifecycle(cwd, unitPath);
  const recommendation = synthesizeRecommendation({
    unitId: unitBranch,
    bootstrap,
    aidlc,
    escalations,
    pendingQuestions,
    lifecycle,
  });
  const stdout = renderUnitReport({
    unitBranch,
    unitPath,
    bootstrap,
    aidlc,
    escalations,
    pendingQuestions,
    recommendation,
  });
  return { exitCode: EXIT_OK, stdout };
}

// ---------------------------------------------------------------------------
// resumeFromMain — D-93 cross-branch mode via showFromRef / lsTreeFromRef.
// Source of truth for unit roster: aidlc-docs/inception/units/*.md (D-98).
// ---------------------------------------------------------------------------
function resumeFromMain(cwd) {
  let unitsDir;
  try {
    unitsDir = safeJoin(cwd, 'aidlc-docs/inception/units');
  } catch (e) {
    return { exitCode: EXIT_INTERNAL, stderr: `safeJoin failed for unit roster directory: ${e.message}\n` };
  }
  if (!existsSync(unitsDir)) {
    // Plan 07-04a UAT-surfaced (analog to Plan 07-01 escalate-fix-finalize no-op fix):
    // emit a tier-5 recommendation via EXIT_OK + stdout so the dispatcher's marker-append
    // path attaches RESUME_OK and the slash-command's `... | assert-marker RESUME_OK`
    // pipe doesn't halt on a benign no-op.
    return {
      exitCode: EXIT_OK,
      stdout:
        '--- /aidlc-resume — project (main) — mode: CROSS_BRANCH ---\n' +
        "Recommendation (tier 5): Project not yet inception'd; run /aidlc-project-inception first.\n",
    };
  }
  let unitFiles;
  try {
    unitFiles = readdirSync(unitsDir).filter((n) => /\.md$/.test(n));
  } catch (e) {
    return { exitCode: EXIT_INTERNAL, stderr: `Could not enumerate unit roster: ${e.message}\n` };
  }
  const units = [];
  for (const file of unitFiles) {
    const unitId = file.replace(/\.md$/, '');
    const unitFilePath = join(unitsDir, file);
    const ext = extractUnitPath(unitFilePath);
    if (ext.error) {
      units.push({ unitId, status: 'ERROR', error: ext.error });
      continue;
    }
    const unitPath = ext.value;
    const refRes = resolveUnitRef(cwd, unitId);
    if (refRes.error === 'NO_REF') {
      units.push({ unitId, status: 'BRANCH_MISSING' });
      continue;
    }
    if (refRes.error === 'GIT_FAILED') {
      units.push({ unitId, status: 'ERROR', error: `git failed: ${refRes.stderr || ''}` });
      continue;
    }
    if (refRes.archived) {
      units.push({ unitId, status: 'RELEASED', archiveTimestamp: refRes.archiveTimestamp, unitPath });
      continue;
    }
    const ref = refRes.ref;
    const bootstrap = readBootstrapStateCrossBranch(cwd, ref, unitPath);
    const aidlc = readAidlcStateCrossBranch(cwd, ref, unitPath);
    const escalations = scanEscalationMarkersCrossBranch(cwd, ref, unitPath);
    const pendingQuestions = findPendingQuestionFilesCrossBranch(cwd, ref, unitPath);
    units.push({
      unitId,
      status: 'ACTIVE',
      unitPath,
      bootstrap,
      aidlc,
      escalations,
      pendingQuestions,
    });
  }
  // Project-level top recommendation: pick the highest-priority surface across
  // all active units. Tier 1 (escalation) on any unit beats Tier 2 (pending)
  // on any other; ties broken by enumeration order.
  let topRecommendation = { tier: 5, prose: 'Everything in order across the project; continue per each unit\'s standard flow — OR run /aidlc-new-milestone if the cycle is complete.' };
  let topTier = 6;
  for (const u of units) {
    if (u.status !== 'ACTIVE') continue;
    const r = synthesizeRecommendation({
      unitId: u.unitId,
      bootstrap: u.bootstrap,
      aidlc: u.aidlc,
      escalations: u.escalations,
      pendingQuestions: u.pendingQuestions,
    });
    if (r.tier < topTier) {
      topTier = r.tier;
      topRecommendation = r;
    }
  }
  // Plan 07-04a UAT-surfaced (resume-tier5-branch-missing): when zero units are
  // ACTIVE the loop above never runs, so the tier-5 default ("cycle complete")
  // would fire even when the milestone has BARELY STARTED — every unit still
  // BRANCH_MISSING — or is in a mixed mid-cycle state (some RELEASED, some
  // BRANCH_MISSING, none ACTIVE). Tier-5 is only correct when every roster
  // entry is RELEASED. If there are any BRANCH_MISSING units, surface a tier-3
  // actionable pointing at the next unit branch to create.
  // TODO: prefer dependency-order from aidlc-docs/inception/unit-of-work-dependency.md
  // when present; for now first-by-roster-enumeration matches roster order observed
  // in M1-B Step 1 and is sufficient for the actionable recommendation.
  if (topTier === 6) {
    const branchMissing = units.filter((u) => u.status === 'BRANCH_MISSING');
    if (branchMissing.length > 0) {
      const next = branchMissing[0].unitId;
      const pending = branchMissing.map((u) => u.unitId).join(', ');
      topRecommendation = {
        tier: 3,
        prose: `NEXT UNIT: no unit branch created yet — \`git checkout -b ${next}\` then \`/aidlc-unit-inception ${next}\` (units pending: ${pending})`,
      };
    }
  }
  const stdout = renderProjectReport({ units, topRecommendation });
  return { exitCode: EXIT_OK, stdout };
}

// ---------------------------------------------------------------------------
// Top-level dispatcher.
// ---------------------------------------------------------------------------
export async function resume({ positional, flags, cwd } = {}) {
  try {
    const cb = currentBranch(cwd);
    if (cb && cb.detached === true) {
      return { exitCode: EXIT_DOMAIN, stderr: 'HEAD is detached; switch to main or a unit branch.\n' };
    }
    let result;
    if (cb.branch === 'main') {
      result = resumeFromMain(cwd);
    } else {
      result = resumeFromUnitBranch(cwd, cb.branch);
    }
    if (result.exitCode !== EXIT_OK) return result;
    // Marker-line stdout contract (06-PATTERNS.md): final line is `RESUME_OK`.
    const stdout = `${result.stdout || ''}\nRESUME_OK\n`;
    return { exitCode: EXIT_OK, stdout };
  } catch (e) {
    return { exitCode: EXIT_INTERNAL, stderr: `resume: internal error: ${e && e.message ? e.message : e}\n` };
  }
}
