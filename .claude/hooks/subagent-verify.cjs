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
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

// Read build path from harness.config.json — change this file, not this hook
function getConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'harness.config.json'), 'utf8'));
  } catch { return {}; }
}
const config = getConfig();
const BUILD_PATH = path.join(PROJECT_ROOT, config.typescript_check?.path ?? '.');
const TSC_COMMAND = config.typescript_check?.command ?? 'npx tsc --noEmit 2>&1';
const FAIL_PATTERN = config.typescript_check?.fail_pattern ?? 'error TS';
const TIMEOUT = config.typescript_check?.timeout_ms ?? 30000;

function checkTypeScript() {
  if (config.typescript_check?.enabled === false) return null;
  try {
    const out = execSync(TSC_COMMAND, {
      cwd: BUILD_PATH,
      timeout: TIMEOUT,
      encoding: 'utf8',
    });
    if (out.includes(FAIL_PATTERN)) return extractErrors(out);
    return null;
  } catch (err) {
    const out = (err.stdout || err.message || '').toString();
    if (out.includes(FAIL_PATTERN)) return extractErrors(out);
    return null; // tsc missing or non-type failure — don't block
  }
}

function extractErrors(out) {
  return out
    .split('\n')
    .filter(l => l.includes(FAIL_PATTERN))
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
        `Command: cd ${config.typescript_check?.path ?? '.'} && ${TSC_COMMAND}`,
    }),
  );
}
// No output = allow orchestrator to continue (Claude Code treats exit 0 + no decision as pass)
