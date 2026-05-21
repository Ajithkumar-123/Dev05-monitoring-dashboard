// assets/scripts/lib/escalate-fix.js — Phase B + finalize for /aidlc-escalate-fix.
// D-89: in-place dispatch reuses cluster's `request_changes` primitive (verified across all 4 clusters).
// D-90: full-restart implements AI-DLC workflow-changes.md Type 4 verbatim.
// D-91: helper-stamped commit format `escalate-fix(<unit-id>): <description>` — JS template literal, never engineer-typed.
// Pitfall 1: synthesized last_envelope includes defensive `unit_id: null` + `next_stage: null` defaults.
// Pitfall 2: per-question section anchoring for [Answer]: parsing.
// Pitfall 4: empty-staged-diff hard-error before commit (escalateFixFinalize).
// Pitfall 5: re-run idempotency via `## Escalate Fix — Restart Archive` audit row + .backup.<ts> existence (Open Q8 strategy A).
import { existsSync, readdirSync, readFileSync, writeFileSync, renameSync, mkdirSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { currentBranch } from './git-probes.js';
import { parseEscalateArgs } from './preflight-escalate-fix.js';
import { validateUnitPath } from './validate-unit-path.js';
import { extractUnitPath } from './extract-unit-path.js';
import { unitDescriptionPath, safeJoin } from './paths.js';
import { EXIT_OK, EXIT_DOMAIN, EXIT_USAGE, EXIT_INTERNAL } from './report.js';
import { writePersistedArg, readPersistedArg, resolveArg } from './persisted-arg.js';
import { writeStaleHintMarker } from './escalation-marker.js'; // DEF-M1-14 (Plan 07.1-02)

// ---------------------------------------------------------------------------
// Stage → cluster / artifact / gate-id mapping (Open Q1 verified table).
// `aidlc-architect` handles two stages; current_stage disambiguates.
// ---------------------------------------------------------------------------
export const STAGE_TO_CLUSTER = Object.freeze({
  'requirements-analysis':  'aidlc-requirements-analyst',
  'user-stories':           'aidlc-story-writer',
  'workflow-planning':      'aidlc-planner',
  'application-design':     'aidlc-architect',
  'units-generation':       'aidlc-architect',
});

export const STAGE_TO_ARTIFACT = Object.freeze({
  'requirements-analysis':  'aidlc-docs/inception/requirements/requirements.md',
  'user-stories':           'aidlc-docs/inception/user-stories/stories.md',
  'workflow-planning':      'aidlc-docs/inception/plans/execution-plan.md',
  'application-design':     'aidlc-docs/inception/application-design/application-design.md',
  'units-generation':       'aidlc-docs/inception/application-design/unit-of-work.md',
});

export const STAGE_TO_GATE_ID = Object.freeze({
  'requirements-analysis':  'approval',
  'user-stories':           'generated-approval',
  'workflow-planning':      'approval',
  'application-design':     'approval',
  'units-generation':       'generated-approval',
});

export const STAGE_ORDER = Object.freeze([
  'requirements-analysis',
  'user-stories',
  'workflow-planning',
  'application-design',
  'units-generation',
]);

// Question 1 letter (A..E) → stage. Order matches the question file template Plan 02 generates.
export const QUESTION1_LETTER_TO_STAGE = Object.freeze({
  A: 'requirements-analysis',
  B: 'user-stories',
  C: 'workflow-planning',
  D: 'application-design',
  E: 'units-generation',
});

// Question 2 letter (A|B) → mode.
export const QUESTION2_LETTER_TO_MODE = Object.freeze({
  A: 'in-place',
  B: 'full-restart',
});

// ---------------------------------------------------------------------------
// synthesizeLastEnvelope — Pitfall 1 defensive defaults baked in.
// ---------------------------------------------------------------------------
export function synthesizeLastEnvelope({ stage }) {
  return {
    status:        'GATE_APPROVAL',
    scope:         'project',
    unit_id:       null,
    current_stage: stage,
    gate_id:       STAGE_TO_GATE_ID[stage],
    artifact_path: STAGE_TO_ARTIFACT[stage],
    message:       '',
    next_stage:    null,
  };
}

// ---------------------------------------------------------------------------
// Private helpers.
// ---------------------------------------------------------------------------
function gitRun(cwd, args, timeout = 10000) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', timeout });
}

function isoTimestamp() {
  return new Date().toISOString();
}

// Plan 06-05: exported for re-use by `audit-review.js` (D-91 analog precedent;
// AGNT-03 staging-dir + log filenames must use the same `:` → `-` filesystem-safe
// ISO 8601 substitution to keep cursor-discovery lex-sort consistent across helpers).
export function isoTimestampForFilename() {
  return new Date().toISOString().replace(/:/g, '-');
}

function validateDescription(description) {
  if (description.length > 200) {
    return { error: `Description too long (${description.length} chars; max 200). Use a concise escalate-fix subject.` };
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(description)) {
    return { error: 'Description must not contain control characters or embedded newlines.' };
  }
  return { ok: true };
}

