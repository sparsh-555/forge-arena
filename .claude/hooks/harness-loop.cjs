#!/usr/bin/env node
/**
 * Stop hook: keeps the forge-arena harness running autonomously.
 *
 * Claude Code calls this on every Stop event (when Claude would normally
 * pause and wait for user input). We read state files and either:
 *   - Allow stop (exit 0) if the build has converged
 *   - Block stop (JSON decision=block) with a targeted next-action prompt
 *
 * The "reason" field is injected into Claude's context, telling it exactly
 * what to do next — no human typing required.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const BUILD_HEALTH = path.join(PROJECT_ROOT, 'state', 'build-health.json');
const TASKS_FILE  = path.join(PROJECT_ROOT, 'state', 'tasks.json');

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

const health = readJSON(BUILD_HEALTH);
const tasks  = readJSON(TASKS_FILE);

// Done — allow Claude to stop
if (health && health.converged === true) {
  process.exit(0);
}

const pending   = (tasks?.tasks     || []).filter(t => (t.status || 'pending') === 'pending');
const sprint    = tasks?.sprint     ?? 0;
const completed = (tasks?.completed || []).length;
const grade     = health?.grade     ?? null;
const mode      = health?.mode      ?? 'build';

let reason;

if (!tasks || (pending.length === 0 && completed === 0)) {
  // No tasks yet — Planner hasn't run or tasks.json is empty
  reason =
    `HARNESS LOOP — no tasks found. ` +
    `Read RUNTIME.md, then read skills/planner.md and act as Planner. ` +
    `Emit sprint 1 tasks to state/tasks.json. ` +
    `After writing tasks.json, immediately pick the first task and invoke Worker (read skills/worker.md).`;

} else if (pending.length > 0) {
  // Tasks exist — keep working
  reason =
    `HARNESS LOOP — sprint ${sprint}, ${pending.length} task(s) pending, ${completed} done. ` +
    `Read state/tasks.json. Pick the highest-priority pending task. ` +
    `Read skills/worker.md and implement it. ` +
    `Write result back to state/tasks.json (move task to completed). ` +
    `Do NOT stop when the task is done — this hook will fire again and direct you to the next task.`;

} else if (completed > 0 && pending.length === 0) {
  // All tasks done — run Reconciler, then Evaluator or Planner
  if (grade === null || grade === 'F' || grade === 'D') {
    reason =
      `HARNESS LOOP — sprint ${sprint} tasks complete (${completed} done). Build grade: ${grade ?? 'unknown'}. ` +
      `Read skills/reconciler.md and act as Reconciler. ` +
      `Fix build errors, then re-run the build. Update state/build-health.json. ` +
      `After the build is green, invoke Evaluator (skills/evaluator.md).`;
  } else {
    reason =
      `HARNESS LOOP — sprint ${sprint} tasks complete (${completed} done). Build grade: ${grade}. ` +
      `Read skills/evaluator.md and act as Evaluator. Run the headless test. ` +
      `If grade is A or B for 2 consecutive cycles, write converged:true to state/build-health.json and stop. ` +
      `Otherwise read skills/planner.md and plan the next sprint.`;
  }
}

console.log(JSON.stringify({ decision: 'block', reason }));
