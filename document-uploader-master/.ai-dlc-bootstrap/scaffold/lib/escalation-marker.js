// assets/scripts/lib/escalation-marker.js — D-67 escalation marker schema + scan + validate-against-main.
// Used by preflight-change-request (write on escalate path), preflight-unit-sync (scan + validate),
// preflight-unit-release (scan for D-69 #2). Sequential N filename (escalation-N.json) per OQ7.
// Sub-Wave 2 (DEF-M1-14, Plan 07.1-02): adds sibling-file stale-hint primitives (writeStaleHintMarker,
//   scanStaleHintMarkers) using STALE_HINT_SCHEMA_VERSION=1. MARKER_SCHEMA_VERSION stays at 1 (no bump).
// Sub-Wave 3 (DEF-M1-17, Plan 07.1-02): adds lifecycle deletion primitives (deleteMarker,
//   deletePendingMarkersForUnit). Regex /^escalation-\d+\.json$/ is intentionally tight — does NOT
//   match -stale.json siblings (T-07.1-02-04 mitigation).
import { existsSync, readdirSync, readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { unitEscalationsDir } from './paths.js';

export const MARKER_SCHEMA_VERSION = 1;

/**
 * WRN-06: atomic write — write to a temp path then rename (atomic on POSIX).
 * A signal/OOM/disk-full mid-write would otherwise leave the marker file as
 * truncated/corrupted partial JSON, which would crash the consumer in
 * scanEscalationMarkers (JSON.parse throws unhandled).
 */
function atomicWriteJson(path, obj) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  renameSync(tmp, path);
}

export function writeEscalationMarker(cwd, unitPath, { description, expectedInceptionArtifact }) {
  // Plan 05.3-08 Gap 8 defense-in-depth: refuse to write a marker with an empty
  // description. Empty markers poison the most-recent-pending selection in
  // preflight-escalate-fix and force the cluster to dispatch with no actionable
  // change directive. Prevent the bad state at the source.
  if (description === null || description === undefined || (typeof description === 'string' && description.trim().length === 0)) {
    throw new Error('writeEscalationMarker: refusing to write a marker with empty description (Gap 8 guard). Recover description from question-file frontmatter or pass an explicit non-empty description.');
  }
  const dir = unitEscalationsDir(cwd, unitPath);
  mkdirSync(dir, { recursive: true });
  const existing = readdirSync(dir).filter((n) => /^escalation-\d+\.json$/.test(n));
  const next = existing.length === 0
    ? 1
    : Math.max(...existing.map((n) => parseInt(n.match(/^escalation-(\d+)\.json$/)[1], 10))) + 1;
  const path = join(dir, `escalation-${next}.json`);
  const marker = {
    schema_version: MARKER_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    description,
    expected_inception_artifact: expectedInceptionArtifact ?? null,
    status: 'pending',
  };
  atomicWriteJson(path, marker);
  return { path, marker };
}

export function scanEscalationMarkers(cwd, unitPath) {
  const dir = unitEscalationsDir(cwd, unitPath);
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir).filter((n) => /^escalation-\d+\.json$/.test(n));
  return entries
    .sort((a, b) => {
      const an = parseInt(a.match(/^escalation-(\d+)\.json$/)[1], 10);
      const bn = parseInt(b.match(/^escalation-(\d+)\.json$/)[1], 10);
      return an - bn;
    })
    .map((name) => {
      // WRN-06: tolerate corrupt/partial JSON (e.g., from a non-atomic write that
      // was interrupted). A corrupt marker surfaces as a non-resolved entry with a
      // `corrupt` status so D-69 #2 still rejects the release rather than crashing.
      const text = readFileSync(join(dir, name), 'utf8');
      try {
        return { name, marker: JSON.parse(text) };
      } catch (e) {
        return {
          name,
          marker: {
            status: 'corrupt',
            error: e.message,
            timestamp: '1970-01-01T00:00:00.000Z',
          },
        };
      }
    });
}

