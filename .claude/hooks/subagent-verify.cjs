#!/usr/bin/env node
/**
 * SubagentStop hook: gate-check worker output before orchestrator continues.
 *
 * Fires in the PARENT (orchestrator) context after each subagent completes.
 * Does not know which specific task just ran, so only checks invariants
 * that are always true after ANY worker finishes:
 *
 *   1. TypeScript must still compile (workers must not introduce type errors)
 *
 * Task completion state is enforced by harness-loop.cjs (which sees the full
 * task queue after all parallel workers finish). Checking it here would
 * false-positive during parallel dispatch when other workers are still running.
 *
 * Decision: block + fix instructions if TypeScript fails.
 * Decision: silent pass (process.exit 0, no output) if all checks pass.
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const GAME_SERVER = path.join(PROJECT_ROOT, 'game-server');

function checkTypeScript() {
  try {
    const out = execSync('npx tsc --noEmit 2>&1', {
      cwd: GAME_SERVER,
      timeout: 30000,
      encoding: 'utf8',
    });
    if (out.includes('error TS')) {
      return extractErrors(out);
    }
    return null;
  } catch (err) {
    const out = (err.stdout || err.message || '').toString();
    if (out.includes('error TS')) return extractErrors(out);
    return null; // tsc missing or other non-type failure — don't block
  }
}

function extractErrors(out) {
  return out
    .split('\n')
    .filter(l => l.includes('error TS'))
    .slice(0, 6)
    .join('\n');
}

const errors = checkTypeScript();
if (errors) {
  console.log(
    JSON.stringify({
      decision: 'block',
      reason:
        `SUBAGENT VERIFY — TypeScript compile failed after worker completed:\n` +
        `${errors}\n\n` +
        `Fix these type errors before the next task runs.\n` +
        `Command: cd game-server && npx tsc --noEmit`,
    }),
  );
}
// No output = allow orchestrator to continue (Claude Code treats exit 0 + no decision as pass)
