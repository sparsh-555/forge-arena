#!/usr/bin/env node
/**
 * Stop hook: context window guard.
 *
 * Runs AFTER harness-loop.cjs in the Stop hook chain (see settings.json).
 * If harness-loop blocked the stop (pending tasks), this hook never fires.
 * If harness-loop allowed the stop (converged / no tasks), this checks
 * whether context is dangerously high before Claude exits.
 *
 * Thresholds:
 *   ≥ 90% → BLOCK: context is at critical level, compact before continuing
 *   ≥ 80% → WARN:  context is high, suggest /compact
 *   < 80% → PASS:  allow stop normally
 *
 * Never blocks context_limit stops (would deadlock compaction).
 * Never blocks user-abort stops.
 */

'use strict';

const fs = require('fs');

let input = {};
try {
  const raw = fs.readFileSync('/dev/stdin', 'utf8');
  input = JSON.parse(raw);
} catch { /* non-fatal — stdin may be empty on some hook events */ }

// Never interfere with context-limit or user-abort stops
const stopReason = (
  input.stop_reason ||
  input.stopReason ||
  input.reason ||
  ''
).toLowerCase();

const isContextLimit = [
  'context_limit', 'context_window', 'context_exceeded',
  'max_tokens', 'token_limit', 'conversation_too_long',
].some(p => stopReason.includes(p));

const isUserAbort = [
  'aborted', 'abort', 'cancel', 'interrupt', 'user_cancel',
].some(p => stopReason.includes(p));

if (isContextLimit || isUserAbort) {
  process.exit(0); // never block these
}

// Calculate context percentage
const used  = input.context_tokens_used  || input.tokens_used  || 0;
const limit = input.context_limit        || input.max_tokens   || 0;
const pct   = (used && limit) ? Math.round((used / limit) * 100) : 0;

if (pct >= 90) {
  console.log(
    JSON.stringify({
      decision: 'block',
      reason:
        `CONTEXT GUARD — Context at ${pct}% (${used}/${limit} tokens). ` +
        `Compacting now to preserve orchestration state. Run /compact, ` +
        `then resume. Current sprint state is in state/tasks.json.`,
    }),
  );
} else if (pct >= 80) {
  // Warn but allow — harness-loop already allowed this stop
  console.log(
    JSON.stringify({
      decision: 'block',
      reason:
        `CONTEXT GUARD — Context at ${pct}%. Consider running /compact before ` +
        `the next sprint to avoid mid-sprint compaction. ` +
        `State is safe in state/tasks.json and state/build-health.json.`,
    }),
  );
}
// < 80% or no token data: silent pass
