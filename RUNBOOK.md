# forge-arena Runbook

Operations reference for Ralphthon Singapore, May 17, 2026.

## Pre-Event Checklist (before 10:30 AM)

- [ ] `ANTHROPIC_API_KEY` is set in shell (`echo $ANTHROPIC_API_KEY`)
- [ ] Assets generated and placed in `game-server/public/assets/`
- [ ] `cd game-server && npm install` completed
- [ ] `npm run build` exits 0
- [ ] `FAST_MODE=true node run-full-game.js --headless` prints `GAME_COMPLETE`
- [ ] Browser can reach `http://localhost:3000`
- [ ] Harness loop tested end-to-end at least once

## Unsupervised Run: 12:30 PM – 3:30 PM

1. Ensure `ANTHROPIC_API_KEY` is exported
2. Open Claude Code in the forge-arena repo root
3. Let Claude Code read `CLAUDE.md` and begin the session start protocol
4. Walk away. Do not touch laptop.

**If something breaks:** You cannot intervene. The Reconciler handles failures.

## Demo Start: 3:30 PM

```bash
# From forge-arena root
./game-server/demo-start.sh
```

This will:
1. Kill any harness Claude processes
2. Build the game server
3. Run headless test (must pass)
4. Start server at http://localhost:3000
5. Open dashboard in browser

## Emergency Manual Start

If demo-start.sh fails, run manually:
```bash
cd game-server
npm run build
export DEMO_MODE=true
export FAST_MODE=true
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}"
node dist/server.js &
open http://localhost:3000
```

## Demo Flow (3:30 PM – 4:30 PM)

1. Show dashboard — judges see game map + agent thought panels
2. Point to PATCH FEED panel — explain harness is evolving game rules live
3. Narrate agent strategies: "Aggressive charges the boss, Cautious maps the full dungeon first"
4. Arena semis start automatically after dungeon timer (2 min in FAST_MODE)
5. Arena final: Sonnet vs Sonnet — narrate the strategic reasoning
6. Point out patches that applied mid-match and how agents adapted

## Key URLs

| Service | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| Game state API | http://localhost:3000/api/game-state |
| Build health | http://localhost:3000/api/build-health |
| SSE harness events | http://localhost:3000/api/harness-events |
| WebSocket game | ws://localhost:3000/ws/game |

## Kill Server

```bash
# If you used demo-start.sh, it printed the PID
kill <SERVER_PID>

# Or find it:
lsof -ti:3000 | xargs kill
```

## Troubleshooting

**Build fails:**
```bash
cd game-server && npm run build 2>&1 | head -50
```

**Headless test fails:**
```bash
FAST_MODE=true node game-server/run-full-game.js --headless
```

**Port already in use:**
```bash
lsof -ti:3000 | xargs kill -9
```

**API key not found:**
```bash
export ANTHROPIC_API_KEY="your-key-here"
```
