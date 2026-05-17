# forge-arena — Game Specification

## Document Ownership
- Type: User input. Locked before harness run. Agents must never modify intent, success criteria, or non-negotiables.
- Created by: User before run.
- Updated by: User only. Agents may append to DECISIONS.md but never edit this file.

## Product Statement

A browser-based AI agent dungeon RPG. Four AI agents with distinct personalities explore a procedurally generated dungeon simultaneously, collecting loot and fighting enemies. After a timed phase, they teleport to a PvP arena for a single-elimination tournament. A harness orchestrates the game's construction and continues running during the demo, patching game rules in real time based on emergent agent strategies — the game evolves as judges watch.

## Success Criteria (Ranked)

1. Four AI agents traverse a procedurally generated dungeon simultaneously, each making decisions via live Claude API calls, with personality-specific reasoning visible in the dashboard.
2. After the dungeon phase timer, all agents teleport to an arena and compete in a single-elimination 1v1 tournament with turn-based souls-like combat.
3. The harness actively patches game-config.json between rounds during the demo — patches are visible to agents (via `recent_patches` in their state payload) and to judges (via the PATCH FEED panel).
4. The dashboard shows three live panels simultaneously: game map with all agent positions, per-agent chain-of-thought reasoning, and the patch feed.
5. The game runs cleanly from `demo-start.sh` with zero manual intervention after launch.

## Hard Limits

- No paid external services beyond Anthropic API (ANTHROPIC_API_KEY required at runtime).
- No WebGL, no 3D — Phaser 3 2D tile rendering only.
- Game server must run on localhost. No deployment required.
- All game logic is server-side (Node.js). Phaser is a renderer only — zero game logic in the browser.
- TypeScript strict mode throughout. No `any`, no `@ts-ignore`.
- `npm run build` must exit 0 before any commit is merged.

## Acceptance Tests (Runnable, Objective)

```bash
# 1. Build passes
cd game-server && npm run build   # exit 0, zero TypeScript errors

# 2. Full live game run (FAST_MODE for speed — real API, no --headless, no NO_API)
cd game-server
FAST_MODE=true node run-full-game.js   # exit 0, prints "GAME_COMPLETE"
                                        # all 4 agents leave spawn positions
                                        # dungeon timer fires and teleport occurs
                                        # 2 semis + 1 final resolve
                                        # winner declared with final score
                                        # fallback rate < 40% of total decisions

# 3. Patch applies mid-game
# state/patch-queue.jsonl contains at least 1 entry after run

# 4. Dashboard serves
cd game-server && npm run build && node dist/server.js &
curl http://localhost:3000/api/game-state  # returns JSON with mode field
```

## Visual Acceptance Criteria

Evaluated by the Evaluator using Claude vision on a screenshot taken while the game is running. All must pass for grade A.

1. **Tile grid visible** — a grid of floor and wall tiles covers the canvas. The map is not a blank canvas or solid colour fill.
2. **Sprite artwork rendered** — agents and enemies appear as PNG sprite images, not as coloured circles, rectangles, or other geometric primitives drawn with canvas APIs.
3. **Active game content showing** — the page displays the game map view (not a blank screen, loading spinner, or the build-phase harness/task-list view).
4. **Map fits the viewport** — the dungeon map is fully visible without being cropped or scrolled off-screen. Tiles are 32×32px (TILE_SIZE=32); MAP_WIDTH=30, MAP_HEIGHT=22; the canvas scales to fit the left column of the three-panel layout.
5. **At least one agent visible** — at least one agent sprite appears on the map. An empty map with no agents means agents never spawned or WebSocket updates are not reaching the renderer.
6. **Agent panels show portraits and HP bars** — the center column shows four agent panels, each with a portrait image (`/assets/ui/portraits/{id}_portrait.png`), a coloured HP bar, and a loadout row listing equipped items by name. Panels with no agent data show "waiting for decision...".
7. **Reasoning text visible** — at least one agent panel shows non-empty reasoning text (not the fallback placeholder). Text must not contain the raw `[fallback]` prefix.
8. **Hand of God panel present** — the right column shows a "Hand of God" panel with kill balance bars and a "Patches Applied" section. If no patches have fired yet, the section reads "watching game state...".

---

## Behavioral Acceptance Tests

These tests are run by the Evaluator in Phase 3 after the live game completes. All must pass for grade A.