function findLatestQuestionFile(cwd) {
  const dir = safeJoin(cwd, 'aidlc-docs/inception');
  if (!existsSync(dir)) return null;
  const re = /^escalate-fix-(\d+)-questions\.md$/;
  let best = null;
  for (const name of readdirSync(dir)) {
    const m = name.match(re);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (best === null || n > best.n) best = { n, name, path: join(dir, name) };
  }
  return best;
}

function readMarkerFromUnitBranch(cwd, unitId, unitPath, markerName) {
  const refPath = `${unitId}:${unitPath}/.ai-dlc-bootstrap/escalations/${markerName}`;
  const r = spawnSync('git', ['show', refPath], { cwd, encoding: 'utf8', timeout: 5000 });
  if (r.status !== 0) {
    return { error: `git show ${refPath} failed: ${(r.stderr ?? '').trim() || `exit ${r.status}`}` };
  }
  try { return { marker: JSON.parse(r.stdout) }; }
  catch (e) { return { error: `Marker at ${refPath} is not valid JSON: ${e.message}` }; }
}

// Mirror of preflight-escalate-fix.js#listMarkersOnUnitBranch — D-92 read-only
// enumeration via `git ls-tree --name-only` (no branch switching).
function listMarkersOnUnitBranch(cwd, unitId, unitPath) {
  const dirRef = `${unitId}:${unitPath}/.ai-dlc-bootstrap/escalations/`;
  const r = spawnSync('git', ['ls-tree', '--name-only', dirRef], { cwd, encoding: 'utf8', timeout: 5000 });
  if (r.status !== 0) return { names: [] };
  const names = (r.stdout ?? '').trim().split('\n').filter((n) => /^escalation-\d+\.json$/.test(n));
  return { names };
}

