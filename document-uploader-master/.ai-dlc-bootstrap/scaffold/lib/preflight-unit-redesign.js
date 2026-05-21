// assets/scripts/lib/preflight-unit-redesign.js — preflight chain for /aidlc-unit-redesign.
// Replaces the bash chain in assets/commands/aidlc-unit-redesign.md lines 27–98.
// CRITICAL: line 91's grep | sed was a G4 victim. JSON.parse + validateState replace it.
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractUnitPath } from './extract-unit-path.js';
import { validateUnitPath } from './validate-unit-path.js';
import { validateState } from './state-validator.js';
import { currentBranch } from './git-probes.js';
import { safeJoin, unitDescriptionPath, unitConstructionStatePath } from './paths.js';
import { EXIT_OK, EXIT_DOMAIN, EXIT_USAGE, EXIT_INTERNAL } from './report.js';
import { readDescriptionFromQuestionFile, writeDescriptionToQuestionFile } from './description-persistence.js';
import { parseUnitArgs } from './parse-unit-args.js';
import { writePersistedArg } from './persisted-arg.js';

// G-04-10: detect an active redesign in progress.
// Signal: latest <unit-path>/aidlc-docs/construction/redesign/redesign-N-questions.md
// exists AND has all 4 [Answer]: tags filled with a non-empty A/B/C letter.
// This mirrors the Phase A vs Phase B discriminator in aidlc-unit-redesign.md
// (orchestrator-side phase detection at the markdown level).
function hasActiveRedesign(cwd, unitPath) {
  const redesignDir = safeJoin(cwd, join(unitPath, 'aidlc-docs/construction/redesign'));
  if (!existsSync(redesignDir)) return false;
  let entries;
  try { entries = readdirSync(redesignDir); }
  catch { return false; }
  const re = /^redesign-(\d+)-questions\.md$/;
  let latestPath = null, latestN = -1;
  for (const name of entries) {
    const m = name.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > latestN) { latestN = n; latestPath = join(redesignDir, name); }
    }
  }
  if (!latestPath) return false;
  let text;
  try { text = readFileSync(latestPath, 'utf8'); }
  catch { return false; }
  // Count [Answer]: lines with a non-empty letter A/B/C (case-insensitive).
  const answers = text.match(/^\[Answer\]:\s*([A-Ca-c])\b/gm) || [];
  return answers.length >= 4;
}

// D-73: latest redesign-N-questions.md path resolver — used by orchestrator to bind a Phase A/B target path
// AND by Phase B description-fallback to read frontmatter when $ARGUMENTS is empty.
export function redesignQuestionFilePath(cwd, unitPath) {
  const redesignDir = safeJoin(cwd, join(unitPath, 'aidlc-docs/construction/redesign'));
  if (!existsSync(redesignDir)) return null;
  let entries;
  try { entries = readdirSync(redesignDir); } catch { return null; }
  const re = /^redesign-(\d+)-questions\.md$/;
  let latestPath = null, latestN = -1;
  for (const name of entries) {
    const m = name.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > latestN) { latestN = n; latestPath = join(redesignDir, name); }
    }
  }
  return latestPath;
}

// D-73 description fallback: env-var description -> frontmatter -> null.
// D-141/D-142: reads description from parseUnitArgs(process.env.AIDLC_ARGS ?? '') instead of positional.
export function redesignDescriptionFallback({ positional, cwd, unitPath }) {
  const fromArgs = parseUnitArgs(process.env.AIDLC_ARGS ?? '').description;
  if (fromArgs) return { description: fromArgs };
  const latestPath = redesignQuestionFilePath(cwd, unitPath);
  if (!latestPath) return { description: null };
  const persisted = readDescriptionFromQuestionFile(latestPath);
  return { description: persisted.description };
}

// Re-export so orchestrator (or wave-3 markdown) can write frontmatter directly when shipping Phase A.
export { writeDescriptionToQuestionFile };

