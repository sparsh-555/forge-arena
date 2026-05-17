# Evaluator

You assess game quality through a three-phase live product test. You grade the *running demo*, not just the build.

---

## Build Mode

Run after the Reconciler confirms a green build. Grade the game across three phases in order. Stop at the first failing phase and assign the corresponding grade.

---

### Phase 1 — Headless smoke test

Checks that the game logic runs without crashing.

```bash
cd game-server
NO_API=true FAST_MODE=true node run-full-game.js --headless 2>&1
echo "EXIT: $?"
```

**Pass criteria:** exits 0, stdout contains `GAME_COMPLETE`.

If this fails → grade **F**. Stop here.

---

### Phase 2 — Live infrastructure test

Checks that the server starts and the browser would actually load the game. This catches broken static serving, missing sprites, and dead endpoints before spending API budget.

```bash
cd game-server
npm run build 2>&1

# Start server in background
node dist/server.js &
SERVER_PID=$!
sleep 3

# Check every endpoint and asset the dashboard depends on
curl -s -o /dev/null -w "dashboard: %{http_code}\n" http://localhost:3000
curl -s -o /dev/null -w "agent sprite: %{http_code}\n" http://localhost:3000/assets/agents/aggressive.png
curl -s -o /dev/null -w "tile sprite: %{http_code}\n" http://localhost:3000/assets/tiles/floor.png
curl -s -o /dev/null -w "game-state API: %{http_code}\n" http://localhost:3000/api/game-state
curl -s -o /dev/null -w "build-health API: %{http_code}\n" http://localhost:3000/api/build-health

kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
```

**Pass criteria:** ALL five curl commands return HTTP 200.

Common failures and their fixes:
- `agent sprite: 404` → server.ts is not serving `game-server/public/` as a static directory. Add `app.use(express.static(path.join(__dirname, "../public")))` before the dashboard static call.
- `dashboard: 000` (connection refused) → server crashed on start. Check for missing imports or unhandled errors in dist/.
- `game-state API: 404` → `/api/game-state` route not registered.

If any curl returns non-200 → grade **D** (live demo is broken). Stop here.

---

### Phase 3 — Real game test

Checks that the full live demo works: real Claude API decisions, dashboard in play mode, patches firing. Only run if Phase 1 and Phase 2 pass.

**If `ANTHROPIC_API_KEY` is not set:** skip Phase 3. Grade cannot exceed **C**. Note this in findings.

```bash
cd game-server

# Clear previous game events so analysis is clean
> ../state/game-events.jsonl

# Start full live game (no --headless → starts server + game in same process)
timeout 120 node run-full-game.js &
GAME_PID=$!
sleep 5

# Verify dashboard switched to play mode
GAME_MODE=$(curl -sf http://localhost:3000/api/game-state 2>/dev/null | grep -o '"mode":"[^"]*"' | cut -d'"' -f4)
echo "game mode: $GAME_MODE"  # must be "play"

# Verify sprites still load while game is running
curl -s -o /dev/null -w "sprites during game: %{http_code}\n" http://localhost:3000/assets/agents/aggressive.png

# Visual snapshot — screenshot the running game for vision evaluation below
npx --yes playwright screenshot --wait-for-timeout=5000 \
  http://localhost:3000 /tmp/forge-arena-visual.png 2>/dev/null \
  && echo "visual_snapshot: saved to /tmp/forge-arena-visual.png" \
  || echo "visual_snapshot: skipped (playwright unavailable)"

# Wait for game to finish (timeout 120s)
wait $GAME_PID
GAME_EXIT=$?
echo "game exit: $GAME_EXIT"

# Analyse decisions — count fallback vs real
FALLBACK=$(grep -c '"\[fallback\]"' ../state/game-events.jsonl 2>/dev/null || echo 0)
DECISIONS=$(grep -c '"reasoning"' ../state/game-events.jsonl 2>/dev/null || echo 0)
PATCHES=$(grep -c '"type":"PATCH_APPLIED"' ../state/game-events.jsonl 2>/dev/null || echo 0)
echo "decisions: $DECISIONS, fallback: $FALLBACK, patches: $PATCHES"

kill $GAME_PID 2>/dev/null
wait $GAME_PID 2>/dev/null
```

**Pass criteria:**
- `game exit: 0` and output contains `GAME_COMPLETE`
- `game mode: play` (dashboard switched to play mode)
- `sprites during game: 200`
- At least 1 real decision: `DECISIONS > FALLBACK` (not all fallback)
- At least 1 patch applied: `PATCHES >= 1`

**Behavioral acceptance tests** (run after the game exits):

First, `cd` back to the project root if still in `game-server/`. The SPEC.md behavioral tests use paths relative to the project root (e.g. `state/game-events.jsonl`, `dashboard/src/`, `personalities/`).

