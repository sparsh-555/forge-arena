# PITFALLS — Hard Runtime Constraints

> **READ-ONLY** — Do not modify this file. These are structural traps that cannot be caught by static analysis, acceptance criteria, or build checks. They only manifest at runtime, often silently.
> Agent instructions: Read this file at session start. Never write to it.

---

## PITFALL 1 — FATAL: Same-Process WebSocket Requirement

`wsClients` in StateEmitter is an in-process Set populated by the WS server's connection handler. If the game runner and the HTTP server run in **separate processes**, every `broadcast()` call silently drops — no error, no crash, just a dashboard that never updates.

**run-full-game.js (live mode) must start the server in the same process:**
```js
import { startServer, setGameState } from './dist/server.js';
await startServer();      // HTTP + WebSocket on port 3000 — SAME process
setGameState(state);      // switches dashboard from HarnessView → GameView
await runDungeonPhase(state, config);
```

**server.ts must have a self-invocation guard** — without it, importing server.ts from run-full-game.js starts a second server and crashes:
```js
import { pathToFileURL } from 'url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
```

No static check can verify "same process." This only shows up when the dashboard is blank during a live run.

---

## PITFALL 2 — EnemyAI State Bleeds Across Evaluator Runs

`bruteTurnCounters`, `sentinelTurnCounters`, and `sentinelHasSummoned` are module-level Maps/Sets. They persist for the lifetime of the Node.js process. The evaluator runs the game multiple times in one session — on the second run, brute telegraph cycles and sentinel summon flags are already partially advanced, producing wrong AI behavior.

**`resetEnemyAIState()` must be called at the start of every game run** (before `runDungeonPhase`), not just exported:
```js
resetEnemyAIState(); // in run-full-game.js, before runDungeonPhase(...)
```

This bug does not appear on the first evaluator run. It only surfaces on the second, which is why it passes CI but fails the live demo.

---

## PITFALL 3 — `arena_turn_cap: 0` is a Silent Infinite Loop

A value of `0` for `arena_turn_cap` in game-config.json is treated as "no cap" — arena matches run until one agent dies, which may never happen if both agents are blocking. The game hangs.

**Default must be 30. FAST_MODE override: 20.** The config key must never be 0. No TypeScript error, no crash — just a hung process that the evaluator eventually kills with a timeout.

---

## PITFALL 4 — Dashboard Must Use Sprite PNGs, Not Graphics Primitives

Workers default to `scene.add.rectangle()` and `scene.add.circle()` because they are faster to write. All pre-generated PNG sprites are then ignored. The evaluator's Phase 2 sprite check still passes (the files exist and are served), but judges see colored boxes instead of artwork.

**Phaser must load and render PNG sprites. TILE_SIZE = 64.**

Preload in scene:
```ts
['aggressive','cautious','hoarder','speedrunner'].forEach(id =>
  this.load.image(id, `/assets/agents/${id}.png`)
);
['grunt','brute','sentinel','hex_caster','shade'].forEach(id =>
  this.load.image(id, `/assets/enemies/${id}.png`)
);
['floor','wall','door','boss_entrance','arena_floor','chest','chest_open'].forEach(t =>
  this.load.image(t, `/assets/tiles/${t}.png`)
);
```

Render agents and enemies as `scene.add.image(x, y, key)`, not as shapes. The evaluator cannot distinguish sprites from primitives — this only fails visually during the demo.
