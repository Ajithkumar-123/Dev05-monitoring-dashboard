// assets/scripts/lib/preflight-escalate-fix.js — Phase A handler for /aidlc-escalate-fix.
// D-85: helper lives in ai-dlc-bootstrap layer (not vanilla AI-DLC). D-86: thin-orchestrator pattern.
// D-87: must be on main (inverted from D-22). D-88: writes aidlc-docs/inception/escalate-fix-N-questions.md.
// D-92: marker is read-only from unit branch via `git show` — helper never switches branches or writes to unit branch.
// Open Q6: most-recent-pending marker auto-select, with --marker N override. Open Q10: appends `## Escalate Fix — Question File` to root audit.md.
import { existsSync, readdirSync, readFileSync, writeFileSync, renameSync, mkdirSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { currentBranch } from './git-probes.js';
import { parseUnitArgs } from './parse-unit-args.js';
import { validateUnitPath } from './validate-unit-path.js';
import { extractUnitPath } from './extract-unit-path.js';
import { unitDescriptionPath, safeJoin } from './paths.js';
import { EXIT_OK, EXIT_DOMAIN, EXIT_USAGE, EXIT_INTERNAL } from './report.js';
import { writePersistedArg } from './persisted-arg.js';

// ---------------------------------------------------------------------------
// parseEscalateArgs — single-string D-77 parser with optional `--marker N` token.
// D-141/D-142 (Phase 07.1): signature pivoted to accept rawArgsString from process.env.AIDLC_ARGS.
// ---------------------------------------------------------------------------
export function parseEscalateArgs(rawArgsString) {
  // First, do single-string split per D-142 to peel off unitId.
  const base = parseUnitArgs(rawArgsString);
  if (base.error) return { error: base.error };
  if (!base.unitId) return { error: 'unit-id missing — usage: /aidlc-escalate-fix <unit-id> [--marker N] "<description>"' };
  // Then post-process the description for an optional leading `--marker N ` token.
  // Plan 05.3-07 (Universal Convention): description after `--marker N` is OPTIONAL —
  // engineer may invoke `/aidlc-escalate-fix alpha --marker 1` with no description.
  let markerOverride = null;
  let description = base.description;
  const m = description.match(/^--marker\s+(\S+)(?:\s+([\s\S]*))?$/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (!Number.isInteger(n) || n <= 0 || String(n) !== m[1]) {
      return { error: `--marker requires positive integer; got "${m[1]}"` };
    }
    markerOverride = n;
    description = m[2] ?? '';
  }
  // Strip surrounding quotes if engineer wrapped description in literal quotes (common).
  description = description.replace(/^"([\s\S]*)"$/, '$1').trim();
  return { unitId: base.unitId, markerOverride, description, error: null };
}

// ---------------------------------------------------------------------------
// Cross-branch marker reads — D-92 mandates `git show` (no branch switching).
// ---------------------------------------------------------------------------
function readMarkerFromUnitBranch(cwd, unitId, unitPath, markerName) {
  const refPath = `${unitId}:${unitPath}/.ai-dlc-bootstrap/escalations/${markerName}`;
  const r = spawnSync('git', ['show', refPath], { cwd, encoding: 'utf8', timeout: 5000 });
  if (r.status !== 0) {
    return { error: `git show ${refPath} failed: ${(r.stderr ?? '').trim() || `exit ${r.status}`}` };
  }
  try {
    return { marker: JSON.parse(r.stdout) };
  } catch (e) {
    return { error: `Marker at ${refPath} is not valid JSON: ${e.message}` };
  }
}

function listMarkersOnUnitBranch(cwd, unitId, unitPath) {
  const dirRef = `${unitId}:${unitPath}/.ai-dlc-bootstrap/escalations/`;
  const r = spawnSync('git', ['ls-tree', '--name-only', dirRef], { cwd, encoding: 'utf8', timeout: 5000 });
  if (r.status !== 0) {
    return { names: [], error: `No escalations directory on branch ${unitId} at ${unitPath}/.ai-dlc-bootstrap/escalations/.` };
  }
  const names = (r.stdout ?? '').trim().split('\n').filter((n) => /^escalation-\d+\.json$/.test(n));
  return { names };
}

// ---------------------------------------------------------------------------
// Phase A question-file helpers (Task 2).
// ---------------------------------------------------------------------------
function isoTimestamp() {
  return new Date().toISOString();
}

function detectQuestionFilePhase(cwd) {
  // Returns { phase: 'A_FIRST'|'A_PENDING'|'DISPATCH_READY', latestN, latestName? }
  //
  // - A_FIRST: no existing files. Write escalate-fix-1.
  // - A_PENDING: latest file exists, has at least one empty [Answer]: tag. Refuse to overwrite —
  //              engineer is mid-fill. escalate-fix will either dispatch (Q1+Q2 filled, Q3 empty
  //              by default) or emit PHASE_A_HALT (Q1 or Q2 empty).
  // - DISPATCH_READY: latest file exists, ALL three [Answer]: tags filled. Do NOT write a new
  //              file — engineer's intent is to dispatch the existing file, not to start a new
  //              escalation cycle. (Plan 05.3-08 Gap 7 closure: the prior A_NEXT phase auto-wrote
  //              file N+1 here, masking the engineer's filled answers and requiring them to fill
  //              the file twice. Starting a NEW escalation cycle requires the prior cycle to be
  //              fully resolved (finalize commit landed); that flow is out of scope for inline
  //              fix and is tracked as a follow-up — engineer can manually delete or rename the
  //              prior question file in the interim.)
  const dir = safeJoin(cwd, 'aidlc-docs/inception');
  if (!existsSync(dir)) return { phase: 'A_FIRST', latestN: 0 };
  const re = /^escalate-fix-(\d+)-questions\.md$/;
  let latestN = 0;
  let latestPath = null;
  let latestName = null;
  for (const name of readdirSync(dir)) {
    const m = name.match(re);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (n > latestN) { latestN = n; latestPath = join(dir, name); latestName = name; }
  }
  if (latestN === 0) return { phase: 'A_FIRST', latestN: 0 };
  // Read [Answer]: tags. Question file has exactly 3.
  const text = readFileSync(latestPath, 'utf8');
  const tags = [...text.matchAll(/^\[Answer\]:\s*(\S*)/gm)].map((m) => m[1] || '');
  const allFilled = tags.length >= 3 && tags.slice(0, 3).every((t) => t.length > 0);
  if (allFilled) return { phase: 'DISPATCH_READY', latestN, latestName };
  return { phase: 'A_PENDING', latestN, latestName };
}

function atomicWriteText(targetPath, content) {
  // Pitfall 6: hard-fail on concurrent escalate-fix.
  if (existsSync(targetPath)) {
    throw new Error(`Concurrent escalate-fix detected: ${targetPath} already exists. Resolve and re-run.`);
  }
  const tmp = `${targetPath}.tmp`;
  writeFileSync(tmp, content);
  // existsSync race window is tiny but tolerable; renameSync is atomic on POSIX.
  if (existsSync(targetPath)) {
    throw new Error(`Concurrent escalate-fix detected (race): ${targetPath}.`);
  }
  renameSync(tmp, targetPath);
}

function buildQuestionFileContent({ unitId, markerName, marker }) {
  return `# Escalate Fix — ${unitId}

## Marker Context

- **Marker file**: \`<unit-path>/.ai-dlc-bootstrap/escalations/${markerName}\` (read from branch \`${unitId}\`)
- **Marker description (verbatim)**: ${marker.description}
- **Marker timestamp**: ${marker.timestamp}
- **Expected inception artifact**: ${marker.expected_inception_artifact ?? '(unspecified — pick stage below)'}

> Resolving marker \`${markerName}\`. To select a different marker, abort and re-run with \`/aidlc-escalate-fix ${unitId} --marker M "<description>"\`.

## Question 1 — Most upstream affected inception stage

Which inception stage owns the canonical artifact that needs to change? Choose the EARLIEST stage where the change must land — AI-DLC's adaptive logic re-reads downstream artifacts on next dispatch.

A) Requirements Analysis  — \`aidlc-docs/inception/requirements/requirements.md\`
B) User Stories           — \`aidlc-docs/inception/user-stories/stories.md\`
C) Workflow Planning      — \`aidlc-docs/inception/plans/execution-plan.md\`
D) Application Design     — \`aidlc-docs/inception/application-design/application-design.md\`
E) Units Generation       — \`aidlc-docs/inception/application-design/unit-of-work.md\`

[Answer]:

## Question 2 — Modification mode

A) In-place (default) — dispatch the cluster owning the chosen stage with \`resume.kind=request_changes\`. Only the chosen stage's artifact is modified; downstream stages re-read your changes the next time they run. No backup files.
B) Full restart        — execute AI-DLC \`workflow-changes.md\` Type 4: archive every COMPLETED downstream artifact as \`<artifact>.backup.<iso-timestamp>\`, reset their rows in \`aidlc-docs/aidlc-state.md\` to PENDING, clear their plan-file checkboxes, then dispatch the chosen stage's cluster from a fresh start. Heavy hammer — only when in-place cannot reach the desired state.

[Answer]:

## Question 3 — Description override (optional)

The marker's description (verbatim above) will be used as \`resume.details\` for the cluster and as the commit-message tail. To override with a different description, fill in below; otherwise leave blank.

[Answer]:

---

After filling all three \`[Answer]:\` tags above, re-run:

\`\`\`
/aidlc-escalate-fix ${unitId} "${marker.description}"
\`\`\`

Phase B will parse the answers, dispatch the cluster, and stamp the canonical \`escalate-fix(${unitId}): <description>\` commit on main.
`;
}

function appendAuditBlock_QuestionFile({ cwd, unitId, markerName, marker, questionFileRel }) {
  const auditPath = safeJoin(cwd, 'aidlc-docs/audit.md');
  // mkdir defensively if aidlc-docs/ does not exist (rare on main, but keep helper robust).
  try { mkdirSync(safeJoin(cwd, 'aidlc-docs'), { recursive: true }); } catch { /* ignore */ }
  const block =
    `\n## Escalate Fix — Question File\n` +
    `**Timestamp**: ${isoTimestamp()}\n` +
    `**Unit**: ${unitId}\n` +
    `**Marker selected**: ${markerName} (description: "${marker.description.replace(/\n/g, ' ')}")\n` +
    `**Question file**: ${questionFileRel}\n\n---\n`;
  appendFileSync(auditPath, block);
}

function selectMarker(names, markerOverride, cwd, unitId, unitPath) {
  if (names.length === 0) {
    return { error: `No escalation markers found on branch ${unitId} at ${unitPath}/.ai-dlc-bootstrap/escalations/.` };
  }
  // Build {n, name, marker} list.
  const entries = [];
  for (const name of names) {
    const m = name.match(/^escalation-(\d+)\.json$/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    const r = readMarkerFromUnitBranch(cwd, unitId, unitPath, name);
    if (r.error) return { error: r.error };
    entries.push({ n, name, marker: r.marker });
  }
  if (markerOverride !== null) {
    const hit = entries.find((e) => e.n === markerOverride);
    if (!hit) {
      return { error: `--marker ${markerOverride} not found on branch ${unitId} (have: ${entries.map((e) => e.n).join(', ') || 'none'}).` };
    }
    return { selected: hit };
  }
  // Most-recent-pending: highest n where status === 'pending'.
  const pending = entries.filter((e) => e.marker.status === 'pending').sort((a, b) => b.n - a.n);
  if (pending.length === 0) {
    return { error: `No pending escalation markers on branch ${unitId} (all resolved or corrupt). Use --marker N to select explicitly.` };
  }
  return { selected: pending[0] };
}

// ---------------------------------------------------------------------------
// preflightEscalateFix — Phase A handler exported entry-point.
// ---------------------------------------------------------------------------
export async function preflightEscalateFix({ positional, cwd }) {
  // (1) Parse $ARGUMENTS.
  // D-141/D-142: engineer-typed unit-id is sourced from env-var (Phase 07.1 args-contract).
  const parsed = parseEscalateArgs(process.env.AIDLC_ARGS ?? '');
  if (parsed.error) {
    return { exitCode: EXIT_USAGE, stderr: `${parsed.error}\n` };
  }
  const { unitId, markerOverride, description } = parsed;

  // Plan 05.3-07 (Universal Convention / Gap 2 closure): description in $ARGUMENTS is now
  // OPTIONAL. When omitted, helper proceeds with marker.description as the resolved description
  // and persists it to the question-file frontmatter so Phase B / Finalize can recover it
  // without engineer retyping. Empty $ARGUMENTS (no unit-id) still rejects via parseEscalateArgs
  // BL-01 path above.

  // (2) D-87 inverted: must be on main. BL-04 detached-HEAD discrimination.
  let branchInfo;
  try { branchInfo = currentBranch(cwd); }
  catch (e) { return { exitCode: EXIT_INTERNAL, stderr: `${e.message}\n` }; }

  if (branchInfo.detached) {
    return { exitCode: EXIT_DOMAIN, stderr: 'Cannot run /aidlc-escalate-fix from detached HEAD. Checkout main first.\n' };
  }
  if (branchInfo.branch !== 'main') {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `Cannot run /aidlc-escalate-fix from branch ${branchInfo.branch}. Checkout main first (escalate-fix closes a fix on main).\n`,
    };
  }

  // (3) BL-01: validate unit-id from $ARGUMENTS BEFORE any path interpolation.
  const idCheck = validateUnitPath(unitId);
  if (idCheck.error) {
    return { exitCode: EXIT_DOMAIN, stderr: `Unit-id ${idCheck.error}\n` };
  }

  // (4) Resolve unit-path via unit description file on main.
  const unitFile = unitDescriptionPath(cwd, unitId);
  if (!existsSync(unitFile)) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `Unit description not found at ${unitFile} for unit-id ${unitId}.\n`,
    };
  }
  const ext = extractUnitPath(unitFile);
  if (ext.error) return { exitCode: EXIT_DOMAIN, stderr: `${ext.error}\n` };
  const unitPath = ext.value;
  const v = validateUnitPath(unitPath);
  if (v.error) return { exitCode: EXIT_DOMAIN, stderr: `${v.error}\n` };

  // (5) D-92: read markers from unit branch via `git show` — no branch switching.
  const list = listMarkersOnUnitBranch(cwd, unitId, unitPath);
  if (list.error) {
    return { exitCode: EXIT_DOMAIN, stderr: `${list.error}\n` };
  }
  const sel = selectMarker(list.names, markerOverride, cwd, unitId, unitPath);
  if (sel.error) {
    return { exitCode: EXIT_DOMAIN, stderr: `${sel.error}\n` };
  }
  const { name: markerName, marker } = sel.selected;

  // (6) Phase A detection — choose between first-write, refuse-double-write, and next-N.
  const phase = detectQuestionFilePhase(cwd);
  const inceptionDir = safeJoin(cwd, 'aidlc-docs/inception');

  if (phase.phase === 'A_PENDING') {
    // Pitfall 6: a prior escalate-fix-N-questions.md exists with empty [Answer]: tags.
    // Refuse to write a new one; surface the pending file so the orchestrator HALTs.
    const pendingRel = `aidlc-docs/inception/${phase.latestName}`;
    const stdout =
      `# SELECTED_MARKER ${markerName} -- "${marker.description}"\n` +
      `# QUESTION_FILE_PENDING ${pendingRel}\n` +
      `PREFLIGHT_OK ${unitPath} ${unitId} ${markerName} ${phase.latestName}\n`;
    return { exitCode: EXIT_OK, stdout };
  }

  if (phase.phase === 'DISPATCH_READY') {
    // Plan 05.3-08 Gap 7 closure: latest escalate-fix-N-questions.md is fully answered.
    // Do NOT write a new file — engineer's intent is to dispatch the existing one. Emit
    // a `# QUESTION_FILE_READY` marker (distinct from `# QUESTION_FILE` which is reserved
    // for fresh-write halts) so the orchestrator's bash gate falls through to
    // `escalate-fix`, which will parse answers and emit DISPATCH_PAYLOAD.
    const readyRel = `aidlc-docs/inception/${phase.latestName}`;
    const stdout =
      `# SELECTED_MARKER ${markerName} -- "${marker.description}"\n` +
      `# QUESTION_FILE_READY ${readyRel}\n` +
      `PREFLIGHT_OK ${unitPath} ${unitId} ${markerName} ${phase.latestName}\n`;
    return { exitCode: EXIT_OK, stdout };
  }

  // A_FIRST: write a new question file with sequential N (N=1 on first run).
  const nextN = phase.latestN + 1;
  const questionFileName = `escalate-fix-${nextN}-questions.md`;
  const questionFileAbs = safeJoin(cwd, `aidlc-docs/inception/${questionFileName}`);
  const questionFileRel = `aidlc-docs/inception/${questionFileName}`;

  try { mkdirSync(inceptionDir, { recursive: true }); }
  catch (e) { return { exitCode: EXIT_INTERNAL, stderr: `mkdir aidlc-docs/inception failed: ${e.message}\n` }; }

  try {
    atomicWriteText(questionFileAbs, buildQuestionFileContent({ unitId, markerName, marker }));
  } catch (e) {
    return { exitCode: EXIT_DOMAIN, stderr: `${e.message}\n` };
  }

  // Plan 05.3-07 Universal Convention (D-73 expanded): persist resolved description into
  // question-file frontmatter so Phase B / Finalize can recover it without engineer retyping.
  // Resolved description is whichever value the helper finally selected: $ARGUMENTS override,
  // marker.description fallback otherwise. Skipped on the QUESTION_FILE_PENDING path above
  // (the file already has its frontmatter from a prior invocation; do not overwrite).
  const resolvedDescription = (description && description.length > 0)
    ? description
    : (marker.description ?? '');
  if (resolvedDescription) {
    try {
      writePersistedArg(questionFileAbs, 'description', resolvedDescription);
    } catch (e) {
      return { exitCode: EXIT_INTERNAL, stderr: `Failed to persist description: ${e.message}\n` };
    }
  }

  // Audit block — append AFTER successful write so the audit log doesn't claim a write that failed.
  try { appendAuditBlock_QuestionFile({ cwd, unitId, markerName, marker, questionFileRel }); }
  catch (e) { return { exitCode: EXIT_INTERNAL, stderr: `audit append failed: ${e.message}\n` }; }

  const stdout =
    `# SELECTED_MARKER ${markerName} -- "${marker.description}"\n` +
    `# QUESTION_FILE ${questionFileRel}\n` +
    `PREFLIGHT_OK ${unitPath} ${unitId} ${markerName} ${questionFileName}\n`;
  return { exitCode: EXIT_OK, stdout };
}
