// assets/scripts/lib/progress.js — WORK-10 / Phase 6 plan 04 + plan 09 (Gap 3 POC parity).
// D-96: POC-style full dashboard — header + Phase Summary table + Parallel Batches + per-phase
//       blocks + Blocked-by lines + per-unit rows + DONE/PARTIAL/READY/BLOCKED taxonomy + `<< next`.
// D-97: cross-branch reads via `git show <unitBranch>:<path>` (no checkout).
// D-98: source of truth for unit roster = aidlc-docs/inception/units/*.md + unit-of-work-dependency.md.
// D-99: released units render `RELEASED <archive-timestamp>` via resolveUnitRef archive fallback.
//
// Read-only contract: this module performs zero state mutation and zero
// branch movement. All cross-branch traversal goes through showFromRef +
// resolveUnitRef from ./git-probes.js so HEAD is never moved.
//
// Coverage map (06-RESEARCH.md §Validation Architecture rows 918-922 — WORK-10):
//   - WORK-10 / D-98: discoverUnitRoster reads aidlc-docs/inception/units/*.md ONLY.
//   - WORK-10 / D-97: readUnitState calls showFromRef + resolveUnitRef; never spawns checkout.
//   - WORK-10 / D-99: classifyStage emits RELEASED <ts> token; multi-archive lex-sort honored
//                      by resolveUnitRef (latest wins).
//   - WORK-10 / D-96: renderDashboard emits Phase Summary header + per-unit rows + Parallel
//                      Batches (Kahn) + per-phase blocks + Blocked-by lines + status taxonomy.
//   - Marker contract: stdout terminates with PROGRESS_OK on EXIT_OK.
//
// Plan 06-09 (Gap 3): parseDependencies recognises the canonical AI-DLC
// dependency-matrix form (`| From \ To | <unit> | <unit> |`) plus the POC B[id]/R[id]/D[id]
// annotated form, and falls back to English-prose for hand-authored notes.
// computeBatches implements Kahn's-algorithm topological grouping (Wave 1 = no
// blockers; Wave N = blockers all in Waves <N; cycles non-fatal via cycleBroken).
// renderMarkdownTable centralises column alignment so every emitted table is
// monospace-aligned (CI/Slack-pasteable). derivePhaseStatus implements the
// DONE/PARTIAL/READY/BLOCKED taxonomy with BLOCKED-outranks-PARTIAL precedence
// (T-06-09-07: `<< next` suffix is part of the row data BEFORE renderMarkdownTable
// so the suffix-bearing row never overflows the column-width pre-pass).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { showFromRef, resolveUnitRef } from './git-probes.js';
import { extractUnitPath } from './extract-unit-path.js';
import { validateUnitPath } from './validate-unit-path.js';
import { safeJoin } from './paths.js';
import { EXIT_OK, EXIT_INTERNAL } from './report.js';

// ---------------------------------------------------------------------------
// Stage classification table — maps orchestrator-state.json `current_stage`
// to the POC-style {Design, Code, Test} triple.
// (Per plan 06-04 <interfaces> AI-DLC stage cluster mapping.)
// ---------------------------------------------------------------------------

const STAGE_TO_TRIPLE = {
  // Inception cluster — no Design/Code/Test progress yet.
  'requirements-analysis': { design: '-', code: '-', test: '-' },
  'user-stories': { design: '-', code: '-', test: '-' },
  'workflow-planning': { design: '-', code: '-', test: '-' },
  'application-design': { design: '-', code: '-', test: '-' },
  'units-generation': { design: '-', code: '-', test: '-' },
  // Design cluster.
  'functional-design': { design: 'wip', code: '-', test: '-' },
  'systems-design': { design: 'wip', code: '-', test: '-' },
  // Code cluster (stages 12 + 13a).
  'code-generation': { design: 'done', code: 'wip', test: '-' },
  // Test cluster (stage 13b).
  'build-and-test': { design: 'done', code: 'done', test: 'wip' },
};

// ---------------------------------------------------------------------------
// Top-level entry point.
// ---------------------------------------------------------------------------

