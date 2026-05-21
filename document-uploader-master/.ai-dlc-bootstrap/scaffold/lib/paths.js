// assets/scripts/lib/paths.js — path helpers. Pure: no IO.
// safeJoin copied verbatim from bin/lib/paths.js so the deployed helper has zero dep on bin/lib/.
import { isAbsolute, join, resolve, sep } from 'node:path';

export const STATE_DIR_NAME = '.ai-dlc-bootstrap';

/**
 * Joins `root` and `rel`, refusing any path that escapes `root` (via `..`)
 * or that is absolute. Returns an absolute, normalized path inside root.
 *
 * Rejects:
 *   - empty `rel`
 *   - absolute `rel` (`/etc/passwd`, `C:\\...` on Windows)
 *   - `rel` that resolves outside `root` (`../escape.txt`)
 */
export function safeJoin(root, rel) {
  if (typeof rel !== 'string' || rel.length === 0) {
    throw new Error('safeJoin: rel must be a non-empty string');
  }
  if (isAbsolute(rel)) {
    throw new Error(`safeJoin: rel must be relative; got absolute path "${rel}"`);
  }
  const absRoot = resolve(root);
  const candidate = resolve(absRoot, rel);
  // Final-position containment check. Tolerant of intermediate `..` so long as
  // the resolved path lands inside root.
  if (candidate !== absRoot && !candidate.startsWith(absRoot + sep)) {
    throw new Error(`safeJoin: "${rel}" resolves outside root "${absRoot}"`);
  }
  return candidate;
}

// Helper-specific path builders (replace bash-side ${UNIT_PATH}/.../ constructions):

export function unitDescriptionPath(cwd, unitId) {
  return safeJoin(cwd, join('aidlc-docs', 'inception', 'units', `${unitId}.md`));
}

export function unitInceptionStatePath(cwd, unitPath) {
  return safeJoin(cwd, join(unitPath, STATE_DIR_NAME, 'inception', 'orchestrator-state.json'));
}

export function unitConstructionStatePath(cwd, unitPath) {
  return safeJoin(cwd, join(unitPath, STATE_DIR_NAME, 'construction', 'orchestrator-state.json'));
}

export function unitEscalationsDir(cwd, unitPath) {
  return safeJoin(cwd, join(unitPath, STATE_DIR_NAME, 'escalations'));
}

export function unitSyncDir(cwd, unitPath) {
  return safeJoin(cwd, join(unitPath, 'aidlc-docs', 'construction', 'sync'));
}
