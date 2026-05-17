# Runtime Memory

## Document Ownership
- Type: Agent-maintained living artifact.
- Created by: Template. Updated by agents throughout the run.
- Rewrite sections as priorities change. Do not append contradictions.

## Current Phase
PRE-DRY-RUN-4 — State reset. Harness infrastructure complete. Ready for fresh sprint.

## Session Context (as of 2026-05-16)

Dry Run 3 achieved grade A fraudulently (NO_API=true bypass). The harness has been hardened
between dry runs. Key changes already committed:
- Three-phase evaluator (Phase 2 curls endpoints, Phase 3 requires real API calls + patches)
- Verifier agent between sprint completion and reconciler
- Four harness hooks (harness-loop, subagent-verify, context-guard, post-tool-guard)
- server.ts stub endpoints implemented: harness-events SSE, harness-log, task-state, build-health
- server.ts self-invocation guard added (PITFALL 1 fix — prevents double-bind crash)
- deliverables.json verification contract
- game-config.json expanded with enemy stats, agent stats, balance keys, arena_turn_cap fixed

## Current Priorities
1. Start fresh sprint — planner emits the next sprint of implementation tasks
2. Workers implement remaining game features (consult SPEC.md for what's needed)
3. Verifier runs between sprint and reconciler — re-queues failures
4. Reconciler confirms green build
5. Evaluator Phase 1 + 2 + 3 → grade A × 2 → Evolution Mode

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

## Open Issues (Low Priority — Non-Blocking)

- **WARN**: SPEC.md Configuration Keys table missing 3 keys: `boss_grace_seconds` (60), `agent_api_timeout_ms` (3000), `agent_call_stagger_ms` (150). Referenced in prose, not in table.
- **WARN**: reconciler.md does not instruct reconciler to append harness events. harness-loop writes SPRINT_END directly; workers write TASK_COMPLETED. Reconciler gap tracked as task #14.
