// assets/scripts/lib/preflight-change-request.js — preflight chain for /aidlc-change-request.
// Replaces the bash chain in assets/commands/aidlc-change-request.md lines 26–92.
// D-41: UNIT_ID derived from git symbolic-ref --short HEAD (current branch name).
// D-74: state file absence now relaxed — derives active gate from audit.md ## Approved heading.
// Plan 05.3-07: description is OPTIONAL (Universal Convention); when provided, writePersistedArg
// persists it into the question-file frontmatter so Phase B can recover via fallback.
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractUnitPath } from './extract-unit-path.js';
import { validateUnitPath } from './validate-unit-path.js';
import { currentBranch } from './git-probes.js';
import { unitDescriptionPath, unitInceptionStatePath, unitConstructionStatePath, safeJoin } from './paths.js';
import { EXIT_OK, EXIT_DOMAIN, EXIT_USAGE, EXIT_INTERNAL } from './report.js';
import { writeEscalationMarker, deletePendingMarkersForUnit } from './escalation-marker.js';
import { readDescriptionFromQuestionFile, writeDescriptionToQuestionFile } from './description-persistence.js';
import { writePersistedArg } from './persisted-arg.js';

export async function preflightChangeRequest({ positional, cwd }) {
  // (1) Plan 05.3-07 (Universal Convention / EN-04-01) + Plan 05.3 inline-fix:
  //     description is OPTIONAL. When non-empty, the helper persists it into the latest
  //     change-request-N-questions.md frontmatter via writePersistedArg (block at end of
  //     function). When empty, the helper proceeds to PREFLIGHT_OK without persisting —
  //     the slash-command's Phase B branch reads the persisted description from the
  //     existing question file's frontmatter. The legacy D-23 hard-rejection fired
  //     BEFORE Phase B detection, breaking Phase B re-invocation in the slash-command
  //     flow (manual UAT 2026-05-03 Scenario 5). Mirrors preflight-unit-redesign.js's
  //     pattern (`if (description) { persist }`).
  // D-141/D-142 (Phase 07.1 args-contract): description sourced from env-var.
  const description = (process.env.AIDLC_ARGS ?? '').trim();

  // (2) D-22: not on main (BL-04: structured return distinguishes detached HEAD from real branches)
  let branchInfo;
  try { branchInfo = currentBranch(cwd); }
  catch (e) { return { exitCode: EXIT_INTERNAL, stderr: `${e.message}\n` }; }

  // (3) D-41: derive unit-id from branch; detached HEAD is an error
  if (branchInfo.detached) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: 'Cannot derive unit-id: detached HEAD. Checkout the named unit branch.\n',
    };
  }
  if (branchInfo.branch === 'main') {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: 'Cannot run /aidlc-change-request on main. Checkout the unit branch first.\n',
    };
  }
  const unitId = branchInfo.branch;

  // (3a) BL-01: validate unit-id derived from branch BEFORE feeding it into any path builder.
  // A hostile branch name (e.g. with `/` segments or `..`) must not forge an
  // arbitrary unitId that flows through the rest of the preflight unchecked.
  const idCheck = validateUnitPath(unitId);
  if (idCheck.error) {
    return { exitCode: EXIT_DOMAIN, stderr: `Branch name (used as unit-id) ${idCheck.error}\n` };
  }

  // (4) D-23: unit-description file present (keyed on derived unitId)
  const unitFile = unitDescriptionPath(cwd, unitId);
  if (!existsSync(unitFile)) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `Unit description not found at ${unitFile} for branch ${unitId}.\n`,
    };
  }

  // (5) UNIT_PATH extract + WR-04 validation
  const ext = extractUnitPath(unitFile);
  if (ext.error) return { exitCode: EXIT_DOMAIN, stderr: `${ext.error}\n` };
  const unitPath = ext.value;

  const v = validateUnitPath(unitPath);
  if (v.error) return { exitCode: EXIT_DOMAIN, stderr: `${v.error}\n` };

  // (6) D-74: relaxed fallback. When state files absent, derive active gate from audit.md ## Approved heading.
  const inceptionState = unitInceptionStatePath(cwd, unitPath);
  const constructionState = unitConstructionStatePath(cwd, unitPath);
  if (!existsSync(inceptionState) && !existsSync(constructionState)) {
    const derived = deriveActiveGateFromAudit(cwd, unitPath);
    if (derived.gate) {
      // Plan 05.3-07 + inline-fix: persist description into Phase A question file ONLY when provided.
      if (description) {
        try { ensureChangeRequestPhaseAQuestionFile(cwd, unitPath, description); }
        catch (e) { return { exitCode: EXIT_INTERNAL, stderr: `Failed to write change-request question file: ${e.message}\n` }; }
      }
      return {
        exitCode: EXIT_OK,
        stdout: `PREFLIGHT_OK ${unitPath} ${unitId} POST_CONSTRUCTION ${derived.gate}\n`,
      };
    }
    return {
      exitCode: EXIT_DOMAIN,
      stderr:
        `Cannot make a change request for ${unitId} — no active state and no derivable gate from audit.md.\n` +
        `Looked for state files:\n  ${inceptionState}\n  ${constructionState}\n` +
        `Looked for '## Approved' heading in: ${safeJoin(cwd, join(unitPath, 'aidlc-docs/audit.md'))}\n` +
        `${derived.reason}\n`,
    };
  }

  // Plan 05.3-07 (Universal Convention / EN-04-01) + inline-fix: persist description into
  // Phase A question file before returning PREFLIGHT_OK ONLY when description is provided.
  // On Phase B re-invocation (empty $ARGUMENTS), the orchestrator reads the persisted
  // description from the existing question-file frontmatter; the helper just clears
  // preflight and exits.
  if (description) {
    try { ensureChangeRequestPhaseAQuestionFile(cwd, unitPath, description); }
    catch (e) { return { exitCode: EXIT_INTERNAL, stderr: `Failed to write change-request question file: ${e.message}\n` }; }
  }

  return { exitCode: EXIT_OK, stdout: `PREFLIGHT_OK ${unitPath} ${unitId}\n` };
}

