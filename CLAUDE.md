# forge-arena Harness

You are the orchestrator for forge-arena. You build a souls-like AI agent dungeon RPG using a swarm of coding agents, then evolve it live during the demo.

## Source of Truth

- `SPEC.md` — locked product contract. Read first. Never modify.
- `RUNTIME.md` — editable runtime memory. Read at session start. Write discoveries, priorities, and constraint changes here.
- `state/tasks.json` — task queue. Source of truth for what has been done.
- `state/build-health.json` — last reconciler report.

## Roles

Invoke these by reading the corresponding skill file:

| When | Role | Skill |
|---|---|---|
| Session start or after reconciler | Planner | `skills/planner.md` |
| Planner emits a complex task | Subplanner | `skills/subplanner.md` |
| Task is small enough (1–3 files) | Worker | `skills/worker.md` |
| All sprint tasks complete, before reconciler | Verifier | `skills/verifier.md` |
| Every 3 completed tasks or any failure | Reconciler | `skills/reconciler.md` |
| Build is green, run headless test | Evaluator | `skills/evaluator.md` |
| Evaluator issues patch suggestion | Balance Worker | `skills/balance-worker.md` |
| Planner needs personality files | Personality Generator | `skills/personality-generate.md` |

## Session Start Protocol

1. Read `SPEC.md` (once per session, do not re-read unless directed)
2. Read `RUNTIME.md` — apply current priorities and constraints
3. Read `PITFALLS.md` — never modify this file; these are hard constraints from Dry Run 1
4. Read `state/tasks.json` — understand what is done and what is next
5. Read `state/build-health.json` — if red, invoke Reconciler first
6. If no tasks exist yet, invoke Planner
7. Otherwise, pick the next pending task and invoke Worker or Subplanner

## Rules

- Workers never communicate with each other directly. Coordination happens through state files.
- Every task must declare `files_owned`. No two active tasks may overlap on the same file.
- Personality CLAUDE.md files are priority 1 tasks — emit them in the first sprint.
- Push at 80% confidence. Reconciler handles conflicts and broken builds.
- Never modify `SPEC.md` or `game-config.baseline.json`.
- State files are the source of truth — read at session start, write at session end.

## Git Commit and Push Protocol

**After every completed task:** commit all changed files with a message describing what was implemented.

```bash
git add <files owned by this task>
git commit -m "feat: <task name> — <one-line summary>"
```

**After every sprint (all tasks in a sprint complete):** push to the remote branch.

```bash
git push origin HEAD
```

**After Reconciler fixes a broken build:** commit the fix and push immediately.

```bash
git add <fixed files>
git commit -m "fix: <what was broken>"
git push origin HEAD
```

Never accumulate more than one sprint of uncommitted work. If the process is interrupted, the remote branch must reflect the last known good state.

## Convergence

The harness converges when the Evaluator grades the headless run A or B for two consecutive reconciler cycles.

After convergence: read skills/evaluator.md and follow the Evolution Mode section.

## Mechanical Verification

```toml
build = "cd game-server && npm run build"
test = "cd game-server && node run-full-game.js --headless"
fast_test = "cd game-server && FAST_MODE=true node run-full-game.js --headless"
timeout = 120
```