// Most-recent-pending fallback when the question file does not embed a marker
// filename (Plan 01 fixture path) — sort entries by N descending, prefer status
// === 'pending', else any.
function selectMostRecentMarker(cwd, unitId, unitPath) {
  const list = listMarkersOnUnitBranch(cwd, unitId, unitPath);
  if (list.names.length === 0) return { error: `No escalation markers found on branch ${unitId}.` };
  const entries = [];
  for (const name of list.names) {
    const m = name.match(/^escalation-(\d+)\.json$/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    const r = readMarkerFromUnitBranch(cwd, unitId, unitPath, name);
    if (r.error) continue;
    entries.push({ n, name, marker: r.marker });
  }
  if (entries.length === 0) return { error: `No readable escalation markers on branch ${unitId}.` };
  const pending = entries.filter((e) => e.marker.status === 'pending').sort((a, b) => b.n - a.n);
  if (pending.length > 0) return { selected: pending[0] };
  entries.sort((a, b) => b.n - a.n);
  return { selected: entries[0] };
}

// ---------------------------------------------------------------------------
// parseAnswersFromQuestionFile — Pitfall 2 per-question section anchoring.
// Walks file line-by-line, tracks `## Question N` headings, binds the FIRST
// `[Answer]:` line under each heading to that question. Never a global regex.
// ---------------------------------------------------------------------------
export function parseAnswersFromQuestionFile(text) {
  const lines = text.split('\n');
  let current = null;
  let answerLineFor = { 1: -1, 2: -1, 3: -1 };
  const answers = { 1: null, 2: null, 3: null };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(/^##\s+Question\s+(\d+)\b/);
    if (h) { current = parseInt(h[1], 10); continue; }
    if (current && answers[current] === null) {
      const a = line.match(/^\[Answer\]:\s*(.*)$/);
      if (a) {
        answers[current] = a[1].trim();
        answerLineFor[current] = i;
      }
    }
  }
  if (!answers[1] || !/^[A-E]$/.test(answers[1])) {
    return { error: `Question 1 [Answer]: missing or not in A..E (got "${answers[1] ?? '<unset>'}")` };
  }
  if (!answers[2] || !/^[AB]$/.test(answers[2])) {
    return { error: `Question 2 [Answer]: missing or not in A..B (got "${answers[2] ?? '<unset>'}")` };
  }
  // Detect dangling continuation under Question 3 (engineer typed a multi-line
  // descOverride, embedding a newline that breaks the [Answer]: contract).
  // A non-blank line that is not a `## Question N` heading immediately after
  // the [Answer]: line is treated as a control-char-bearing answer.
  if (answerLineFor[3] >= 0) {
    const next = (lines[answerLineFor[3] + 1] ?? '').trim();
    if (next && !/^##\s+Question\s+\d+\b/.test(next) && !/^---/.test(next)) {
      return {
        error: 'Question 3 [Answer]: contains a newline or control character (multi-line descriptions are rejected).',
        usageError: true,
      };
    }
  }
  return {
    stage:        QUESTION1_LETTER_TO_STAGE[answers[1]],
    mode:         QUESTION2_LETTER_TO_MODE[answers[2]],
    descOverride: answers[3] ?? '',
  };
}

// ---------------------------------------------------------------------------
// escalateFix — Phase B handler exported entry-point.
// ---------------------------------------------------------------------------
export async function escalateFix({ positional, cwd }) {
  // (1) Parse $ARGUMENTS — reuse Plan 02's parser.
  // D-141/D-142: engineer-typed unit-id is sourced from env-var (Phase 07.1 args-contract).
  const parsed = parseEscalateArgs(process.env.AIDLC_ARGS ?? '');
  if (parsed.error) return { exitCode: EXIT_USAGE, stderr: `${parsed.error}\n` };
  // Plan 05.3 code-review CR-02: capture argDescription so the fallback chain at step (7)
  // can honor `$ARGUMENTS` override per the documented Universal Convention. Previously
  // discarded; the engineer's typed override on Phase B silently had no effect on dispatch.
  const { unitId, description: argDescription } = parsed;

  // (2) D-87 must-be-on-main.
  let branchInfo;
  try { branchInfo = currentBranch(cwd); }
  catch (e) { return { exitCode: EXIT_INTERNAL, stderr: `${e.message}\n` }; }
  if (branchInfo.detached) {
    return { exitCode: EXIT_DOMAIN, stderr: 'Cannot run /aidlc-escalate-fix from detached HEAD. Checkout main first.\n' };
  }
  if (branchInfo.branch !== 'main') {
    return { exitCode: EXIT_DOMAIN, stderr: `Cannot run /aidlc-escalate-fix from branch ${branchInfo.branch}. Checkout main first.\n` };
  }

  // (3) BL-01.
  const idCheck = validateUnitPath(unitId);
  if (idCheck.error) return { exitCode: EXIT_DOMAIN, stderr: `Unit-id ${idCheck.error}\n` };

  // (4) Resolve unit-path on main.
  const unitFile = unitDescriptionPath(cwd, unitId);
  if (!existsSync(unitFile)) {
    return { exitCode: EXIT_DOMAIN, stderr: `Unit description not found at ${unitFile} for unit-id ${unitId}.\n` };
  }
  const ext = extractUnitPath(unitFile);
  if (ext.error) return { exitCode: EXIT_DOMAIN, stderr: `${ext.error}\n` };
  const unitPath = ext.value;
  const v = validateUnitPath(unitPath);
  if (v.error) return { exitCode: EXIT_DOMAIN, stderr: `${v.error}\n` };

  // (5) Find latest answered escalate-fix-N-questions.md and parse.
  // Plan 05.3-07 Gap 1 closure: when no question file exists OR answers are not yet filled,
  // emit a `# PHASE_A_HALT` marker and exit cleanly. This lets the orchestrator's single
  // combined !-block run preflight + escalateFix unconditionally; bash gates next-step on
  // the marker (PHASE_A_HALT → exit 0; DISPATCH_PAYLOAD → proceed).
  const qf = findLatestQuestionFile(cwd);
  if (!qf) {
    return {
      exitCode: EXIT_OK,
      stdout: '# PHASE_A_HALT no escalate-fix-N-questions.md found — run /aidlc-escalate-fix first to write it, then fill the [Answer]: tags\n',
    };
  }
  const qfText = readFileSync(qf.path, 'utf8');
  const ans = parseAnswersFromQuestionFile(qfText);
  if (ans.error) {
    // Plan 05.3-07 Gap 1 closure: distinguish "answers missing/incomplete" (Phase A halt —
    // graceful exit 0 with PHASE_A_HALT marker) from "answers malformed" (engineer error —
    // still EXIT_USAGE for usageError, EXIT_DOMAIN for other parse errors). The parser sets
    // `usageError: true` only for control-char violations in Q3.
    if (ans.usageError) {
      return { exitCode: EXIT_USAGE, stderr: `${qf.name}: ${ans.error}\n` };
    }
    return {
      exitCode: EXIT_OK,
      stdout: `# PHASE_A_HALT ${qf.name}: ${ans.error}\n`,
    };
  }
  const { stage, mode, descOverride } = ans;

  // (6) Resolve marker — re-read via git show (D-92).
  // Plan 02's question file embeds the chosen marker filename via the
  // `<unit-path>/.ai-dlc-bootstrap/escalations/<name>` line interpolation.
  // If the question file does not embed a marker filename (Wave-0 fixture
  // shape), fall back to most-recent-pending on the unit branch — same
  // selection rule as Plan 02's auto-select default.
  let description;
  let markerName;
  let marker;
  const markerNameMatch = qfText.match(/escalation-(\d+)\.json/);
  if (markerNameMatch) {
    markerName = `escalation-${markerNameMatch[1]}.json`;
    const markerRead = readMarkerFromUnitBranch(cwd, unitId, unitPath, markerName);
    if (markerRead.error) return { exitCode: EXIT_DOMAIN, stderr: `${markerRead.error}\n` };
    marker = markerRead.marker;
  } else {
    const sel = selectMostRecentMarker(cwd, unitId, unitPath);
    if (sel.error) return { exitCode: EXIT_DOMAIN, stderr: `${sel.error}\n` };
    markerName = sel.selected.name;
    marker = sel.selected.marker;
  }
  // Plan 05.3 code-review CR-01 + CR-02: full Universal-Convention fallback chain (mirrors
  // escalateFixFinalize's resolution at step 5). Order: $ARGUMENTS override → persisted
  // frontmatter → Q3 override → marker.description. Without this, an engineer who typed
  // `/aidlc-escalate-fix api "corrected description"` on Phase B saw it silently ignored,
  // and the dispatch payload / audit log / commit message diverged from what they typed.
  // CR-01 defensive guard prevents `validateDescription(undefined)` crash when the resolved
  // marker has no description field (legacy or hand-edited markers — Gap 8 write guard
  // doesn't cover read paths).
  const persisted = readPersistedArg(qf.path, 'description').value;
  description = resolveArg(argDescription, persisted);
  if (!description && descOverride && descOverride.length > 0) {
    description = descOverride;
  }
  if (!description && typeof marker.description === 'string' && marker.description.length > 0) {
    description = marker.description;
  }
  if (typeof description !== 'string' || description.length === 0) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr:
        `escalate-fix: no description available — none provided in $ARGUMENTS, ` +
        `no persisted frontmatter, Q3 empty, and marker ${markerName} has no description field. ` +
        `Re-run with explicit description: /aidlc-escalate-fix ${unitId} "<description>".\n`,
    };
  }

  // (7) WRN-11.
  const dv = validateDescription(description);
  if (dv.error) return { exitCode: EXIT_USAGE, stderr: `${dv.error}\n` };

  // (8) Branch on mode.
  const args = { cwd, unitId, unitPath, stage, description, qfName: qf.name, qfRelative: `aidlc-docs/inception/${qf.name}`, markerName };
  if (mode === 'in-place') return await runInPlaceMode(args);
  if (mode === 'full-restart') return await runFullRestartMode(args);
  return { exitCode: EXIT_INTERNAL, stderr: `Unknown mode "${mode}" — should not reach here.\n` };
}

