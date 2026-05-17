# Runtime Memory

## Document Ownership
- Type: Agent-maintained living artifact.
- Created by: Template. Updated by agents throughout the run.
- Rewrite sections as priorities change. Do not append contradictions.

## Current Phase
BUILD — Sprint 1 (Foundation). 6 tasks emitted: types.ts fixes (S1-001), DungeonGen (S1-002), CombatSystem (S1-003), DungeonBridge (S1-004), EnemyAI (S1-005), StateEmitter (S1-006). All priority 1, fully independent. After these land: Sprint 2 will wire GameLoop, AgentAPI, PatchApplier, and run-full-game.js.

## Active Constraints
- types.ts is being modified in S1-001 (additive only — MAP_WIDTH, EnemyTier expansion, ROUND_STATE, missing fields)
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

## Blocked Items
(None)
