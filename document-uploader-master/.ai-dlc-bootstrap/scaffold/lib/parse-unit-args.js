// assets/scripts/lib/parse-unit-args.js — Single-string $ARGUMENTS parser. Pure: no IO.
// Helper-side replacement for the bash preamble `ARGS="$ARGUMENTS"; UNIT_ID="${ARGS%% *}"` (D-77).
// First whitespace-delimited token = unit-id; rest (trimmed) = description.
// Returns null unitId for empty input; description is always a string (possibly empty).
// D-142 (Phase 07.1): signature pivoted from (positional) to (rawArgsString).
export function parseUnitArgs(rawArgsString) {
  const raw = (rawArgsString ?? '').trim();
  if (!raw) return { unitId: null, description: '', error: null };
  const m = raw.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  if (!m) return { unitId: null, description: '', error: 'Could not parse $ARGUMENTS' };
  return { unitId: m[1], description: (m[2] ?? '').trim(), error: null };
}