// ---------------------------------------------------------------------------
// runInPlaceMode — D-89 in-place dispatch payload.
// ---------------------------------------------------------------------------
async function runInPlaceMode({ cwd, unitId, unitPath, stage, description, qfRelative, markerName }) {
  const cluster = STAGE_TO_CLUSTER[stage];
  const artifactPath = STAGE_TO_ARTIFACT[stage];
  const lastEnvelope = synthesizeLastEnvelope({ stage });
  const dispatchPayload = {
    scope: 'project',
    current_stage: stage,
    resume: { kind: 'request_changes', details: description, gate_id: STAGE_TO_GATE_ID[stage] },
    last_envelope: lastEnvelope,
  };

  const auditPath = safeJoin(cwd, 'aidlc-docs/audit.md');
  try { mkdirSync(safeJoin(cwd, 'aidlc-docs'), { recursive: true }); } catch { /* ignore */ }
  const auditBlock =
    `\n## Escalate Fix — Dispatch\n` +
    `**Timestamp**: ${isoTimestamp()}\n` +
    `**Unit**: ${unitId}\n` +
    `**Mode**: in-place\n` +
    `**Stage**: ${stage}\n` +
    `**Cluster**: ${cluster}\n` +
    `**Description**: ${description.replace(/\n/g, ' ')}\n` +
    `**Marker**: ${markerName}\n` +
    `**Question file**: ${qfRelative}\n\n---\n`;
  appendFileSync(auditPath, auditBlock);

  const stdout =
    `DISPATCH_MODE in-place\n` +
    `DISPATCH_CLUSTER ${cluster}\n` +
    `DISPATCH_STAGE ${stage}\n` +
    `DISPATCH_PAYLOAD ${JSON.stringify(dispatchPayload)}\n` +
    `FINALIZE_PATHS ${artifactPath} aidlc-docs/audit.md\n`;
  return { exitCode: EXIT_OK, stdout };
}

// ---------------------------------------------------------------------------
// Full-restart helpers — D-90 implements AI-DLC workflow-changes.md Type 4
// archive + state-reset for COMPLETED downstream stages, plus Open Q8 strategy
// A continuation detection (audit-block + .backup.<ts> coupled).
// ---------------------------------------------------------------------------
function downstreamStages(chosenStage) {
  const idx = STAGE_ORDER.indexOf(chosenStage);
  if (idx === -1) return [];
  return STAGE_ORDER.slice(idx + 1);
}

function readStateFile(cwd) {
  const p = safeJoin(cwd, 'aidlc-docs/aidlc-state.md');
  if (!existsSync(p)) return { path: p, text: '', exists: false };
  return { path: p, text: readFileSync(p, 'utf8'), exists: true };
}

function isStageCompletedInState(stateText, stage) {
  // Match a state-file row that mentions the stage AND has [x] checkbox.
  // Stage names may use slug (`requirements-analysis`) or title-case
  // (`Requirements Analysis`). Match either.
  const slug = stage;
  const title = stage.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join(' ');
  for (const line of stateText.split('\n')) {
    if (!/^\s*-\s*\[x\]/.test(line)) continue;
    if (line.includes(slug) || line.includes(title)) return true;
  }
  return false;
}