export async function progress({ positional, flags, cwd }) {
  try {
    // (1) D-98 prereq: project-inception artifacts must exist on main.
    const unitsDir = safeJoin(cwd, 'aidlc-docs/inception/units');
    if (!existsSync(unitsDir)) {
      // Plan 07-04a UAT-surfaced (analog to Plan 07-01 escalate-fix-finalize no-op fix):
      // emit a tier-5 recommendation via EXIT_OK + stdout (with inline PROGRESS_OK marker)
      // so the slash-command's `... | assert-marker PROGRESS_OK` pipe doesn't halt on a
      // benign no-op. Progress has no separate dispatcher — marker is inline.
      return {
        exitCode: EXIT_OK,
        stdout:
          `Project not yet inception'd; run /aidlc-project-inception first. (No ${unitsDir})\n` +
          'PROGRESS_OK <no-op:no-project-yet>\n',
      };
    }

    // (2) Discover the unit roster from inception artifacts.
    const units = discoverUnitRoster(cwd);

    // (3) Per-unit cross-branch state read.
    const unitStates = new Map();
    for (const u of units) {
      unitStates.set(u.unitId, readUnitState(cwd, u));
    }

    // (4) Dependency parse (best-effort; fall back to empty).
    const dependencies = readDependencies(cwd, units.map((u) => u.unitId));

    // (5) Stage classification.
    const classifications = new Map();
    for (const u of units) {
      classifications.set(u.unitId, classifyStage(unitStates.get(u.unitId)));
    }

    // (6) Aggregate counts.
    const counts = aggregateCounts(classifications);

    // (7) Render.
    const projectName = discoverProjectName(cwd);
    const traceMode = !!(flags && flags.trace);
    const dashboard = renderDashboard({
      projectName,
      units,
      classifications,
      dependencies,
      counts,
      traceMode,
    });
    return { exitCode: EXIT_OK, stdout: dashboard + '\nPROGRESS_OK\n' };
  } catch (err) {
    return { exitCode: EXIT_INTERNAL, stderr: `progress: internal error: ${err.message}\n` };
  }
}

// ---------------------------------------------------------------------------
// discoverUnitRoster (D-98 / Pitfall 6) — roster is inception artifacts ONLY.
// `git branch -l` is NOT consulted (would surface phantom feature branches).
// ---------------------------------------------------------------------------

export function discoverUnitRoster(cwd) {
  const unitsDir = safeJoin(cwd, 'aidlc-docs/inception/units');
  let entries;
  try {
    entries = readdirSync(unitsDir);
  } catch {
    return [];
  }
  const units = [];
  for (const f of entries) {
    if (!/\.md$/.test(f)) continue;
    if (f === 'README.md') continue;
    const unitId = f.replace(/\.md$/, '');
    const unitFilePath = safeJoin(cwd, join('aidlc-docs/inception/units', f));
    const ext = extractUnitPath(unitFilePath);
    if (ext.error) continue; // malformed unit description — skip silently
    // T-06-04-01: BL-01 path validation BEFORE any cross-branch read uses unitPath.
    const v = validateUnitPath(ext.value);
    if (v.error) continue; // unsafe path — skip
    units.push({ unitId, unitPath: ext.value, descriptionFile: f });
  }
  // Stable order: sort by unitId for deterministic dashboard render.
  units.sort((a, b) => a.unitId.localeCompare(b.unitId));
  return units;
}

// ---------------------------------------------------------------------------
// readUnitState (D-97) — cross-branch read via `git show`.
// Falls back: live branch → archive ref → NO_BRANCH.
// ---------------------------------------------------------------------------

