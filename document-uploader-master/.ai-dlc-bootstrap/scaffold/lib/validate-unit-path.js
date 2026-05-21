// assets/scripts/lib/validate-unit-path.js — char-class allow-list + structural checks. Pure: no IO.
//
// BL-02: defense in depth.
// - char-class allow-list catches non-allowed bytes (control chars, $, <, >, etc.)
// - explicit `..`-segment rejection catches in-tree traversal (`a/../b`) that
//   safeJoin would silently flatten — `safeJoin` only rejects paths that
//   resolve OUTSIDE root, so `services/legit/../other` would be accepted as
//   `services/other`. Rejecting at the validation layer treats `..` as a
//   malformed Directory cell rather than a legitimate path.
// - leading `/` and `./` are rejected so the contract is "clean relative path".
const SAFE_PATH = /^[A-Za-z0-9._/-]+$/;

export function validateUnitPath(unitPath) {
  if (!unitPath || !SAFE_PATH.test(unitPath)) {
    return { error: `UNIT_PATH '${unitPath}' contains characters outside the allow-list [A-Za-z0-9._/-]. Refusing to scaffold.` };
  }
  if (unitPath.startsWith('/') || unitPath.startsWith('./')) {
    return { error: `UNIT_PATH '${unitPath}' must be a clean relative path (no leading '/' or './'). Refusing to scaffold.` };
  }
  if (unitPath.split('/').some((seg) => seg === '..')) {
    return { error: `UNIT_PATH '${unitPath}' contains a '..' segment. Refusing to scaffold.` };
  }
  return { ok: true };
}
