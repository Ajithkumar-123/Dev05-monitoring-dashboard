// assets/scripts/lib/audit-review.js — AGNT-03 / Phase 6 plan 05.
// D-100: read all units' aidlc-docs/audit.md + all *-questions.md across all units.
// D-101: write consolidated log at .ai-dlc-bootstrap/audit-improvements/<ISO-timestamp>.md.
// D-103: cycle-since-last-run cursor — most recent prior log file is the cursor; null cursor → full history.
// D-104: idempotent — re-run on same input window produces fresh <ts>.md with substantially same content.
// D-107: file-based handoff — staging directory at .ai-dlc-bootstrap/audit-improvements/.staging/<ts>/.
// 06-RESEARCH §Pitfall 11: collect cleans up stale .staging/* dirs >24h old (self-healing).
import { existsSync, readdirSync, readFileSync, writeFileSync, renameSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { showFromRef, lsTreeFromRef, resolveUnitRef, currentBranch } from './git-probes.js';
import { extractUnitPath } from './extract-unit-path.js';
import { validateUnitPath } from './validate-unit-path.js';
import { safeJoin } from './paths.js';
import { isoTimestampForFilename } from './escalate-fix.js';
import { EXIT_OK, EXIT_DOMAIN, EXIT_USAGE, EXIT_INTERNAL } from './report.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Atomic write — writeFileSync to <path>.tmp then renameSync to <path>.
 * Pattern from `escalation-marker.js#atomicWriteJson` (lines 16-21).
 * Guards against partial-write corruption mid-collect.
 */
function atomicWrite(path, content) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

/**
 * Discover the cursor for cycle-since-last-run mode (D-103).
 * Returns `{ cursor, priorPath }` where:
 *   - cursor: ISO 8601 timestamp string of latest prior log, OR null (full-history)
 *   - priorPath: absolute path to that log file, OR null
 *
 * Cursor format: filename minus `.md` extension. Helper-stamped filenames use
 * `:`→`-` substitution (isoTimestampForFilename), so the cursor as stored in
 * filename is `2026-04-15T00-00-00.000Z`. Comparison against audit-block
 * `Timestamp: 2026-04-15T00:00:00.000Z` (canonical ISO) is done via byte-wise
 * lex compare BUT we normalize by reverting `:`s in the cursor before compare.
 */
function findPriorAuditLog(cwd) {
  const dir = safeJoin(cwd, '.ai-dlc-bootstrap/audit-improvements');
  if (!existsSync(dir)) return { cursor: null, priorPath: null };
  const candidates = readdirSync(dir)
    .filter((n) => /^[\d.\-TZ:]+\.md$/.test(n))
    .sort(); // ISO 8601 lex-sort = chronological
  if (candidates.length === 0) return { cursor: null, priorPath: null };
  const latest = candidates[candidates.length - 1];
  const priorPath = join(dir, latest);
  // Cursor is the filename-stem (no .md). For comparison against canonical
  // ISO timestamps in audit blocks, callers convert dashes back to colons.
  const cursor = latest.replace(/\.md$/, '');
  return { cursor, priorPath };
}

/**
 * Convert a filename-safe ISO timestamp (`:` → `-`) back to canonical ISO.
 * Filename:   2026-04-15T00-00-00.000Z
 * Canonical:  2026-04-15T00:00:00.000Z
 *
 * Only the time portion (after `T`) needs the back-conversion, since
 * `-`s in the date portion are part of the canonical form.
 */
function cursorToCanonicalISO(cursor) {
  if (!cursor) return null;
  // Match YYYY-MM-DDTHH-MM-SS.sssZ and replace the time HH-MM-SS with HH:MM:SS.
  return cursor.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
}

/**
 * Slice an audit.md text by `## ` H2 boundaries, returning blocks whose
 * Timestamp tag is >= sinceISO. If sinceISO is null, returns the entire text
 * (full-history mode per D-103).
 *
 * Per 06-RESEARCH.md §Code Examples lines 743-775. Walks file by `^## `
 * boundaries; for each block, regex-matches `Timestamp[*\s:]+(<ISO>)`; includes
 * if `>= sinceISO` OR if `sinceISO === null`. Timestamp-less blocks (rare)
 * are included in any window (defensive).
 */
function sliceAuditByTimestamp(auditText, sinceISO) {
  if (!auditText) return '';
  const lines = auditText.split('\n');
  const blocks = [];
  let current = null;
  for (const line of lines) {
    if (/^## /.test(line)) {
      if (current) blocks.push(current);
      current = { content: [line] };
    } else if (current) {
      current.content.push(line);
    } else {
      // Pre-first-block content (e.g., `# Audit log` H1 + frontmatter) is dropped.
      // The bundle reconstructs the file from H2 blocks only.
    }
  }
  if (current) blocks.push(current);
  const TIMESTAMP_RE = /Timestamp[*\s:]+(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/;
  const filtered = blocks.filter((b) => {
    if (!sinceISO) return true; // null cursor → full history
    const text = b.content.join('\n');
    const m = text.match(TIMESTAMP_RE);
    if (!m) return true; // timestamp-less blocks included
    return m[1] >= sinceISO;
  });
  if (filtered.length === 0) return '';
  return filtered.map((b) => b.content.join('\n')).join('\n');
}

/**
 * Discover the unit roster from `aidlc-docs/inception/units/*.md` (D-98 — same
 * source-of-truth as progress.js). Returns array of { unitId, unitPath, descPath }.
 * Filters out units whose Directory cell is invalid.
 */
function discoverUnitRoster(cwd) {
  const unitsDir = safeJoin(cwd, 'aidlc-docs/inception/units');
  if (!existsSync(unitsDir)) return [];
  const out = [];
  for (const name of readdirSync(unitsDir)) {
    if (!name.endsWith('.md')) continue;
    const unitId = name.replace(/\.md$/, '');
    const idCheck = validateUnitPath(unitId);
    if (idCheck.error) continue;
    const descPath = join(unitsDir, name);
    const ext = extractUnitPath(descPath);
    if (ext.error) continue;
    const v = validateUnitPath(ext.value);
    if (v.error) continue;
    out.push({ unitId, unitPath: ext.value, descPath });
  }
  // Stable sort by unitId so bundle output is deterministic across runs (D-104).
  out.sort((a, b) => a.unitId.localeCompare(b.unitId));
  return out;
}

/**
 * Self-healing stale-staging cleanup (06-RESEARCH §Pitfall 11). Removes any
 * `.ai-dlc-bootstrap/audit-improvements/.staging/<ts>/` directory whose mtime
 * is older than 24 hours (engineer killed the slash-command mid-run).
 */
function cleanStaleStaging(cwd) {
  const stagingRoot = safeJoin(cwd, '.ai-dlc-bootstrap/audit-improvements/.staging');
  if (!existsSync(stagingRoot)) return;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const name of readdirSync(stagingRoot)) {
    const full = join(stagingRoot, name);
    let st;
    try { st = statSync(full); }
    catch { continue; }
    if (!st.isDirectory()) continue;
    if (st.mtimeMs < cutoff) {
      try { rmSync(full, { recursive: true, force: true }); }
      catch { /* best-effort */ }
    }
  }
}

/**
 * Enumerate `*-questions.md` files for a unit on its current ref via cross-branch
 * git ls-tree. Returns `[{ ref, dirRel, name, content }]`. Cursor filtering on
 * cross-branch reads is best-effort: `git show` does not surface mtime, so all
 * matching files are included and the LLM filters by reading the embedded
 * Timestamp blocks. `lsTreeFromRef` returns `{ entries: string[] }` on success.
 */
function enumerateQuestionFilesCrossBranch(cwd, ref, unitPath) {
  const dirs = [
    `${unitPath}/aidlc-docs/construction/change-requests`,
    `${unitPath}/aidlc-docs/construction/redesign`,
    `${unitPath}/aidlc-docs/construction/sync`,
  ];
  const out = [];
  for (const dirRel of dirs) {
    const ls = lsTreeFromRef(cwd, ref, dirRel);
    if (ls.error) continue;
    for (const name of ls.entries) {
      if (!/-questions\.md$/.test(name)) continue;
      const fileRef = `${dirRel}/${name}`;
      const r = showFromRef(cwd, ref, fileRef);
      if (r.error) continue;
      out.push({ ref, dirRel, name, content: r.stdout });
    }
  }
  return out;
}

/**
 * Enumerate working-tree `escalate-fix-N-questions.md` files at project-root
 * `aidlc-docs/inception/`. Cursor filter: include if mtimeMs >= cursorMs OR
 * cursorMs is null (first-run / null cursor).
 */
function enumerateProjectRootEscalateQuestionFiles(cwd, cursorMs) {
  const inceptionDir = safeJoin(cwd, 'aidlc-docs/inception');
  if (!existsSync(inceptionDir)) return [];
  const out = [];
  for (const name of readdirSync(inceptionDir)) {
    if (!/^escalate-fix-\d+-questions\.md$/.test(name)) continue;
    const full = join(inceptionDir, name);
    let st;
    try { st = statSync(full); }
    catch { continue; }
    if (cursorMs !== null && st.mtimeMs < cursorMs) continue;
    let content = '';
    try { content = readFileSync(full, 'utf8'); }
    catch { continue; }
    out.push({ ref: 'main', dirRel: 'aidlc-docs/inception', name, content });
  }
  return out;
}

/**
 * Walk all prior `.ai-dlc-bootstrap/audit-improvements/*.md` log files and
 * extract one-line entries per Suggestion target (D-104 dedup hint). Format:
 *
 *   <log-file-name>: <target-path>
 *
 * One line per `### Suggestion N` whose `**Target:**` field is captured.
 */
function buildPriorSuggestionsIndex(cwd) {
  const dir = safeJoin(cwd, '.ai-dlc-bootstrap/audit-improvements');
  if (!existsSync(dir)) return '# Prior Suggestions Index\n\n(no prior logs)\n';
  const logs = readdirSync(dir).filter((n) => /\.md$/.test(n)).sort();
  if (logs.length === 0) return '# Prior Suggestions Index\n\n(no prior logs)\n';
  const lines = ['# Prior Suggestions Index\n'];
  for (const name of logs) {
    let text;
    try { text = readFileSync(join(dir, name), 'utf8'); }
    catch { continue; }
    // Find each `### Suggestion N` section and capture the **Target:** field.
    const re = /^###\s+Suggestion\s+\d+[^\n]*\n(?:[^#][^\n]*\n)*?-\s*\*\*Target:\*\*\s*([^\n]+)/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
      lines.push(`${name}: ${m[1].trim()}`);
    }
  }
  if (lines.length === 1) lines.push('(no prior suggestion targets)');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

/**
 * auditReviewCollect — Phase 1 (collect) of /aidlc-audit-review.
 *
 * (1) Branch assertion: must run on main (D-100 / project-scope).
 * (2) Discover cursor (D-103) — emits `# CURSOR_NULL` for first-run full-history.
 * (3) Self-heal stale staging dirs (>24h old; Pitfall 11).
 * (4) Allocate fresh staging dir + final output path.
 * (5) Discover unit roster from aidlc-docs/inception/units/*.md (D-98).
 * (6) Build audit-bundle.md from cross-branch reads (per-unit `aidlc-docs/audit.md`)
 *     + project-level audit.md (optional per Pitfall 10 — emits AUDIT_MAIN_ABSENT
 *     diagnostic when missing). Slice each by Timestamp >= cursor.
 * (7) Build question-files-bundle.md from cross-branch ls-tree + show across
 *     change-requests/redesign/sync dirs per unit + project-root escalate-fix-*-questions.md.
 * (8) Build prior-suggestions-index.md (D-104 dedup hint).
 * (9) Emit `COLLECT_OK <staging-dir> <output-path>` terminal stdout.
 *
 * All bundle writes use atomic write (writeFileSync .tmp + renameSync). Read-only
 * against evidence sources (no audit.md / questions.md mutation).
 */
export async function auditReviewCollect({ positional, flags, cwd }) {
  // (1) Branch assertion — must be on main.
  let branchInfo;
  try { branchInfo = currentBranch(cwd); }
  catch (e) { return { exitCode: EXIT_INTERNAL, stderr: `${e.message}\n` }; }
  if (branchInfo.detached) {
    return { exitCode: EXIT_DOMAIN, stderr: 'Cannot run /aidlc-audit-review from detached HEAD. Checkout main first.\n' };
  }
  if (branchInfo.branch !== 'main') {
    return { exitCode: EXIT_DOMAIN, stderr: `Cannot run /aidlc-audit-review from branch ${branchInfo.branch}. Checkout main first.\n` };
  }

  // (2) Cursor discovery (D-103).
  const { cursor, priorPath } = findPriorAuditLog(cwd);
  const cursorISO = cursorToCanonicalISO(cursor);
  let cursorMs = null;
  if (cursor) {
    const parsed = Date.parse(cursorISO);
    if (Number.isFinite(parsed)) cursorMs = parsed;
  }

  // (3) Self-healing stale-staging cleanup (Pitfall 11).
  cleanStaleStaging(cwd);

  // (4) Allocate fresh staging dir + final output path.
  const ts = isoTimestampForFilename();
  const stagingDir = safeJoin(cwd, join('.ai-dlc-bootstrap/audit-improvements/.staging', ts));
  mkdirSync(stagingDir, { recursive: true });
  const outputDir = safeJoin(cwd, '.ai-dlc-bootstrap/audit-improvements');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${ts}.md`);

  // (5) Discover unit roster (D-98).
  const units = discoverUnitRoster(cwd);

  // (6) Build audit-bundle.md.
  const auditBundleParts = [];
  const diagnostics = [];

  // Project-level audit.md (Pitfall 10 — OPTIONAL).
  const projectAuditPath = safeJoin(cwd, 'aidlc-docs/audit.md');
  if (existsSync(projectAuditPath)) {
    let projectText = '';
    try { projectText = readFileSync(projectAuditPath, 'utf8'); }
    catch { projectText = ''; }
    const sliced = sliceAuditByTimestamp(projectText, cursorISO);
    if (sliced.length > 0) {
      auditBundleParts.push(`\n## ===== Project audit.md (main) =====\n\n${sliced}`);
    }
  } else {
    diagnostics.push('# AUDIT_MAIN_ABSENT aidlc-docs/audit.md not present on main (Pitfall 10 — optional)');
  }

  // Per-unit audit.md (cross-branch read).
  for (const unit of units) {
    const refResult = resolveUnitRef(cwd, unit.unitId);
    if (refResult.error === 'NO_REF') {
      diagnostics.push(`# UNIT_NO_REF ${unit.unitId} has neither live nor archive ref`);
      continue;
    }
    if (refResult.error) {
      diagnostics.push(`# UNIT_GIT_FAILED ${unit.unitId}: ${refResult.error}`);
      continue;
    }
    const ref = refResult.ref;
    const auditRel = `${unit.unitPath}/aidlc-docs/audit.md`;
    const r = showFromRef(cwd, ref, auditRel);
    if (r.error === 'PATH_MISSING') continue; // unit hasn't written audit.md yet
    if (r.error === 'REF_MISSING') {
      diagnostics.push(`# UNIT_REF_MISSING ${unit.unitId} ref=${ref}`);
      continue;
    }
    if (r.error) {
      diagnostics.push(`# UNIT_AUDIT_READ_FAIL ${unit.unitId}: ${r.error}`);
      continue;
    }
    const sliced = sliceAuditByTimestamp(r.stdout, cursorISO);
    if (sliced.length > 0) {
      auditBundleParts.push(`\n## ===== Unit: ${unit.unitId} (ref: ${ref}) =====\n\n${sliced}`);
    }
  }

  // D-104 idempotency: bundle CONTENT must be byte-identical across re-runs on the
  // same input window. The current `<ts>` is intentionally OMITTED from the bundle
  // body — only Cursor + structural counts + diagnostics flow in. The fresh `<ts>`
  // is surfaced via the staging-dir path + COLLECT_OK marker, not embedded here.
  const auditBundleHeader = `# Audit Bundle\n\n` +
    `Cursor: ${cursorISO ?? 'null (full-history)'}\n` +
    `Units enumerated: ${units.length}\n` +
    (diagnostics.length > 0 ? `\n${diagnostics.join('\n')}\n` : '');
  const auditBundleContent = auditBundleHeader + auditBundleParts.join('\n');
  atomicWrite(join(stagingDir, 'audit-bundle.md'), auditBundleContent);

  // (7) Build question-files-bundle.md.
  const qfBundleParts = [];
  for (const unit of units) {
    const refResult = resolveUnitRef(cwd, unit.unitId);
    if (refResult.error) continue;
    const files = enumerateQuestionFilesCrossBranch(cwd, refResult.ref, unit.unitPath);
    for (const f of files) {
      qfBundleParts.push(
        `\n## ===== ${unit.unitId} | ${f.dirRel}/${f.name} (ref: ${f.ref}) =====\n\n${f.content}`,
      );
    }
  }
  // Project-root escalate-fix-N-questions.md (read from main working tree, mtime-filtered).
  const projectQFs = enumerateProjectRootEscalateQuestionFiles(cwd, cursorMs);
  for (const f of projectQFs) {
    qfBundleParts.push(
      `\n## ===== project | ${f.dirRel}/${f.name} (ref: ${f.ref}) =====\n\n${f.content}`,
    );
  }
  // D-104 idempotency: same as audit-bundle — no `<ts>` embedded; CONTENT is a
  // function of the input window (Cursor + cross-branch reads), not the run time.
  const qfBundleHeader = `# Question Files Bundle\n\n` +
    `Cursor: ${cursorISO ?? 'null (full-history)'}\n` +
    `Files enumerated: ${qfBundleParts.length}\n`;
  const qfBundleContent = qfBundleHeader + qfBundleParts.join('\n');
  atomicWrite(join(stagingDir, 'question-files-bundle.md'), qfBundleContent);

  // (8) Build prior-suggestions-index.md.
  const priorIndex = buildPriorSuggestionsIndex(cwd);
  atomicWrite(join(stagingDir, 'prior-suggestions-index.md'), priorIndex);

  // (9) Terminal stdout.
  const totalBundleBytes =
    Buffer.byteLength(auditBundleContent, 'utf8') +
    Buffer.byteLength(qfBundleContent, 'utf8') +
    Buffer.byteLength(priorIndex, 'utf8');
  const cursorLine = cursor ? `# CURSOR ${cursor}` : '# CURSOR_NULL';
  const stdout =
    `${cursorLine}\n` +
    `# UNIT_COUNT ${units.length}\n` +
    `# BUNDLE_BYTES ${totalBundleBytes}\n` +
    `COLLECT_OK ${stagingDir} ${outputPath}\n`;
  return { exitCode: EXIT_OK, stdout };
}