```bash
# 6. Enemy movement — enemies must leave their spawn positions
# Run after a NO_API headless game completes.
ROUND_COUNT=$(grep '"type":"ROUND_STATE"' state/game-events.jsonl 2>/dev/null | wc -l | tr -d ' ')
echo "round_state_events: $ROUND_COUNT"
# Must be > 0. If 0: ROUND_STATE not implemented — grade capped at B.

# Compare first and last ROUND_STATE: at least one enemy must have moved.
# Extract first enemy position from round 1 and last round, check they differ.
node -e "
const fs = require('fs');
const lines = fs.readFileSync('state/game-events.jsonl','utf8').trim().split('\n')
  .map(l => { try { return JSON.parse(l); } catch { return null; } })
  .filter(e => e && e.type === 'ROUND_STATE');
if (lines.length < 2) { console.log('ENEMIES_MOVED: SKIP (fewer than 2 rounds)'); process.exit(0); }
const first = lines[0].enemies, last = lines[lines.length-1].enemies;
const moved = first.some((e,i) => last[i] && (last[i].position.x !== e.position.x || last[i].position.y !== e.position.y));
console.log('ENEMIES_MOVED:', moved);
" 2>/dev/null
# Must print: ENEMIES_MOVED: true

# 7. Agent movement — ALL 4 agents must leave their spawn positions by at least 5 tiles
node -e "
const fs = require('fs');
const lines = fs.readFileSync('state/game-events.jsonl','utf8').trim().split('\n')
  .map(l => { try { return JSON.parse(l); } catch { return null; } })
  .filter(e => e && e.type === 'ROUND_STATE');
if (lines.length < 2) { console.log('AGENTS_MOVED: SKIP'); process.exit(0); }
const spawn = lines[0].agents;
const ids = ['aggressive','cautious','hoarder','speedrunner'];
const stuck = ids.filter(id => {
  const sp = spawn[id]?.position;
  if (!sp) return false;
  return !lines.some(rs => {
    const p = rs.agents[id]?.position;
    return p && Math.abs(p.x - sp.x) + Math.abs(p.y - sp.y) >= 5;
  });
});
console.log('STUCK_AGENTS:', stuck.length === 0 ? 'none' : stuck.join(','));
console.log('AGENTS_MOVED:', stuck.length === 0);
" 2>/dev/null
# Must print: AGENTS_MOVED: true
# STUCK_AGENTS must be 'none' — any agent frozen at spawn is a grade-blocking failure

# 8. Dungeon scores — at least 2 agents must have earned points
node -e "
const fs = require('fs');
const lines = fs.readFileSync('state/game-events.jsonl','utf8').trim().split('\n')
  .map(l => { try { return JSON.parse(l); } catch { return null; } })
  .filter(e => e && e.type === 'ROUND_STATE');
if (!lines.length) { console.log('DUNGEON_SCORES: SKIP'); process.exit(0); }
" 2>/dev/null
# Dungeon scores are validated by the existing GAME_COMPLETE stdout (scores printed per agent).
# At least 2 agents must have dungeonScore > 0 in the final results line.
grep 'dungeon=' state/game-events.jsonl 2>/dev/null || echo "check GAME_COMPLETE stdout for dungeonScore values"
```

```bash
# 9. Dashboard static checks (no browser needed — catches empty Phaser init)
grep -c 'new Phaser.Game' dashboard/src/GameView.tsx
# Must be >= 1. Zero means Phaser never initializes — dashboard is a blank div.

grep -c 'this.load.image\|this\.load\.image' dashboard/src/GameView.tsx
# Must be >= 1. Zero means sprites are never loaded — dashboard renders boxes.

grep -rn 'new WebSocket\|WebSocket(' dashboard/src/
# Must match. No WebSocket = dashboard never receives game state updates.

grep -c 'PATCH_EVENT' dashboard/src/GameView.tsx
# Must be >= 1. broadcastPatch() sends this type; dashboard must handle it to show
# live patch flashes in the Hand of God panel.

grep -c 'lastReasoning' dashboard/src/GameView.tsx
# Must be >= 1. Agent reasoning text panel requires this field from AgentState.

grep -c 'AgentPanel\|portrait' dashboard/src/GameView.tsx
# Must be >= 1. Portrait panel component must exist.

# 10. Personality file completeness
for id in aggressive cautious hoarder speedrunner; do
  for section in "## Identity" "## Core Drive" "## Item Priority" "## Combat Style" \
                 "## Exploration Strategy" "## Boss Encounter Strategy" "## Patch Awareness"; do
    grep -q "$section" personalities/$id/CLAUDE.md \
      && echo "OK: $id $section" \
      || echo "MISSING: $id $section"
  done
done
# All 28 lines must print OK.

# 11. State persistence — game state survives after run completes
# Start server, verify /api/game-state returns a non-empty game state (not mode: build)
cd game-server && node dist/server.js &
SERVER_PID=$!
sleep 2
MODE=$(curl -sf http://localhost:3000/api/game-state | grep -o '"mode":"[^"]*"' | cut -d'"' -f4)
echo "api game-state mode: $MODE"
kill $SERVER_PID 2>/dev/null; wait $SERVER_PID 2>/dev/null
# If mode is "build" after a game ran — currentGameState was never persisted to server memory.
# Fix: ensure setGameState() is called with the final state, and server.ts serves it from memory.
```

---

## Non-Negotiables

