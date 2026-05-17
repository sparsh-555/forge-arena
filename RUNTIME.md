# Runtime Memory

## Document Ownership
- Type: Agent-maintained living artifact.
- Created by: Template. Updated by agents throughout the run.
- Rewrite sections as priorities change. Do not append contradictions.

## Current Phase
BUILD — Sprint 5. All core systems complete and passing. Dry-run-5 root causes fixed; dashboard fully wired (Phaser map, agent panels, Hand of God); boss spawning live; lastReasoning propagated each round; PATCH_EVENT WS message type handled. Game is playable end-to-end. Evaluator configured to run full live game only (no headless). Next step: full live run with ANTHROPIC_API_KEY to get Grade A.

## Critical Constraints (Learned From Dry-Run-5 — Do Not Repeat These Failures)

- **`max_tokens` in AgentAPI MUST be ≥ 600.** 300 truncates the response before the JSON action is emitted. Results in 100% fallback rate silently — the build appears healthy but the game is broken.
- **`agent_api_timeout_ms` MUST be ≥ 8000ms.** Haiku round-trip is 3–6s. A 3s timeout causes every primary call to abort.
- **JSON action block MUST appear FIRST in personality response, before any analysis.** If JSON is last, the analysis fills the token budget and JSON is truncated. Personality CLAUDE.md files must say: emit the JSON line first on its own line, then optionally add prose.
- **DungeonGen MUST validate all 4 spawn positions can pathfind to the boss entrance.** Reject and regenerate the map if any spawn is unreachable. Speedrunner sat at (1,1) for 70 rounds because this was not checked.
- **Evaluator no longer runs headless.** It runs `FAST_MODE=true node run-full-game.js` with real API. Grade B now requires fallback < 40% and all agents mobile. Do not target headless acceptance criteria.

## Active Constraints
- game-config.baseline.json is read-only — PatchApplier validates against it, never writes it
- No LLM SDK — direct Anthropic REST calls only (fetch API)
- ANTHROPIC_API_KEY must ALWAYS come from `process.env` — NEVER hardcoded
- Phaser is browser-side renderer only — zero game logic in dashboard
- rot.js version is 2.2.0 — use ROT.Map.Digger (NOT BspDungeon — does not exist in this version)
- Valid weapons: sword, axe, dagger, greatsword ONLY — no other weapon names exist

## Pre-loaded Assets (do not regenerate)

All sprites pre-generated, correctly sized, transparent backgrounds.
Served from `game-server/public/assets/` at runtime via `express.static`.

### Character Sprites (64×64)
Each has static + 4 directional sprites:

| Character | Static | Directional |
|---|---|---|
| agents/aggressive | `agents/aggressive.png` | `agents/aggressive_{north,south,east,west}.png` |
| agents/cautious | `agents/cautious.png` | `agents/cautious_{north,south,east,west}.png` |
| agents/hoarder | `agents/hoarder.png` | `agents/hoarder_{north,south,east,west}.png` |
| agents/speedrunner | `agents/speedrunner.png` | `agents/speedrunner_{north,south,east,west}.png` |
| enemies/grunt | `enemies/grunt.png` | `enemies/grunt_{north,south,east,west}.png` |
| enemies/brute | `enemies/brute.png` | `enemies/brute_{north,south,east,west}.png` |
| enemies/sentinel | `enemies/sentinel.png` | `enemies/sentinel_{north,south,east,west}.png` |
| enemies/hex_caster | `enemies/hex_caster.png` | `enemies/hex_caster_{north,south,east,west}.png` |
| enemies/shade | `enemies/shade.png` | `enemies/shade_{north,south,east,west}.png` |

Phaser loading pattern — swap texture on move:
```ts
['north','south','east','west'].forEach(dir =>
  this.load.image(`aggressive_${dir}`, '/assets/agents/aggressive_' + dir + '.png')
);
sprite.setTexture(`aggressive_${direction}`);
```

### Tiles (64×64): floor, wall, wall_top, wall_side, wall_corner, door, boss_entrance, arena_floor, chest, chest_open, floor_cracked, floor_mossy, wall_torch
### Boss (128×128): boss.png, boss_phase2.png, boss_death.png
### Items (48×48): sword, axe, dagger, greatsword, leather_armor, chain_armor, plate_armor, shield, estus, poison, strength_potion, estus_flask_icon
### UI: portraits 256×256, icons 32×32, spawn_effect 64×64, phase badges 120×32

## Dashboard Rendering Contracts (Discovered Sprint 5 — Workers Must Not Break These)

- **`DashboardPayload` sends flat tile fields:** `tiles`, `mapWidth`, `mapHeight` are top-level fields on the payload — NOT nested under `map`. `GameView.tsx` reads `payload.tiles`, `payload.mapWidth`, `payload.mapHeight`. Any worker refactoring `toDashboardPayload` must maintain this flat shape.
- **WebSocket sends two distinct message types:**
  1. Full `DashboardPayload` snapshot — sent by `broadcast(state)` every round
  2. `{ type: "PATCH_EVENT", patch: PatchEvent }` — sent by `broadcastPatch(patch)` immediately when a patch lands
  The dashboard checks `msg.type === "PATCH_EVENT"` first, then falls through to parse as DashboardPayload. Do not merge these into one message type.
- **`lastReasoning` must be stamped before broadcast:** GameLoop sets `agent.lastReasoning = action.reasoning` immediately after collecting all agent decisions, before calling `applyAgentAction`. This ensures every `broadcast()` snapshot includes the latest thinking.
- **`AgentState.lastReasoning` flows through to dashboard:** It is a field on `AgentState`, included in `DashboardPayload.agents[id].lastReasoning`. Workers must not strip it in `toDashboardPayload`.

## Completed Systems (Sprint 5)

- Phaser `DungeonScene`: tiles, agent sprites, enemy sprites, boss sprites, HP bars on all entities
- `AgentPanel` React component: portrait image, HP bar, loadout row (equipped items + backpack count + estus), reasoning text (220 char, strips `[fallback]` prefix)
- `PatchCard` + `KillBar`: Hand of God panel with live patch feed and kill balance bars
- Boss: spawns on `boss_entrance` tile entry, auto-combat each round until dead or agent eliminated
- Chest re-rendering: tile updates from `chest` to `chest_open` when agent picks up contents
- Server endpoints: `/api/harness-log`, `/api/harness-events` (SSE), `/api/task-state`, `/api/build-health` all implemented
- `HarnessView`: task queue, live event log, build health grade panel — three-column layout

## Blocked Items
(None)
