// assets/scripts/lib/new-milestone.js — Action handler: clears bootstrap orchestrator state (D-83/D-84).
// D-84 invariant: NEVER modifies vendor AI-DLC files — AI-DLC's append-only audit history is preserved.
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { safeJoin, STATE_DIR_NAME } from './paths.js';
import { EXIT_OK, EXIT_INTERNAL } from './report.js';
import { preflightNewMilestone } from './preflight-new-milestone.js';

export async function newMilestone({ positional, cwd }) {
  // Re-run pre-flight defense-in-depth.
  const pf = await preflightNewMilestone({ positional, cwd });
  if (pf.exitCode !== EXIT_OK) return pf;

  const statePath = safeJoin(cwd, join(STATE_DIR_NAME, 'inception', 'project-orchestrator-state.json'));
  if (existsSync(statePath)) {
    try { unlinkSync(statePath); }
    catch (e) { return { exitCode: EXIT_INTERNAL, stderr: `Could not clear orchestrator state: ${e.message}\n` }; }
  }

  return { exitCode: EXIT_OK, stdout: `NEW_MILESTONE_OK state cleared (or absent)\n` };
}
