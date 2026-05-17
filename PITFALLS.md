# PITFALLS — Dry Run 1 Lessons

> **READ-ONLY** — Do not modify this file. These are hard constraints derived from Dry Run 1.
> Agent instructions: Read this file at session start. Never write to it.

---

## PITFALL 1 — FATAL: Live Demo Connection

**What broke:** run-full-game.js was headless-only. Dashboard showed build health view forever. No live game visible to judges.

run-full-game.js MUST implement TWO modes in one file:

**Mode 1 — `--headless` flag (CI/Evaluator):**
- No server started. Runs game, exits 0 on GAME_COMPLETE, exits 1 on crash.

**Mode 2 — no flag (live demo):**
```js
import { startServer, setGameState } from './dist/server.js';
await startServer();       // starts HTTP + WebSocket on port 3000 — SAME process
const state = { ... };
setGameState(state);       // switches dashboard from HarnessView → GameView
await runDungeonPhase(state, config);
```

**Why same process is critical:** `wsClients` Set in StateEmitter is populated by the WS server's connection handler. Separate process = empty Set = every `broadcast()` silently dropped.

**server.ts self-invocation guard — REQUIRED:**
```js
// Replace unconditional startServer() at bottom of server.ts with:
import { pathToFileURL } from 'url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
```

**setGameState must be called** or `/api/game-state` always returns `{ mode: "build" }` and GameView never renders.

---

## PITFALL 2 — FATAL: Arena Floor Tiles Never Generated

**What broke:** `findArenaPositions()` scans for `tile.type === "arena_floor"`. DungeonGen only produces `floor`, `wall`, `boss_entrance`, `chest`. Result: every agent teleports to `{x: Infinity, y: Infinity}`. Arena silently broken.

**Fix in `teleportToArena`** — retype boss room floor tiles before calling `findArenaPositions()`:
```js
const bossRoom = map.rooms.find(r => r.id === map.bossRoomId);
for (const tile of bossRoom.tiles) {
  if (tile.type === 'floor') tile.type = 'arena_floor';
}
```

---

## PITFALL 3 — FATAL: Boss Fight Loop Never Implemented

**What broke:** Agents path to `boss_entrance` but nothing triggers. `bossKilled` and `arenaDamageBonus` are never set anywhere. SPEC requires boss kill → +10% arena damage bonus.

**Required in GameLoop.ts:**
- When agent arrives adjacent to `boss_entrance`: set `status = "in_boss_fight"`
- Run boss HP drain loop (boss HP from `config.boss.boss_hp`)
- On boss death: `agent.bossKilled = true`, `agent.arenaDamageBonus = 0.10`
- Grace period fires 60s after first kill — `hasActiveGracePeriod()` is implemented, just never triggers

---

## PITFALL 4: EnemyAI State Bleeds Across Runs

**What broke:** `bruteTurnCounters`, `sentinelTurnCounters`, `sentinelHasSummoned` are module-level Maps/Sets — persist across evaluator multi-run loops.

**Fix:** Export and call at game start:
```js
export function resetEnemyAIState(): void {
  bruteTurnCounters.clear();
  sentinelTurnCounters.clear();
  sentinelHasSummoned.clear();
}
```

---

## PITFALL 5: Hardcoded Values — Use game-config.json

Values must come from config so Balance Worker can patch them:

| Value | game-config.json key |
|---|---|
| Agent starting HP (150) | `agents.starting_hp` |
| Agent starting stamina (100) | `agents.starting_stamina` |
| Estus heal fraction (0.6 × maxHp) | `agents.estus_heal_fraction` |
| Estus starting count (3) | `agents.estus_count` |
| Max patches per phase (3) | `balance.max_patches_per_phase` |
| Kill-domination patch threshold (0.5) | `balance.patch_trigger_kill_ratio` |
| Arena win bonus (15 pts) | `balance.arena_win_bonus` |
| Arena runner-up bonus (5 pts) | `balance.arena_runnerup_bonus` |

**Starting weapons — valid names: sword, axe, dagger, greatsword ONLY:**
- aggressive: sword (baseDamage 15) — NOT greatsword (one-shots grunts, breaks balance)
- cautious: dagger (baseDamage 8) + leather_armor (armorReduction 0.15)
- hoarder: dagger (baseDamage 8)
- speedrunner: dagger (baseDamage 8)
- greatsword is chest loot only, never a starting weapon

---

## PITFALL 6: Patch Pipeline Wiring

**What broke:** PatchApplier implemented correctly but GameLoop never called it. Evaluator checks `patch_events_during_run: true` as a SPEC Must Have.