function resetStageInState(stateText, stage) {
  const slug = stage;
  const title = stage.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join(' ');
  const lines = stateText.split('\n');
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*-\s*\[x\]/.test(line)) continue;
    if (!(line.includes(slug) || line.includes(title))) continue;
    let updated = line.replace(/\[x\]/, '[ ]');
    updated = updated.replace(/COMPLETED.*$/, 'PENDING');
    if (!/PENDING\s*$/.test(updated)) updated = updated.replace(/$/, ' — PENDING');
    lines[i] = updated;
    changed = true;
  }
  return { text: lines.join('\n'), changed };
}

function clearPlanFileCheckboxesForStage(cwd, stage) {
  const planDir = safeJoin(cwd, 'aidlc-docs/inception/plans');
  if (!existsSync(planDir)) return [];
  const slug = stage;
  const title = stage.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join(' ');
  const touched = [];
  for (const name of readdirSync(planDir)) {
    if (!name.endsWith('.md')) continue;
    const path = join(planDir, name);
    const orig = readFileSync(path, 'utf8');
    const lines = orig.split('\n');
    let changed = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/^\s*-\s*\[x\]/.test(line)) continue;
      if (!(line.includes(slug) || line.includes(title))) continue;
      lines[i] = line.replace(/\[x\]/, '[ ]');
      changed = true;
    }
    if (changed) {
      writeFileSync(path, lines.join('\n'));
      touched.push(`aidlc-docs/inception/plans/${name}`);
    }
  }
  return touched;
}

// Open Q8 strategy A: continuation iff a `## Escalate Fix — Restart Archive`
// audit row from the last 24h coexists with at least one expected `.backup.<ts>`
// file. Both present → 'continuation'; both absent → 'fresh'; one present
// alone → 'mixed' (hard error: partial restart, manual cleanup required).
function detectContinuationState(cwd, downstream) {
  const auditPath = safeJoin(cwd, 'aidlc-docs/audit.md');
  let recentArchiveBlock = false;
  if (existsSync(auditPath)) {
    const auditText = readFileSync(auditPath, 'utf8');
    const blocks = [...auditText.matchAll(/## Escalate Fix — Restart Archive\s*\n\*\*Timestamp\*\*:\s*([^\n]+)/g)];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const m of blocks) {
      const ts = Date.parse(m[1].trim());
      if (Number.isFinite(ts) && ts >= cutoff) { recentArchiveBlock = true; break; }
    }
  }
  let backupsExist = false;
  for (const stage of downstream) {
    const artifact = safeJoin(cwd, STAGE_TO_ARTIFACT[stage]);
    const dir = dirname(artifact);
    const base = basename(artifact);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.startsWith(`${base}.backup.`)) { backupsExist = true; break; }
    }
    if (backupsExist) break;
  }
  if (recentArchiveBlock && backupsExist) return 'continuation';
  if (!recentArchiveBlock && !backupsExist) return 'fresh';
  return 'mixed';
}

