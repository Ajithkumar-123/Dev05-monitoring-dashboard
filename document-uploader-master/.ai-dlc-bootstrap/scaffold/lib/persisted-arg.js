// assets/scripts/lib/persisted-arg.js — Universal description-arg persistence helper.
// Implements the Description Persistence Convention (D-73 expanded; see ./CLAUDE.md):
//   1. Phase A captures $ARGUMENTS description and writes it to the question-file frontmatter.
//   2. Phase B with empty $ARGUMENTS recovers the persisted value.
//   3. Override: non-empty $ARGUMENTS on Phase B replaces the persisted value.
//
// D-156 (Phase 07.1 args-contract): API unchanged. Callers now pass
// process.env.AIDLC_ARGS-derived values to writePersistedArg/resolveArg
// (replacing the legacy positional-derived shape). The Universal Description-Arg
// Persistence Convention (CLAUDE.md) and tests/command-contract.test.js
// PERSISTENCE_CONVENTION_COMMANDS allow-list both remain authoritative.
//
// API:
//   writePersistedArg(filePath, fieldName, value)  - writes <fieldName>: '<escaped>' into YAML frontmatter
//   readPersistedArg(filePath, fieldName)          - returns { value: string | null }
//   resolveArg(rawArguments, persistedValue)       - override-on-non-empty resolver
//
// Storage shape: question-file YAML frontmatter (artifact-local; survives /clear; tamper-prone but
// repo-tracked under git; same trade-off as D-73 ratified in Phase 05.3).

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';

// Plan 05.3 code-review WR-01: split on /\r?\n/ so CRLF-line-ending files (Windows
// editors, git core.autocrlf) round-trip safely. Without this, `lines[0]` would be
// `'---\r'` and the strict equality check returned null, silently swallowing every
// persisted description on Windows.
function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0 || lines[0] !== '---') return null;
  const closeIdx = lines.indexOf('---', 1);
  if (closeIdx < 1) return null;
  return {
    fmLines: lines.slice(1, closeIdx),
    bodyLines: lines.slice(closeIdx + 1),
  };
}

// Plan 05.3 code-review CR-04: atomic write — temp+rename ensures any signal/OOM/
// disk-full mid-write leaves the canonical path either fully old or fully new, never
// truncated. Mirrors `escalation-marker.js#atomicWriteJson` and `preflight-escalate-
// fix.js#atomicWriteText`. Critical for fresh question-file writes (no git history
// to recover from).
function atomicWriteText(filePath, content) {
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, filePath);
}

// Plan 05.3 code-review CR-03: shared fieldName validator — used by both write and
// read paths. Asymmetry was a latent regex-injection vector (caller-supplied fieldName
// with regex special chars matched arbitrary fields on read while throwing on write).
function validateFieldName(fieldName) {
  if (typeof fieldName !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(fieldName)) {
    throw new Error('fieldName must be a simple YAML identifier ([A-Za-z][A-Za-z0-9_-]*)');
  }
}

function escapeYamlScalar(value) {
  // Single-quoted YAML scalar: escape literal single quote by doubling.
  return value.replace(/'/g, "''");
}

function unescapeYamlScalar(raw) {
  let s = raw.trim();
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
    s = s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

export function writePersistedArg(filePath, fieldName, value) {
  if (typeof value !== 'string') {
    throw new Error('value must be a string');
  }
  if (value.includes('\n') || value.includes('\r')) {
    throw new Error('value must be single-line YAML scalar (no embedded newlines)');
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(value)) {
    throw new Error('value contains control characters (invalid for YAML scalar)');
  }
  validateFieldName(fieldName);
  const newFieldLine = `${fieldName}: '${escapeYamlScalar(value)}'`;

  let text = '';
  if (existsSync(filePath)) {
    text = readFileSync(filePath, 'utf8');
  }
  const parsed = parseFrontmatter(text);
  if (!parsed) {
    // No frontmatter: prepend a fresh block (preserves existing body verbatim).
    const body = text;
    atomicWriteText(filePath, `---\n${newFieldLine}\n---\n${body}`);
    return;
  }
  // Replace existing field or append.
  const fmLines = parsed.fmLines.slice();
  const idx = fmLines.findIndex((line) => new RegExp(`^${fieldName}:\\s`).test(line));
  if (idx >= 0) {
    fmLines[idx] = newFieldLine;
  } else {
    fmLines.push(newFieldLine);
  }
  const out = `---\n${fmLines.join('\n')}\n---\n${parsed.bodyLines.join('\n')}`;
  atomicWriteText(filePath, out);
}

export function readPersistedArg(filePath, fieldName) {
  validateFieldName(fieldName);
  if (!existsSync(filePath)) return { value: null };
  let text;
  try { text = readFileSync(filePath, 'utf8'); } catch { return { value: null }; }
  const parsed = parseFrontmatter(text);
  if (!parsed) return { value: null };
  const fmText = parsed.fmLines.join('\n');
  // fieldName is validated above to a strict YAML identifier — no regex injection here.
  const m = fmText.match(new RegExp(`^${fieldName}:\\s*(.+)$`, 'm'));
  if (!m) return { value: null };
  return { value: unescapeYamlScalar(m[1]) };
}

export function resolveArg(rawArguments, persistedValue) {
  const raw = (typeof rawArguments === 'string') ? rawArguments.trim() : '';
  if (raw) return raw;
  const persisted = (typeof persistedValue === 'string') ? persistedValue.trim() : '';
  if (persisted) return persisted;
  return null;
}