export async function preflightUnitRedesign({ positional, cwd }) {
  // D-141/D-142: engineer-typed unit-id is sourced from env-var (Phase 07.1 args-contract).
  const { unitId, description, error } = parseUnitArgs(process.env.AIDLC_ARGS ?? '');
  if (error) {
    return { exitCode: EXIT_USAGE, stderr: `${error}\n` };
  }

  // (1) D-23: empty unit-id arg -> USAGE
  if (!unitId) {
    return {
      exitCode: EXIT_USAGE,
      stderr: 'Usage: scaffold preflight-unit-redesign "<unit-id> [description...]"\n',
    };
  }
  void description; // description is available for D-73 callers; not used directly in the preflight chain.

  // (1a) BL-01: validate unit-id BEFORE feeding it into any path builder.
  const idCheck = validateUnitPath(unitId);
  if (idCheck.error) {
    return { exitCode: EXIT_USAGE, stderr: `unit-id ${idCheck.error}\n` };
  }

  // (2) D-22: not on main (BL-04: structured return distinguishes detached HEAD from real branches)
  const branchInfo = currentBranch(cwd);
  if (branchInfo.branch === 'main') {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `Cannot run /aidlc-unit-redesign on main. Checkout the ${unitId} branch.\n`,
    };
  }

  // (3) D-23: unit-description file present
  const unitFile = unitDescriptionPath(cwd, unitId);
  if (!existsSync(unitFile)) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `Unit description not found at ${unitFile}.\n`,
    };
  }

  // (4) UNIT_PATH extract
  const ext = extractUnitPath(unitFile);
  if (ext.error) return { exitCode: EXIT_DOMAIN, stderr: `${ext.error}\n` };
  const unitPath = ext.value;

  // (5) WR-04: char-class allow-list
  const v = validateUnitPath(unitPath);
  if (v.error) return { exitCode: EXIT_DOMAIN, stderr: `${v.error}\n` };

  // (6) D-51: state file MUST exist at construction path
  const statePath = unitConstructionStatePath(cwd, unitPath);
  if (!existsSync(statePath)) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `D-51: no active construction orchestrator state at ${statePath}. /aidlc-unit-redesign is only valid mid-construction (current_cluster=aidlc-coder).\n`,
    };
  }

  // (7) State file readable JSON
  let raw;
  try {
    raw = readFileSync(statePath, 'utf8');
  } catch (e) {
    return { exitCode: EXIT_INTERNAL, stderr: `Cannot read state file at ${statePath}: ${e.message}\n` };
  }

  let state;
  try {
    state = JSON.parse(raw);
  } catch (e) {
    return { exitCode: EXIT_INTERNAL, stderr: `State file at ${statePath} is not valid JSON: ${e.message}\n` };
  }

  // (8) Schema validation
  try {
    validateState(state);
  } catch (e) {
    return { exitCode: EXIT_INTERNAL, stderr: `State file at ${statePath} failed schema validation: ${e.message}\n` };
  }

  // (9) D-51: current_cluster must be aidlc-coder for new redesigns.
  // G-04-10 relaxation: allow rewind-target clusters (aidlc-functional-designer,
  // aidlc-systems-designer) when an active redesign is in progress (a filled
  // redesign-N-questions.md exists). This permits Phase B gate-loop continuation
  // per aidlc-unit-redesign.md line 81's "User re-runs ..." contract.
  const REDESIGN_VALID_CLUSTERS = new Set([
    'aidlc-coder',
    'aidlc-functional-designer',
    'aidlc-systems-designer',
  ]);
  if (!REDESIGN_VALID_CLUSTERS.has(state.current_cluster)) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `D-51: /aidlc-unit-redesign is only valid mid-construction. Current cluster: ${state.current_cluster}.\n`,
    };
  }
  if (state.current_cluster !== 'aidlc-coder' && !hasActiveRedesign(cwd, unitPath)) {
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `D-51: /aidlc-unit-redesign is only valid when current_cluster=aidlc-coder OR a redesign is in progress (filled redesign-N-questions.md exists). Current cluster: ${state.current_cluster}.\n`,
    };
  }

  // Plan 05.3-07 (Universal Convention / EN-04-01): when description is provided in
  // $ARGUMENTS, persist it into a Phase A redesign-N-questions.md frontmatter so Phase B
  // re-invocation with empty $ARGUMENTS recovers via redesignDescriptionFallback. Skipped
  // when description is empty (Phase B continuation runs do not retype).
  if (description) {
    try { ensureUnitRedesignPhaseAQuestionFile(cwd, unitPath, description); }
    catch (e) { return { exitCode: EXIT_INTERNAL, stderr: `Failed to write redesign question file: ${e.message}\n` }; }
  }

  return { exitCode: EXIT_OK, stdout: `PREFLIGHT_OK ${unitPath}\n` };
}