export function validateMarkerAgainstMain(cwd, unitId, marker) {
  const r = spawnSync(
    'git',
    [
      'log',
      'main',
      `--grep=^escalate-fix(${unitId}):`,
      '--since',
      marker.timestamp,
      '--format=%H %s',
    ],
    { cwd, encoding: 'utf8', timeout: 5000 },
  );
  if (r.status !== 0) {
    return { found: false, commits: [], error: (r.stderr ?? '').trim() };
  }
  const commits = (r.stdout ?? '').trim().split('\n').filter(Boolean);
  return { found: commits.length > 0, commits };
}

export function markMarkerResolved(cwd, unitPath, markerName) {
  const dir = unitEscalationsDir(cwd, unitPath);
  const path = join(dir, markerName);
  const marker = JSON.parse(readFileSync(path, 'utf8'));
  marker.status = 'resolved';
  marker.resolved_at = new Date().toISOString();
  // WRN-06: atomic write protects against partial-write corruption mid-resolve.
  atomicWriteJson(path, marker);
}

// ---------------------------------------------------------------------------
// Sub-Wave 2 (DEF-M1-14): sibling-file stale-hint primitives.
// STALE_HINT_SCHEMA_VERSION is independent; MARKER_SCHEMA_VERSION is NOT bumped.
// Stale-hint files are named `escalation-N-stale.json` (sibling of escalation-N.json).
// ---------------------------------------------------------------------------

export const STALE_HINT_SCHEMA_VERSION = 1;

export function writeStaleHintMarker(cwd, unitPath, { markerN, since }) {
  const dir = unitEscalationsDir(cwd, unitPath);
  mkdirSync(dir, { recursive: true });
  const hintPath = join(dir, `escalation-${markerN}-stale.json`); // SIBLING FILE
  const hint = {
    schema_version: STALE_HINT_SCHEMA_VERSION,
    downstream_stale: true,
    downstream_stale_since: since ?? new Date().toISOString(),
    markerN,
  };
  atomicWriteJson(hintPath, hint);
}

export function scanStaleHintMarkers(cwd, unitPath) {
  const dir = unitEscalationsDir(cwd, unitPath);
  if (!existsSync(dir)) return [];
  const re = /^escalation-(\d+)-stale\.json$/; // SIBLING-NAME PATTERN
  const hints = [];
  for (const name of readdirSync(dir)) {
    if (!re.test(name)) continue;
    try {
      const text = readFileSync(join(dir, name), 'utf8');
      const hint = JSON.parse(text);
      if (hint.downstream_stale === true) hints.push(hint);
    } catch { /* corrupt — skip */ }
  }
  return hints;
}

// ---------------------------------------------------------------------------
// Sub-Wave 3 (DEF-M1-17): lifecycle deletion primitives.
// deleteMarker: one-shot delete of a named marker (tolerates concurrent delete).
// deletePendingMarkersForUnit: supersede-on-write — deletes all pending markers.
// Regex /^escalation-\d+\.json$/ is intentionally anchored: does NOT match -stale.json siblings.
// ---------------------------------------------------------------------------

export function deleteMarker(cwd, unitPath, markerName) {
  const dir = unitEscalationsDir(cwd, unitPath);
  const path = join(dir, markerName);
  if (!existsSync(path)) return;
  try { unlinkSync(path); } catch { /* tolerate concurrent delete */ }
}

export function deletePendingMarkersForUnit(cwd, unitPath) {
  const dir = unitEscalationsDir(cwd, unitPath);
  if (!existsSync(dir)) return; // no-op when escalations dir absent
  for (const name of readdirSync(dir)) {
    if (!/^escalation-\d+\.json$/.test(name)) continue; // tightness: NOT -stale.json
    const path = join(dir, name);
    try {
      const marker = JSON.parse(readFileSync(path, 'utf8'));
      if (marker.status === 'resolved') continue; // leave for sync cleanup
      unlinkSync(path);
    } catch { /* corrupt — skip */ }
  }
}
