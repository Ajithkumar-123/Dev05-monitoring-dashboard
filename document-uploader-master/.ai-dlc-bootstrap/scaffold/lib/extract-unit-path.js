// assets/scripts/lib/extract-unit-path.js — extract Directory cell from unit description. Pure: readFileSync/existsSync only.
//
// WR-06 invariant: error strings emitted from this function MUST NOT include
// the unsanitized cell value or any other untrusted file contents. Callers
// string-interpolate the returned `error` directly into stderr; including
// raw cell content would create a terminal-injection surface (CSI sequences,
// newlines, etc.). When a future error path needs to reference the bad value,
// pass it through validateUnitPath's allow-list first or surface a structured
// error type.
import { readFileSync, existsSync } from 'node:fs';

// Strict canonical form — cluster-agent contract is `**Directory** | <path> |`.
const DIRECTORY_ROW = /^\|\s*\*\*Directory\*\*\s*\|\s*([^|]+?)\s*\|/m;

// WR-04: detect a Directory-LIKE row (any bold/italic/backtick/none decoration)
// so we can emit a clearer diagnostic when the strict pattern misses.
const DIRECTORY_ROW_LOOSE = /^\|\s*[*_`]*Directory[*_`]*\s*\|/m;

export function extractUnitPath(unitFilePath) {
  if (!existsSync(unitFilePath)) {
    return { error: `Unit description not found at ${unitFilePath}` };
  }
  const text = readFileSync(unitFilePath, 'utf8');
  const match = text.match(DIRECTORY_ROW);
  if (!match) {
    if (DIRECTORY_ROW_LOOSE.test(text)) {
      // Loose match found — the row is THERE but the formatting is non-standard.
      return {
        error: `${unitFilePath} has a Directory-like row but its formatting is non-standard. Use the canonical form: | **Directory** | <path> |`,
      };
    }
    return { error: `${unitFilePath} has no Directory row` };
  }
  const value = match[1].trim().replace(/\/+$/, '');
  if (value === 'N/A' || value === '') {
    return { error: `${unitFilePath} has Directory=${value || 'empty'}. Cannot scaffold.` };
  }
  return { value };
}
