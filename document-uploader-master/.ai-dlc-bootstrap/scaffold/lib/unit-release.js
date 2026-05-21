// assets/scripts/lib/unit-release.js — D-65/D-68/D-70 release ceremony.
// Multi-step procedure: sync first, strict pre-flight, squash-merge, root file append, commit, branch archive rename.
// This is the ONLY Phase 5 helper that mutates main; all git invocations go through spawnSync with timeouts and structured rollback.
import { existsSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { currentBranch, branchExists } from './git-probes.js';
import { extractUnitPath } from './extract-unit-path.js';
import { validateUnitPath } from './validate-unit-path.js';
import { unitDescriptionPath, safeJoin } from './paths.js';
import { preflightUnitSync } from './preflight-unit-sync.js';
import { preflightUnitRelease } from './preflight-unit-release.js';
import { EXIT_OK, EXIT_DOMAIN, EXIT_USAGE, EXIT_INTERNAL } from './report.js';
import { parseUnitArgs } from './parse-unit-args.js';

function gitRun(cwd, args, timeout = 10000) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', timeout });
}

function isoTimestampForBranch() {
  // ISO 8601 with `:` replaced by `-` (git refspec disallows ':').
  return new Date().toISOString().replace(/:/g, '-');
}

function nextArchiveName(cwd, baseName) {
  if (!branchExists(cwd, baseName)) return baseName;
  for (let i = 1; i < 100; i++) {
    const candidate = `${baseName}-${i}`;
    if (!branchExists(cwd, candidate)) return candidate;
  }
  return null;
}

