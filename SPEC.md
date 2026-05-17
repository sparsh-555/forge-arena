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

# 2. Headless full game run
node run-full-game.js --headless  # exit 0, prints "GAME_COMPLETE" to stdout
                                   # all 4 agents make at least 1 decision
                                   # dungeon timer fires and teleport occurs
                                   # 2 semis + 1 final resolve
                                   # winner declared with final score

# 3. Fast mode headless (demo config)
FAST_MODE=true node run-full-game.js --headless  # exit 0, completes in < 90 seconds

# 4. Patch applies mid-game
# game-config.json written during headless run reflects at least 1 patch event
# patch-queue.jsonl contains at least 1 entry after run

# 5. Dashboard serves
cd game-server && npm run build && node dist/server.js &
curl http://localhost:3000/api/game-state  # returns JSON with mode field
```

## Visual Acceptance Criteria

Evaluated by the Evaluator using Claude vision on a screenshot taken while the game is running. All must pass for grade A.

1. **Tile grid visible** — a grid of floor and wall tiles covers the canvas. The map is not a blank canvas or solid colour fill.
2. **Sprite artwork rendered** — agents and enemies appear as PNG sprite images, not as coloured circles, rectangles, or other geometric primitives drawn with canvas APIs.
3. **Active game content showing** — the page displays the game map view (not a blank screen, loading spinner, or the build-phase harness/task-list view).
4. **Map fits the viewport** — the dungeon map is fully visible without being cropped or scrolled off-screen. Tiles are 64×64px; MAP_WIDTH=30, MAP_HEIGHT=22 should fit a 1920px-wide display.
5. **At least one agent visible** — at least one agent sprite appears on the map. An empty map with no agents means agents never spawned or WebSocket updates are not reaching the renderer.

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

# 7. Agent movement — all active agents must leave their spawn positions
node -e "
const fs = require('fs');
const lines = fs.readFileSync('state/game-events.jsonl','utf8').trim().split('\n')
  .map(l => { try { return JSON.parse(l); } catch { return null; } })
  .filter(e => e && e.type === 'ROUND_STATE');
if (lines.length < 2) { console.log('AGENTS_MOVED: SKIP'); process.exit(0); }
const first = lines[0].agents, last = lines[lines.length-1].agents;
const moved = Object.keys(first).some(id => last[id] && (last[id].position.x !== first[id].position.x || last[id].position.y !== first[id].position.y));
console.log('AGENTS_MOVED:', moved);
" 2>/dev/null
# Must print: AGENTS_MOVED: true

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
grep 'dungeon=' ../../state/game-events.jsonl 2>/dev/null || echo "check GAME_COMPLETE stdout for dungeonScore values"
```

```bash
# 9. Dashboard static checks (no browser needed — catches empty Phaser init)
grep -c 'new Phaser.Game' dashboard/src/GameView.tsx
# Must be >= 1. Zero means Phaser never initializes — dashboard is a blank div.

grep -c 'this.load.image\|this\.load\.image' dashboard/src/GameView.tsx
# Must be >= 1. Zero means sprites are never loaded — dashboard renders boxes.

grep -rn 'new WebSocket\|WebSocket(' dashboard/src/
# Must match. No WebSocket = dashboard never receives game state updates.

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
node dist/server.js &
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
- Patches must be validated against game-config.baseline.json before writing. Values outside ±30% of baseline are rejected.
- Round lock is mandatory: round N+1 does not start until all of round N's agent actions are resolved.
- Personality CLAUDE.md files must include a `## Patch Awareness` section instructing agents to read `recent_patches` and adapt strategy.
- All four personality files must be generated before the QA evaluator runs its first headless test.
- ANTHROPIC_API_KEY must be read from environment — never hardcoded.

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
| `AgentState` | `lastReasoning?: string` | optional | Most recent reasoning string from Claude; DashboardPayload sends this to the renderer |
| `DungeonMap` | `width: number` | required | Must equal MAP_WIDTH (30) |
| `DungeonMap` | `height: number` | required | Must equal MAP_HEIGHT (22) |

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
3. Collect responses with 3s timeout. Timed-out agents receive `{ goal: "pass" }`.
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
- Validates: `Math.abs(newValue - baseline) / baseline <= 0.30`
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
| Brute | 70 | 18 | Move toward nearest agent, telegraphs heavy strike 1 turn ahead | Medium/large rooms | 2 |
| Sentinel | 120 | 12 | Blocks every 3rd turn, summons Grunt at 30% HP | Large rooms | 3 |
| Hex Caster | 50 | 14 | Stays at range 3–4 tiles, ranged hex attack (bypasses armor reduction) | Large rooms (>50 tiles), alongside Sentinel (50/50 split) | 2 |
| Shade | 25 | 10 | Ambushes from unexplored corridors; 50% miss chance on first strike only | Corridors and unexplored tiles | 1 |

