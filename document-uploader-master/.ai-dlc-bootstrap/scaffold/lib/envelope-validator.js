// assets/scripts/lib/envelope-validator.js — validate <aidlc-envelope> JSON. Pure: no IO.
// Throw style matches bin/lib/manifest.js#validateManifest precedent.
// Phase 06.1: Field renamed kind → status to match the envelope contract documented in
// assets/skills/aidlc-cluster-agent-pattern/SKILL.md. Pre-existing discrepancy: the validator
// previously checked the wrong field name; agents emit env.status. The validator was
// effectively untested against real agent envelopes.
export function validateEnvelope(env) {
  if (!env || typeof env !== 'object') throw new Error('envelope: not an object');
  if (typeof env.status !== 'string' || !env.status) {
    throw new Error('envelope: missing or non-string required field "status"');
  }
  // gate_id only required for GATE_QUESTIONS / GATE_APPROVAL. AWAITING_BUILD_TEST and
  // STAGE_COMPLETE/ERROR have no gate_id (Phase 06.1 D-135).
  if (['GATE_QUESTIONS', 'GATE_APPROVAL'].includes(env.status)) {
    if (typeof env.gate_id !== 'string' || !env.gate_id) {
      throw new Error(`envelope (${env.status}): missing or non-string required field "gate_id"`);
    }
  }
  if (typeof env.message !== 'string') {
    throw new Error('envelope: missing or non-string required field "message"');
  }
}