// Plan 05.3-07 helper: ensure a change-request-N-questions.md exists at the latest sequential
// N with `description: '<value>'` persisted in YAML frontmatter. If a latest file already
// exists with empty [Answer]: tag, treat it as Phase A pending and re-persist into it
// (idempotent on repeated Phase A invocations); otherwise compute next-N and write a new file.
function ensureChangeRequestPhaseAQuestionFile(cwd, unitPath, description) {
  const crDir = safeJoin(cwd, join(unitPath, 'aidlc-docs/construction/change-requests'));
  mkdirSync(crDir, { recursive: true });
  const re = /^change-request-(\d+)-questions\.md$/;
  let entries = [];
  try { entries = readdirSync(crDir); } catch { /* ignore */ }
  let latestN = 0;
  let latestPath = null;
  for (const name of entries) {
    const m = name.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > latestN) { latestN = n; latestPath = join(crDir, name); }
    }
  }
  // Check the latest file's [Answer]: tag — if filled, compute next-N; if empty, reuse it.
  let targetPath = null;
  if (latestPath) {
    const text = readFileSync(latestPath, 'utf8');
    const m = text.match(/^\[Answer\]:\s*(\S*)/m);
    const answered = m && m[1] && m[1].length > 0;
    if (!answered) {
      targetPath = latestPath; // Phase A re-run — overwrite frontmatter on existing pending file.
    }
  }
  if (!targetPath) {
    const nextN = latestN + 1;
    targetPath = join(crDir, `change-request-${nextN}-questions.md`);
  }
  if (!existsSync(targetPath)) {
    // Minimal placeholder body — the orchestrator markdown's Edit step mirrors the engineer's
    // chosen letter via AskUserQuestion onto the single [Answer]: line.
    const body =
      `# Change Request — Routing\n\n` +
      `## Question — How should this change be handled?\n\n` +
      `A) Inline — Change fits within current stage; re-dispatch active cluster with request_changes.\n` +
      `B) Redesign — Change affects multiple design stages; redirect to /aidlc-unit-redesign.\n` +
      `C) Escalate — Change requires inception-level fix on main first.\n\n` +
      `[Answer]:\n`;
    writeFileSync(targetPath, body);
  }
  writePersistedArg(targetPath, 'description', description);
}

