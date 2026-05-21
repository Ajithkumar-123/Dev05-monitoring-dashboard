// assets/scripts/lib/git-probes.js — git probes via spawnSync. Read-only IO.
import { spawnSync } from 'node:child_process';

/**
 * Returns the current branch name as a structured result.
 *
 * Shape:
 *   - `{ branch: '<name>' }` when HEAD points at a named ref.
 *   - `{ detached: true }` when HEAD is genuinely detached (git reports
 *     "ref HEAD is not a symbolic ref" or "fatal: ref HEAD is not...").
 *
 * Throws on any other failure mode (git not installed, not a git repo,
 * permission denied, spawn timeout, etc.) so the caller can surface the
 * underlying diagnostic instead of misclassifying it as detached HEAD.
 *
 * BL-04: previously returned the literal sentinel string '(detached)' for
 * EVERY non-zero exit, which (a) collided with a real branch literally
 * named '(detached)' and (b) masked all other git failure modes.
 *
 * WR-05: stderr from the failure path is now propagated into the thrown
 * Error message so the caller can surface "git not found" vs "not a git
 * repo" vs "permission denied".
 */
export function currentBranch(cwd) {
  const r = spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], {
    cwd, encoding: 'utf8', timeout: 5000,
  });
  if (r.status !== 0) {
    const stderr = (r.stderr ?? '').trim();
    // Detached HEAD: git emits "fatal: ref HEAD is not a symbolic ref" (or
    // a localised variant). Match the stable English phrase.
    if (/not a symbolic ref/i.test(stderr)) {
      return { detached: true };
    }
    throw new Error(`git symbolic-ref --short HEAD failed: ${stderr || `exit ${r.status}`}`);
  }
  return { branch: (r.stdout ?? '').trim() };
}

export function workingTreeIsClean(cwd) {
  const r = spawnSync('git', ['status', '--porcelain'], {
    cwd, encoding: 'utf8', timeout: 5000,
  });
  if (r.status !== 0) {
    throw new Error(`git status failed: ${r.stderr ?? ''}`);
  }
  return (r.stdout ?? '').trim().length === 0;
}

export function branchExists(cwd, branchName) {
  const r = spawnSync('git', ['rev-parse', '--verify', branchName], {
    cwd, encoding: 'utf8', timeout: 5000,
  });
  return r.status === 0;
}

/**
 * `git show <ref>:<relPath>` — read a file from a sibling branch without checkout.
 *
 * Shape:
 *   - `{ stdout: '<file-content>' }` on success.
 *   - `{ error: 'REF_MISSING', stderr }` when ref does not exist (git: "fatal: invalid object name").
 *   - `{ error: 'PATH_MISSING', stderr }` when ref exists but path missing (git: "path '...' does not exist in '...'").
 *   - `{ error: 'GIT_FAILED', stderr }` for any other non-zero exit.
 *
 * 06-RESEARCH §Pattern 1 + §Common Pitfalls #4 — caller branches on `error` to render
 * different diagnostics (RELEASED vs PENDING_SCAFFOLD vs ERROR) without misclassifying
 * "scaffold not yet committed" as "git failed".
 */
export function showFromRef(cwd, ref, relPath) {
  const r = spawnSync('git', ['show', `${ref}:${relPath}`], {
    cwd, encoding: 'utf8', timeout: 5000,
  });
  if (r.status === 0) return { stdout: r.stdout };
  const stderr = (r.stderr ?? '').trim();
  if (/^fatal: invalid object name/i.test(stderr)) {
    return { error: 'REF_MISSING', stderr };
  }
  if (/path '.+' does not exist in/i.test(stderr)) {
    return { error: 'PATH_MISSING', stderr };
  }
  return { error: 'GIT_FAILED', stderr };
}

/**
 * `git ls-tree --name-only <ref>:<relPath>` — enumerate directory entries on a sibling branch.
 *
 * Shape:
 *   - `{ entries: ['name1', 'name2', ...] }` on success (empty array if directory empty).
 *   - `{ error: 'PATH_MISSING', stderr }` when ref exists but directory missing.
 *   - `{ error: 'GIT_FAILED', stderr }` for any other non-zero exit.
 *
 * 06-RESEARCH §Pattern 1.
 */
export function lsTreeFromRef(cwd, ref, relPath) {
  const r = spawnSync('git', ['ls-tree', '--name-only', `${ref}:${relPath}`], {
    cwd, encoding: 'utf8', timeout: 5000,
  });
  if (r.status === 0) {
    const entries = (r.stdout ?? '').trim().split('\n').filter(Boolean);
    return { entries };
  }
  const stderr = (r.stderr ?? '').trim();
  if (/Not a valid object name/i.test(stderr)) return { error: 'PATH_MISSING', stderr };
  return { error: 'GIT_FAILED', stderr };
}

/**
 * Resolve a unit-id to its current ref — live branch first, then archive ref(s).
 *
 * Shape:
 *   - `{ ref: '<unitId>', archived: false }` when live branch exists.
 *   - `{ ref: 'archive/<ts>/<unitId>', archived: true, archiveTimestamp: '<ts>', allArchives: [...] }` when only archive ref(s) exist.
 *   - `{ error: 'NO_REF', unitId }` when neither live nor archive ref exists.
 *   - `{ error: 'GIT_FAILED', stderr }` on git CLI failure.
 *
 * Multi-archive case (released twice across milestones): refs are sorted lexicographically
 * by archive timestamp; ISO 8601 sorts correctly as strings, so the LATEST archive
 * is the last element. `allArchives` exposes the full list.
 *
 * 06-RESEARCH §Pattern 2 + §Common Pitfalls #5.
 */
export function resolveUnitRef(cwd, unitId) {
  // Try live unit branch first.
  const live = spawnSync('git', ['rev-parse', '--verify', '--quiet', unitId], {
    cwd, encoding: 'utf8', timeout: 5000,
  });
  if (live.status === 0) {
    return { ref: unitId, archived: false };
  }
  // Fall back to archive refs.
  const archives = spawnSync('git', [
    'for-each-ref', '--format=%(refname:short)',
    `refs/heads/archive/*/${unitId}`,
  ], { cwd, encoding: 'utf8', timeout: 5000 });
  if (archives.status !== 0) return { error: 'GIT_FAILED', stderr: (archives.stderr ?? '').trim() };
  const refs = (archives.stdout ?? '').trim().split('\n').filter(Boolean).sort();
  if (refs.length === 0) return { error: 'NO_REF', unitId };
  const latest = refs[refs.length - 1];
  const m = latest.match(/^archive\/([^/]+)\/(.+)$/);
  return {
    ref: latest,
    archived: true,
    archiveTimestamp: m ? m[1] : null,
    allArchives: refs,
  };
}
