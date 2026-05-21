// assets/scripts/lib/escalate-fix-orchestrate.js — gap-closure plan 06-10 (harness-incompat gap-4):
// Single-entry orchestrator wrapping preflightEscalateFix + escalateFix with the
// QUESTION_FILE early-exit gate moved helper-side. Replaces the bash-side
// `if echo "$HELPER_OUT" | grep -q '^# QUESTION_FILE '; then ... exit 0; fi`
// block (Plan 05.3-08 Gap 6 closure) so the slash-command bash block becomes a
// single-line pipe — the only shape the Claude Code 2.1.126+ harness accepts.
//
// Three paths through this orchestrator:
//
// A. Fresh-write (A_FIRST):
//    preflightEscalateFix writes escalate-fix-N-questions.md and emits
//    `# QUESTION_FILE <path>` in its stdout. Orchestrator detects that line,
//    appends `PHASE_A_HALT_OK <path>` as a terminal marker, and returns exitCode=0
//    WITHOUT invoking escalateFix. The downstream assert-marker pipe checks for
//    `PHASE_A_HALT_OK ` and confirms the halt.
//
// B. Partial-fill (A_PENDING):
//    preflightEscalateFix emits `# QUESTION_FILE_PENDING <path>` (note the
//    `_PENDING` suffix — distinct from `# QUESTION_FILE `). Orchestrator falls
//    through to escalateFix, which surfaces `# PHASE_A_HALT <...>`. The
//    downstream assert-marker pipe checks for `# PHASE_A_HALT ` on this path.
//
// C. Dispatch-ready (all three [Answer]: tags filled):
//    preflightEscalateFix emits `# QUESTION_FILE_READY <path>`. Orchestrator
//    falls through to escalateFix, which produces `DISPATCH_PAYLOAD ...`. The
//    downstream assert-marker pipe checks for `DISPATCH_PAYLOAD `.
//
// Detection guard (T-06-10-06): the fresh-write marker is `# QUESTION_FILE `
// (with a trailing space). `# QUESTION_FILE_PENDING ` starts with `# QUESTION_FILE_`
// (underscore next byte after `E`) — the trailing-space anchor ensures we never
// misclassify `_PENDING` as a fresh write.
import { preflightEscalateFix } from './preflight-escalate-fix.js';
import { escalateFix } from './escalate-fix.js';
import { EXIT_OK } from './report.js';

/**
 * @param {{ positional: string[], flags: Record<string, unknown>, cwd: string }} ctx
 * @returns {Promise<{ exitCode: number, stdout?: string, stderr?: string }>}
 */
export async function escalateFixOrchestrate(ctx) {
  // (1) Run preflight.
  const pre = await preflightEscalateFix(ctx);

  // (2) Forward preflight failures verbatim — no escalateFix call.
  if (pre.exitCode !== EXIT_OK) {
    return pre;
  }

  // (3) Scan preflight stdout for the fresh-write marker `# QUESTION_FILE ` (trailing
  //     space). Note: `# QUESTION_FILE_PENDING ` does NOT match because the character
  //     immediately after `QUESTION_FILE` is `_`, not ` `. This distinction is the
  //     key correctness invariant tested by escalate-fix-orchestrate.test.js Test 5.
  const preStdout = pre.stdout ?? '';
  const lines = preStdout.split('\n');
  const freshLine = lines.find((l) => l.startsWith('# QUESTION_FILE '));

  if (freshLine) {
    // Fresh-write path (A_FIRST): question file was just written by preflight.
    // Extract the path from the rest of the line (after `# QUESTION_FILE `).
    const qfPath = freshLine.slice('# QUESTION_FILE '.length).trim();
    const stdout = preStdout + `\nPHASE_A_HALT_OK ${qfPath}\n`;
    return { exitCode: EXIT_OK, stdout, stderr: pre.stderr };
  }

  // (4) Not a fresh-write: route through escalateFix.
  //     - `# QUESTION_FILE_PENDING ` path → escalateFix emits `# PHASE_A_HALT `.
  //     - `# QUESTION_FILE_READY ` path  → escalateFix produces `DISPATCH_PAYLOAD `.
  const efr = await escalateFix(ctx);

  // Concatenate stdout and stderr from both helpers so the caller's pipe sees all output.
  const stdout = preStdout + (efr.stdout ?? '');
  const stderr = (pre.stderr ?? '') + (efr.stderr ?? '');

  return { exitCode: efr.exitCode, stdout, stderr };
}
