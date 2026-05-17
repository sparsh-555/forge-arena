#!/usr/bin/env node
/**
 * Stop hook: context window guard.
 *
 * Runs AFTER harness-loop.cjs in the Stop hook chain (see settings.json).
 * If harness-loop blocked the stop (pending tasks), this hook never fires.
 * If harness-loop allowed the stop (converged / no tasks), this checks
 * whether context usage has crossed a threshold before Claude exits.
 *
 * Thresholds are read from harness.config.json (context_guard section):
 *   compact_at_pct_used  → BLOCK and prompt /compact (default: 20%)
 *   warn_at_pct_used     → WARN only, allow stop (default: 15%)
 *
 * Expressed as % USED so "20% used = 80% free". For a 1M token model,
 * compacting at 20% (200K tokens used) keeps the orchestrator lean and
 * ensures workers always receive a fresh, low-noise context.
 *
 * Never blocks context_limit stops (would deadlock compaction).
 * Never blocks user-abort stops.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'harness.config.json'), 'utf8'));
  } catch { return {}; }
}

let input = {};
try {
  const raw = fs.readFileSync('/dev/stdin', 'utf8');
  input = JSON.parse(raw);
} catch { /* non-fatal */ }

// Never interfere with context-limit or user-abort stops
const stopReason = (
  input.stop_reason ||
  input.stopReason  ||
  input.reason      ||
  ''
).toLowerCase();

const isContextLimit = [
  'context_limit', 'context_window', 'context_exceeded',
  'max_tokens', 'token_limit', 'conversation_too_long',
].some(p => stopReason.includes(p));

const isUserAbort = [
  'aborted', 'abort', 'cancel', 'interrupt', 'user_cancel',
].some(p => stopReason.includes(p));

if (isContextLimit || isUserAbort) process.exit(0);

// Load thresholds from config
const cfg          = readConfig().context_guard || {};
const COMPACT_PCT  = cfg.compact_at_pct_used ?? 20;
const WARN_PCT     = cfg.warn_at_pct_used    ?? 15;
const CONFIG_LIMIT = cfg.context_limit       ?? 0;

// Prefer runtime token data; fall back to config-declared limit
const used  = input.context_tokens_used || input.tokens_used || 0;
const limit = input.context_limit || input.max_tokens || CONFIG_LIMIT || 0;
const pct   = (used && limit) ? Math.round((used / limit) * 100) : 0;
const free  = 100 - pct;

if (pct >= COMPACT_PCT) {
  const limitLabel = limit ? `${(limit / 1000).toFixed(0)}K` : 'unknown';
  console.log(
    JSON.stringify({
      decision: 'block',
      reason:
        `CONTEXT GUARD — ${pct}% used (${free}% free, ${used} / ${limitLabel} tokens). ` +
        `Threshold: compact at ${COMPACT_PCT}% used. ` +
        `Run /compact now, then resume. Sprint state is safe in state/tasks.json.`,
    }),
  );
} else if (pct >= WARN_PCT) {
  console.log(
    JSON.stringify({
      decision: 'block',
      reason:
        `CONTEXT GUARD — ${pct}% used (${free}% free). ` +
        `Approaching ${COMPACT_PCT}% compact threshold. ` +
        `Consider /compact before the next sprint to keep worker context clean. ` +
        `State is safe in state/tasks.json and state/build-health.json.`,
    }),
  );
}
// Below warn threshold or no token data: silent pass
