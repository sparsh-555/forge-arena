#!/usr/bin/env bash
# preflight.sh — run before the demo to verify the full stack.
# Exits 0 only if everything is green. Any failure prints FAIL and exits 1.

set -euo pipefail
PASS=0
FAIL=0

ok()   { echo "  OK  $1"; PASS=$((PASS+1)); }
fail() { echo " FAIL $1"; FAIL=$((FAIL+1)); }

echo "=== forge-arena preflight ==="

# 1. API key
[ -n "${ANTHROPIC_API_KEY:-}" ] && ok "ANTHROPIC_API_KEY set" || fail "ANTHROPIC_API_KEY not set"

# 2. Port 3000 free
lsof -i :3000 -sTCP:LISTEN -t >/dev/null 2>&1 && fail "port 3000 in use" || ok "port 3000 free"

# 3. Build
echo "--- build ---"
(cd game-server && npm run build 2>&1 | tail -3) && ok "npm run build" || fail "npm run build"

# 4. Headless smoke test
echo "--- headless smoke ---"
(cd game-server && NO_API=true FAST_MODE=true node run-full-game.js --headless 2>/dev/null) \
  && ok "headless GAME_COMPLETE" || fail "headless GAME_COMPLETE"

# 5. SPEC behavioral acceptance tests — run every command in SPEC.md's section
echo "--- SPEC behavioral tests ---"
# 5a. ROUND_STATE events exist
ROUND_COUNT=$(grep -c '"type":"ROUND_STATE"' state/game-events.jsonl 2>/dev/null || echo 0)
[ "$ROUND_COUNT" -gt 0 ] && ok "ROUND_STATE events ($ROUND_COUNT)" || fail "ROUND_STATE events = 0 (not implemented)"

# 5b. Enemies moved
if [ "$ROUND_COUNT" -gt 1 ]; then
  ENEMIES_MOVED=$(node -e "
    const fs = require('fs');
    const lines = fs.readFileSync('state/game-events.jsonl','utf8').trim().split('\n')
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(e => e && e.type === 'ROUND_STATE');
    const first = lines[0].enemies, last = lines[lines.length-1].enemies;
    const moved = first.some((e,i) => last[i] && (last[i].position.x !== e.position.x || last[i].position.y !== e.position.y));
    process.stdout.write(moved ? 'true' : 'false');
  " 2>/dev/null)
  [ "$ENEMIES_MOVED" = "true" ] && ok "enemies moved" || fail "enemies frozen (did not move between first and last round)"
fi

# 5c. Agents moved
if [ "$ROUND_COUNT" -gt 1 ]; then
  AGENTS_MOVED=$(node -e "
    const fs = require('fs');
    const lines = fs.readFileSync('state/game-events.jsonl','utf8').trim().split('\n')
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(e => e && e.type === 'ROUND_STATE');
    const first = lines[0].agents, last = lines[lines.length-1].agents;
    const moved = Object.keys(first).some(id => last[id] && (last[id].position.x !== first[id].position.x || last[id].position.y !== first[id].position.y));
    process.stdout.write(moved ? 'true' : 'false');
  " 2>/dev/null)
  [ "$AGENTS_MOVED" = "true" ] && ok "agents moved" || fail "agents frozen (did not move between first and last round)"
fi

# 5d. Dashboard static checks
grep -qc 'new Phaser.Game' dashboard/src/GameView.tsx 2>/dev/null \
  && ok "Phaser.Game initialized in GameView" || fail "Phaser.Game not found in GameView.tsx"

grep -qc 'this\.load\.image\|this\.load\.spritesheet' dashboard/src/GameView.tsx 2>/dev/null \
  && ok "sprites loaded in GameView" || fail "no sprite loading in GameView.tsx"

grep -rq 'new WebSocket\|WebSocket(' dashboard/src/ 2>/dev/null \
  && ok "WebSocket connection in dashboard" || fail "no WebSocket connection in dashboard/src/"

# 5e. Personality files — all required sections present
PERSONALITY_FAIL=0
for id in aggressive cautious hoarder speedrunner; do
  for section in "## Identity" "## Core Drive" "## Item Priority" "## Combat Style" \
                 "## Exploration Strategy" "## Boss Encounter Strategy" "## Patch Awareness"; do
    grep -q "$section" "personalities/$id/CLAUDE.md" 2>/dev/null || {
      fail "personalities/$id/CLAUDE.md missing section: $section"
      PERSONALITY_FAIL=1
    }
  done
done
[ "$PERSONALITY_FAIL" -eq 0 ] && ok "all personality files complete"

# 5f. demo-start.sh exists and is executable
[ -x "demo-start.sh" ] && ok "demo-start.sh exists and is executable" || fail "demo-start.sh missing or not executable"

# 6. Server starts and endpoints respond
echo "--- live server ---"
(cd game-server && node dist/server.js &)
SERVER_PID=$!
sleep 3
curl -sf -o /dev/null http://localhost:3000 && ok "dashboard HTTP 200" || fail "dashboard HTTP 200"
curl -sf -o /dev/null http://localhost:3000/assets/agents/aggressive.png && ok "agent sprite 200" || fail "agent sprite 404"
curl -sf -o /dev/null http://localhost:3000/assets/tiles/floor.png && ok "tile sprite 200" || fail "tile sprite 404"
curl -sf -o /dev/null http://localhost:3000/api/game-state && ok "game-state API 200" || fail "game-state API failed"
kill $SERVER_PID 2>/dev/null; wait $SERVER_PID 2>/dev/null

# 7. Visual check — screenshot the running game, open for manual inspection
echo "--- visual check ---"
(cd game-server && NO_API=true FAST_MODE=true node dist/server.js &)
VSRV_PID=$!
sleep 2
(cd game-server && NO_API=true node run-full-game.js --headless 2>/dev/null &)
VGAME_PID=$!
sleep 6  # allow a few rounds to render

npx --yes playwright screenshot --wait-for-timeout=3000 \
  http://localhost:3000 /tmp/forge-arena-visual.png 2>/dev/null \
  && ok "screenshot saved → /tmp/forge-arena-visual.png" \
  || fail "playwright screenshot failed (playwright not installed?)"

kill $VGAME_PID $VSRV_PID 2>/dev/null; wait $VGAME_PID $VSRV_PID 2>/dev/null

if [ -f /tmp/forge-arena-visual.png ]; then
  echo ""
  echo "  → Opening screenshot for manual visual inspection..."
  echo "  → Check: tile grid visible? sprites not circles? agents on map?"
  open /tmp/forge-arena-visual.png 2>/dev/null || xdg-open /tmp/forge-arena-visual.png 2>/dev/null || true
fi

# Summary
echo ""
echo "=== preflight: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && echo "READY FOR DEMO" && exit 0 || echo "FIX FAILURES BEFORE DEMO" && exit 1