export async function unitRelease({ positional, cwd }) {
  // (1) Description required (D-77: parsed from full $ARGUMENTS string).
  // D-141/D-142: engineer-typed unit-id is sourced from env-var (Phase 07.1 args-contract).
  const { description } = parseUnitArgs(process.env.AIDLC_ARGS ?? '');
  // unitId derived from currentBranch(cwd) below — same as before.
  if (!description) {
    return {
      exitCode: EXIT_USAGE,
      stderr: 'Usage: scaffold unit-release "<unit-id> <description...>"\nProvide a non-empty release description.\n',
    };
  }
  // WRN-11: description shape validation. The description is embedded in the git
  // commit subject, the audit.md release block, and the aidlc-state.md row.
  // Multi-line descriptions, control characters, or very long strings break
  // `git log --oneline` rendering and could spoof additional `## Release —`
  // blocks in the markdown audit log. Reject early before any git mutation.
  if (description.length > 200) {
    return {
      exitCode: EXIT_USAGE,
      stderr: `Description too long (${description.length} chars; max 200). Use a concise release subject.\n`,
    };
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(description)) {
    return {
      exitCode: EXIT_USAGE,
      stderr: 'Description must not contain control characters or embedded newlines.\n',
    };
  }

  // (2) D-22: must START on unit branch.
  let branchInfo;
  try { branchInfo = currentBranch(cwd); }
  catch (e) { return { exitCode: EXIT_INTERNAL, stderr: `${e.message}\n` }; }
  if (branchInfo.detached) {
    return { exitCode: EXIT_DOMAIN, stderr: 'Cannot derive unit-id: detached HEAD. Checkout the named unit branch.\n' };
  }
  if (branchInfo.branch === 'main') {
    return { exitCode: EXIT_DOMAIN, stderr: 'Cannot run /aidlc-unit-release on main. Checkout the unit branch first.\n' };
  }
  const unitId = branchInfo.branch;

  // BL-01 validate unit-id before path interpolation.
  const idCheck = validateUnitPath(unitId);
  if (idCheck.error) return { exitCode: EXIT_DOMAIN, stderr: `Branch name (used as unit-id) ${idCheck.error}\n` };

  // (3) D-65: sync first.
  const syncResult = await preflightUnitSync({ positional: [], cwd });
  if (syncResult.exitCode !== EXIT_OK) {
    return {
      exitCode: syncResult.exitCode,
      stderr: `D-65 sync-first failed:\n${syncResult.stderr ?? ''}`,
      stdout: syncResult.stdout,
    };
  }
  // If sync emitted ESCALATION_PENDING diagnostic, that's a soft warning; release pre-flight (D-69 #2) will hard-fail.
  // If sync wrote a sync question file (orchestrator-side, not in helper), that surfaces as D-69 #3 fail.

  // (4) D-69 + D-60 strict pre-flight (defense in depth).
  const preflightResult = await preflightUnitRelease({ positional: [], cwd });
  if (preflightResult.exitCode !== EXIT_OK) {
    return {
      exitCode: preflightResult.exitCode,
      stderr: preflightResult.stderr,
    };
  }

  // (5) Resolve unitPath for root file paths.
  const unitFile = unitDescriptionPath(cwd, unitId);
  const ext = extractUnitPath(unitFile);
  if (ext.error) return { exitCode: EXIT_DOMAIN, stderr: `${ext.error}\n` };
  const unitPath = ext.value;

  // (6) Idempotency: if diff against main is empty, unit has no contributions → ALREADY_RELEASED.
  const diffR = gitRun(cwd, ['diff', '--name-only', `main...${unitId}`]);
  if (diffR.status === 0 && (diffR.stdout ?? '').trim().length === 0) {
    return { exitCode: EXIT_OK, stdout: `RELEASE_OK ${unitId} ALREADY_RELEASED\n` };
  }

  // (7) D-62: checkout main BEFORE any root-file mutation so main is the mutation target.
  const checkoutMain = gitRun(cwd, ['checkout', '-q', 'main']);
  if (checkoutMain.status !== 0) {
    return {
      exitCode: EXIT_INTERNAL,
      stderr: `git checkout main failed: ${(checkoutMain.stderr ?? '').trim() || `exit ${checkoutMain.status}`}\n`,
    };
  }

  // (8) Squash-merge from unit branch.
  const squash = gitRun(cwd, ['merge', '--squash', unitId]);
  if (squash.status !== 0) {
    // WRN-02: Rollback failures must surface — otherwise the engineer cannot tell
    // "release rolled back cleanly" from "release rolled back with garbage left on main".
    const reset = gitRun(cwd, ['reset', '--hard', 'HEAD']);
    const checkoutBack = reset.status === 0 ? gitRun(cwd, ['checkout', '-q', unitId]) : { status: 0 };
    if (reset.status !== 0 || checkoutBack.status !== 0) {
      return {
        exitCode: EXIT_INTERNAL,
        stderr:
          `git merge --squash ${unitId} failed AND rollback failed.\n` +
          `merge stderr: ${(squash.stderr ?? '').trim()}\n` +
          `reset stderr: ${(reset.stderr ?? '').trim()}\n` +
          (checkoutBack.stderr ? `checkout stderr: ${(checkoutBack.stderr ?? '').trim()}\n` : '') +
          `Repository is in an inconsistent state. Inspect manually with 'git status' and 'git branch'.\n`,
      };
    }
    return {
      exitCode: EXIT_DOMAIN,
      stderr: `git merge --squash ${unitId} failed (likely D-60 violation):\n${(squash.stderr ?? '').trim()}\n`,
    };
  }

  // (9) Append release block to root aidlc-docs/audit.md (D-62 contract; AI-DLC append-only mandate).
  const isoTs = new Date().toISOString();
  const auditPath = safeJoin(cwd, 'aidlc-docs/audit.md');
  // WRN-04: mkdirSync(..., { recursive: true }) throws ENOTDIR if aidlc-docs exists
  // as a regular file rather than a directory. Translate to a structured error so
  // the helper still returns a {exitCode, stderr} envelope instead of bubbling an
  // unhandled exception out through dispatch.js.
  try {
    mkdirSync(safeJoin(cwd, 'aidlc-docs'), { recursive: true });
  } catch (e) {
    return {
      exitCode: EXIT_INTERNAL,
      stderr: `Cannot create aidlc-docs/: ${e.message}. Inspect main checkout.\n`,
    };
  }
  const archiveBaseName = `archive/${isoTimestampForBranch()}/${unitId}`;
  const archiveName = nextArchiveName(cwd, archiveBaseName) ?? archiveBaseName;
  const auditBlock =
    `\n## Release — ${unitId}\n` +
    `**Timestamp**: ${isoTs}\n` +
    `**Description**: ${description}\n` +
    `**Squash-merged from**: ${unitId} (now ${archiveName})\n` +
    `**Artifacts merged**: ${unitPath}/\n\n---\n`;
  appendFileSync(auditPath, auditBlock);

  // (10) Update root aidlc-docs/aidlc-state.md Stage Progress checkbox row (append-or-create).
  const statePath = safeJoin(cwd, 'aidlc-docs/aidlc-state.md');
  const stateLine = `- [x] Per-Unit Loop — unit \`${unitId}\` — RELEASED ${isoTs}\n`;
  if (existsSync(statePath)) {
    appendFileSync(statePath, stateLine);
  } else {
    writeFileSync(statePath, `# AI-DLC State\n\n## Stage Progress\n\n${stateLine}`);
  }

  // (11) Stage root file changes (path-scoped per T-04-03; never -am).
  const addR = gitRun(cwd, ['add', 'aidlc-docs/audit.md', 'aidlc-docs/aidlc-state.md']);
  if (addR.status !== 0) {
    return { exitCode: EXIT_INTERNAL, stderr: `git add failed: ${(addR.stderr ?? '').trim()}\n` };
  }

  // (12) Single atomic release commit.
  const commit = gitRun(cwd, ['commit', '-q', '-m', `release(${unitId}): ${description}`]);
  if (commit.status !== 0) {
    // WRN-02: surface rollback failures explicitly so the engineer can distinguish
    // "commit failed and we rolled back cleanly" from "commit failed AND rollback
    // failed, repository in inconsistent state".
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
    return {
      exitCode: EXIT_INTERNAL,
      stderr: `git commit failed: ${(commit.stderr ?? '').trim()}\n`,
    };
  }

  // (13) D-70: rename unit branch to archive ref. Collision -> append suffix.
  const renameR = gitRun(cwd, ['branch', '-m', unitId, archiveName]);
  if (renameR.status !== 0) {
    // WRN-03: release commit landed but archive rename failed — this is a partial
    // success and MUST surface as a non-zero exit so downstream automation does not
    // treat it as fully done. The release commit is preserved on stdout (stable
    // grep target), and the warning lives on stderr (the failure channel).
    return {
      exitCode: EXIT_INTERNAL,
      stdout: `RELEASE_OK ${unitId} ${archiveName}\n`,
      stderr:
        `WARNING: archive rename failed (release commit landed on main).\n` +
        `Run manually: git branch -m ${unitId} ${archiveName}\n` +
        `git stderr: ${(renameR.stderr ?? '').trim()}\n`,
    };
  }

  return { exitCode: EXIT_OK, stdout: `RELEASE_OK ${unitId} ${archiveName}\n` };
}
