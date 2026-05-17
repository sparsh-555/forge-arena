#!/usr/bin/env node
// Headless full game runner. Used by Evaluator for QA grading.
// Simulates a complete game run without browser or human input.
//
// Usage:
//   node run-full-game.js --headless
//   FAST_MODE=true node run-full-game.js --headless
//
// Exit codes:
//   0 — game completed successfully, "GAME_COMPLETE" printed to stdout
//   1 — game crashed or did not complete

// TODO: implement headless simulation
// 1. Load game config (readConfig())
// 2. Generate dungeon (generateDungeon(seed))
// 3. Initialize GameState with all 4 agents
// 4. If FAST_MODE=true: override dungeon_timer_seconds=120, arena_turn_cap=20
// 5. Run dungeon phase (all 4 agents make at least 1 decision each)
// 6. Fire dungeon timer → teleport all agents to arena
// 7. Run SEMI1: agentA vs agentB, resolve to winner
// 8. Run SEMI2: agentC vs agentD, resolve to winner
// 9. Run FINAL: semi1winner vs semi2winner, resolve to winner
// 10. Print final scores for all 4 agents
// 11. Print "GAME_COMPLETE" to stdout
// 12. Verify: all 4 agents made at least 1 decision (non-fallback reasoning)
// 13. Verify: at least 1 PatchEvent exists in state/game-events.jsonl
// 14. Exit 0

console.error("run-full-game.js not implemented");
process.exit(1);