/**
 * auditReviewFinalize — Phase 3 (finalize) of /aidlc-audit-review.
 *
 * Verifies the output log file exists and is non-empty (Pitfall 4 analog),
 * then removes the staging directory. Idempotent: re-run on already-cleaned
 * staging dir returns OK with `(already-cleaned)` marker.
 *
 * Positional[0] = absolute staging-dir path (returned by collect via COLLECT_OK).
 */
export async function auditReviewFinalize({ positional, flags, cwd }) {
  const stagingDir = positional && positional[0];
  if (!stagingDir) {
    return { exitCode: EXIT_USAGE, stderr: 'Usage: audit-review-finalize <staging-dir>\n' };
  }

  // Idempotency: staging dir already cleaned → return OK with marker.
  if (!existsSync(stagingDir)) {
    return { exitCode: EXIT_OK, stdout: `FINALIZE_OK ${stagingDir} (already-cleaned)\n` };
  }

  // Derive output path from staging dir name (last segment is the timestamp).
  const ts = stagingDir.split('/').filter(Boolean).pop();
  const outputPath = safeJoin(cwd, join('.ai-dlc-bootstrap/audit-improvements', `${ts}.md`));

  // Pitfall 4 analog: verify output exists + non-empty BEFORE deleting staging.
  if (!existsSync(outputPath)) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `Output log missing at ${outputPath}; preserving staging dir for inspection.\n`,
    };
  }
  let stat;
  try { stat = statSync(outputPath); }
  catch (e) {
    return { exitCode: EXIT_INTERNAL, stderr: `Could not stat ${outputPath}: ${e.message}\n` };
  }
  if (stat.size === 0) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `Output log is zero-byte at ${outputPath}; preserving staging dir for inspection.\n`,
    };
  }

  // Cleanup
  try { rmSync(stagingDir, { recursive: true, force: true }); }
  catch (e) {
    return { exitCode: EXIT_INTERNAL, stderr: `Could not remove staging dir: ${e.message}\n` };
  }
  return { exitCode: EXIT_OK, stdout: `FINALIZE_OK ${outputPath}\n` };
}