Enemy stats are initial values from game-config.json. Live patches may modify grunt/brute/sentinel/hex_caster/shade stats during play.

### Boss Encounter

- Spawns in the deepest room. One boss instance per agent (per-agent trigger zone).
- When agent steps on trigger tile, a boss instance spawns exclusive to that agent.
- Boss: 300 HP, 3 attack patterns (telegraphed 1 turn ahead). Phase 2 at 50% HP (patterns change).
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

- After every 3 dungeon rounds or 3 arena turns, the Evaluator reads `state/game-events.jsonl`.
- If a metric exceeds a threshold (e.g., one personality win rate > 75% over last 5 rounds), Evaluator writes a `PatchSuggestion` to `state/patch-queue.jsonl`.
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
| `enemies.brute_damage` | 18 | Yes | |
| `enemies.sentinel_hp` | 120 | Yes | |
| `enemies.sentinel_damage` | 12 | Yes | |
| `enemies.hex_caster_hp` | 50 | Yes | |
| `enemies.hex_caster_damage` | 14 | Yes | |
| `enemies.shade_hp` | 25 | Yes | |
| `enemies.shade_damage` | 10 | Yes | |
| `boss.boss_hp` | 300 | No | |
| `boss.boss_phase2_threshold` | 0.5 | No | |
| `agents.starting_hp` | 150 | No | |
| `agents.starting_stamina` | 100 | No | |
| `agents.estus_heal_fraction` | 0.6 | No | Fraction of maxHp restored per charge |
| `agents.estus_count` | 3 | No | Charges per agent |
| `balance.max_patches_per_phase` | 3 | No | |
| `balance.patch_trigger_kill_ratio` | 0.5 | No | Kill share threshold to trigger patch |
| `balance.arena_win_bonus` | 15 | No | Score points for arena winner |
| `balance.arena_runnerup_bonus` | 5 | No | Score points for arena runner-up |
| `arena_turn_cap` | 30 | No | Max arena turns (FAST_MODE: 20) |
| `dungeon_timer_seconds` | 300 | No | FAST_MODE: 120 |
| `fov_radius` | 6 | No | |
| `round_interval_ms` | 2000 | No | |

`game-config.baseline.json` holds the read-only defaults. PatchApplier rejects values outside ±30% of baseline.

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
| hoarder | dagger (baseDamage 8) | Collect everything, adapt in arena | Collect all items regardless of type. Use backpack swap strategy in arena. | Balanced approach, adapt to opponent gear. | Full map sweep. Never skip a chest. |
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
| `demo-start.sh` | Single command to start the live demo | Set `ANTHROPIC_API_KEY` from env, run `cd game-server && node dist/server.js` in background, open browser to localhost:3000, then run `node run-full-game.js` (no --headless). Exit cleanly when game ends. |
| `preflight.sh` | Pre-demo validation | Already provided. Run before demo: `bash preflight.sh` must exit 0. |

Both scripts live at the repo root and must be executable (`chmod +x`).

## Required Living Artifacts

- `SPEC.md` — this file, user-owned, never modified by agents
- `AGENTS.md` — execution policy, user-owned
- `DECISIONS.md` — architecture decision log, agent-maintained
- `RUNTIME.md` — editable runtime memory (current priorities, discovered constraints), agent-maintained
- `state/build-health.json` — reconciler-maintained
- `state/tasks.json` — planner-maintained

## Definition of Done

All acceptance tests pass:
- `npm run build` exits 0
- `node run-full-game.js --headless` exits 0 and prints `GAME_COMPLETE`
- `FAST_MODE=true node run-full-game.js --headless` completes in < 90 seconds
- All 4 personality CLAUDE.md files exist with all required sections
- Dashboard serves and shows all three panels (map, reasoning, patch feed)
- At least 1 patch event written to state/patch-queue.jsonl during headless run
