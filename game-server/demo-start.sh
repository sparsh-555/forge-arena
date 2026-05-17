#!/bin/bash
# demo-start.sh — transition from harness build mode to demo mode.
# Run at 3:30 PM when the harness has converged and it's time to play.
# Usage: cd forge-arena && ./game-server/demo-start.sh

set -euo pipefail

# Always resolve to repo root regardless of where script is called from
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== forge-arena demo start ==="

# Kill any running harness sessions (claude code processes writing to state/)
echo "[1/5] Stopping harness..."
pkill -f "claude" || true
sleep 2

# Build the game (must be in game-server/ for npm commands)
echo "[2/5] Building game server..."
cd "$REPO_ROOT/game-server"
npm run build
echo "Build: OK"

# Verify headless test passes (run from game-server/ so process.cwd() is correct)
echo "[3/5] Running fast headless test..."
FAST_MODE=true node run-full-game.js --headless
echo "Headless test: OK"

# Set env vars and start game server from game-server/ directory
# IMPORTANT: server.ts uses import.meta.url for path resolution — must run from game-server/
echo "[4/5] Starting game server..."
export DEMO_MODE=true
export FAST_MODE=true
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY must be set}"
node dist/server.js &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"
sleep 2

# Open dashboard in browser
echo "[5/5] Opening dashboard..."
open "http://localhost:3000" 2>/dev/null || xdg-open "http://localhost:3000" 2>/dev/null || echo "Open http://localhost:3000 in your browser"

echo ""
echo "=== forge-arena is live ==="
echo "Dashboard: http://localhost:3000"
echo "Server PID: $SERVER_PID (kill with: kill $SERVER_PID)"
