// assets/scripts/lib/dispatch.js — Subcommand dispatch. Pure besides the handler call.
import { EXIT_USAGE } from './report.js';
import { spawnSync } from 'node:child_process';
import { preflightUnitInception } from './preflight-unit-inception.js';
import { scaffoldUnitInception } from './scaffold-unit-inception.js';
import { preflightUnitDesign } from './preflight-unit-design.js';
import { preflightUnitConstruct } from './preflight-unit-construct.js';
import { preflightUnitRedesign, persistUnitRedesignDescription } from './preflight-unit-redesign.js';
// WRN-10: combine preflightChangeRequest + preflightChangeRequestEscalate into a
// single import — they live in the same module. Two separate `from` clauses for
// the same source file is an unconventional split-barrel pattern that obscures
// module locality and risks drift if a future refactor moves only one symbol.
import { preflightChangeRequest, preflightChangeRequestEscalate, persistChangeRequestDescription } from './preflight-change-request.js';
import { preflightProjectInception } from './preflight-project-inception.js';
import { preflightUnitSync } from './preflight-unit-sync.js';                                             // plan 05-04
import { preflightUnitRelease } from './preflight-unit-release.js';                                       // plan 05-05
import { unitRelease } from './unit-release.js';                                                          // plan 05-07
import { preflightNewMilestone } from './preflight-new-milestone.js';                                     // plan 05.2-04
import { newMilestone } from './new-milestone.js';                                                        // plan 05.2-04
import { preflightEscalateFix } from './preflight-escalate-fix.js';                                       // plan 05.3-02
import { escalateFix, escalateFixFinalize } from './escalate-fix.js';                                     // plan 05.3-03
import { resume } from './resume.js';                                                                     // Phase 6 plan 03
import { progress } from './progress.js';                                                                 // Phase 6 plan 04
import { auditReviewCollect, auditReviewFinalize } from './audit-review.js';                              // Phase 6 plan 05
import { assertMarker } from './assert-marker.js';                                                        // Phase 6 plan 10 (gap-closure 4)
import { escalateFixOrchestrate } from './escalate-fix-orchestrate.js';                                   // Phase 6 plan 10 (gap-closure 4)
import { runBuildAndTest } from './run-build-and-test.js';                                                // Phase 06.1

// DEF-M1-9/16/19 runtime guard (Sub-Wave 1) — refuse to surface STAGE_COMPLETE when
// a unit-scoped handler has written outside <unit-path>/. Scans git status --porcelain
// for modified/untracked paths; any path that does not start with `${unitPath}/` is a leak.
function detectCrossUnitLeak({ cwd, unitPath }) {
  const r = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8', timeout: 5000 });
  if (r.status !== 0) return { leaked: [] };
  const lines = (r.stdout ?? '').trim().split('\n').filter(Boolean);
  const leaked = [];
  for (const line of lines) {
    const path = line.slice(3); // skip "XY " porcelain-v1 prefix
    if (!path.startsWith(`${unitPath}/`)) leaked.push(path);
  }
  return { leaked };
}

// HANDLERS map populated by plans 04, 05, 06 as handlers ship.
// Each handler is an async function: ({ positional, flags, cwd }) => Promise<{ exitCode, stdout?, stderr? }>
export const HANDLERS = Object.freeze({
  'preflight-unit-inception': preflightUnitInception,      // plan 04
  'scaffold-unit-inception': scaffoldUnitInception,        // plan 04
  'preflight-unit-design': preflightUnitDesign,            // plan 05
  'preflight-unit-construct': preflightUnitConstruct,      // plan 05
  'preflight-unit-redesign': preflightUnitRedesign,        // plan 06
  'preflight-change-request': preflightChangeRequest,      // plan 06
  'preflight-project-inception': preflightProjectInception, // plan 06
  'preflight-unit-sync': preflightUnitSync,                              // plan 05-04
  'preflight-unit-release': preflightUnitRelease,                        // plan 05-05
  'unit-release': unitRelease,                                           // plan 05-07
  'preflight-change-request-escalate': preflightChangeRequestEscalate,   // plan 05-06
  'preflight-new-milestone': preflightNewMilestone,                       // plan 05.2-04
  'new-milestone': newMilestone,                                          // plan 05.2-04
  'preflight-escalate-fix': preflightEscalateFix,                         // plan 05.3-02
  'escalate-fix': escalateFix,                                            // plan 05.3-03
  'escalate-fix-finalize': escalateFixFinalize,                           // plan 05.3-03
  'change-request-persist-description': persistChangeRequestDescription,  // plan 05.3-07
  'unit-redesign-persist-description': persistUnitRedesignDescription,    // plan 05.3-07
  'resume': resume,                                                       // Phase 6 plan 03
  'progress': progress,                                                   // Phase 6 plan 04
  'audit-review-collect': auditReviewCollect,                             // Phase 6 plan 05
  'audit-review-finalize': auditReviewFinalize,                           // Phase 6 plan 05
  'assert-marker': assertMarker,                                          // Phase 6 plan 10 (gap-closure 4)
  'escalate-fix-orchestrate': escalateFixOrchestrate,                     // Phase 6 plan 10 (gap-closure 4)
  'run-build-and-test': runBuildAndTest,                                  // Phase 06.1
  // _test_noop: test-only handler for dispatch runtime guard regression test (DEF-M1-9/16/19).
  // Always returns { exitCode: 0, stdout: '', stderr: '' }; used to exercise the post-handler
  // cross-unit-leak guard without coupling the test to a real handler's output shape.
  '_test_noop': async () => ({ exitCode: 0, stdout: '', stderr: '' }),   // Plan 07.1-02 test guard
});

export async function dispatch({ subcommand, positional, flags, cwd, scope, unitPath, ...rest }) {
  const handler = HANDLERS[subcommand];
  if (!handler) {
    return {
      exitCode: EXIT_USAGE,
      stderr: `Unknown subcommand: ${subcommand}\nRun --help for usage.\n`,
    };
  }
  const result = await handler({ positional, flags, cwd, scope, unitPath, ...rest });
  // WR-08: explicit shape check — a future handler that returns undefined
  // or a primitive would otherwise be silently treated as exit 0 by the
  // `result.exitCode ?? EXIT_OK` fallback in scaffold.js.
  if (!result || typeof result !== 'object' || typeof result.exitCode !== 'number') {
    throw new Error(`Handler ${subcommand} returned invalid result shape: ${JSON.stringify(result)}`);
  }
  // DEF-M1-9/16/19 runtime guard — only enforced when caller declares unit scope.
  if (scope === 'unit' && unitPath) {
    const { leaked } = detectCrossUnitLeak({ cwd, unitPath });
    if (leaked.length > 0) {
      return {
        exitCode: 1,
        stderr: `STAGE_COMPLETE_WITH_CROSS_UNIT_LEAK ${leaked.join(' ')}\n`,
      };
    }
  }
  return result;
}
