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

All patchable values live in `game-config.json`. See SPEC.md → "Configuration Keys" for the full table.

**Never hardcode HP, stamina, estus, weapon damage, enemy stats, scoring bonuses, or timing values.** Always read from config so the Balance Worker can patch them at runtime.

---

## PITFALL 6: Patch Pipeline Wiring

PatchApplier must be called from `runDungeonPhase` after every 3 completed rounds — not just implemented. Evaluator Phase 3 grades B (not A) if no `PATCH_APPLIED` events appear during the live run.

---

## PITFALL 7: Game Balance

- **Enemy spawn cap:** max 3 per non-boss room — without it agents die in 12 rounds instead of 60
- **`arena_turn_cap: 0` is a bug** — use 30. FAST_MODE override: 20.

---

## PITFALL 10: Dashboard Rendering Bugs (confirmed in dry run 2)

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

---

## PITFALL 8: hex_caster and shade Never Spawn

Types include them, sprites exist, but `computeEnemySpawns` never spawns them. Spawn rules are now in SPEC.md → Enemies table. Use `config.enemies.hex_caster_hp/damage` and `config.enemies.shade_hp/damage` (not hardcoded values).