export function readUnitState(cwd, { unitId, unitPath }) {
  const refResult = resolveUnitRef(cwd, unitId);
  if (refResult.error === 'NO_REF') {
    return { kind: 'NO_BRANCH' };
  }
  if (refResult.error) {
    return { kind: 'CORRUPT', error: refResult.error };
  }
  if (refResult.archived) {
    return {
      kind: 'RELEASED',
      ref: refResult.ref,
      archiveTimestamp: refResult.archiveTimestamp,
      allArchives: refResult.allArchives,
    };
  }
  // Live branch — try construction state first, fall back to inception state.
  const constructionPath = `${unitPath}/.ai-dlc-bootstrap/construction/orchestrator-state.json`;
  let r = showFromRef(cwd, refResult.ref, constructionPath);
  if (r.error === 'PATH_MISSING') {
    const inceptionPath = `${unitPath}/.ai-dlc-bootstrap/inception/orchestrator-state.json`;
    r = showFromRef(cwd, refResult.ref, inceptionPath);
  }
  if (r.error === 'PATH_MISSING') {
    return { kind: 'NO_STATE', ref: refResult.ref };
  }
  if (r.error) {
    return { kind: 'CORRUPT', ref: refResult.ref, error: r.error };
  }
  try {
    const state = JSON.parse(r.stdout);
    return {
      kind: 'OK',
      ref: refResult.ref,
      state,
      currentStage: state.current_stage,
      gateId: state.last_envelope?.gate_id ?? null,
      lastEnvelope: state.last_envelope ?? null,
    };
  } catch (e) {
    return { kind: 'PARSE_ERROR', ref: refResult.ref, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// classifyStage — unit state → {design, code, test, status}.
// ---------------------------------------------------------------------------

export function classifyStage(unitState) {
  if (!unitState) {
    return { design: '?', code: '?', test: '?', status: 'UNKNOWN' };
  }
  if (unitState.kind === 'RELEASED') {
    return {
      design: 'done',
      code: 'done',
      test: 'done',
      status: `RELEASED ${unitState.archiveTimestamp}`,
    };
  }
  if (unitState.kind === 'NO_BRANCH') {
    return { design: '-', code: '-', test: '-', status: 'BRANCH_MISSING' };
  }
  if (unitState.kind === 'NO_STATE') {
    return { design: '-', code: '-', test: '-', status: 'PENDING' };
  }
  if (unitState.kind === 'CORRUPT' || unitState.kind === 'PARSE_ERROR') {
    return { design: '?', code: '?', test: '?', status: `ERROR: ${unitState.error}` };
  }
  // OK kind.
  const triple = STAGE_TO_TRIPLE[unitState.currentStage] ?? { design: '?', code: '?', test: '?' };
  // Cycle-complete: STAGE_COMPLETE on the final stage with next_stage=null.
  if (
    unitState.lastEnvelope?.status === 'STAGE_COMPLETE'
    && unitState.lastEnvelope?.next_stage === null
    && unitState.currentStage === 'build-and-test'
  ) {
    return { design: 'done', code: 'done', test: 'done', status: 'COMPLETE' };
  }
  return { ...triple, status: unitState.currentStage ?? 'UNKNOWN' };
}

// ---------------------------------------------------------------------------
// readDependencies — best-effort parse of unit-of-work-dependency.md.
// ---------------------------------------------------------------------------

export function readDependencies(cwd, unitIds) {
  const deps = new Map();
  for (const id of unitIds) deps.set(id, { blockedBy: [] });
  let depPath;
  try {
    depPath = safeJoin(cwd, 'aidlc-docs/inception/application-design/unit-of-work-dependency.md');
  } catch {
    return deps;
  }
  if (!existsSync(depPath)) return deps;
  let text;
  try {
    text = readFileSync(depPath, 'utf8');
  } catch {
    return deps;
  }
  try {
    parseDependencies(text, unitIds, deps);
  } catch {
    // Graceful: malformed dep file → empty deps.
  }
  return deps;
}

// ---------------------------------------------------------------------------
// parseDependencies — multi-format parser (plan 06-09 Gap 3).
// Pass 1: canonical AI-DLC matrix-table form (`| From \ To | <unit> | <unit> |`).
//         Cells: `—` / empty / `none|None|NONE` mean NO edge; everything else
//         (including POC B[id]/R[id]/D[id]-annotated cells) means edge.
// Pass 2: English-prose fallback `<unit> depends on <a>, <b>` (preserved).
// ---------------------------------------------------------------------------

export function parseDependencies(text, unitIds, deps) {
  // Pass 1: canonical matrix-table form. If a `From \ To` header is found, all
  // edges from THAT table are applied (including B/R/D-annotated cells).
  const matrixApplied = parseMatrixTableDependencies(text, unitIds, deps);
  if (matrixApplied) return;
  // Pass 2: English-prose fallback (existing behavior — preserved for
  // hand-authored dependency files).
  parseEnglishProseDependencies(text, unitIds, deps);
}

function parseMatrixTableDependencies(text, unitIds, deps) {
  const lines = text.split('\n');
  // Find header row: `| From \ To | <col-1> | <col-2> | ... |` (allow whitespace
  // around the backslash; allow other layouts of the header text).
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\|\s*From\s*\\?\s*To\s*\|/i.test(lines[i])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return false;
  const headerCells = splitMarkdownTableRow(lines[headerIdx]);
  // First cell is "From \ To"; remaining cells are column unit-ids.
  const colUnits = headerCells.slice(1).map(stripBackticks).map((s) => s.trim());
  // Skip separator row (|---|---|).
  let row = headerIdx + 1;
  if (row < lines.length && /^\s*\|\s*-+/.test(lines[row])) row++;
  // Iterate body rows until we hit a non-table line.
  let appliedAny = false;
  while (row < lines.length) {
    const l = lines[row];
    if (!/^\s*\|/.test(l)) break;
    const cells = splitMarkdownTableRow(l);
    if (cells.length < 2) {
      row++;
      continue;
    }
    const fromUnit = stripBackticks(cells[0].trim());
    if (!unitIds.includes(fromUnit)) {
      row++;
      continue;
    }
    for (let c = 1; c < cells.length && c - 1 < colUnits.length; c++) {
      const cellRaw = cells[c].trim();
      const toUnit = colUnits[c - 1];
      if (!unitIds.includes(toUnit)) continue;
      if (toUnit === fromUnit) continue;
      if (isNoEdgeCell(cellRaw)) continue;
      // Edge: fromUnit depends on toUnit (matrix is "From \ To" = from-row depends on to-column).
      const cur = deps.get(fromUnit) ?? { blockedBy: [] };
      if (!cur.blockedBy.includes(toUnit)) cur.blockedBy.push(toUnit);
      cur.blockedBy.sort();
      deps.set(fromUnit, cur);
      appliedAny = true;
    }
    row++;
  }
  // Treat any non-empty matrix table as "applied" — even if every row had only
  // no-edge cells (em-dash/none/empty), the matrix IS the source of truth and
  // we MUST NOT then run the English-prose fallback (which could double-count).
  return true;
}

function parseEnglishProseDependencies(text, unitIds, deps) {
  // PRESERVED from pre-plan-06-09 implementation.
  const lines = text.split('\n');
  for (const line of lines) {
    for (const unitId of unitIds) {
      const m1 = line.match(new RegExp(`\\b${escapeRegex(unitId)}\\b\\s+depends\\s+on\\s+(.+)`, 'i'));
      if (m1) {
        const others = m1[1]
          .split(/[,\s]+/)
          .map((s) => s.replace(/[^A-Za-z0-9._-]/g, ''))
          .filter((s) => s && s !== unitId && unitIds.includes(s));
        const cur = deps.get(unitId) ?? { blockedBy: [] };
        for (const o of others) {
          if (!cur.blockedBy.includes(o)) cur.blockedBy.push(o);
        }
        deps.set(unitId, cur);
      }
    }
  }
}

function splitMarkdownTableRow(line) {
  // Strip leading/trailing pipes then split. Trim each cell.
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((s) => s.trim());
}

function stripBackticks(s) {
  return s.replace(/`/g, '');
}

function isNoEdgeCell(s) {
  if (!s) return true;
  const t = s.trim();
  if (t === '' || t === '—' || t === '-') return true;
  if (/^none$/i.test(t)) return true;
  return false;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// computeBatches (plan 06-09) — Kahn's-algorithm topological grouping.
// Wave 1 = units with no blockers; Wave N = blockers all in Waves <N.
// Cycles surface non-fatally via { cycleBroken: unitId[] }.
// ---------------------------------------------------------------------------

export function computeBatches(unitIds, dependencies) {
  const remaining = new Set(unitIds);
  const placed = new Set();
  const waves = [];
  // Safety cap: any cycle is detected by `wave.length === 0` after one pass,
  // but the cap defends against pathological dependency Maps.
  let safety = unitIds.length + 2;
  while (remaining.size > 0 && safety-- > 0) {
    const wave = [];
    for (const uid of remaining) {
      const blockers = (dependencies.get(uid) ?? { blockedBy: [] }).blockedBy;
      // Unit is ready if all blockers are already placed in earlier waves OR
      // the blocker isn't a known unit (hand-authored typo — silently skip).
      const ready = blockers.every((b) => placed.has(b) || !unitIds.includes(b));
      if (ready) wave.push(uid);
    }
    if (wave.length === 0) {
      return { waves, cycleBroken: [...remaining].sort() };
    }
    wave.sort();
    waves.push(wave);
    for (const u of wave) {
      placed.add(u);
      remaining.delete(u);
    }
  }
  return { waves, cycleBroken: [...remaining].sort() };
}

// ---------------------------------------------------------------------------
// renderMarkdownTable (plan 06-09) — column-aligned markdown table.
// Cells padded to max width per column; separator dashes track widths.
// ---------------------------------------------------------------------------

export function renderMarkdownTable(headers, rows) {
  const colCount = headers.length;
  const widths = headers.map((h) => String(h ?? '').length);
  for (const row of rows) {
    for (let i = 0; i < colCount; i++) {
      const txt = row[i] == null ? '' : String(row[i]);
      if (txt.length > widths[i]) widths[i] = txt.length;
    }
  }
  const fmtRow = (cells) =>
    '| ' + cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join(' | ') + ' |';
  const sep = '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|';
  const out = [fmtRow(headers), sep];
  for (const row of rows) out.push(fmtRow(row));
  return out;
}

// ---------------------------------------------------------------------------
// derivePhaseStatus (plan 06-09) — POC-style DONE/PARTIAL/READY/BLOCKED + nextPhase.
//
// Precedence (when multiple conditions hold):
//   allDone               → DONE
//   any phaseBlockers     → BLOCKED   ← OUTRANKS PARTIAL
//   anyDone || anyWip     → PARTIAL
//   else                  → READY
//
// Rationale: a phase where some units are done but at least one OTHER unit is
// blocked-on-not-yet-done dependency cannot complete until the blocker resolves,
// so reporting PARTIAL would mislead engineers about whether work can proceed.
// BLOCKED is the more actionable signal.
// ---------------------------------------------------------------------------

export function derivePhaseStatus(units, classifications, dependencies) {
  const phases = {};
  const blockers = {};
  for (const phaseKey of ['design', 'code', 'test']) {
    const colName = phaseKey.charAt(0).toUpperCase() + phaseKey.slice(1);
    const triples = units.map((u) => classifications.get(u.unitId)).filter(Boolean);
    const allDone = triples.length > 0 && triples.every((t) => t[phaseKey] === 'done');
    const anyDone = triples.some((t) => t[phaseKey] === 'done');
    const anyWip = triples.some((t) => t[phaseKey] === 'wip');
    // Compute BLOCKED: any unit in this phase column with `-` whose blockers'
    // SAME-phase column != 'done'.
    const phaseBlockers = new Set();
    for (const u of units) {
      const c = classifications.get(u.unitId);
      if (!c || c[phaseKey] !== '-') continue;
      const dep = dependencies.get(u.unitId);
      if (!dep) continue;
      for (const b of dep.blockedBy) {
        const bc = classifications.get(b);
        if (!bc || bc[phaseKey] !== 'done') phaseBlockers.add(b);
      }
    }
    // PRECEDENCE: BLOCKED outranks PARTIAL. Order matters here.
    if (allDone) {
      phases[colName] = 'DONE';
    } else if (phaseBlockers.size > 0) {
      phases[colName] = 'BLOCKED';
    } else if (anyDone || anyWip) {
      phases[colName] = 'PARTIAL';
    } else {
      phases[colName] = 'READY';
    }
    if (phaseBlockers.size > 0) blockers[colName] = [...phaseBlockers].sort();
  }
  // First phase that's READY or PARTIAL (in execution order Design → Code → Test).
  let nextPhase = null;
  for (const colName of ['Design', 'Code', 'Test']) {
    if (phases[colName] === 'READY' || phases[colName] === 'PARTIAL') {
      nextPhase = colName;
      break;
    }
  }
  return { phases, nextPhase, blockers };
}

// ---------------------------------------------------------------------------
// aggregateCounts — done / wip / remaining / released.
// ---------------------------------------------------------------------------

export function aggregateCounts(classifications) {
  let done = 0;
  let wip = 0;
  let remaining = 0;
  let released = 0;
  for (const c of classifications.values()) {
    if (typeof c.status === 'string' && c.status.startsWith('RELEASED')) {
      released += 1;
      done += 1;
      continue;
    }
    if (c.status === 'COMPLETE') {
      done += 1;
      continue;
    }
    const triple = [c.design, c.code, c.test];
    if (triple.every((t) => t === 'done')) {
      done += 1;
    } else if (triple.some((t) => t === 'wip')) {
      wip += 1;
    } else {
      remaining += 1;
    }
  }
  return { done, wip, remaining, released };
}

// ---------------------------------------------------------------------------
// discoverProjectName — read intent.md H1 if available; else basename(cwd).
// ---------------------------------------------------------------------------

export function discoverProjectName(cwd) {
  let intentPath;
  try {
    intentPath = safeJoin(cwd, 'aidlc-docs/inception/intent/intent.md');
  } catch {
    return basename(cwd);
  }
  if (!existsSync(intentPath)) return basename(cwd);
  try {
    const text = readFileSync(intentPath, 'utf8');
    const m = text.match(/^#\s+(.+?)\s*$/m);
    if (m) return m[1].trim();
  } catch {
    // ignore
  }
  return basename(cwd);
}

// ---------------------------------------------------------------------------
// renderDashboard — POC-parity plain-text output (plan 06-09 Gap 3).
//
// Output order:
//   1. `=== <project> — N units ===` header
//   2. counts line
//   3. `Phase Summary:` heading + aligned table (Phase / Status / Units)
//      with DONE/PARTIAL/READY/BLOCKED tokens + `<< next` suffix on first
//      READY/PARTIAL phase. The suffix is part of the row data BEFORE
//      renderMarkdownTable so the column-width pre-pass includes it.
//   4. `Parallel Batches / Execution Waves:` heading + aligned table
//      (Wave / Units / Blocks-on) — one row per Kahn wave; cycleBroken
//      surfaces as a `* Cycle-broken:` line.
//   5. Per-phase blocks (`--- Phase: Design/Code/Test ---`) with parallelism
//      annotation + `Blocked by:` line for BLOCKED phases + per-unit table.
//   6. `--- Units ---` heading + per-unit rows (PRESERVED format).
//   7. (PROGRESS_OK is appended by progress() — NOT here.)
// ---------------------------------------------------------------------------

export function renderDashboard({
  projectName,
  units,
  classifications,
  dependencies,
  counts,
  traceMode,
}) {
  const lines = [];
  lines.push(`=== ${projectName} — ${units.length} units ===`);
  lines.push(
    `done: ${counts.done}  wip: ${counts.wip}  remaining: ${counts.remaining}  released: ${counts.released}`,
  );
  lines.push('');

  // -----------------------------------------------------------------
  // (3) Phase Summary table.
  // -----------------------------------------------------------------
  lines.push('Phase Summary:');
  const buckets = bucketByPhase(units, classifications);
  const { phases, nextPhase, blockers } = derivePhaseStatus(units, classifications, dependencies);
  const statusForPhase = (phaseName) => {
    const base = phases[phaseName] ?? '-';
    return phaseName === nextPhase ? `${base} << next` : base;
  };
  // Released/Pending bucket counts → render as count or `-`.
  const cellForBucket = (phase) => {
    const ids = buckets[phase] ?? [];
    return ids.length > 0 ? String(ids.length) : '-';
  };
  const summaryRows = [
    ['Design', statusForPhase('Design'), (buckets.Design ?? []).join(', ')],
    ['Code', statusForPhase('Code'), (buckets.Code ?? []).join(', ')],
    ['Test', statusForPhase('Test'), (buckets.Test ?? []).join(', ')],
    ['Released', cellForBucket('Released'), (buckets.Released ?? []).join(', ')],
    ['Pending', cellForBucket('Pending'), (buckets.Pending ?? []).join(', ')],
  ];
  lines.push(...renderMarkdownTable(['Phase', 'Status', 'Units'], summaryRows));
  lines.push('');

  // -----------------------------------------------------------------
  // (4) Parallel Batches / Execution Waves table.
  // -----------------------------------------------------------------
  lines.push('Parallel Batches / Execution Waves:');
  const unitIds = units.map((u) => u.unitId);
  const { waves, cycleBroken } = computeBatches(unitIds, dependencies);
  const batchRows = waves.map((wave, idx) => {
    // Blocks-on = aggregated unique blockers from earlier waves (sorted).
    const blocksOn = new Set();
    for (const uid of wave) {
      const blockedBy = (dependencies.get(uid) ?? { blockedBy: [] }).blockedBy;
      for (const b of blockedBy) {
        if (unitIds.includes(b)) blocksOn.add(b);
      }
    }
    const blocksOnStr = blocksOn.size > 0 ? [...blocksOn].sort().join(', ') : '(none)';
    return [String(idx + 1), wave.join(', '), blocksOnStr];
  });
  if (batchRows.length === 0) {
    // No units → emit a single placeholder row so the table is well-formed.
    batchRows.push(['-', '(no units)', '(none)']);
  }
  lines.push(...renderMarkdownTable(['Wave', 'Units', 'Blocks-on'], batchRows));
  if (cycleBroken.length > 0) {
    lines.push(`* Cycle-broken: ${cycleBroken.join(', ')}`);
  }
  lines.push('');

  // -----------------------------------------------------------------
  // (5) Per-phase blocks.
  // -----------------------------------------------------------------
  for (const phaseName of ['Design', 'Code', 'Test']) {
    const phaseKey = phaseName.toLowerCase();
    const status = phases[phaseName];
    lines.push(`--- Phase: ${phaseName} ---`);
    // Parallelism annotation.
    let annotation;
    if (status === 'DONE') {
      annotation = 'Parallelism: complete';
    } else if (status === 'BLOCKED') {
      const ids = blockers[phaseName] ?? [];
      annotation = `Parallelism: blocked-by ${ids.join(', ')}`;
    } else if (status === 'READY') {
      // No unit started this phase; check whether any unit has blockers.
      // If no blockers, all units could run in parallel.
      const anyBlocker = units.some((u) => {
        const dep = dependencies.get(u.unitId);
        return dep && dep.blockedBy.length > 0;
      });
      annotation = anyBlocker
        ? 'Mixed: see per-unit rows'
        : `All parallel — up to ${units.length} engineers`;
    } else {
      // PARTIAL — derive from current statuses.
      annotation = 'Mixed: see per-unit rows';
    }
    lines.push(annotation);
    if (status === 'BLOCKED') {
      const ids = blockers[phaseName] ?? [];
      lines.push(`Blocked by: ${ids.join(', ')}`);
    }
    // Per-unit table.
    const phaseRows = units.map((u) => {
      const c = classifications.get(u.unitId) || { design: '?', code: '?', test: '?', status: 'UNKNOWN' };
      let unitStatus = c.status;
      // For BLOCKED phase, annotate the row's status cell when this unit is the one blocked.
      if (c[phaseKey] === '-') {
        const dep = dependencies.get(u.unitId);
        if (dep && dep.blockedBy.length > 0) {
          const unsatisfied = dep.blockedBy.filter((b) => {
            const bc = classifications.get(b);
            return !bc || bc[phaseKey] !== 'done';
          });
          if (unsatisfied.length > 0) {
            unitStatus = `(BLOCKED by ${unsatisfied.join(', ')})`;
          }
        }
      }
      return [u.unitId, c.design, c.code, c.test, unitStatus];
    });
    lines.push(...renderMarkdownTable(['Unit', 'Design', 'Code', 'Test', 'Status'], phaseRows));
    lines.push('');
  }

  // -----------------------------------------------------------------
  // (6) Per-unit rows — PRESERVED for backward-compat.
  // -----------------------------------------------------------------
  lines.push('--- Units ---');
  for (const u of units) {
    const c = classifications.get(u.unitId);
    let row = `${u.unitId}: Design ${c.design} | Code ${c.code} | Test ${c.test}   ${c.status}`;
    const dep = dependencies.get(u.unitId);
    if (dep && dep.blockedBy.length > 0) {
      row += `  (BLOCKED by: ${dep.blockedBy.join(', ')})`;
    }
    lines.push(row);
  }

  if (traceMode) {
    lines.push('');
    lines.push('--- Trace ---');
    lines.push('Cross-branch state read via `git show <unit-branch>:<path>` (D-97).');
    lines.push('Unit roster discovered via aidlc-docs/inception/units/*.md (D-98).');
  }

  return lines.join('\n');
}

function bucketByPhase(units, classifications) {
  const buckets = { Design: [], Code: [], Test: [], Released: [], Pending: [] };
  for (const u of units) {
    const c = classifications.get(u.unitId);
    if (typeof c.status === 'string' && c.status.startsWith('RELEASED')) {
      buckets.Released.push(u.unitId);
    } else if (c.test === 'wip' || c.test === 'done') {
      buckets.Test.push(u.unitId);
    } else if (c.code === 'wip' || c.code === 'done') {
      buckets.Code.push(u.unitId);
    } else if (c.design === 'wip' || c.design === 'done') {
      buckets.Design.push(u.unitId);
    } else {
      buckets.Pending.push(u.unitId);
    }
  }
  return buckets;
}