- No TODOs, placeholders, or unimplemented stubs in any code path exercised by run-full-game.js.
- Every agent decision must include a `reasoning` string — no silent moves.
- Patches must be validated against game-config.baseline.json before writing. Values must be > 0.
- Round lock is mandatory: round N+1 does not start until all of round N's agent actions are resolved.
- Personality CLAUDE.md files must include a `## Patch Awareness` section instructing agents to read `recent_patches` and adapt strategy.
- All four personality files must be generated before the evaluator runs.
- ANTHROPIC_API_KEY must be read from environment — never hardcoded.
- **AgentAPI `max_tokens` must be ≥ 600.** 300 tokens truncates the response before the JSON action block is written. This silently causes 100% fallback decisions — the most expensive failure mode.
- **AgentAPI timeout must be ≥ 8000ms.** Anthropic API round-trip for Haiku is 3–6s under normal load. A 3s timeout guarantees primary call failure on every round.
- **JSON action block must appear FIRST in the agent response, before any analysis.** Putting JSON last causes truncation when the analysis fills the token budget. Personality CLAUDE.md files must instruct: emit the JSON line first, then optionally add reasoning prose.
- **DungeonGen must validate all 4 spawn positions for pathfinding connectivity to the boss entrance** before returning a map. Reject and regenerate if any spawn is unreachable. An agent stuck at its spawn for the entire dungeon phase means pathfinding is broken at generation time.
- **`DashboardPayload` sends tiles as flat top-level fields** — `tiles: Tile[][]`, `mapWidth: number`, `mapHeight: number` — NOT nested under a `map` object. `toDashboardPayload()` must keep this shape; dashboard `GameView.tsx` reads `payload.tiles`, `payload.mapWidth`, `payload.mapHeight` directly.
- **WebSocket emits two distinct message types.** `broadcast(state)` sends a full `DashboardPayload` snapshot every round. `broadcastPatch(patch)` sends `{ type: "PATCH_EVENT", patch: PatchEvent }` immediately when a patch is applied. Dashboard checks `msg.type === "PATCH_EVENT"` first, then parses as DashboardPayload. Never merge these into one message type.
- **`GameLoop` must stamp `lastReasoning` on each `AgentState` before calling `broadcast`.** Set `agent.lastReasoning = action.reasoning` immediately after all agent decisions are collected, before `applyAgentAction`. Omitting this means the dashboard reasoning panels always show "waiting for decision..." regardless of real API activity.
- **`AgentAPI` MUST use the Anthropic streaming API (`stream: true`) with early abort.** Parse the SSE stream and abort the request as soon as a valid JSON action block is extracted. Non-streaming waits for the full response (~6s/call); streaming with early abort reduces to ~1.5s/call. This is critical for `DEMO_MODE` 300ms rounds to feel responsive.
- **`run-full-game.js` MUST reset `game-config.json` from `game-config.baseline.json` at startup.** Stale HoG patches from a previous run persist if `game-config.json` is not reset. Always write baseline values to `game-config.json` as the first action in `main()`.
- **Arena entry MUST reset stamina costs to baseline values.** HoG patches dungeon stamina costs mid-game. These must not carry into arena fights. `runArenaPhase` must call `resetStaminaToBaseline()` (from `PatchApplier.ts`) before the first arena round. Failure causes arena agents to face heavily-distorted stamina economics.
- **Item pickup MUST award `dungeonScore` immediately.** Each ground item collected via `pick_up_item` increments `agent.dungeonScore` by 1. Chest contents award one point per item collected. Score must update in real time — not only at game end.
- **`bossKilled` flag MUST appear in `AgentStatePayload`.** Set `bossKilled: true` in `toAgentPayload()` once `agent.bossKilled` is true. Agents that already killed their boss must not re-enter the boss fight loop; speedrunner personality depends on this field to stop looping the boss entrance.

## Architecture Constraints

### Topology

```
game-server/            Game logic, AgentAPI, patch surface, unified HTTP server
  src/types.ts          Single source of truth for all shared types
  src/DungeonBridge.ts  Boundary: rot.js output → GameState. Nothing crosses this boundary.
  src/server.ts         Unified: SSE harness events (build phase) + WS game state (play phase)
  game-config.json      Live patch surface. Agents observe this every round.
  game-config.baseline.json  Read-only. PatchApplier validates against this, never writes here.
  run-full-game.js      Headless test runner. QA evaluator invokes this.
dashboard/              React frontend. Renders state snapshots only.
personalities/          Four CLAUDE.md files loaded by AgentAPI as system prompts.
state/                  Harness state files (tasks, build health, patch queue, game events).
```

### State Machine

Game progresses through explicit states. No state may be skipped.

```
BUILD → DUNGEON → ARENA_SEMI1 → ARENA_SEMI2 → ARENA_FINAL → ENDED
```

The `GamePhase` enum in types.ts must encode all six states. Server rejects invalid transitions.

### Contracts

**Cross-module type contracts** (enforced by tsc — workers must not omit these fields):

| Interface | Field | Type | Purpose |
|---|---|---|---|
| `EnemyAction` | `newPosition?: Position` | optional | Set by EnemyAI for move actions; GameLoop reads this to update `enemy.position` |
| `AgentState` | `lastReasoning?: string` | optional | Most recent reasoning string from Claude; GameLoop sets this before `broadcast()`; dashboard reads it for the reasoning panel |
| `AgentStatePayload` | `bossKilled?: boolean` | optional | True once agent has killed their personal boss instance; agents stop targeting boss entrance after this; speedrunner uses it to exit boss-hunt loop |
| `DungeonMap` | `width: number` | required | Must equal MAP_WIDTH (30) |
| `DungeonMap` | `height: number` | required | Must equal MAP_HEIGHT (22) |
| `DungeonMap` | `dungeonEntrancePosition: Position` | required | Bottom-left entrance room centre; all 4 agents spawn clustered within 5 tiles of this point |
| `DashboardPayload` | `tiles: Tile[][]` | required | Full tile grid as a flat top-level field (NOT nested under `map`) |
| `DashboardPayload` | `mapWidth: number` | required | Must equal `state.map.width`; used by renderer to size the Phaser canvas |
| `DashboardPayload` | `mapHeight: number` | required | Must equal `state.map.height` |

**ROUND_STATE event** (required every round in DUNGEON and ARENA phases):

GameLoop must append this event to `state/game-events.jsonl` at the end of each resolved round:

```json
{
  "type": "ROUND_STATE",
  "round": 5,
  "phase": "DUNGEON",
  "timestamp": "<ISO>",
  "agents": {
    "aggressive": { "position": { "x": 5, "y": 3 }, "hp": 140, "status": "active" }
  },
  "enemies": [
    { "id": "enemy_0", "position": { "x": 10, "y": 7 }, "hp": 22, "isAlive": true }
  ]
}
```

This event is the source of truth for behavioral verification (enemy movement, agent movement, survival rates). It is required for the evaluator to issue grade A.

