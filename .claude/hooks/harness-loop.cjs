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

const PROJECT_ROOT   = path.join(__dirname, '..', '..');
const BUILD_HEALTH   = path.join(PROJECT_ROOT, 'state', 'build-health.json');
const TASKS_FILE     = path.join(PROJECT_ROOT, 'state', 'tasks.json');
const HARNESS_EVENTS = path.join(PROJECT_ROOT, 'state', 'harness-events.jsonl');

function appendHarnessEvent(event) {
  try {
    fs.appendFileSync(HARNESS_EVENTS, JSON.stringify({ ...event, timestamp: new Date().toISOString() }) + '\n');
  } catch { /* non-fatal */ }
}

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

const health = readJSON(BUILD_HEALTH);
const tasks  = readJSON(TASKS_FILE);

// Converged — hand off to evaluator's Evolution Mode, do not stop
if (health && health.converged === true) {
  appendHarnessEvent({ type: 'EVOLUTION_MODE_START', grade: health.grade });
  const reason =
    `HARNESS LOOP — build converged (grade A/B). Entering Evolution Mode. ` +
    `Read skills/evaluator.md and follow the "Evolution Mode" section exactly. ` +
    `Do NOT set converged back to false.`;
  console.log(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

const pending   = (tasks?.tasks     || []).filter(t => (t.status || 'pending') === 'pending');
const inProgress = (tasks?.tasks    || []).filter(t => t.status === 'in_progress');
const sprint    = tasks?.sprint     ?? 0;
const completed = (tasks?.completed || []).length;
const grade     = health?.grade     ?? null;

let reason;

if (!tasks || (pending.length === 0 && completed === 0)) {
  // No tasks yet — Planner hasn't run or tasks.json is empty
  appendHarnessEvent({ type: 'SPRINT_START', sprint: 1 });
  reason =
    `HARNESS LOOP — no tasks found. ` +
    `Read RUNTIME.md, then read skills/planner.md and act as Planner. ` +
    `Emit sprint 1 tasks to state/tasks.json. ` +
    `After writing tasks.json, immediately pick the first task and invoke Worker (read skills/worker.md). ` +
    `HARNESS EVENT LOGGING: whenever you (or a subagent) complete a task, append one NDJSON line to state/harness-events.jsonl: ` +
    `{"type":"TASK_COMPLETED","task":"<task-id>","sprint":<sprint>,"timestamp":"<ISO>"}. ` +
    `When starting a new sprint, append {"type":"SPRINT_START","sprint":<n>,"timestamp":"<ISO>"}.`;

} else if (pending.length > 0) {
  // Tasks exist — keep working
  appendHarnessEvent({ type: 'HARNESS_TICK', sprint, pending: pending.length, completed, grade });
  reason =
    `HARNESS LOOP — sprint ${sprint}, ${pending.length} task(s) pending, ${completed} done. ` +
    `Read state/tasks.json. Find the highest priority level among pending tasks. ` +
    `Collect ALL pending tasks at that priority level — they are independent and must run in parallel. ` +
    `If there are 2 or more tasks at that priority: use the Agent tool to dispatch one subagent per task simultaneously (parallel, not sequential). ` +
    `Brief each subagent with the full task description and instruct it to read skills/worker.md then implement the task. ` +
    `Each subagent must update state/tasks.json when done (move its task to completed) AND append to state/harness-events.jsonl: ` +
    `{"type":"TASK_COMPLETED","task":"<task-id>","sprint":${sprint},"timestamp":"<ISO>"}. ` +
    `If there is only one task at that priority: read skills/worker.md and implement it directly. ` +
    `Do NOT stop when tasks complete — this hook will fire again and direct you to the next batch.`;

} else if (completed > 0 && pending.length === 0) {
  // All tasks done — verify first, then Reconciler/Evaluator/Planner
  appendHarnessEvent({ type: 'SPRINT_END', sprint, completed, grade });
  if (grade === null || grade === 'F' || grade === 'D') {
    reason =
      `HARNESS LOOP — sprint ${sprint} tasks complete (${completed} done). Build grade: ${grade ?? 'unknown'}. ` +
      `First: read skills/verifier.md and act as Verifier — re-check each completed task against state/deliverables.json with fresh evidence. ` +
      `Any tasks that fail verification: re-queue them to pending in state/tasks.json. ` +
      `If tasks were re-queued: stop here, the next harness tick will dispatch workers to fix them. ` +
      `If all tasks verified: read skills/reconciler.md and act as Reconciler. ` +
      `Fix build errors, then re-run the build. Update state/build-health.json. ` +
      `After the build is green, invoke Evaluator (skills/evaluator.md).`;
  } else {
    reason =
      `HARNESS LOOP — sprint ${sprint} tasks complete (${completed} done). Build grade: ${grade}. ` +
      `First: read skills/verifier.md and act as Verifier — re-check each completed task against state/deliverables.json with fresh evidence. ` +
      `Any tasks that fail verification: re-queue them to pending in state/tasks.json. ` +
      `If tasks were re-queued: stop here, the next harness tick will dispatch workers to fix them. ` +
      `If all tasks verified: read skills/evaluator.md and act as Evaluator. Run all three evaluation phases. ` +
      `If grade is A or B for 2 consecutive cycles, write converged:true to state/build-health.json. ` +
      `Otherwise read skills/planner.md and plan the next sprint.`;
  }
}

console.log(JSON.stringify({ decision: 'block', reason }));