// ---------------------------------------------------------------------------
// runFullRestartMode — D-90 Type 4 verbatim: archive each COMPLETED downstream
// artifact + reset its state row + clear plan-file checkboxes, then dispatch
// the chosen stage's cluster from a fresh start (resume.kind=null).
// ---------------------------------------------------------------------------
async function runFullRestartMode({ cwd, unitId, stage, description, qfRelative, markerName }) {
  const cluster = STAGE_TO_CLUSTER[stage];
  const downstream = downstreamStages(stage);
  const auditPath = safeJoin(cwd, 'aidlc-docs/audit.md');
  try { mkdirSync(safeJoin(cwd, 'aidlc-docs'), { recursive: true }); } catch { /* ignore */ }

  const continuation = detectContinuationState(cwd, downstream);
  if (continuation === 'mixed') {
    return {
      exitCode: EXIT_INTERNAL,
      stderr:
        `Partial restart detected — manual cleanup required.\n` +
        `Audit log shows a recent '## Escalate Fix — Restart Archive' block but the expected .backup.<ts> files are absent (or vice versa).\n` +
        `Inspect aidlc-docs/audit.md and ${downstream.map((s) => STAGE_TO_ARTIFACT[s]).join(', ')} manually before re-running.\n`,
    };
  }

  if (continuation === 'continuation') {
    const block =
      `\n## Escalate Fix — Restart Continued\n` +
      `**Timestamp**: ${isoTimestamp()}\n` +
      `**Unit**: ${unitId}\n` +
      `**Continuing stage**: ${stage}\n` +
      `**Question file**: ${qfRelative}\n\n---\n`;
    appendFileSync(auditPath, block);
  } else {
    // Fresh restart.
    const ts = isoTimestampForFilename();
    const archived = [];
    for (const ds of downstream) {
      const artifactRel = STAGE_TO_ARTIFACT[ds];
      const artifactAbs = safeJoin(cwd, artifactRel);
      if (!existsSync(artifactAbs)) continue;
      const state = readStateFile(cwd);
      if (state.exists && !isStageCompletedInState(state.text, ds)) continue;
      const backupPath = `${artifactAbs}.backup.${ts}`;
      try {
        renameSync(artifactAbs, backupPath);
        archived.push({ from: artifactRel, to: `${artifactRel}.backup.${ts}`, stage: ds });
      } catch (e) {
        return { exitCode: EXIT_INTERNAL, stderr: `Archive renameSync failed for ${artifactRel}: ${e.message}\n` };
      }
    }

    let stateUpdated = false;
    const state = readStateFile(cwd);
    if (state.exists) {
      let text = state.text;
      for (const a of archived) {
        const r = resetStageInState(text, a.stage);
        if (r.changed) { text = r.text; stateUpdated = true; }
      }
      if (stateUpdated) writeFileSync(state.path, text);
    }

    const touchedPlans = [];
    for (const a of archived) {
      const t = clearPlanFileCheckboxesForStage(cwd, a.stage);
      touchedPlans.push(...t);
    }

    // Only emit the Restart Archive audit block when we actually archived
    // something. Empty-archive runs are idempotent on their own (no state to
    // continue) — emitting a block in that case would create a 'mixed' false
    // positive on re-run.
    if (archived.length > 0) {
      const block =
        `\n## Escalate Fix — Restart Archive\n` +
        `**Timestamp**: ${isoTimestamp()}\n` +
        `**Unit**: ${unitId}\n` +
        `**Stage to restart**: ${stage}\n` +
        `**Downstream stages reset**: ${archived.map((a) => a.stage).join(', ')}\n` +
        `**Artifacts archived**:\n` +
        archived.map((a) => `- ${a.from} → ${a.to}\n`).join('') +
        `**Plan files updated**: ${touchedPlans.join(', ') || '(none)'}\n\n---\n`;
      appendFileSync(auditPath, block);
    }
  }

  // Always emit the dispatch block + dispatch payload.
  const dispatchBlock =
    `\n## Escalate Fix — Dispatch\n` +
    `**Timestamp**: ${isoTimestamp()}\n` +
    `**Unit**: ${unitId}\n` +
    `**Mode**: full-restart\n` +
    `**Stage**: ${stage}\n` +
    `**Cluster**: ${cluster}\n` +
    `**Description**: ${description.replace(/\n/g, ' ')}\n` +
    `**Marker**: ${markerName}\n` +
    `**Question file**: ${qfRelative}\n\n---\n`;
  appendFileSync(auditPath, dispatchBlock);

  const dispatchPayload = {
    scope: 'project',
    current_stage: stage,
    resume: { kind: null, details: description },
    last_envelope: null,
  };
  const stdout =
    `DISPATCH_MODE full-restart\n` +
    `DISPATCH_CLUSTER ${cluster}\n` +
    `DISPATCH_STAGE ${stage}\n` +
    `DISPATCH_PAYLOAD ${JSON.stringify(dispatchPayload)}\n` +
    `FINALIZE_PATHS ${STAGE_TO_ARTIFACT[stage]} aidlc-docs/aidlc-state.md aidlc-docs/audit.md\n`;
  return { exitCode: EXIT_OK, stdout };
}

