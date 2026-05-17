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

## PITFALL 8: hex_caster and shade Never Spawn

Types include them, sprites exist, but `computeEnemySpawns` never spawns them. Add:
- Large rooms (>50 tiles): 50% sentinel, 50% hex_caster
- Corridor/unexplored spawns: shade
