# Runtime Memory

## Document Ownership
- Type: Agent-maintained living artifact.
- Created by: Template. Updated by agents throughout the run.
- Rewrite sections as priorities change. Do not append contradictions.

## Current Phase
BUILD — Sprint 1 (Discovery/Foundation)

## Current Priorities
1. Foundation modules (independent, parallel): CombatSystem, DungeonGen, PatchApplier, EnemyAI, DungeonBridge, Personalities
2. Integration: AgentAPI, StateEmitter, GameLoop, server.ts
3. Acceptance: run-full-game.js (TWO MODES — see PITFALLS.md #1), GameView.tsx
4. Verify full end-to-end: `node run-full-game.js` (no flag) → localhost:3000 shows live Phaser game

## Active Constraints
- types.ts is the complete shared vocabulary — do not modify
- game-config.baseline.json is read-only — PatchApplier validates against it, never writes it
- No LLM SDK — direct Anthropic REST calls only (fetch API)
- ANTHROPIC_API_KEY must ALWAYS come from `process.env` — NEVER hardcoded
- Phaser is browser-side renderer only — zero game logic in dashboard
- rot.js version is 2.2.0 — use ROT.Map.Digger (NOT BspDungeon — does not exist in this version)
- Valid weapons: sword, axe, dagger, greatsword ONLY — no other weapon names exist

## Pre-loaded Assets (do not regenerate)

All sprites pre-generated, correctly sized, transparent backgrounds.

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

---

## SPEC Acceptance Criteria — Priority Order for Evaluator

1. `build_passes` — npm run build exits 0
2. `headless_exits_0` + `game_complete_printed`
3. `all_4_agents_decide` — ≥1 real Anthropic API call each, 0 errors
4. `dungeon_timer_fires` + `teleport_occurs`
5. `two_semis_one_final` + `winner_declared`
6. `patch_events_during_run` — ≥1 patch applied mid-game
7. `dashboard_serves` — server on :3000 returns 200
8. **LIVE DEMO** — `node run-full-game.js` (no flag) → open localhost:3000 → GameView shows dungeon map with agents moving in real time

## Blocked Items
(None)