// ---------------------------------------------------------------------------
// escalateFixFinalize — D-91 helper-stamped commit + Pitfall 4 empty-diff
// guard + Resolved audit block. Invoked AFTER the orchestrator's Task()
// dispatch returns; verifies the cluster actually changed an inception
// artifact, then commits via JS-template-literal-stamped subject (engineer
// can never misspell the format prefix).
// ---------------------------------------------------------------------------
export async function escalateFixFinalize({ positional, cwd }) {
  // (1) Parse $ARGUMENTS — Plan 05.3-07: description in $ARGUMENTS is now OPTIONAL under
  // the Universal Description-Arg Persistence Convention (D-73 expanded).
  // D-141/D-142: engineer-typed unit-id is sourced from env-var (Phase 07.1 args-contract).
  const parsed = parseEscalateArgs(process.env.AIDLC_ARGS ?? '');
  if (parsed.error) return { exitCode: EXIT_USAGE, stderr: `${parsed.error}\n` };
  const { unitId, description: argDescription } = parsed;

  // (2) D-87.
  let branchInfo;
  try { branchInfo = currentBranch(cwd); }
  catch (e) { return { exitCode: EXIT_INTERNAL, stderr: `${e.message}\n` }; }
  if (branchInfo.detached || branchInfo.branch !== 'main') {
    return { exitCode: EXIT_DOMAIN, stderr: 'escalate-fix finalize must run on main.\n' };
  }

  // (3) BL-01.
  const idCheck = validateUnitPath(unitId);
  if (idCheck.error) return { exitCode: EXIT_DOMAIN, stderr: `Unit-id ${idCheck.error}\n` };

  // (4) Resolve unit-path on main (mirrors escalateFix step 4) — needed for marker-fallback
  // path in the description-resolution chain below.
  const unitFile = unitDescriptionPath(cwd, unitId);
  if (!existsSync(unitFile)) {
    return { exitCode: EXIT_DOMAIN, stderr: `Unit description not found at ${unitFile} for unit-id ${unitId}.\n` };
  }
  const ext = extractUnitPath(unitFile);
  if (ext.error) return { exitCode: EXIT_DOMAIN, stderr: `${ext.error}\n` };
  const unitPath = ext.value;
  const v = validateUnitPath(unitPath);
  if (v.error) return { exitCode: EXIT_DOMAIN, stderr: `${v.error}\n` };

  // (5) Re-derive FINALIZE_PATHS from latest answered question file.
  // Plan 07-01 (TODO 2026-05-03-escalate-fix-finalize-no-op-marker): emit a
  // quiescent marker on the no-questions-file branch so the post-Plan-06-11
  // single-line pipe (`assert-marker 'RESOLVED_OK '`) in
  // aidlc-escalate-fix-finalize.md does not halt the harness on benign no-ops.
  // RESEARCH OQ#3: 'RESOLVED_OK <no-op:no-questions-file>' startsWith
  // 'RESOLVED_OK ' (8 chars + space), so assert-marker.js#65 prefix-match
  // captures it without a contract change.
  const qf = findLatestQuestionFile(cwd);
  if (!qf) {
    return {
      exitCode: EXIT_OK,
      stdout:
        'No escalate-fix-N-questions.md found — nothing to finalize.\n' +
        'RESOLVED_OK <no-op:no-questions-file>\n',
    };
  }
  const qfText = readFileSync(qf.path, 'utf8');
  const ans = parseAnswersFromQuestionFile(qfText);
  if (ans.error) {
    const ec = ans.usageError ? EXIT_USAGE : EXIT_DOMAIN;
    return { exitCode: ec, stderr: `${qf.name}: ${ans.error}\n` };
  }
  const { stage, mode, descOverride } = ans;

  // Plan 05.3-07 Universal Convention (D-73 expanded) fallback chain for description:
  //   (a) $ARGUMENTS override — engineer retyped on Finalize invocation
  //   (b) persisted frontmatter — written by /aidlc-escalate-fix Phase A via writePersistedArg
  //   (c) Question 3 override letter — engineer's question-file edit
  //   (d) marker.description — the original escalation marker on the unit branch
  // Whichever resolves first wins; if all four are empty, EXIT_DOMAIN.
  const persisted = readPersistedArg(qf.path, 'description').value;
  let description = resolveArg(argDescription, persisted);
  if (!description && descOverride && descOverride.length > 0) {
    description = descOverride;
  }
  if (!description) {
    // Last-resort fallback: re-read marker.description via git show (D-92).
    const markerNameMatch = qfText.match(/escalation-(\d+)\.json/);
    if (markerNameMatch) {
      const markerName = `escalation-${markerNameMatch[1]}.json`;
      const markerRead = readMarkerFromUnitBranch(cwd, unitId, unitPath, markerName);
      if (!markerRead.error) {
        description = markerRead.marker.description;
      }
    }
  }
  if (!description) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `escalate-fix-finalize: no description available — none provided in $ARGUMENTS, no persisted frontmatter, Question 3 empty, and no marker reference found in ${qf.name}.\n`,
    };
  }

  // (6) WRN-11 — validate the resolved description (control chars / length).
  const dv = validateDescription(description);
  if (dv.error) return { exitCode: EXIT_USAGE, stderr: `${dv.error}\n` };

  // Plan 05.3 Gap 12: aidlc-state.md is included for BOTH modes because the dispatched
  // cluster may modify it during its run (e.g., aidlc-requirements-analyst marks the stage
  // as 'reopened' when an escalate-fix surfaces a requirements pivot). The previous in-place
  // path captured only the stage artifact; the cluster's state.md edits stayed uncommitted.
  // For full-restart, the helper itself also resets state-file rows to PENDING, so it must
  // be staged regardless. Pre-stage filter on line 660 (existingPaths) skips state.md if
  // it doesn't exist; subsequent Pitfall 4 guard fires if the staged diff is empty.
  const paths = [STAGE_TO_ARTIFACT[stage], 'aidlc-docs/aidlc-state.md'];
  // Plan 05.3-08 Gap 11a: the answered question file (aidlc-docs/inception/escalate-fix-
  // N-questions.md) is added to the same atomic commit AFTER the Pitfall 4 empty-diff
  // guard — same pattern as audit.md (staged at step 8a). Staging it here would mask
  // genuine empty-cluster-output cases (the question file is always non-empty, so it
  // would always satisfy the guard). The file IS the canonical record of which stage/
  // mode/desc-override the engineer chose for this escalation cycle and belongs in the
  // same commit that records resolution.
  const questionFileRel = `aidlc-docs/inception/${qf.name}`;

  // (6) Stage paths that exist on disk.
  const existingPaths = paths.filter((p) => existsSync(safeJoin(cwd, p)));
  if (existingPaths.length === 0) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `Pitfall 4: no inception artifacts changed — none of [${paths.join(', ')}] exist on disk.\n`,
    };
  }
  const addR = gitRun(cwd, ['add', ...existingPaths]);
  if (addR.status !== 0) {
    return { exitCode: EXIT_INTERNAL, stderr: `git add failed: ${(addR.stderr ?? '').trim()}\n` };
  }

  // (7) Pitfall 4: verify staged diff is non-empty BEFORE commit.
  const diffR = gitRun(cwd, ['diff', '--cached', '--name-only']);
  if (diffR.status !== 0) {
    return { exitCode: EXIT_INTERNAL, stderr: `git diff --cached failed: ${(diffR.stderr ?? '').trim()}\n` };
  }
  const stagedFiles = (diffR.stdout ?? '').trim();
  if (!stagedFiles) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: 'Pitfall 4: no inception artifacts changed — staged diff is empty. Cluster ran but produced no change. Aborting.\n',
    };
  }

  // (8) Append `## Escalate Fix — Resolved` audit block.
  const auditPath = safeJoin(cwd, 'aidlc-docs/audit.md');
  try { mkdirSync(safeJoin(cwd, 'aidlc-docs'), { recursive: true }); } catch { /* ignore */ }
  const resolvedBlock =
    `\n## Escalate Fix — Resolved\n` +
    `**Timestamp**: ${isoTimestamp()}\n` +
    `**Unit**: ${unitId}\n` +
    `**Mode**: ${mode}\n` +
    `**Stage**: ${stage}\n` +
    `**Cluster**: ${STAGE_TO_CLUSTER[stage]}\n` +
    `**Artifacts touched**: ${stagedFiles.split('\n').join(', ')}\n` +
    `**Commit**: escalate-fix(${unitId}): ${description.replace(/\n/g, ' ')}\n` +
    `**Question file**: aidlc-docs/inception/${qf.name}\n\n---\n`;
  appendFileSync(auditPath, resolvedBlock);

  // (8a) Re-stage audit.md so it lands in the same atomic commit.
  const addAuditR = gitRun(cwd, ['add', 'aidlc-docs/audit.md']);
  if (addAuditR.status !== 0) {
    return { exitCode: EXIT_INTERNAL, stderr: `git add audit.md failed: ${(addAuditR.stderr ?? '').trim()}\n` };
  }

  // (8b) Plan 05.3-08 Gap 11a: stage the answered question file (escalate-fix-N-questions.md)
  // AFTER Pitfall 4 so its always-non-empty content can't mask a genuinely-empty cluster
  // output. The question file is the canonical record of the engineer's escalation choices
  // (stage/mode/desc-override) and belongs in the same atomic resolve commit. Skip if the
  // file does not exist on disk (defensive — in normal flow it always exists).
  if (existsSync(safeJoin(cwd, questionFileRel))) {
    const addQfR = gitRun(cwd, ['add', questionFileRel]);
    if (addQfR.status !== 0) {
      return { exitCode: EXIT_INTERNAL, stderr: `git add ${questionFileRel} failed: ${(addQfR.stderr ?? '').trim()}\n` };
    }
  }

  // (9) D-91 helper-stamped commit. Format prefix is a JS template literal —
  // engineer cannot misspell it; static-grep contract pins this byte string.
  const commit = gitRun(cwd, ['commit', '-q', '-m', `escalate-fix(${unitId}): ${description}`]);
  if (commit.status !== 0) {
    // WRN-02 rollback: surface failure explicitly so the engineer can
    // distinguish clean rollback from inconsistent state.
    const reset = gitRun(cwd, ['reset', '--hard', 'HEAD']);
    if (reset.status !== 0) {
      return {
        exitCode: EXIT_INTERNAL,
        stderr:
          `git commit failed AND rollback failed.\n` +
          `commit stderr: ${(commit.stderr ?? '').trim()}\n` +
          `reset stderr: ${(reset.stderr ?? '').trim()}\n` +
          `Repository is in an inconsistent state. Inspect manually with 'git status'.\n`,
      };
    }
    return { exitCode: EXIT_INTERNAL, stderr: `git commit failed: ${(commit.stderr ?? '').trim()}\n` };
  }

  // (10) DEF-M1-14 (Plan 07.1-02): in-place mode writes a sibling stale-hint marker so
  // preflight-unit-release can refuse release until /aidlc-unit-design + /aidlc-unit-construct
  // have been re-run since this timestamp. Non-fatal: hint write failure must not abort the finalize.
  if (mode === 'in-place') {
    const markerN = (() => {
      const m2 = qfText.match(/escalation-(\d+)\.json/);
      return m2 ? parseInt(m2[1], 10) : 1;
    })();
    try {
      writeStaleHintMarker(cwd, unitPath, {
        markerN,
        since: new Date().toISOString(),
      });
    } catch {
      // Non-fatal: hint write failure should not abort the finalize.
    }
  }

  return { exitCode: EXIT_OK, stdout: `RESOLVED_OK ${unitId}\n` };
}
