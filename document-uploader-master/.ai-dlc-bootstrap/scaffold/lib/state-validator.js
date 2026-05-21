// assets/scripts/lib/state-validator.js — validate orchestrator-state.json. Pure: no IO.
// Used by preflight-unit-redesign in plan 06.
const VALID_SCOPES = new Set(['project', 'unit']);

export function validateState(state) {
  if (!state || typeof state !== 'object') throw new Error('state: not an object');
  if (!VALID_SCOPES.has(state.scope)) {
    throw new Error(`state: invalid scope "${state.scope}" (must be project|unit)`);
  }
  for (const f of ['current_cluster', 'current_stage', 'last_updated']) {
    if (typeof state[f] !== 'string' || !state[f]) {
      throw new Error(`state: missing or non-string required field "${f}"`);
    }
  }
  // G-04-06: started_at is OPTIONAL at the schema layer for backward compatibility
  // with state files written before the design/construct command contracts were
  // updated to set it. When present it MUST be a non-empty string. Orchestrators
  // that need a stable timestamp anchor (e.g. /aidlc-unit-redesign D-48 rewind)
  // MUST backfill from `last_updated` when started_at is absent.
  if (state.started_at !== undefined && (typeof state.started_at !== 'string' || !state.started_at)) {
    throw new Error('state: started_at must be a non-empty string when present');
  }
  if (state.scope === 'unit' && (typeof state.unit_id !== 'string' || !state.unit_id)) {
    throw new Error('state: scope=unit requires non-empty unit_id');
  }
  // last_envelope is OPTIONAL at this validation layer: it may be absent
  // (initial state, before the first stage commit) or set to an object.
  // When present, validateEnvelope is the source of truth for its shape;
  // here we only enforce the "object (and not null/array) when present"
  // outer-shape contract. Callers that require a populated envelope must
  // check `state.last_envelope` themselves.
  if (state.last_envelope !== undefined && (typeof state.last_envelope !== 'object' || state.last_envelope === null || Array.isArray(state.last_envelope))) {
    throw new Error('state: last_envelope must be an object when present');
  }
}
