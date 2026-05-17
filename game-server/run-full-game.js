#!/usr/bin/env node
// Headless full game runner. Used by Evaluator for QA grading.
//
// Usage:
//   node run-full-game.js --headless
//   FAST_MODE=true node run-full-game.js --headless
//   NO_API=true FAST_MODE=true node run-full-game.js --headless
//   node run-full-game.js --headless --seed=42
//
// Exit codes:
//   0 — GAME_COMPLETE printed to stdout
//   1 — game crashed or did not complete

import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { generateDungeon, computeAgentSpawns, computeEnemySpawns, computeChestContents, validateSpawnConnectivity } from "./dist/DungeonGen.js";
import { runDungeonPhase, teleportToArena, runArenaMatch } from "./dist/GameLoop.js";
import { resetEnemyAIState } from "./dist/EnemyAI.js";
import { getFallbackAction } from "./dist/AgentAPI.js";
import { initReplay, getReplaySeed } from "./dist/ReplayStore.js";
import { readConfig } from "./dist/PatchApplier.js";
import { logEvent, broadcast, EVENTS_LOG_PATH } from "./dist/StateEmitter.js";
import { startServer, setGameState } from "./dist/server.js";
import { AGENT_IDS } from "./dist/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = resolve(__dirname, "..", "state");

// Parse CLI args
const args = process.argv.slice(2);
const headless = args.includes("--headless");
const record = args.includes("--record");
const replayMode = args.includes("--replay");
const seedArg = args.find(a => a.startsWith("--seed="));
let seed = seedArg ? parseInt(seedArg.split("=")[1], 10) : Math.floor(Math.random() * 1000000);
const fastMode = process.env.FAST_MODE === "true";
const noApi = process.env.NO_API === "true";

// Item factory — create Item objects from item name strings
let _itemCounter = 0;
function createItem(name) {
  _itemCounter++;
  const items = {
    sword:          { slot: "weapon", rarity: "common", stats: { baseDamage: 15, attackMultiplier: 1.0, loadContribution: 15 } },
    axe:            { slot: "weapon", rarity: "common", stats: { baseDamage: 18, attackMultiplier: 1.2, loadContribution: 20 } },
    dagger:         { slot: "weapon", rarity: "common", stats: { baseDamage: 8, attackMultiplier: 0.8, loadContribution: 8 } },
    greatsword:     { slot: "weapon", rarity: "rare",   stats: { baseDamage: 25, attackMultiplier: 1.5, loadContribution: 30 } },
    leather_armor:  { slot: "armor", rarity: "common", stats: { armorReduction: 0.15, loadContribution: 10 } },
    chain_armor:    { slot: "armor", rarity: "common", stats: { armorReduction: 0.25, loadContribution: 18 } },
    plate_armor:    { slot: "armor", rarity: "rare",   stats: { armorReduction: 0.35, loadContribution: 28 } },
    shield:         { slot: "shield", rarity: "common", stats: { blockReduction: 0.6, loadContribution: 12 } },
    estus:          { slot: "consumable", rarity: "common", stats: { healPercent: 0.6 } },
    strength_potion:{ slot: "consumable", rarity: "common", stats: { buffType: "strength", buffDuration: 3 } },
  };
  const template = items[name];
  if (!template) return null;
  return {
    id: `${name}_${_itemCounter}`,
    name,
    slot: template.slot,
    rarity: template.rarity,
    stats: { ...template.stats },
  };
}

function createStartingEquipment(agentId) {
  const equipment = {
    aggressive: { weapon: createItem("sword") },
    cautious:   { weapon: createItem("dagger"), armor: createItem("leather_armor") },
    hoarder:    { weapon: createItem("dagger") },
    speedrunner:{ weapon: createItem("dagger") },
  };
  return equipment[agentId] || {};
}

function createAgentState(agentId, position, config) {
  return {
    id: agentId,
    status: "active",
    position: { ...position },
    combat: {
      hp: config.agents?.starting_hp ?? 150,
      maxHp: config.agents?.starting_hp ?? 150,
      stamina: config.agents?.starting_stamina ?? 100,
      maxStamina: config.agents?.starting_stamina ?? 100,
      loadTier: "light",
      equipmentLoad: 0,
      maxEquipmentLoad: 100,
      arenaDamageBonus: 0,
    },
    inventory: {
      equipped: createStartingEquipment(agentId),
      backpack: [],
      estusCount: config.agents?.estus_count ?? 3,
      maxEstus: config.agents?.estus_count ?? 3,
    },
    dungeonScore: 0,
    kills: { grunt: 0, brute: 0, sentinel: 0 },
    bossKilled: false,
  };
}

