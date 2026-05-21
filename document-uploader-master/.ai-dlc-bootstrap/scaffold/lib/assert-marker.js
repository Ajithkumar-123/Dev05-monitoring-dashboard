// assets/scripts/lib/assert-marker.js — gap-closure plan 06-10 (harness-incompat gap-4):
// Stdin-forwarder + line-anchored literal-prefix marker assertion. Replaces bash-side
// `echo "$HELPER_OUT" | grep -q '^MARKER' || { echo "..." >&2; exit 1; }` blocks with a
// single-line pipe-friendly scaffold subcommand the harness accepts (Claude Code 2.1.126+
// rejects multi-line bash with brace-quote forms or `if`/`then`/`fi` blocks — see
// 06-HUMAN-UAT.md gap-4-harness-incompat).
//
// Why streaming (not buffer-then-assert)?
// The upstream helper's stdout must be visible to the engineer in real time. A buffered
// approach would hold all output until EOF. Streaming writes each chunk to process.stdout
// immediately while scanning complete lines for the marker pattern.
//
// Why return stdout: '' (not result.stdout)?
// scaffold.js line 48: `if (result.stdout) process.stdout.write(result.stdout)`. The truthy
// check skips empty strings — no double-write. We already wrote every chunk to process.stdout
// during the read loop; the returned stdout: '' is intentional.
//
// Thread-safety: process.stdin is a single global stream. Do not call assertMarker
// concurrently in the same process.
import { EXIT_OK, EXIT_USAGE } from './report.js';

/**
 * @param {{ positional: string[], flags: Record<string, unknown>, cwd: string, _stdin?: import('node:stream').Readable, _stdout?: import('node:stream').Writable }} ctx
 *   `_stdin` and `_stdout` are optional test-injection overrides (not used in production).
 *   In production, process.stdin / process.stdout are used directly.
 * @returns {Promise<{ exitCode: number, stdout?: string, stderr?: string }>}
 */
export async function assertMarker({ positional, _stdin, _stdout }) {
  const raw = positional[0];

  // Missing or whitespace-only pattern → EXIT_USAGE.
  if (!raw || raw.trim() === '') {
    return {
      exitCode: EXIT_USAGE,
      stdout: '',
      stderr: 'assert-marker: missing required marker pattern\n',
    };
  }

  // Comma-separated patterns: split on comma, preserve each piece as-is (including
  // leading/trailing spaces that form part of the literal prefix match).
  // Empty pieces (e.g., from `,,`) are dropped.
  const patterns = raw.split(',').filter((s) => s.length > 0);
  if (patterns.length === 0) {
    return {
      exitCode: EXIT_USAGE,
      stdout: '',
      stderr: 'assert-marker: missing required marker pattern\n',
    };
  }

  // Read stdin line-by-line; stream each chunk back to stdout while scanning.
  let buf = '';
  let matched = false;

  /**
   * Check whether `line` starts with ANY of the patterns (literal prefix; CRLF stripped).
   * Pattern is NOT a regex — no escaping, no meta-chars. We use String.startsWith so
   * `.` in the pattern matches only `.`, not any character.
   */
  function checkLine(line) {
    // Strip trailing \r before matching (CRLF safety).
    const stripped = line.endsWith('\r') ? line.slice(0, -1) : line;
    for (const p of patterns) {
      if (stripped.startsWith(p)) {
        matched = true;
        return;
      }
    }
  }

  // Resolve the stream sources: use injected streams (_stdin/_stdout) in tests,
  // fall back to process.stdin / process.stdout in production.
  const stdinStream = _stdin ?? process.stdin;
  const stdoutStream = _stdout ?? process.stdout;

  await new Promise((resolve, reject) => {
    stdinStream.setEncoding('utf8');

    stdinStream.on('data', (chunk) => {
      // Forward the raw chunk to stdout immediately so the engineer sees helper output.
      stdoutStream.write(chunk);

      buf += chunk;
      // Process all complete lines in buf (everything up to the last \n).
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        checkLine(line);
      }
    });

    stdinStream.on('end', () => {
      // Process any trailing partial-line (no terminating \n).
      if (buf.length > 0) checkLine(buf);
      resolve();
    });

    stdinStream.on('error', reject);
  });

  if (matched) {
    return { exitCode: EXIT_OK, stdout: '' };
  }

  // Marker not found: build a human-readable label from all patterns.
  // Single pattern: "Helper succeeded but emitted no RESUME_OK marker — halt."
  // Multiple patterns: "Helper succeeded but emitted no PHASE_A_HALT_OK / # PHASE_A_HALT / DISPATCH_PAYLOAD  marker — halt."
  const label = patterns.join(' / ');
  return {
    exitCode: 1,
    stdout: '',
    stderr: `Helper succeeded but emitted no ${label} marker — halt.\n`,
  };
}