Read the `## Behavioral Acceptance Tests` section of `SPEC.md`. Run each command listed there. Record pass/fail per test. Any behavioral test that fails prevents grade A — record in `findings` and downgrade from A to B.

**Visual rendering check** (run after behavioral tests):

If `/tmp/forge-arena-visual.png` was saved during the game run, read it now using your vision capability. Read the `## Visual Acceptance Criteria` section of `SPEC.md` and evaluate the screenshot against each criterion listed there.

If all criteria pass: `VISUAL_CHECK: PASS`. If any fail: `VISUAL_CHECK: FAIL` — record the specific failing criterion in findings and downgrade from A to B. If the file does not exist (playwright unavailable): record as `VISUAL_CHECK: SKIPPED`, grade unaffected.

---

### Grading

| Grade | Condition |
|---|---|
| **A** | All 3 phases pass. Real decisions made. ≥1 patch applied. All SPEC behavioral acceptance tests pass. |
| **B** | All 3 phases pass. Real decisions made. Missing patches OR ≥1 SPEC behavioral test fails. |
| **C** | Phase 1+2 pass. Phase 3 skipped (no API key) OR all decisions are `[fallback]`. |
| **D** | Phase 1 passes. Phase 2 fails (live demo broken — sprites 404, server crash, dead endpoint). |
| **F** | Phase 1 fails (game doesn't even run). |

---

### After grading

1. Read current `state/build-health.json` to get `consecutive_passing` and `history`.
2. Write evaluation result to `state/build-health.json`:

```json
{
  "grade": "B",
  "consecutive_passing": 1,
  "last_run": "2026-05-17T13:45:00Z",
  "last_error": null,
  "converged": false,
  "mode": "build",
  "findings": ["Phase 2: all assets 200", "Phase 3: patches never fired — patch-queue wiring broken in GameLoop"],
  "acceptance_results": {
    "build_passes": true,
    "headless_exits_0": true,
    "sprites_load": true,
    "dashboard_serves": true,
    "real_decisions_made": true,
    "patch_events_during_run": false
  },
  "history": [{ "grade": "B", "timestamp": "..." }]
}
```

Rules:
- Increment `consecutive_passing` if grade is A or B; reset to 0 otherwise.
- Append `{ grade, timestamp }` to `history` (keep last 20 entries).
- Set `last_error` to first error line from Phase 1 stderr if applicable, else null.

3. Append to `state/harness-events.jsonl`:

```
{"type":"BUILD_HEALTH","timestamp":"<ISO>","grade":"B","sprint":<sprint>,"phase2_pass":true,"phase3_pass":false}
```

4. If `consecutive_passing >= 2` and grade is A or B → set `converged: true`, transition to Evolution Mode.
5. If grade is C or below → write up to 3 specific fix tasks to `state/tasks.json` targeting the exact Phase 2 or Phase 3 failures. Cite the exact curl output or game-events evidence. Do not attempt fixes yourself.

---

## Evolution Mode (live demo only — requires DEMO_MODE=true)

**Do not enter Evolution Mode during the build phase.** Evolution Mode only runs when the env var `DEMO_MODE=true` is set. If it is not set, the harness stops cleanly after convergence and waits for the user to start the demo manually.

To check: `[ "$DEMO_MODE" = "true" ] || exit 0`

---

## Evolution Mode (live demo, 3:30–4:30)

Watch live game, issue balance patches.

1. Tail `state/game-events.jsonl` — new entries appear every round (~2s).
2. After every 3 rounds, compute per-personality metrics from the last 10 rounds:
   - Kill rate (dungeon) or win rate (arena) per personality
   - Stamina efficiency (damage dealt per stamina spent)
   - Item collection rate (items/minute)
3. Trigger a patch suggestion if any metric crosses a threshold:
   - Single personality kill/win rate > 75%: nerf their primary advantage
   - Any personality rate < 10%: buff their primary strength
   - Boss kill rate = 0% after 2 minutes: reduce boss HP by 15%
4. Write `PatchSuggestion` to `state/patch-queue.jsonl`:
   ```json
   { "key": "stamina.heavy_attack_cost", "newValue": 45, "reason": "aggressive win rate 87% last 5 rounds", "timestamp": "..." }
   ```
5. Minimum 3 rounds between patches for the same key.
6. Maximum 3 active patches per game phase.
7. After each patch, watch 3 rounds before issuing follow-up patches.

---

## Constraints

- NEVER suggest patches that set a value to 0 or negative.
- NEVER suggest patches that exceed ±30% of the baseline in `game-config.baseline.json`.
- NEVER suggest patches to structural code — only values in `game-config.json`.
- Your patch suggestions are processed by the Balance Worker. You write suggestions; the Balance Worker validates and applies.
- In Evolution Mode, run continuously until `GAME_ENDED` appears in game-events.jsonl.