// D-74: derive active gate from audit.md ## Approved heading.
// Heading format (from Phase 4 audit-log conventions): `## Approved — <stage> (<gate-id>)`.
// Fallback chain: heading match -> '**Active gate**:' line in latest entry -> null.
function deriveActiveGateFromAudit(cwd, unitPath) {
  const auditPath = safeJoin(cwd, join(unitPath, 'aidlc-docs/audit.md'));
  if (!existsSync(auditPath)) {
    return { gate: null, reason: 'audit.md not found.' };
  }
  let text;
  try { text = readFileSync(auditPath, 'utf8'); }
  catch (e) { return { gate: null, reason: `cannot read audit.md: ${e.message}` }; }
  // Walk lines from end to find the latest '## Approved' heading.
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^## Approved.*?\(([^)]+)\)/);
    if (m) return { gate: m[1].trim() };
    // Fallback: '**Active gate**: <id>' line in latest gate-tagged entry.
    const m2 = lines[i].match(/^\*\*Active gate\*\*:\s*(\S+)/);
    if (m2) return { gate: m2[1].trim() };
  }
  return { gate: null, reason: "No '## Approved — <stage> (<gate-id>)' or '**Active gate**: <id>' found." };
}

// D-67 escalate-path subcommand: runs the full preflight chain THEN writes an escalation marker.
// Atomic: marker is only written when preflight returns EXIT_OK.
export async function preflightChangeRequestEscalate({ positional, cwd }) {
  const result = await preflightChangeRequest({ positional, cwd });
  if (result.exitCode !== EXIT_OK) return result;
  // WRN-05: re-wrap currentBranch in try/catch — the parent preflightChangeRequest
  // already wraps its first call (line 27), but `currentBranch` is documented to
  // throw on any non-detached-HEAD git failure. Without this guard, a transient
  // git failure (concurrent index lock release, .git permission flip) between the
  // parent preflight and this re-call would surface as an uncaught Promise rejection
  // through dispatch.js, breaking the structured-error contract.
  let branchInfo;
  try { branchInfo = currentBranch(cwd); }
  catch (e) { return { exitCode: EXIT_INTERNAL, stderr: `${e.message}\n` }; }
  const unitId = branchInfo.branch;
  const unitFile = unitDescriptionPath(cwd, unitId);
  const ext = extractUnitPath(unitFile);
  // BLK-03 (Plan 07.1-04): the line-70 first-call guard uses EXIT_DOMAIN because the
  // first call processes fresh user input — a missing UNIT_PATH there is a domain
  // error. Reaching THIS re-derive call means preflightChangeRequest already passed
  // once successfully — so a second-call extraction failure indicates a race
  // condition, file mutation between calls, or future error-semantics change.
  // EXIT_INTERNAL is correct here.
  if (ext.error) return { exitCode: EXIT_INTERNAL, stderr: ext.error + '\n' };
  const unitPath = ext.value;
  // Plan 05.3-08 Gap 8 fix: when $ARGUMENTS is empty (Phase B re-invocation per Gap 4
  // Universal Convention), recover description from question-file frontmatter via the
  // same fallback resolver Phase B's Inline route uses. Without this, an engineer who
  // chose Route C on Phase B with empty args would write a marker with empty
  // description — poisoning future preflight-escalate-fix's most-recent-pending
  // selection and forcing the dispatch cluster to operate with no change directive.
  const fallback = changeRequestDescriptionFallback({ positional, cwd, unitPath });
  const description = fallback.description ?? '';
  if (!description || description.trim().length === 0) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr:
        `Cannot write escalation marker for ${unitId}: no description available — none in $ARGUMENTS and no persisted value in the latest change-request-N-questions.md frontmatter.\n` +
        `Re-run /aidlc-change-request "<actionable description>" or fill in the persisted description on the question file.\n`,
    };
  }
  // DEF-M1-17: supersede-on-write — delete all prior pending markers for this unit before
  // writing the new one. Resolved markers are preserved (they carry audit history).
  try { deletePendingMarkersForUnit(cwd, unitPath); } catch { /* non-fatal */ }
  const { path: markerPath } = writeEscalationMarker(cwd, unitPath, {
    description: description.trim(),
    expectedInceptionArtifact: null,
  });
  const stdout = (result.stdout ?? '') + `ESCALATION_MARKER_WRITTEN ${markerPath}\n`;
  return { exitCode: EXIT_OK, stdout };
}

