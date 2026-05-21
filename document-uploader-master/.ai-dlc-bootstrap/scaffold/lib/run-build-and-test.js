// assets/scripts/lib/run-build-and-test.js — Phase 06.1 (per-unit Build and Test).
// Reads <unit-path>/aidlc-docs/construction/build-and-test/run-build-and-test.sh,
// spawns it via async child_process.spawn (NOT spawnSync — unit tests can be slow
// and blocking the event loop is wrong; see RESEARCH §Pattern 2). Captures
// stdout + stderr + exit. Emits BT_OK on exit 0, BT_FAIL <200-char stderr tail>
// on non-zero. Writes <unit-path>/aidlc-docs/construction/build-and-test/last-run.log
// (single overwrite file, D-128 / D-133 — no archive, no rotation).
//
// Marker-line contract (assert-marker.js startsWith anchor): BT_OK and BT_FAIL
// MUST be the FIRST bytes on their line, no prefix.
//
// Test-injection: `_spawn` parameter mirrors the `_stdin`/`_stdout` precedent in
// assert-marker.js. Production uses child_process.spawn; tests inject a fake.
import { spawn as realSpawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { EXIT_OK, EXIT_USAGE } from './report.js';

const STDERR_TAIL_LEN = 200; // OQ-6: 200 chars per RESEARCH; full stderr in last-run.log.

/**
 * @param {{ positional: string[], flags?: Record<string, unknown>, cwd?: string, _spawn?: Function }} ctx
 *   `_spawn` is an optional test-injection override (production uses child_process.spawn).
 *   Mirrors the `_stdin`/`_stdout` injection pattern in assert-marker.js.
 * @returns {Promise<{ exitCode: number, stdout?: string, stderr?: string }>}
 */
export async function runBuildAndTest({ positional, _spawn }) {
  const [unitPath] = positional || [];

  // (1) Validate unitPath present — EXIT_USAGE (64) per dispatch handler contract.
  if (!unitPath) {
    return {
      exitCode: EXIT_USAGE,
      stderr: 'Usage: scaffold run-build-and-test <unit-path>\n',
    };
  }

  // (2) Assert script exists at the canonical path (D-59 / D-133).
  //     spawn is NEVER called when script is absent (Test 4 invariant).
  const btDir = join(unitPath, 'aidlc-docs/construction/build-and-test');
  const scriptPath = join(btDir, 'run-build-and-test.sh');
  const logPath = join(btDir, 'last-run.log');

  if (!existsSync(scriptPath)) {
    return {
      exitCode: 1,
      stdout: `BT_FAIL script not found: ${scriptPath}\n`,
      stderr: `run-build-and-test.sh not found at ${scriptPath}\n`,
    };
  }

  // (3) Execute via async spawn (not spawnSync — event loop blocking is wrong).
  //     Use `bash <scriptPath>` rather than relying on shebang + execute bit —
  //     the agent generates the script and its permission bits are unspecified.
  //     cwd=unitPath: correct per RESEARCH OQ-3 / Pattern 2.
  //     We do NOT chdir the Node process; we pass cwd to spawn only.
  // DEF-M1-8: spawn receives absolute path; cwd is also unitPath, so a relative
  // scriptPath would be doubled in some shells.
  const absScriptPath = resolve(scriptPath);
  const spawnFn = _spawn ?? realSpawn;
  const proc = spawnFn('bash', [absScriptPath], { cwd: unitPath, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdoutBuf = '';
  let stderrBuf = '';
  proc.stdout.on('data', (chunk) => { stdoutBuf += chunk.toString('utf8'); });
  proc.stderr.on('data', (chunk) => { stderrBuf += chunk.toString('utf8'); });

  const exitCode = await new Promise((resolve, reject) => {
    proc.on('close', (code) => resolve(code));
    proc.on('error', (err) => reject(err));
  });

  // (4) Write last-run.log: full stdout + full stderr (NOT the truncated tail).
  //     Single overwrite file per D-128 / D-133 — no archive, no rotation.
  const logBody =
    `--- run-build-and-test.sh exit=${exitCode} ---\n` +
    `[stdout]\n${stdoutBuf}\n` +
    `[stderr]\n${stderrBuf}\n`;
  writeFileSync(logPath, logBody, 'utf8');

  // (5) Emit marker on stdout.
  //     BT_OK / BT_FAIL MUST be the FIRST bytes on their line (assert-marker startsWith anchor).
  if (exitCode === 0) {
    return { exitCode: EXIT_OK, stdout: 'BT_OK\n' };
  }

  // Non-zero: emit BT_FAIL marker with last STDERR_TAIL_LEN chars of stderr.
  // Newlines replaced by spaces and trimmed — inline in the marker line (OQ-6).
  // Full stderr is in last-run.log for diagnostics.
  const tail = stderrBuf.slice(-STDERR_TAIL_LEN).replace(/\n/g, ' ').trim();
  return { exitCode: 1, stdout: `BT_FAIL ${tail}\n` };
}