**Wire in runDungeonPhase** — after every 3 completed rounds:
1. Read `state/patch-queue.jsonl` for pending suggestions
2. Call `applyPatch(suggestion)` for first valid entry
3. Call `broadcastPatch(patchEvent)`
4. Log `PATCH_APPLIED` event via `logEvent()`
Max 3 patches per phase (`config.balance.max_patches_per_phase`).

---

## PITFALL 7: Game Balance

- **Enemy spawn cap:** max 3 per non-boss room — without it agents die in 12 rounds instead of 60
- **`arena_turn_cap: 0` is a bug** — use 30. FAST_MODE override: 20.

---

## PITFALL 9: Dashboard Right Panel Must Be "Hand of God" — Not Just a Patch Log

**What broke:** Agent built a minimal "Patch Feed" sidebar (10 lines of text). The demo story requires a dramatic Evolution panel that shows the AI *reasoning* about balance, not just logging events. Judges need to *see* the Hand of God moment — a patch fires and the game visibly responds.

**Required layout in GameView.tsx — three columns, all visible simultaneously:**

```
┌──────────────────────┬──────────────────┬────────────────────┐
│  LEFT: Phaser map    │ CENTER: 4 agent  │ RIGHT: Hand of God │
│  (game canvas)       │ thought panels   │ (Evolution panel)  │
└──────────────────────┴──────────────────┴────────────────────┘
```

**CENTER panel requirements (agent thoughts):**
- HP bar per agent (colour shifts green→yellow→red)
- Last `reasoning` string from Claude API response (scrollable)
- Status badge: ALIVE / IN_BOSS_FIGHT / ELIMINATED
- Source: poll `/api/game-state` every 2s