// D-73 description-fallback resolver — used by orchestrator on Phase B with empty $ARGUMENTS.
// D-141/D-142 (Phase 07.1 args-contract): fromArgs sourced from env-var.
export function changeRequestDescriptionFallback({ positional, cwd, unitPath }) {
  const fromArgs = (process.env.AIDLC_ARGS ?? '').trim();
  if (fromArgs) return { description: fromArgs };
  const dir = safeJoin(cwd, join(unitPath, 'aidlc-docs/construction/change-requests'));
  if (!existsSync(dir)) return { description: null };
  let entries;
  try { entries = readdirSync(dir); } catch { return { description: null }; }
  const re = /^change-request-(\d+)-questions\.md$/;
  let latestPath = null, latestN = -1;
  for (const name of entries) {
    const m = name.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > latestN) { latestN = n; latestPath = join(dir, name); }
    }
  }
  if (!latestPath) return { description: null };
  return readDescriptionFromQuestionFile(latestPath);
}

// Re-export for orchestrator use.
export { writeDescriptionToQuestionFile };

// Plan 05.3-07 Universal Convention handler: persist the engineer-provided description
// into the latest change-request-N-questions.md frontmatter so Phase B can recover it
// when $ARGUMENTS is empty. Invoked by the orchestrator markdown's Phase A !-block; emits
// `# PERSISTED_OK <path>` on success. Idempotent — re-running with the same description is
// a no-op; re-running with a different description overrides.
export async function persistChangeRequestDescription({ positional, cwd }) {
  // (1) Re-run the preflight chain to get a validated unitPath. Note: preflightChangeRequest
  // already writes/persists the question file when description is non-empty, so this handler
  // is effectively idempotent with that flow.
  const result = await preflightChangeRequest({ positional, cwd });
  if (result.exitCode !== EXIT_OK) return result;

  // (2) Re-derive unitPath from the same chain.
  let branchInfo;
  try { branchInfo = currentBranch(cwd); }
  catch (e) { return { exitCode: EXIT_INTERNAL, stderr: `${e.message}\n` }; }
  const unitId = branchInfo.branch;
  const unitFile = unitDescriptionPath(cwd, unitId);
  const ext = extractUnitPath(unitFile);
  // BLK-03 (Plan 07.1-04): see rationale in preflightChangeRequestEscalate above.
  // Reaching this re-derive means preflightChangeRequest already passed; a second-call
  // failure is a race / file mutation between calls — EXIT_INTERNAL is correct.
  if (ext.error) return { exitCode: EXIT_INTERNAL, stderr: ext.error + '\n' };
  const unitPath = ext.value;

  // (3) Resolve the latest change-request-N-questions.md path.
  const crDir = safeJoin(cwd, join(unitPath, 'aidlc-docs/construction/change-requests'));
  if (!existsSync(crDir)) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `No change-requests/ directory at ${crDir}; cannot persist description.\n`,
    };
  }
  let entries;
  try { entries = readdirSync(crDir); }
  catch { return { exitCode: EXIT_INTERNAL, stderr: `Cannot read ${crDir}.\n` }; }
  const re = /^change-request-(\d+)-questions\.md$/;
  let latestPath = null, latestN = -1;
  for (const name of entries) {
    const m = name.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > latestN) { latestN = n; latestPath = join(crDir, name); }
    }
  }
  if (!latestPath) {
    return { exitCode: EXIT_DOMAIN, stderr: 'No change-request-N-questions.md found to persist into.\n' };
  }

  // (4) Persist the description (skip silently if $ARGUMENTS is empty — Phase B will fall back).
  // D-141/D-142 (Phase 07.1 args-contract): description sourced from env-var.
  const description = (process.env.AIDLC_ARGS ?? '').trim();
  if (description) {
    try {
      writePersistedArg(latestPath, 'description', description);
    } catch (e) {
      return { exitCode: EXIT_INTERNAL, stderr: `Failed to persist description: ${e.message}\n` };
    }
  }
  const stdout = (result.stdout ?? '') + `# PERSISTED_OK ${latestPath}\n`;
  return { exitCode: EXIT_OK, stdout };
}