**Round loop (DUNGEON phase):**
1. GameLoop reads `game-config.json` (picks up any patches written since last round)
2. Fire all 4 `POST /decide/:agentId` calls in parallel (staggered by 150ms each: 0ms, 150ms, 300ms, 450ms)
3. Collect responses with **8s timeout minimum** (read from `game-config.json` key `agent_api_timeout_ms`, default 8000). Timed-out agents receive `{ goal: "pass" }`.
4. Resolve conflicts using fixed priority: `aggressive > cautious > hoarder > speedrunner`
5. Resolve agent actions, then resolve enemy actions (rule-based, no API call)
6. Update GameState, write to `state/game-events.jsonl`
7. StateEmitter broadcasts `toDashboardPayload()` via WebSocket, sends `toAgentPayload(agentId)` to each agent on their next call

**AgentAPI contract:**
- Input: `AgentStatePayload` (agent's FOV only — not full map)
- Output: `AgentAction` with `goal`, `target`, and mandatory `reasoning` string
- System prompt: contents of `personalities/{agentId}/CLAUDE.md`
- Model: Haiku during DUNGEON, Sonnet during ARENA_FINAL

**Patch contract:**
- Evaluator writes `PatchSuggestion` to `state/patch-queue.jsonl`
- Balance worker claims one entry (versioned claim, one worker per config key)
- Validates: `newValue > 0`
- Writes atomically: temp file → `fs.renameSync` → `game-config.json`
- Emits `PatchEvent` to StateEmitter
- Next round: `recent_patches` array in each agent's payload includes the patch + reason

### File / Folder Expectations

```
game-server/src/
  types.ts          AgentId, GamePhase, AgentStatus, GameState, AgentStatePayload,
                    AgentAction, AgentGoal, PatchEvent, PatchSuggestion, BossInstance,
                    Item, EquipSlot, CombatState, ArenaMatchup, ConflictPriority,
                    DashboardPayload — ALL types defined here, nowhere else.
  DungeonBridge.ts  toAgentPayload(state, agentId): AgentStatePayload
                    toDashboardPayload(state): DashboardPayload
  DungeonGen.ts     generateDungeon(seed): DungeonMap — rot.js BSP, ~20 rooms
  GameLoop.ts       runDungeonPhase(), runArenaPhase(), teleportToArena(),
                    resolveConflicts(actions), roundLock state
  AgentAPI.ts       POST /decide/:agentId — loads personality, calls Claude, returns AgentAction
  EnemyAI.ts        resolveEnemyActions(state): EnemyAction[] — pure rule-based, no Claude
  CombatSystem.ts   resolveCombat(attacker, defender, action): CombatResult
                    calcDamage(weapon, armor): number
                    calcStaminaCost(action, config): number
                    calcEquipmentLoad(equipped): LoadTier
  PatchApplier.ts   applyPatch(suggestion): void — validates, atomic write, emits event
  StateEmitter.ts   broadcast(payload): void — WebSocket to dashboard
                    logEvent(event): void — appends to game-events.jsonl
                    broadcastPatch(patch): void — emits PATCH_APPLIED to clients
  DungeonBridge.ts  toAgentPayload(state, agentId): AgentStatePayload — FOV-filtered
                    toDashboardPayload(state): DashboardPayload — full map for spectators
  server.ts         GET /api/game-state, SSE /api/harness-events, WS /ws/game
```

## Game Mechanics

### Dungeon Phase

- **Map**: rot.js BSP, fixed seed per session (~20 rooms, corridors connecting them). **MAP_WIDTH=30, MAP_HEIGHT=22** (1920×1408px at 64px/tile — fits a 1080p screen without scrolling). Doors between rooms.
- **Timer**: 300 seconds (5 minutes). `FAST_MODE=true` → 120 seconds (2 minutes).
- **Agents**: All 4 spawn simultaneously at separate starting positions. No PvP. Each has independent FOV (rot.js FOV, radius 6 tiles).
- **Round**: Every 2 seconds. Agent API calls fire in parallel (staggered 150ms). Enemy actions resolve after agents each round.
- **Round lock**: Round N+1 does not start until round N fully resolves (max wait = 3s timeout + resolution time).
- **Conflict priority**: `aggressive > cautious > hoarder > speedrunner`. Lower-priority conflicting action converts to `pass`.

### Items

- **Slots**: weapon, armor, shield, consumable (one equipped per slot).
- **Backpack**: unlimited, no weight penalty. All pickups go to backpack first.
- **Equip**: agent action `equip_from_backpack` costs full turn, swaps item into slot.
- **Arena**: backpack swapping allowed, costs full turn (no action that round).

### Enemies

| Type | HP | Damage | Behavior | Spawn Location | Dungeon Points |
|---|---|---|---|---|---|
| Grunt | 30 | 8 | Move toward nearest agent, attack if adjacent | All rooms | 1 |
| Brute | 70 | 10 | Move toward nearest agent, telegraphs heavy strike 1 turn ahead | Medium/large rooms | 2 |
| Sentinel | 120 | 12 | Blocks every 3rd turn, summons Grunt at 30% HP | Large rooms | 3 |
| Hex Caster | 50 | 14 | Stays at range 3–4 tiles, ranged hex attack (bypasses armor reduction) | Large rooms (>50 tiles), alongside Sentinel (50/50 split) | 2 |
| Shade | 25 | 10 | Ambushes from unexplored corridors; 50% miss chance on first strike only | Corridors and unexplored tiles | 1 |

Enemy stats are initial values from game-config.json. Live patches may modify grunt/brute/sentinel/hex_caster/shade stats during play.

### Boss Encounter

- Spawns in the deepest room. One boss instance per agent (per-agent trigger zone).
- When agent steps on trigger tile, a boss instance spawns exclusive to that agent.
- Boss: 200 HP, auto-attacks each round (Phase 1 = 2.5% max HP/round, Phase 2 = 4% max HP/round). Phase 2 at 50% HP.
- Kill reward: +5 dungeon score, guaranteed rare item (auto-backpack), permanent +10% damage buff in arena.
- **Grace period**: If main timer expires while agent is in a boss fight, agent has 60 seconds to finish. If boss not dead at grace expiry, agent teleports with no boss rewards.

### Combat (dungeon and arena)

- **Stamina**: max 100, regenerates 20/turn (modified by equipment load).
- **Actions and costs** (from game-config.json, patchable):

| Action | Stamina Cost | Notes |
|---|---|---|
| heavy_attack | 30 | High damage multiplier |
| medium_attack | 20 | Standard damage |
| light_attack | 10 | Low damage, low cost |
| block | 15 | Reduces incoming damage by 60% this turn |
| pass | 0 | Skip turn |

- **Stamina at 0**: action fails, wasted turn.
- **Damage formula**: `weapon.baseDamage × attackMultiplier × (1 - target.armorReduction)`
- **Equipment load** (equipped items only):

| Load | Threshold | Stamina Regen Modifier |
|---|---|---|
| Light | < 40% capacity | None |
| Medium | 40–70% | -10% regen |
| Heavy | > 70% | -20% regen |

- **Heals (estus)**: 3 per agent, each restores 60% max HP. Arena rule: estus locked during 1v1 fights.

### Teleport

When dungeon timer fires (plus any active grace periods):
- Finalize all dungeon scores
- Auto-move any ground loot in agent's boss room to agent's backpack
- Calculate seeds: `dungeonScore` descending, tiebreaker = HP remaining descending
- Spawn all 4 agents in arena at designated starting positions
- Transition GamePhase: DUNGEON → ARENA_SEMI1

### Arena Phase

- **Format**: Single elimination, sequential (Semi 1 → Semi 2 → Final).
- **Seeding**: Seed 1 (highest dungeon score) vs Seed 4. Seed 2 vs Seed 3.
- **Combat**: Alternating turns (Agent A acts, Agent B acts, repeat). Same stamina/damage system.
- **Heals**: Estus locked. No healing mid-fight.
- **Turn cap**: 30 turns in full mode, 20 turns in `FAST_MODE=true`; higher HP% wins. (`arena_turn_cap: 0` in game-config is a bug — default must be 30.)
- **Win condition**: Opponent reaches 0 HP. Or turn cap exceeded (higher HP% wins).
- **Eliminated agents**: Stop receiving API calls. Dashboard shows portrait greyed with "ELIMINATED".
- **Arena patching**: Harness continues patching between turns mid-match. Agents see patches in their payload.

### Scoring Formula

```
dungeonScore = (gruntKills × 1) + (bruteKills × 2) + (sentinelKills × 3)
             + (bossKill × 5) + (itemsCollected × 0.5)

arenaBonus = { winner: 15, runnerUp: 5, semiLoss: 0 }

finalScore = dungeonScore + arenaBonus
```

Leaderboard shown on dashboard throughout. Updates after each dungeon round and after each arena fight.

### Live Evolution (Hand of God)

- After every 2 dungeon rounds or 2 arena turns, the Evaluator reads `state/game-events.jsonl`.
- If `leadGap >= 2` (leading agent's kill count exceeds second-place by 2 or more) **or** any personality rate falls below 10%, the Evaluator writes a `PatchSuggestion` to `state/patch-queue.jsonl`. Classic win-rate thresholds (> 75%) also trigger patches but `leadGap` fires faster and more reliably during early rounds.
- Balance worker validates and applies to `game-config.json` atomically.
- **Next round**: all agents receive `recent_patches` in their payload. Agents are expected to read and reason about patches.
- **Dungeon patches**: enemy stat adjustments + new enemy/item spawns in unexplored tiles.
- **Arena patches**: stamina costs, damage multipliers, equipment load thresholds.
- Dashboard PATCH FEED shows each patch with metric and reason.

### Configuration Keys (game-config.json)

All patchable values live in `game-config.json`. Workers must read from config — never hardcode these values.

| Key | Default | Patchable | Notes |
|---|---|---|---|
| `stamina.heavy_attack_cost` | 30 | Yes | |
| `stamina.medium_attack_cost` | 20 | Yes | |
| `stamina.light_attack_cost` | 10 | Yes | |
| `stamina.block_cost` | 15 | Yes | |
| `stamina.base_regen_per_turn` | 20 | Yes | |
| `enemies.grunt_hp` | 30 | Yes | |
| `enemies.grunt_damage` | 8 | Yes | |
| `enemies.brute_hp` | 70 | Yes | |
| `enemies.brute_damage` | 10 | Yes | Baseline set to 10 (was 18). At 18 a brute kills any 150-HP agent in 8 hits — too fast for strategic play |
| `enemies.sentinel_hp` | 120 | Yes | |
| `enemies.sentinel_damage` | 12 | Yes | |
| `enemies.hex_caster_hp` | 50 | Yes | |
| `enemies.hex_caster_damage` | 14 | Yes | |
| `enemies.shade_hp` | 25 | Yes | |
| `enemies.shade_damage` | 10 | Yes | |
| `boss.boss_hp` | 200 | No | |
| `boss.boss_phase2_threshold` | 0.5 | No | |
| `agents.starting_hp` | 150 | No | |
| `agents.starting_stamina` | 100 | No | |
| `agents.estus_heal_fraction` | 0.6 | No | Fraction of maxHp restored per charge |
| `agents.estus_count` | 3 | No | Charges per agent |
| `balance.max_patches_per_phase` | 6 | No | Raised from 3 to sustain visible HoG activity across a full 5-minute demo session |
| `balance.patch_trigger_kill_ratio` | 0.5 | No | Kill share threshold to trigger patch |
| `balance.arena_win_bonus` | 15 | No | Score points for arena winner |
| `balance.arena_runnerup_bonus` | 5 | No | Score points for arena runner-up |
| `arena_turn_cap` | 30 | No | Max arena turns (FAST_MODE: 20) |
| `dungeon_timer_seconds` | 300 | No | FAST_MODE: 120 |
| `fov_radius` | 6 | No | |
| `round_interval_ms` | 2000 | No | |
| `agent_api_timeout_ms` | 8000 | No | Minimum 8000. Lower values guarantee primary call failure on every round. |

`game-config.baseline.json` holds the read-only defaults. PatchApplier validates that `newValue > 0`.

---

## Dependency Philosophy

### Allowed
- `rot.js` — dungeon generation, pathfinding, FOV, scheduling
- `phaser` (v3, stable) — browser-side 2D rendering only
- `express` — HTTP server
- `ws` — WebSocket server
- `dotenv` — environment variable loading
- `typescript`, `ts-node`, `vite`
- `react`, `react-dom`, `@types/react`, `@types/react-dom`
- `tailwindcss` — dashboard styling

### Banned
- Any database (SQLite, Postgres, MongoDB) — state lives in JSON files only
- Any LLM SDK other than direct Anthropic REST calls — keeps dependency surface minimal
- Any CSS framework beyond Tailwind — no MUI, Bootstrap
- Any physics engine — no Cannon, Matter.js

## Agent Personality System

Each personality is a CLAUDE.md file at `personalities/{agentId}/CLAUDE.md`. The AgentAPI loads it as the system prompt for every Claude call involving that agent. Required sections:

```
## Identity
## Core Drive
## Item Priority
## Combat Style
## Exploration Strategy
## Boss Encounter Strategy
## Patch Awareness   <-- mandatory, must instruct agent to read recent_patches and adapt
```

### Personality Archetypes

| Agent | Starting Equipment | Core Drive | Item Priority | Combat | Exploration |
|---|---|---|---|---|---|
| aggressive | sword (baseDamage 15) | Maximize damage output at all costs | Highest base damage weapon always. Ignore armor/shield. | Heavy attacks. Never block. Heal only < 20% HP. | Prioritize enemies over items. Engage everything. |
| cautious | dagger (baseDamage 8) + leather_armor (armorReduction 0.15) | Survive longest, outlast opponents | Max armor first, then shield, then weapon. | Block often. Medium attacks. Heal at < 50% HP. | Clear rooms methodically. Avoid risk. |
| hoarder | dagger (baseDamage 8) | Sprint to every chest, flee dungeon enemies, deploy best gear in arena | Chest-first always. Skip enemies unless blocking path. Flee on HP < 50%. Swap to best gear each arena round. | Adapt to opponent — use heaviest weapon vs low-armor foes, equip shield vs high-damage attackers. | Beeline to nearest visible chest. Never engage enemies voluntarily. Full backpack = power spike at arena entry. |
| speedrunner | dagger (baseDamage 8) | Race to boss, ignore everything else | Take first weapon found, nothing else. | Light attacks to save stamina for movement. Skip enemies unless blocking path. |

**Starting weapon constraint:** Valid weapon names are `sword`, `axe`, `dagger`, `greatsword` only. `greatsword` is chest loot only — never a starting weapon (one-shots grunts, breaks early balance). Starting equipment is fixed per personality; workers must not change these.

## Scope Model

### Must Have
1. Procedural dungeon generation (rot.js BSP, ~20 rooms)
2. Four agents moving simultaneously in parallel rounds (2s interval, round lock)
3. Per-agent FOV (radius 6, own view only in API payload)
4. Three enemy tiers with rule-based AI
5. Per-agent boss instances with grace period
6. Item system (4 slots + backpack, equip costs turn)
7. Stamina-based combat with equipment load
8. 5-minute dungeon timer → auto-teleport → arena
9. Single-elimination arena (sequential 1v1, alternating turns)
10. Scoring formula (dungeon + arena bonus)
11. Live patching via game-config.json, visible to agents via recent_patches
12. Dashboard: game map + per-agent reasoning + patch feed
13. Four personality CLAUDE.md files (all required sections)
14. Headless test runner (run-full-game.js)

### Nice to Have
- Door sprites and opening animation between rooms
- Multiple rare item types from boss
- Game replay viewer in dashboard (post-game)
- Bracket tree visualization in arena dashboard panel
- Sound effects

## Autonomous Resource Discovery

The harness operates with full internet access. During construction, harness agents autonomously scoured the open-source ecosystem to find production-grade assets and reference implementations, rather than building from scratch.

### Spelunky Classic HD — Visual Assets
- **Source**: [SpelunkyClassicHD](https://github.com/yancharkin/SpelunkyClassicHD) by Derek Yu / Mossmouth (Spelunky User License v1.1b)
- **Discovery**: An Explore agent searched GitHub for "pixel art dungeon sprite sheet 32x32" and surfaced Spelunky Classic HD as the highest-quality freely available match. The sprites are 16×16 pixel art at native resolution, nearest-neighbor upscaled to 32×32 for our tile grid.
- **Usage**: All agent sprites (TunnelMan → aggressive, Vampire → cautious, Shopkeeper → hoarder, Skeleton → speedrunner), all enemy sprites (Caveman → grunt, Yeti → brute, MagmaMan → sentinel, Alien → hex_caster, Bat → shade), all tiles (cave floor, walls, doors, chests, arena floor), boss sprite (Olmec), and UI portraits.
- **Integration**: A Python extraction script (`extract_spelunky.py`) was generated by the harness to parse GameMaker Studio 2 `.yy` sprite manifests, extract individual PNG frames, perform pixel-perfect 2× upscaling via PIL, and write assets into `game-server/public/assets/`. The script auto-generated 256×256 agent portraits with colored identity borders.
- **Dashboard rendering**: Phaser 3 configured with `pixelArt: true` for nearest-neighbor scaling. Walk-cycle animations built from individual texture keys (not spritesheets) at 8fps (agents) and 6fps (enemies). Tween-based movement interpolation at 380ms.

### Tuxemon — Battle Mechanics Reference
- **Source**: [Tuxemon](https://github.com/Tuxemon/Tuxemon) — open-source monster-taming RPG
- **Discovery**: An Architect agent identified Tuxemon as the closest open-source match for turn-based 1v1 combat with HP/stamina bars, status effects, and alternating turns. The combat state machine (`tuxemon/combat/`) and UI patterns informed our arena implementation.
- **Usage**: The arena battle view follows Tuxemon's turn-by-turn combat model — agents alternate attacks, each turn updates visible HP/stamina bars, and the last action is displayed as combat log text. Agent portraits face each other in VS layout with active-turner highlighting.

### Why This Strengthens the Harness
- **Proves autonomy**: The harness didn't just stitch together libraries — it actively searched, evaluated, and integrated external projects.
- **Production-quality visuals**: 15-year-old professionally-designed pixel art from a published game, not procedural placeholders.
- **Battle-tested mechanics**: Tuxemon's combat system has years of community refinement behind its design patterns.
- **Legal compliance**: Both projects have permissive licenses; attribution is included in the dashboard.

## Planned Obstacles & Proactive Mitigations

The planner identified these risks during the architecture phase and designed mitigations before any code was written. Each obstacle was anticipated, not discovered by accident.

### PITFALL 1 — Server Self-Invocation Guard
- **Risk**: The harness repeatedly invokes `server.ts` during the build phase, causing `EADDRINUSE` port conflicts. Without a guard, every new run crashes.
- **Mitigation**: `startServer()` returns immediately if the server is already running (singleton pattern). Port 3000 bound once, reused across restarts.

### PITFALL 2 — Enemy AI State Leak Between Runs
- **Risk**: Module-level `Map` and `Set` variables in `EnemyAI.ts` accumulate state across multiple game runs in the same process. Brute turn counters and sentinel summon flags carry over, causing enemies to behave as if run N+1 is a continuation of run N.
- **Mitigation**: `resetEnemyAIState()` exported function clears all module-level state. Called at the top of `main()` in `run-full-game.js` before every run.

### PITFALL 3 — JSON Output Truncation
- **Risk**: LLM output has a `max_tokens` budget. If the personality's analysis prose fills the budget before the JSON action block, the action is truncated, and the round is wasted. Observed at `max_tokens=300` with 100% fallback rate.
- **Mitigation**: `max_tokens` set to 600 minimum. Personality files mandate JSON-first output — the action line MUST appear on line 1 of the response, before any analysis prose. Parser extracts the first valid JSON object containing `goal` and `reasoning` fields.

### PITFALL 4 — API Timeout vs Model Latency
- **Risk**: Anthropic API calls to Haiku take 2-6 seconds under normal load. Timeouts set too low cause premature abort; timeouts set too high stall the game loop. Retry logic with capped timeouts makes the second attempt equal to the first, defeating the purpose.
- **Mitigation**: Base timeout 15s with retry at `max(2× base, 20s)` — retry always gets more time than the first attempt. FAST_MODE sets 3.5s timeout with no retry to keep rounds fast during headless tests.

### PITFALL 5 — Chest vs GroundItem Type Confusion
- **Risk**: Agents see `chest` entities in their FOV and attempt `pick_up_item` on them. But chests are map tiles (`state.map.tiles`), not items in `state.groundItems`. The action silently fails because the target ID doesn't exist in the ground items array. Agents get stuck in loops targeting the same chest for 15+ rounds.
- **Mitigation**: `applyAgentAction` intercepts `pick_up_item` targets matching `chest_X_Y` pattern, parses position from the ID, collects all items at that position into the backpack, and marks the chest tile as `chest_open`.

### PITFALL 6 — Dungeon PvP Targeting
- **Risk**: Agents see each other in FOV during the dungeon phase and attack rival agents instead of enemies. Attacks between agents in dungeon are blocked (PvP disabled), so these actions waste turns. All 4 agents can die having fought each other instead of enemies.
- **Mitigation**: `getVisibleEntities` excludes other agents from FOV during dungeon phases. Agents only see each other in arena phases where PvP is intended. This ensures they focus on enemies during exploration.

### PITFALL 7 — 4-Directional Adjacency Enforcement
- **Risk**: The attack code resolves combat without checking whether the target is adjacent. Agents can attack enemies from any distance. Enemy AI uses 4-directional pathfinding but agent attacks had no adjacency requirement, making distance meaningless.
- **Mitigation**: `isAdjacent()` check added to both agent-vs-enemy and agent-vs-agent combat paths in `applyAgentAction`. Attacks only connect if the target is cardinally adjacent (N/S/E/W, no diagonals).

### PITFALL 8 — Pathfinding Ignores Item Positions
- **Risk**: Movement code resolves target positions by searching `state.enemies` and `state.agents`, but never `state.groundItems`. Agents using `move_to_item` with valid item IDs find no matching target and stay in place. Loot-focused personalities (hoarder, cautious) become completely immobile.
- **Mitigation**: Target resolution in movement handler extended to search `state.groundItems` as a third fallback after enemies and agents. `move_to_safe` without a target ID now computes a flee direction away from the nearest enemy.

### PITFALL 9 — Enemy Swarm Targeting
- **Risk**: `findNearestAgent` always returns the absolute closest agent by Manhattan distance. All enemies converge on the same target (typically the fastest-moving agent), creating an unrealistic gang-up effect. The targeted agent dies rapidly while others roam untouched.
- **Mitigation**: Weighted random selection replaces deterministic nearest-pick. 60% chance nearest agent, 25% second-nearest, 10% third, 5% fourth. Enemies spread across multiple targets, creating more dynamic encounters.

### PITFALL 10 — Eliminated Agent Score Wipe
- **Risk**: The dungeon score calculation in `run-full-game.js` checked `agent.status === "eliminated"` and zeroed the score. An agent who killed 5 enemies before dying got score 0. Surviving agents with 0 kills could outrank them for arena seeding.
- **Mitigation**: Score calculation reads `agent.kills` directly regardless of elimination status. Dead agents retain their kill count for arena seeding purposes. The `eliminated` check was removed from the score loop.

### PITFALL 11 — HoG Patch Inflation
- **Risk**: Each HoG patch is computed as `currentValue ± delta`. After 3 patches to the same key, the value has drifted far from baseline: e.g., `grunt_hp` starts at 30, first patch → 25, second → 21, third → 18. But if the HoG intended "nerf grunt HP by 15%" each time, the third nerf is actually 40% off baseline. The patches compound and values spiral toward 0 or infinity.
- **Mitigation**: All HoG patch values are anchored to `game-config.baseline.json`. Formula: up = `baseline × (1 + n × 0.20)`, capped at `baseline × 2.5`; down = `baseline × (1 - n × 0.12)`, floored at `baseline × 0.40`. `n` is the count of previous patches to that key this phase. `PatchApplier.ts` exports `getNestedValue(baseline, key)` for computing anchor deltas.

### PITFALL 12 — Arena Stamina Contamination
- **Risk**: HoG patches `game-config.json` stamina costs during the dungeon phase (e.g., `heavy_attack_cost` raised from 30 to 48 to nerf the aggressive agent). When the dungeon phase ends and arena begins, the game loop still reads from the same `game-config.json`. Arena agents face 48-stamina heavy attacks — 60% more expensive than designed. Aggressive agents run out of stamina in 2–3 turns.
- **Mitigation**: `PatchApplier.ts` exports `resetStaminaToBaseline()`. `runArenaPhase()` calls this before the first arena round. It atomically rewrites all `stamina.*` keys in `game-config.json` back to baseline values. Enemy stat patches (grunt HP, brute damage) persist into the arena, but stamina economics are always reset.

### Out of Scope
- Multiplayer (human players)
- Infinite dungeon levels (single floor only)
- Crafting system
- Save/load persistence
- Mobile responsive dashboard

## Throughput / Scope Ranges

- Initial task fan-out: 40–60 worker tasks
- Change size: each task touches 1–4 files
- Parallelism: high (DungeonGen, CombatSystem, AgentAPI, EnemyAI, dashboard panels all independent)
- Personality files: generated in first sprint, priority 1
- Runtime target: game playable (headless test passes) within 2 hours of harness start

## Required Runnable Scripts

| Script | Purpose | Must |
|---|---|---|
| `demo-start.sh` | Single command to start the live demo | Set `ANTHROPIC_API_KEY` from env, run `cd game-server && node dist/server.js` in background, open browser to localhost:3000, then run `DEMO_MODE=true node run-full-game.js --seed 42`. Exit cleanly when game ends. |
| `preflight.sh` | Pre-demo validation | Already provided. Run before demo: `bash preflight.sh` must exit 0. |

Both scripts live at the repo root and must be executable (`chmod +x`).

### Demo Modes

| Mode | Dungeon Timer | Round Interval | API Timeout | Seed | When to use |
|---|---|---|---|---|---|
| `DEMO_MODE=true` | 45s | 300ms | 8000ms | Fixed (`--seed 42`) | Live audience demo — fast, reproducible, visually compelling |
| `FAST_MODE=true` | 120s | 2000ms | 3500ms | Random | Evaluator CI runs — tests real code paths quickly |
| _(neither)_ | 300s | 2000ms | 8000ms | Random | Full fidelity run — pre-demo validation only |

`--seed <N>` and `--seed=<N>` both work. `DEMO_MODE=true` with `--seed 42` is the canonical demo invocation. Fixed seed ensures a consistent run if judges ask to see it again.

## Required Living Artifacts

- `SPEC.md` — this file, user-owned, never modified by agents
- `AGENTS.md` — execution policy, user-owned
- `DECISIONS.md` — architecture decision log, agent-maintained
- `RUNTIME.md` — editable runtime memory (current priorities, discovered constraints), agent-maintained
- `state/build-health.json` — reconciler-maintained
- `state/tasks.json` — planner-maintained

## Definition of Done

All acceptance tests pass:
- `npm run build` exits 0 (both game-server and dashboard)
- `FAST_MODE=true node run-full-game.js` exits 0 and prints `GAME_COMPLETE`
- All 4 agents leave their spawn positions during the run (no stuck agents)
- Fallback rate < 40% of total agent decisions
- All 4 personality CLAUDE.md files exist with all required sections
- Dashboard serves and shows all three panels simultaneously:
  - **Left**: Phaser map with tile grid, agent sprites, enemy sprites, HP bars
  - **Center**: Four agent panels — portrait, HP bar, equipped loadout, reasoning text
  - **Right**: Hand of God panel — kill balance bars, live patch feed
- Agent reasoning text in dashboard updates every round with real Claude output (no "[fallback]" prefix on >60% of panels)
- At least 1 patch event fires and appears in the Hand of God panel during the run
- Boss spawns when an agent steps on `boss_entrance` tile; boss sprite visible on map