**RIGHT panel requirements ("Hand of God" — w-64):**
1. **Kill Balance meter** — bar chart of kills per agent (shows who's dominating)
2. **"Evaluator thinks:"** — Balance Worker's latest reasoning text from `BALANCE_ANALYSIS` events via SSE `/api/events`
3. **Patch cards** — each `PATCH_APPLIED` rendered as:
   ```
   ⚡ PATCH APPLIED
   enemies.grunt_hp
   30 → 20  (−33%)
   "aggressive dominating kill ratio..."
   ```
   Flash yellow border for 2s on new patch, then fade. Newest at top.

**Data sources:**
- WebSocket `/ws/game` → DashboardPayload (tiles, agents, enemies, kills)
- SSE `/api/events` → `game-events.jsonl` tail (BALANCE_ANALYSIS, PATCH_APPLIED, ROUND_END)
- Poll `/api/game-state` every 2s → agent reasoning strings

**HarnessView must also be substantial:** During the build phase, show tasks completing in real time with checkmarks, sprint number, active task name, and build grade. Not just a static "building..." message.

---

## PITFALL 10: Four Dashboard Rendering Bugs (confirmed in dry run 2)

### 10a — FATAL: Game Renders Graphics Primitives Instead of Sprites

**What broke:** Agent wrote `// No asset preloading needed — we render with graphics primitives` and drew coloured circles/rectangles. All pre-generated PNG sprites were ignored.

**Fix — Phaser MUST load and use the sprite PNGs. TILE_SIZE = 64:**
```ts
// In Phaser scene.preload():
['aggressive','cautious','hoarder','speedrunner'].forEach(id => {
  this.load.image(id, `/assets/agents/${id}.png`);
  ['north','south','east','west'].forEach(dir =>
    this.load.image(`${id}_${dir}`, `/assets/agents/${id}_${dir}.png`)
  );
});
['grunt','brute','sentinel','hex_caster','shade'].forEach(id => {
  this.load.image(id, `/assets/enemies/${id}.png`);
  ['north','south','east','west'].forEach(dir =>
    this.load.image(`${id}_${dir}`, `/assets/enemies/${id}_${dir}.png`)
  );
});
['floor','wall','wall_top','wall_side','wall_corner','door',
 'boss_entrance','arena_floor','chest','chest_open',
 'floor_cracked','floor_mossy','wall_torch'].forEach(t =>
  this.load.image(t, `/assets/tiles/${t}.png`)
);

// Render agents as sprites, not circles:
const sprite = scene.add.image(
  agent.position.x * TILE_SIZE + TILE_SIZE/2,
  agent.position.y * TILE_SIZE + TILE_SIZE/2,
  `${agentId}_${direction}`
);
```

### 10b — Map Renders in Bottom-Left Corner, Rest Is Black

**What broke:** Dungeon rooms occupy low coordinate values. Canvas sized for full 60×40 grid but dungeon only uses ~30×25 tiles. Top-right 60% of canvas is black.

**Fix:** Calculate actual dungeon bounds after first DashboardPayload, then center camera:
```ts
let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
for (const row of tiles) {
  for (const tile of row) {
    if (tile.type !== 'wall') {
      minX = Math.min(minX, tile.x); maxX = Math.max(maxX, tile.x);
      minY = Math.min(minY, tile.y); maxY = Math.max(maxY, tile.y);
    }
  }
}
this.cameras.main.setBounds(
  minX * TILE_SIZE, minY * TILE_SIZE,
  (maxX - minX + 2) * TILE_SIZE, (maxY - minY + 2) * TILE_SIZE
);
this.cameras.main.centerOn(
  ((minX + maxX) / 2) * TILE_SIZE,
  ((minY + maxY) / 2) * TILE_SIZE
);
```

### 10c — Balance Worker Emits Dummy Patches (same value, stub reason)

**What broke:** Patch feed showed `stamina.light_attack_cost: 10 → 10` (same value!) with reason "evaluator test patch". Repeated every cycle. Not reading real game state.

**Fix:**
1. Read actual kill counts from `state/game-events.jsonl` before patching
2. Only fire when `kills[leader] / totalKills > config.balance.patch_trigger_kill_ratio`
3. Minimum 10% delta — never emit `oldValue === newValue`
4. Real reason citing actual kill ratio observed

```js
// WRONG:
{ key: 'stamina.light_attack_cost', oldValue: 10, newValue: 10, reason: 'evaluator test patch' }

// CORRECT:
{ key: 'enemies.grunt_hp', oldValue: 30, newValue: 22,
  reason: 'aggressive has 71% kill share (threshold 50%) — reducing grunt_hp to slow snowball' }
```

### 10d — Agent Thoughts Panel Always Shows "waiting..."

**What broke:** Server `/api/game-state` response does not include `lastReasoning` per agent.

**Fix — GameLoop must store reasoning after each API call:**
```ts
agent.lastReasoning = action.reasoning;  // after AgentAPI.decide()
agent.currentGoal   = action.goal;
```
**And server `/api/game-state` must expose it:**
```ts
agents: {
  [id]: { status, hp, kills, lastReasoning: agent.lastReasoning ?? '', goal: agent.currentGoal ?? '', inventoryCount }
}
```

---

## PITFALL 8: hex_caster and shade Never Spawn

Types include them, sprites exist, but `computeEnemySpawns` never spawns them. Add:
- Large rooms (>50 tiles): 50% sentinel, 50% hex_caster
- Corridor/unexplored spawns: shade

---

## PITFALL 11: Dashboard Cannot Switch Between Build Log and Game View

**What broke:** Once `setGameState()` is called and mode flips to "play", the HarnessView disappears forever. Judges cannot see the harness build history after the game starts.

**Fix in App.tsx — add `viewOverride` state:**
```tsx
const [viewOverride, setViewOverride] = useState<"build" | "play" | null>(null);
const activeView = viewOverride ?? mode;

// In header, when mode === "play":
<button onClick={() => setViewOverride(activeView === "build" ? "play" : "build")}>
  {activeView === "build" ? "▶ Game" : "📋 Build Log"}
</button>
```
The status badge always reflects real server mode (LIVE/BUILDING). The toggle only affects which view renders.

**Fix in server.ts — add `/api/harness-log` endpoint:**
```ts
app.get("/api/harness-log", (_req, res) => {
  try {
    const raw = readFileSync(HARNESS_EVENTS_LOG, "utf8");
    const lines = raw.split("\n").filter(Boolean).map(l => JSON.parse(l));
    res.json(lines);
  } catch (err: any) {
    if (err.code === "ENOENT") return res.json([]);
    throw err;
  }
});
```

**Fix in server.ts — add `/api/task-state` endpoint:**
```ts
app.get("/api/task-state", (_req, res) => {
  try {
    res.json(JSON.parse(readFileSync(TASKS_FILE, "utf8")));
  } catch (err: any) {
    if (err.code === "ENOENT") return res.json({ sprint: 1, tasks: [] });
    throw err;
  }
});
```

**HarnessView.tsx — on mount, fetch historical log before subscribing to SSE:**
```ts
// On mount: fetch /api/harness-log → setEvents(history.reverse().slice(0, 200))
// Then open SSE /api/harness-events and prepend live events to the top
// Also poll /api/task-state every 5s for task queue with checkmarks
```
