#!/bin/bash
# session-start.sh — run at the start of every Claude Code harness session.
# Prints current state summary to stdout so agents begin with full context.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== forge-arena session start ==="
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# Build health
if [ -f "$REPO_ROOT/state/build-health.json" ]; then
  GRADE=$(python3 -c "import json,sys; d=json.load(open('$REPO_ROOT/state/build-health.json')); print(d.get('grade','null'))" 2>/dev/null || echo "unknown")
  CONVERGED=$(python3 -c "import json,sys; d=json.load(open('$REPO_ROOT/state/build-health.json')); print(d.get('converged', False))" 2>/dev/null || echo "false")
  MODE=$(python3 -c "import json,sys; d=json.load(open('$REPO_ROOT/state/build-health.json')); print(d.get('mode','build'))" 2>/dev/null || echo "build")
  echo "Build health: grade=$GRADE  converged=$CONVERGED  mode=$MODE"
fi

# Task queue summary
if [ -f "$REPO_ROOT/state/tasks.json" ]; then
  PENDING=$(python3 -c "
import json
d = json.load(open('$REPO_ROOT/state/tasks.json'))
tasks = d.get('tasks', [])
pending = [t for t in tasks if t.get('status') == 'pending']
claimed = [t for t in tasks if t.get('status') == 'claimed']
completed = len(d.get('completed', []))
print(f'pending={len(pending)}  claimed={len(claimed)}  completed={completed}')
" 2>/dev/null || echo "unreadable")
  echo "Tasks: $PENDING"
fi

# Patch queue depth
if [ -f "$REPO_ROOT/state/patch-queue.jsonl" ]; then
  PATCHES=$(wc -l < "$REPO_ROOT/state/patch-queue.jsonl" | tr -d ' ')
  echo "Patch queue: $PATCHES suggestions"
fi

# Recent events tail
if [ -f "$REPO_ROOT/state/game-events.jsonl" ] && [ -s "$REPO_ROOT/state/game-events.jsonl" ]; then
  echo ""
  echo "Last 3 game events:"
  tail -3 "$REPO_ROOT/state/game-events.jsonl"
fi

echo ""
echo "=== proceed with CLAUDE.md session start protocol ==="