async function main() {
  // Reset enemy AI state (PITFALL 2)
  resetEnemyAIState();

  // Load config
  const config = readConfig();
  if (fastMode) {
    config.dungeon_timer_seconds = 120;
    config.arena_turn_cap = 20;
    config.round_interval_ms = 500;
    config.agent_api_timeout_ms = 3500;
  }

  // Replay mode: load pre-recorded actions, use recording's seed, fast rounds
  if (replayMode) {
    const replayPath = resolve(STATE_DIR, "replay.json");
    initReplay(replayPath);
    const replaySeed = getReplaySeed();
    if (replaySeed !== null) seed = replaySeed;
    config.round_interval_ms = 600;
    config.dungeon_timer_seconds = 120;
    config.arena_turn_cap = 20;
    console.error(`[run-full-game] REPLAY MODE — seed=${seed}, 600ms rounds`);
  }

  // If NO_API, unset the API key so AgentAPI falls back naturally
  if (noApi) {
    delete process.env.ANTHROPIC_API_KEY;
  }

  // Generate dungeon — retry seed if spawns are not connected to boss
  let map = generateDungeon(seed);
  let agentSpawns = computeAgentSpawns(map);
  let attempts = 0;
  while (!validateSpawnConnectivity(map, agentSpawns) && attempts < 10) {
    attempts++;
    console.error(`[run-full-game] Spawn connectivity failed, retrying with seed ${seed + attempts}`);
    map = generateDungeon(seed + attempts);
    agentSpawns = computeAgentSpawns(map);
  }
  const enemySpawns = computeEnemySpawns(map);
  const chestContents = computeChestContents(map);

  // Create ground items from chests
  const groundItems = [];
  for (const [key, itemNames] of Object.entries(chestContents)) {
    const [cx, cy] = key.split(",").map(Number);
    for (const name of itemNames) {
      const item = createItem(name);
      if (item) {
        groundItems.push({ position: { x: cx, y: cy }, item });
        // Mark chest tile
        if (map.tiles[cy]?.[cx]) {
          map.tiles[cy][cx] = { ...map.tiles[cy][cx], type: "chest" };
        }
      }
    }
  }

  // Create agent states
  const agents = {};
  for (const id of AGENT_IDS) {
    const pos = agentSpawns[id] || { x: 1, y: 1 };
    agents[id] = createAgentState(id, pos, config);
  }

  // Create enemy states
  const enemies = enemySpawns.map((es, i) => {
    const enemyConfig = config.enemies;
    const hpMap = {
      grunt: enemyConfig.grunt_hp,
      brute: enemyConfig.brute_hp,
      sentinel: enemyConfig.sentinel_hp,
      hex_caster: enemyConfig.hex_caster_hp,
      shade: enemyConfig.shade_hp,
    };
    return {
      id: `enemy_${i}`,
      tier: es.tier,
      position: { ...es.position },
      hp: hpMap[es.tier] || 30,
      maxHp: hpMap[es.tier] || 30,
      isAlive: true,
    };
  });

  // Build initial game state
  let state = {
    phase: "DUNGEON",
    roundNumber: 0,
    dungeonTimer: config.dungeon_timer_seconds,
    map,
    agents,
    enemies,
    bossInstances: {},
    groundItems,
    recentPatches: [],
    arenaMatchups: [],
    finalScores: {},
    seed,
  };

  if (!headless) {
    // Live mode: start server in same process (PITFALL 1)
    await startServer();
    setGameState(state);
    console.log(`[run-full-game] Live server started on http://localhost:3000`);
    console.log(`[run-full-game] Seed: ${seed}, FAST_MODE: ${fastMode}, NO_API: ${noApi}`);
  }

  try {
    // Run dungeon phase
    console.error(`[run-full-game] Starting dungeon phase (seed=${seed}, timer=${state.dungeonTimer}s)...`);
    state = await runDungeonPhase(state, config);
    console.error(`[run-full-game] Dungeon phase complete. Phase: ${state.phase}`);

    // Compute dungeon scores for seeding
    const scores = {};
    for (const id of AGENT_IDS) {
      const agent = state.agents[id];
      if (!agent) {
        scores[id] = 0;
        continue;
      }
      const itemCount = agent.inventory.backpack.length;
      const dScore = (agent.kills.grunt * 1) + (agent.kills.brute * 2) +
                     (agent.kills.sentinel * 3) + (agent.bossKilled ? 5 : 0) +
                     (itemCount * 0.5);
      agent.dungeonScore = Math.floor(dScore);
      scores[id] = agent.dungeonScore;
    }
    console.error("[run-full-game] Dungeon scores:", scores);

    // Teleport if not already in arena
    if (state.phase === "DUNGEON") {
      state = await teleportToArena(state);
    }

    // Run arena matches
    const matchups = state.arenaMatchups;
    let finalScores = {};
    let winner = null;
    let arenaBonuses = {};

    if (matchups.length >= 2) {
      // Full bracket: 2 semis + final
      console.error(`[run-full-game] ARENA_SEMI1: ${matchups[0].agentA} vs ${matchups[0].agentB}`);
      const semi1Winner = await runArenaMatch(state, config, matchups[0]);
      state = { ...state, phase: "ARENA_SEMI2" };
      matchups[0].winner = semi1Winner;
      state.agents[matchups[0].agentA === semi1Winner ? matchups[0].agentB : matchups[0].agentA].status = "eliminated";
      console.error(`[run-full-game] SEMI1 winner: ${semi1Winner}`);

      console.error(`[run-full-game] ARENA_SEMI2: ${matchups[1].agentA} vs ${matchups[1].agentB}`);
      const semi2Winner = await runArenaMatch(state, config, matchups[1]);
      state = { ...state, phase: "ARENA_FINAL" };
      matchups[1].winner = semi2Winner;
      state.agents[matchups[1].agentA === semi2Winner ? matchups[1].agentB : matchups[1].agentA].status = "eliminated";
      console.error(`[run-full-game] SEMI2 winner: ${semi2Winner}`);

      // Final
      console.error(`[run-full-game] ARENA_FINAL: ${semi1Winner} vs ${semi2Winner}`);
      const finalMatchup = { agentA: semi1Winner, agentB: semi2Winner, turnCount: 0 };
      winner = await runArenaMatch(state, config, finalMatchup);
      console.error(`[run-full-game] FINAL winner: ${winner}`);

      arenaBonuses[winner] = 15;
      const runnerUp = winner === semi1Winner ? semi2Winner : semi1Winner;
      arenaBonuses[runnerUp] = 5;
      for (const id of [matchups[0].agentA, matchups[0].agentB, matchups[1].agentA, matchups[1].agentB]) {
        arenaBonuses[id] = arenaBonuses[id] || 0;
      }
    } else if (matchups.length === 1) {
      // Degraded: only 2 survivors — skip semis, run a single final
      console.error(`[run-full-game] ARENA_FINAL (degraded): ${matchups[0].agentA} vs ${matchups[0].agentB}`);
      state = { ...state, phase: "ARENA_FINAL" };
      winner = await runArenaMatch(state, config, matchups[0]);
      matchups[0].winner = winner;
      console.error(`[run-full-game] FINAL winner: ${winner}`);
      arenaBonuses[winner] = 15;
      const runnerUp = matchups[0].agentA === winner ? matchups[0].agentB : matchups[0].agentA;
      arenaBonuses[runnerUp] = 5;
    }

    for (const id of AGENT_IDS) {
      arenaBonuses[id] = arenaBonuses[id] || 0;
      finalScores[id] = (scores[id] || 0) + (arenaBonuses[id] || 0);
    }
    state = { ...state, phase: "ENDED", finalScores };

    // Broadcast final state so dashboard shows arena results
    broadcast(state);

    // Always log GAME_COMPLETE event
    logEvent({
      type: "GAME_COMPLETE",
      timestamp: new Date().toISOString(),
      round: state.roundNumber,
      phase: "ENDED",
      data: { finalScores, arenaBonuses, winner, seed },
    });

    // Print results
    console.log("GAME_COMPLETE");
    console.log(`Winner: ${winner || "none (arena skipped)"}`);
    console.log("Final scores:");
    for (const id of AGENT_IDS) {
      console.log(`  ${id}: dungeon=${scores[id] || 0}, arena=${arenaBonuses[id] || 0}, final=${finalScores[id]}`);
    }

    // Record mode: extract AGENT_ACTION events from game-events.jsonl → state/replay.json
    if (record) {
      try {
        const lines = readFileSync(EVENTS_LOG_PATH, "utf8").trim().split("\n");
        const actions = {};
        for (const line of lines) {
          try {
            const ev = JSON.parse(line);
            if (ev.type === "AGENT_ACTION" && ev.data?.agentId && ev.round != null) {
              const key = `${ev.round}_${ev.data.agentId}`;
              actions[key] = {
                goal: ev.data.goal,
                ...(ev.data.targetId != null ? { targetId: ev.data.targetId } : {}),
                reasoning: ev.data.reasoning,
              };
            }
          } catch { /* skip malformed lines */ }
        }
        const replayData = { seed, actions };
        const replayPath = resolve(STATE_DIR, "replay.json");
        writeFileSync(replayPath, JSON.stringify(replayData, null, 2) + "\n");
        console.log(`[record] Saved ${Object.keys(actions).length} actions → state/replay.json (seed=${seed})`);
      } catch (err) {
        console.error("[record] Failed to write replay.json:", err.message);
      }
    }

    if (headless) {
      process.exit(0);
    }
  } catch (err) {
    console.error("GAME CRASHED:", err.message || err);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