// Plan 05.3-07 helper: ensure a redesign-N-questions.md exists with `description: '<value>'`
// persisted in YAML frontmatter. Reuses any unanswered (Phase A pending) latest file;
// otherwise computes next-N. Mirrors ensureChangeRequestPhaseAQuestionFile's idempotency.
function ensureUnitRedesignPhaseAQuestionFile(cwd, unitPath, description) {
  const redesignDir = safeJoin(cwd, join(unitPath, 'aidlc-docs/construction/redesign'));
  mkdirSync(redesignDir, { recursive: true });
  const re = /^redesign-(\d+)-questions\.md$/;
  let entries = [];
  try { entries = readdirSync(redesignDir); } catch { /* ignore */ }
  let latestN = 0;
  let latestPath = null;
  for (const name of entries) {
    const m = name.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > latestN) { latestN = n; latestPath = join(redesignDir, name); }
    }
  }
  // Reuse latest file when it has any unanswered [Answer]: tag (Phase A pending).
  let targetPath = null;
  if (latestPath) {
    const text = readFileSync(latestPath, 'utf8');
    // Count [Answer]: lines with non-empty letter A/B/C — if all 4 filled, treat as answered.
    const answers = text.match(/^\[Answer\]:\s*([A-Ca-c])\b/gm) || [];
    if (answers.length < 4) {
      targetPath = latestPath;
    }
  }
  if (!targetPath) {
    const nextN = latestN + 1;
    targetPath = join(redesignDir, `redesign-${nextN}-questions.md`);
  }
  if (!existsSync(targetPath)) {
    const body =
      `# Redesign Stage Selection\n\n` +
      `## Q1 Functional Design\n\n[Answer]:\n\n` +
      `## Q2 NFR Requirements\n\n[Answer]:\n\n` +
      `## Q3 NFR Design\n\n[Answer]:\n\n` +
      `## Q4 Infrastructure Design\n\n[Answer]:\n`;
    writeFileSync(targetPath, body);
  }
  writePersistedArg(targetPath, 'description', description);
}

// Plan 05.3-07 Universal Convention handler: persist the engineer-provided description
// into the latest redesign-N-questions.md frontmatter. Mirrors persistChangeRequestDescription.
export async function persistUnitRedesignDescription({ positional, cwd }) {
  const result = await preflightUnitRedesign({ positional, cwd });
  if (result.exitCode !== EXIT_OK) return result;

  // D-141/D-142: engineer-typed unit-id is sourced from env-var (Phase 07.1 args-contract).
  const { unitId, description } = parseUnitArgs(process.env.AIDLC_ARGS ?? '');
  if (!unitId) {
    return { exitCode: EXIT_USAGE, stderr: 'Usage: scaffold unit-redesign-persist-description "<unit-id> [description...]"\n' };
  }
  const unitFile = unitDescriptionPath(cwd, unitId);
  const ext = extractUnitPath(unitFile);
  const unitPath = ext.value;

  const latestPath = redesignQuestionFilePath(cwd, unitPath);
  if (!latestPath) {
    return { exitCode: EXIT_DOMAIN, stderr: 'No redesign-N-questions.md found to persist into.\n' };
  }
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
