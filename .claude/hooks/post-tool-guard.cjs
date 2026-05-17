#!/usr/bin/env node
/**
 * PostToolUse hook: guard state file integrity after every tool call.
 *
 * Two checks:
 *
 *   1. JSON validity — if the orchestrator just wrote a state/*.json file,
 *      verify it is valid JSON before Claude continues. A malformed
 *      tasks.json or build-health.json would silently break the harness loop.
 *
 *   2. Context warning — if context is approaching the limit, inject a
 *      visible reminder so the orchestrator notices before it's too late.
 *
 * Outputs nothing (silent pass) when all is well.
 * Outputs a warning string (not a block) for context; blocks for bad JSON.
 */

'use strict';

const fs = require('fs');
const path = require('path');

let input = {};
try {
  const raw = fs.readFileSync('/dev/stdin', 'utf8');
  input = JSON.parse(raw);
} catch { /* non-fatal */ }

const toolName  = (input.tool_name  || '').toLowerCase();
const toolInput = input.tool_input  || {};

// ── Check 1: JSON validity on state file writes ──────────────────────────────
if (toolName === 'write' || toolName === 'edit') {
  const filePath = toolInput.file_path || toolInput.path || '';
  const isStateJson =
    filePath.includes('state/') && filePath.endsWith('.json') ||
    filePath.includes('build-health') ||
    filePath.includes('tasks.json');

  if (isStateJson) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      JSON.parse(content);
    } catch (err) {
      // File written but content is not valid JSON
      const msg = err.message || String(err);
      process.stdout.write(
        `\nPOST-TOOL GUARD: ${path.basename(filePath)} is not valid JSON after write: ${msg}. ` +
        `Fix the file before proceeding — a malformed JSON state file will break the harness loop.\n`,
      );
    }
  }
}

// ── Check 2: Context window warning ─────────────────────────────────────────
const used  = input.context_tokens_used  || input.tokens_used  || 0;
const limit = input.context_limit        || input.max_tokens   || 0;
const pct   = (used && limit) ? Math.round((used / limit) * 100) : 0;

if (pct >= 85) {
  process.stdout.write(
    `\nPOST-TOOL GUARD: Context at ${pct}% (${used}/${limit} tokens). ` +
    `Run /compact soon — harness state is in state/tasks.json.\n`,
  );
}
