# Architecture Decisions

This file is maintained by harness agents. Workers write decisions here as they make them.
Do NOT delete entries. Strike through if superseded.

Format per entry:
```
## ADR-NNN: <short title>
**Status:** accepted | superseded by ADR-XXX
**Date:** YYYY-MM-DD
**Decision:** <one sentence>
**Rationale:** <why this was chosen over alternatives>
```

---

## ADR-001: rot.js for dungeon generation and pathfinding
**Status:** accepted  
**Date:** 2026-05-13  
**Decision:** Use rot.js v2.2.0 server-side for BSP dungeon gen, A* pathfinding, and FOV computation.  
**Rationale:** Battle-tested roguelike library with exactly the primitives needed; runs in Node.js without browser; Phaser handles rendering separately.

## ADR-002: Phaser.js v3 browser-only as pure renderer
**Status:** accepted  
**Date:** 2026-05-13  
**Decision:** Phaser receives `DashboardPayload` from WebSocket and renders only — zero game logic in the browser.  
**Rationale:** Game state lives on the server (authoritative), dashboard is just a spectator view. Prevents desync and cheating.

## ADR-003: Haiku for dungeon/semis, Sonnet for final only
**Status:** accepted  
**Date:** 2026-05-13  
**Decision:** `claude-haiku-4-5-20251001` for dungeon and arena semis, `claude-sonnet-4-6` for arena final only.  
**Rationale:** Haiku is fast (latency fits 2s rounds), cheap (4 agents × many rounds), and good enough for dungeon decisions. Sonnet reserved for the high-stakes final to showcase reasoning quality.

## ADR-004: Per-agent boss instances
**Status:** accepted  
**Date:** 2026-05-13  
**Decision:** Each agent triggers their own boss spawn when stepping on the boss entrance tile.  
**Rationale:** Multiple agents fighting one boss simultaneously creates coordination complexity and spectacle problems. Per-agent instances let each agent demonstrate their strategy independently.

## ADR-005: Round lock with parallel Claude calls
**Status:** accepted  
**Date:** 2026-05-13  
**Decision:** All 4 Claude calls fire simultaneously (staggered 150ms), round lock prevents overlap until all responses arrive or timeout.  
**Rationale:** Appears simultaneous to spectators; avoids sequential 8-second round times; agents act on same world state snapshot.

## ADR-006: Atomic patch writes via tmp→rename
**Status:** accepted  
**Date:** 2026-05-13  
**Decision:** Balance Worker writes to `game-config.tmp.json` then `fs.renameSync` to `game-config.json`.  
**Rationale:** `fs.rename` is atomic on POSIX systems; prevents GameLoop from reading a partially-written config mid-round.

## ADR-007: High-level goal API (no coordinate navigation)
**Status:** accepted  
**Date:** 2026-05-13  
**Decision:** Agents express `AgentGoal` (move_to_boss, attack_heavy, pick_up_item), rot.js executes pathfinding.  
**Rationale:** LLMs are unreliable at coordinate arithmetic. Abstract goals decouple agent reasoning from map geometry.

## ADR-008: Conflict resolution by fixed priority
**Status:** accepted  
**Date:** 2026-05-13  
**Decision:** When agents claim the same tile/item, priority is `aggressive > cautious > hoarder > speedrunner`.  
**Rationale:** Simple, deterministic, consistent with personalities. Aggressive always wins resource conflicts — reinforces their archetype.

---
<!-- Agents: append new ADRs below this line -->
