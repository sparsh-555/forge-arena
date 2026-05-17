// GameLoop: orchestrates the full game state machine.
// Owns the round timer, round lock, conflict resolution, phase transitions.

import type {
  AgentAction,
  AgentId,
  ArenaMatchup,
  GameConfig,
  GamePhase,
  GameState,
} from "./types.js";
import { AGENT_IDS, CONFLICT_PRIORITY, PHASE_TRANSITIONS } from "./types.js";
import { handleDecideRoute, getFallbackAction } from "./AgentAPI.js";
import { resolveEnemyActions, pathfindStep, resetEnemyAIState, isAdjacent } from "./EnemyAI.js";
import { resolveCombat, resolveEnemyAttack, calcStaminaCost, calcStaminaRegen } from "./CombatSystem.js";
import { broadcast, broadcastPatch, logEvent } from "./StateEmitter.js";
import { readConfig, applyPatch } from "./PatchApplier.js";
import { toAgentPayload } from "./DungeonBridge.js";
import ROT from "rot-js";

const ROUND_INTERVAL_MS = 2000;
const AGENT_STAGGER_MS = 150;
const AGENT_TIMEOUT_MS = 3000;

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function updateFOV(state: GameState): GameState {
  const tiles = state.map.tiles.map(row => row.map(tile => ({
    ...tile,
    visibleTo: [] as AgentId[],
  })));

  for (const agentId of AGENT_IDS) {
    const agent = state.agents[agentId];
    if (!agent || agent.status === "eliminated") continue;

    const lightPasses = (x: number, y: number): boolean => {
      const tile = tiles[y]?.[x];
      return tile != null && tile.type !== "wall";
    };

    const fov = new ROT.FOV.PreciseShadowcasting(lightPasses);
    fov.compute(agent.position.x, agent.position.y, 6, (x, y, _r, _vis) => {
      if (tiles[y]?.[x]) {
        tiles[y][x] = { ...tiles[y][x], explored: true, visibleTo: [...tiles[y][x].visibleTo, agentId] };
      }
    });
  }

  return { ...state, map: { ...state.map, tiles } };
}

/**
 * Transition the game to the next phase.
 */
export function transitionPhase(state: GameState, to: GamePhase): GameState {
  const allowed = PHASE_TRANSITIONS[state.phase];
  if (allowed !== to) {
    throw new Error(`Invalid phase transition: ${state.phase} → ${to}`);
  }
  return { ...state, phase: to };
}

/**
 * Check if any active agent is on a boss entrance tile and spawn a boss instance.
 */
function processBossSpawns(state: GameState, config: GameConfig): GameState {
  const newBossInstances = { ...state.bossInstances };

  for (const id of AGENT_IDS) {
    const agent = state.agents[id];
    if (!agent || agent.status === "eliminated") continue;
    if (newBossInstances[id]) continue; // already has a boss

    const tile = state.map.tiles[agent.position.y]?.[agent.position.x];
    if (tile?.type === "boss_entrance") {
      const bossHp = config.boss.boss_hp;
      // Find first non-wall adjacent tile for boss placement
      const adjacent = [
        { x: agent.position.x + 1, y: agent.position.y },
        { x: agent.position.x - 1, y: agent.position.y },
        { x: agent.position.x, y: agent.position.y - 1 },
        { x: agent.position.x, y: agent.position.y + 1 },
      ];
      const bossPos = adjacent.find(p => {
        const t = state.map.tiles[p.y]?.[p.x];
        return t && t.type !== "wall";
      }) ?? agent.position;

      newBossInstances[id] = {
        agentId: id,
        position: bossPos,
        hp: bossHp,
        maxHp: bossHp,
        phase: 1,
        isAlive: true,
      };
      logEvent({
        type: "BOSS_SPAWN",
        timestamp: new Date().toISOString(),
        round: state.roundNumber,
        phase: state.phase,
        data: { agentId: id, position: agent.position, hp: bossHp },
      });
    }
  }

  return { ...state, bossInstances: newBossInstances };
}

/**
 * Process boss-agent combat each round (automatic back-and-forth).
 * Boss takes damage (agent attacks), agent takes damage (boss attacks).
 */
function processBossCombat(state: GameState, config: GameConfig): GameState {
  const bossInstances = { ...state.bossInstances };
  const agents = { ...state.agents };
  let changed = false;

  for (const ownerId of AGENT_IDS) {
    const boss = bossInstances[ownerId];
    if (!boss || !boss.isAlive) continue;
    const agent = agents[ownerId];
    if (!agent || agent.status === "eliminated") continue;

    // Agent damage to boss (auto-attack based on equipped weapon)
    const weapon = agent.inventory.equipped.weapon;
    const baseDamage = weapon?.stats?.baseDamage ?? 10;
    const mult = weapon?.stats?.attackMultiplier ?? 1.0;
    const agentDamage = Math.floor(baseDamage * mult);

    // Phase 2 at 50% HP
    const newBossHp = Math.max(0, boss.hp - agentDamage);
    const newPhase: 1 | 2 = newBossHp <= boss.maxHp * config.boss.boss_phase2_threshold ? 2 : 1;

    // Boss damage to agent — balanced so a skilled agent can survive ~20 rounds
    const bossDamage = newPhase === 2
      ? Math.floor(config.boss.boss_hp * 0.04)
      : Math.floor(config.boss.boss_hp * 0.025);
    const armor = agent.inventory.equipped.armor;
    const armorReduction = armor?.stats?.armorReduction ?? 0;
    const damageToAgent = Math.floor(bossDamage * (1 - armorReduction));
    const newAgentHp = Math.max(0, agent.combat.hp - damageToAgent);

    bossInstances[ownerId] = {
      ...boss,
      hp: newBossHp,
      phase: newPhase,
      isAlive: newBossHp > 0,
    };

    agents[ownerId] = {
      ...agent,
      combat: { ...agent.combat, hp: newAgentHp },
      status: newAgentHp <= 0 ? "eliminated" as const : agent.status,
    };

    if (newBossHp <= 0) {
      agents[ownerId] = {
        ...agents[ownerId],
        bossKilled: true,
        dungeonScore: agent.dungeonScore + 5,
        combat: {
          ...agents[ownerId].combat,
          arenaDamageBonus: 0.10,
        },
      };
      logEvent({
        type: "BOSS_DEFEATED",
        timestamp: new Date().toISOString(),
        round: state.roundNumber,
        phase: state.phase,
        data: { agentId: ownerId },
      });
    }

    changed = true;
  }

  if (!changed) return state;
  return { ...state, bossInstances, agents };
}

/**
 * Resolve conflicts when multiple agents choose the same target.
 */
export function resolveConflicts(
  actions: Record<AgentId, AgentAction>
): Record<AgentId, AgentAction> {
  const result = { ...actions };
  const agentList = Object.keys(result) as AgentId[];

  for (let i = 0; i < agentList.length; i++) {
    for (let j = i + 1; j < agentList.length; j++) {
      const a = agentList[i];
      const b = agentList[j];
      const actA = result[a];
      const actB = result[b];

      if (!actA || !actB) continue;
      if (actA.goal === "pass" || actB.goal === "pass") continue;

      // Conflict: same targetId for move/attack goals
      const aTarget = actA.targetId;
      const bTarget = actB.targetId;
      if (aTarget && bTarget && aTarget === bTarget) {
        const priA = CONFLICT_PRIORITY.indexOf(a);
        const priB = CONFLICT_PRIORITY.indexOf(b);
        if (priA < priB) {
          result[b] = { goal: "pass", reasoning: "conflict resolved" };
        } else {
          result[a] = { goal: "pass", reasoning: "conflict resolved" };
        }
      }
    }
  }

  return result;
}

/**
 * Apply a single resolved agent action to the game state.
 * Pure function — returns new state, never mutates.
 */
export function applyAgentAction(
  state: GameState,
  agentId: AgentId,
  action: AgentAction,
  config: GameConfig
): GameState {
  const agents = { ...state.agents };
  const agent = { ...agents[agentId] };
  agents[agentId] = agent;

  const goal = action.goal;

  // Stamina regen at start of each agent's turn
  const regen = calcStaminaRegen(agent.combat, config);
  agent.combat = { ...agent.combat, stamina: Math.min(agent.combat.maxStamina, agent.combat.stamina + regen) };

  // Movement goals: compute next step
  if (goal.startsWith("move_")) {
    let targetPos = agent.position;
    if (action.targetId) {
      // Try to find target entity position
      const targetEnemy = state.enemies.find(e => e.id === action.targetId && e.isAlive);
      if (targetEnemy) { targetPos = targetEnemy.position; }
      else {
        const targetAgent = state.agents[action.targetId as AgentId];
        if (targetAgent && targetAgent.status !== "eliminated") { targetPos = targetAgent.position; }
        else {
          // Check ground items
          const targetItem = state.groundItems.find(gi => gi.item.id === action.targetId);
          if (targetItem) { targetPos = targetItem.position; }
        }
      }
    }
    // Handle chest targets for move_to_item (chest_X_Y → position from coordinates)
    if (goal === "move_to_item" && action.targetId?.startsWith("chest_")) {
      const parts = action.targetId.split("_");
      const cx = parseInt(parts[1], 10);
      const cy = parseInt(parts[2], 10);
      if (!isNaN(cx) && !isNaN(cy)) {
        targetPos = { x: cx, y: cy };
      }
    }
    // Fallback: if target entity not found, find nearest matching type
    if (targetPos.x === agent.position.x && targetPos.y === agent.position.y) {
      if (goal === "move_to_enemy") {
        const nearest = state.enemies.filter(e => e.isAlive).sort((a, b) =>
          (Math.abs(a.position.x - agent.position.x) + Math.abs(a.position.y - agent.position.y)) -
          (Math.abs(b.position.x - agent.position.x) + Math.abs(b.position.y - agent.position.y)))[0];
        if (nearest) targetPos = nearest.position;
      } else if (goal === "move_to_item") {
        const nearest = state.groundItems.sort((a, b) =>
          (Math.abs(a.position.x - agent.position.x) + Math.abs(a.position.y - agent.position.y)) -
          (Math.abs(b.position.x - agent.position.x) + Math.abs(b.position.y - agent.position.y)))[0];
        if (nearest) targetPos = nearest.position;
      }
    }
    // For move_to_boss, target the boss entrance
    if (goal === "move_to_boss") {
      targetPos = state.map.bossEntrancePosition;
    }
    // For move_to_safe without explicit target: flee from nearest enemy
    if (goal === "move_to_safe" && !action.targetId) {
      const nearestEnemy = state.enemies
        .filter(e => e.isAlive)
        .sort((a, b) =>
          (Math.abs(a.position.x - agent.position.x) + Math.abs(a.position.y - agent.position.y)) -
          (Math.abs(b.position.x - agent.position.x) + Math.abs(b.position.y - agent.position.y))
        )[0];
      if (nearestEnemy) {
        // Move in the opposite direction
        const dx = agent.position.x - nearestEnemy.position.x;
        const dy = agent.position.y - nearestEnemy.position.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx >= absDy) {
          targetPos = { x: agent.position.x + (dx > 0 ? 1 : dx < 0 ? -1 : 0), y: agent.position.y };
        } else {
          targetPos = { x: agent.position.x, y: agent.position.y + (dy > 0 ? 1 : dy < 0 ? -1 : 0) };
        }
        // Clamp to map bounds
        targetPos.x = Math.max(0, Math.min(state.map.width - 1, targetPos.x));
        targetPos.y = Math.max(0, Math.min(state.map.height - 1, targetPos.y));
      }
    }

    const next = pathfindStep(agent.position, targetPos, state);
    // Clamp and check walls
    if (next.x >= 0 && next.x < state.map.width && next.y >= 0 && next.y < state.map.height) {
      const tile = state.map.tiles[next.y][next.x];
      if (tile.type !== "wall") {
        agent.position = { ...next };
      }
    }
  }

  // Combat goals — only valid if target is cardinally adjacent (4-dir)
  if (goal === "attack_heavy" || goal === "attack_medium" || goal === "attack_light") {
    if (action.targetId) {
      const targetEnemyIdx = state.enemies.findIndex(e => e.id === action.targetId && e.isAlive);
      // If target exists but not adjacent: move toward it instead (replay resilience)
      if (targetEnemyIdx >= 0 && !isAdjacent(agent.position, state.enemies[targetEnemyIdx].position)) {
        const next = pathfindStep(agent.position, state.enemies[targetEnemyIdx].position, state);
        if (next.x >= 0 && next.x < state.map.width && next.y >= 0 && next.y < state.map.height) {
          const tile = state.map.tiles[next.y][next.x];
          if (tile.type !== "wall") { agent.position = { ...next }; }
        }
        return { ...state, agents: { ...state.agents, [agentId]: agent } };
      }
      if (targetEnemyIdx >= 0 && isAdjacent(agent.position, state.enemies[targetEnemyIdx].position)) {
        const targetEnemy = state.enemies[targetEnemyIdx];
        const result = resolveCombat(
          agent.combat,
          agent.inventory,
          targetEnemy.hp,
          0,
          false,
          goal,
          config
        );
        agent.combat = { ...agent.combat, stamina: result.attackerStaminaAfter };
        // Track kill and update live dungeon score
        if (result.defenderHpAfter <= 0) {
          const t = targetEnemy.tier;
          const key = t === "grunt" ? "grunt" : t === "brute" ? "brute" : "sentinel";
          const killPoints: Record<string, number> = { grunt: 1, brute: 2, sentinel: 3 };
          agent.kills = { ...agent.kills, [key]: agent.kills[key] + 1 };
          agent.dungeonScore = (agent.dungeonScore ?? 0) + (killPoints[key] ?? 1);
        }
        // Update enemy HP directly — return enemies array with updated enemy
        const updatedEnemies = state.enemies.map((e, i) =>
          i === targetEnemyIdx ? { ...e, hp: result.defenderHpAfter, isAlive: result.defenderHpAfter > 0 } : e
        );
        return { ...state, agents: { ...state.agents, [agentId]: agent }, enemies: updatedEnemies };
      } else if (state.phase !== "DUNGEON") {
        // Agent vs agent — ARENA only (PvP disabled in dungeon)
        const targetAgent = state.agents[action.targetId as AgentId];
        if (targetAgent && targetAgent.status !== "eliminated" && isAdjacent(agent.position, targetAgent.position)) {
          const armorItem = targetAgent.inventory.equipped.armor;
          const armorReduction = armorItem?.stats?.armorReduction ?? 0;
          const result = resolveCombat(
            agent.combat,
            agent.inventory,
            targetAgent.combat.hp,
            armorReduction,
            false,
            goal,
            config
          );
          agent.combat = { ...agent.combat, stamina: result.attackerStaminaAfter };
          const updatedTarget = {
            ...targetAgent,
            combat: { ...targetAgent.combat, hp: result.defenderHpAfter },
            status: result.defenderHpAfter <= 0 ? "eliminated" as const : targetAgent.status,
          };
          return { ...state, agents: { ...state.agents, [agentId]: agent, [action.targetId as AgentId]: updatedTarget } };
        }
      }
    }
  }

  // Block
  if (goal === "block") {
    const cost = calcStaminaCost(goal, config);
    agent.combat = { ...agent.combat, stamina: Math.max(0, agent.combat.stamina - cost) };
  }

  // Use estus: heal 60% max HP
  if (goal === "use_estus") {
    if (agent.inventory.estusCount > 0) {
      const healAmount = Math.floor(agent.combat.maxHp * 0.6);
      agent.combat = {
        ...agent.combat,
        hp: Math.min(agent.combat.maxHp, agent.combat.hp + healAmount),
      };
      agent.inventory = {
        ...agent.inventory,
        estusCount: agent.inventory.estusCount - 1,
      };
    }
  }

  // Pick up item: move from ground to backpack
  if (goal === "pick_up_item" && action.targetId) {
    if (action.targetId.startsWith("chest_")) {
      // Chest target: open chest, collect all items at that position, mark opened even if empty
      const parts = action.targetId.split("_");
      const chestX = parseInt(parts[1], 10);
      const chestY = parseInt(parts[2], 10);
      const chestItems = state.groundItems.filter(
        gi => gi.position.x === chestX && gi.position.y === chestY
      );
      if (chestItems.length > 0) {
        agent.inventory = {
          ...agent.inventory,
          backpack: [...agent.inventory.backpack, ...chestItems.map(gi => gi.item)],
        };
      }
      const itemIds = new Set(chestItems.map(gi => gi.item.id));
      const newGroundItems = state.groundItems.filter(gi => !itemIds.has(gi.item.id));
      // Mark chest tile as opened (always, even if empty — breaks the loop)
      const updatedTiles = state.map.tiles.map((row, y) =>
        y === chestY
          ? row.map((tile, x) => (x === chestX && tile.type === "chest" ? { ...tile, type: "chest_open" as const } : tile))
          : row
      );
      return {
        ...state,
        agents: { ...state.agents, [agentId]: agent },
        groundItems: newGroundItems,
        map: { ...state.map, tiles: updatedTiles },
      };
    } else {
      const itemIdx = state.groundItems.findIndex(gi => gi.item.id === action.targetId);
      if (itemIdx >= 0) {
      const groundItem = state.groundItems[itemIdx];
      agent.inventory = {
        ...agent.inventory,
        backpack: [...agent.inventory.backpack, groundItem.item],
      };
      const newGroundItems = state.groundItems.filter((_, i) => i !== itemIdx);
      return { ...state, agents: { ...state.agents, [agentId]: agent }, groundItems: newGroundItems };
    }
    }
  }

  // Equip from backpack
  if (goal === "equip_from_backpack" && action.targetId) {
    const bpIdx = agent.inventory.backpack.findIndex(item => item.id === action.targetId);
    if (bpIdx >= 0) {
      const item = agent.inventory.backpack[bpIdx];
      const slot = item.slot;
      const newBackpack = agent.inventory.backpack.filter((_, i) => i !== bpIdx);
      const oldEquipped = agent.inventory.equipped[slot];
      const newEquipped = { ...agent.inventory.equipped, [slot]: item };
      const finalBackpack = oldEquipped ? [...newBackpack, oldEquipped] : newBackpack;
      agent.inventory = { ...agent.inventory, equipped: newEquipped, backpack: finalBackpack };
    }
  }

  // Pass: no-op

  return { ...state, agents };
}

/**
 * Analyse current game state and return the most impactful balance patch, or null if game is balanced.
 * Looks at score composition (kills vs items vs boss), casualty rate, and dominant strategies.
 */
function choosePatch(
  state: GameState,
  config: GameConfig
): { key: string; newValue: number; reason: string; timestamp: string } | null {
  const ts = new Date().toISOString();

  // Summarise per-agent stats
  const agentStats = AGENT_IDS.map(id => {
    const a = state.agents[id];
    if (!a) return null;
    const kills = a.kills.grunt + a.kills.brute + a.kills.sentinel;
    const items = a.inventory.backpack.length;
    const score = a.dungeonScore;
    return { id, kills, items, score, status: a.status, bossKill: a.bossKilled };
  }).filter((s): s is NonNullable<typeof s> => s !== null);

  const eliminated = agentStats.filter(s => s.status === "eliminated");
  const active     = agentStats.filter(s => s.status !== "eliminated");

  // ── Rule 1: Mass casualties → enemies too lethal ──────────────────────────
  // If ≥2 agents are already dead, reduce grunt HP so the remaining can survive.
  if (eliminated.length >= 2) {
    const newVal = Math.max(1, Math.floor(config.enemies.grunt_hp * 0.85));
    return { key: "enemies.grunt_hp", newValue: newVal, timestamp: ts,
      reason: `${eliminated.length} agents eliminated — grunt HP reduced to keep game alive` };
  }

  // ── Rule 2: No one is scoring → game is too hard ──────────────────────────
  const totalScore = agentStats.reduce((s, a) => s + a.score, 0);
  if (totalScore === 0 && state.roundNumber > 6) {
    const newVal = Math.max(1, Math.floor(config.enemies.grunt_hp * 0.85));
    return { key: "enemies.grunt_hp", newValue: newVal, timestamp: ts,
      reason: "all agents at 0 score — reducing grunt HP to open up play" };
  }

  if (active.length < 2) return null; // too few agents to compare

  // ── Rule 3: Dominant strategy analysis ───────────────────────────────────
  const sorted = [...active].sort((a, b) => b.score - a.score);
  const leader = sorted[0];
  const second = sorted[1];

  const leadGap = leader.score - second.score;
  const isStrongLead = leadGap >= 3 && leader.score >= second.score * 2;

  if (isStrongLead) {
    // Identify the source of the lead
    const killLead = leader.kills - (sorted.map(a => a.kills).sort((a,b) => b-a)[1] ?? 0);
    const itemLead = leader.items - (sorted.map(a => a.items).sort((a,b) => b-a)[1] ?? 0);

    if (leader.bossKill && !sorted.slice(1).some(a => a.bossKill)) {
      // Leader killed the boss; give others a fighting chance by reducing brute pressure
      const newVal = Math.floor(config.enemies.brute_damage * 0.88);
      return { key: "enemies.brute_damage", newValue: newVal, timestamp: ts,
        reason: `${leader.id} is the only boss killer — easing brute pressure for others` };
    }

    if (killLead >= 3) {
      // Kill-dominant → heavy attacks too strong, raise cost
      const newVal = Math.floor(config.stamina.heavy_attack_cost * 1.15);
      return { key: "stamina.heavy_attack_cost", newValue: newVal, timestamp: ts,
        reason: `${leader.id} leads on kills (+${killLead}) — heavy attack stamina cost raised` };
    }

    if (itemLead >= 3) {
      // Hoard-dominant → item accumulation paying off too much; nerf brutes so others can fight more
      const newVal = Math.floor(config.enemies.brute_hp * 0.88);
      return { key: "enemies.brute_hp", newValue: newVal, timestamp: ts,
        reason: `${leader.id} leads on items (+${itemLead}) — lowering brute HP opens more rooms` };
    }

    // Generic lead → raise light attack cost (benefits speedrunner/cautious most)
    const newVal = Math.floor(config.stamina.light_attack_cost * 1.2);
    return { key: "stamina.light_attack_cost", newValue: newVal, timestamp: ts,
      reason: `${leader.id} score lead ${leader.score} vs ${second.score} — light attack cost raised` };
  }

  // ── Rule 4: Game is balanced — small tune to show Hand of God is active ──
  // Slightly adjust base regen so agents can make more decisions per round.
  // Only fire this if no prior patches have addressed balance.
  const newRegen = Math.min(
    Math.floor(config.stamina.base_regen_per_turn * 1.1),
    24 // cap at ±30% of baseline 20
  );
  if (newRegen !== config.stamina.base_regen_per_turn) {
    return { key: "stamina.base_regen_per_turn", newValue: newRegen, timestamp: ts,
      reason: `game balanced (scores ${sorted.map(a => `${a.id}:${a.score}`).join(", ")}) — stamina regen tuned up` };
  }

  return null;
}

/**
 * Start the dungeon phase loop.
 */
export async function runDungeonPhase(initialState: GameState, config: GameConfig): Promise<GameState> {
  resetEnemyAIState();

  let state = deepClone(initialState);
  let timer = config.dungeon_timer_seconds;
  const roundInterval = config.round_interval_ms ?? ROUND_INTERVAL_MS;

  return new Promise((resolve) => {
    let roundLock = false;
    let roundNumber = 0;

    const interval = setInterval(async () => {
      if (roundLock) return;
      roundLock = true;
      roundNumber++;

      try {
        // Re-read config to pick up patches
        let liveConfig: GameConfig;
        try { liveConfig = readConfig(); } catch { liveConfig = config; }

        // Update FOV
        state = updateFOV(state);

        // Build agent payloads
        const payloads = AGENT_IDS.map(id => {
          const agent = state.agents[id];
          if (!agent || agent.status === "eliminated") return null;
          return { agentId: id, payload: toAgentPayload(state, id) };
        });

        // Fire agent decisions staggered
        const actionPromises = payloads.map((p, i) =>
          new Promise<{ agentId: AgentId; action: AgentAction }>(async (resolveAction) => {
            if (!p) {
              resolveAction({ agentId: AGENT_IDS[i], action: getFallbackAction(AGENT_IDS[i]) });
              return;
            }
            await new Promise(r => setTimeout(r, i * AGENT_STAGGER_MS));
            const timeout = config.agent_api_timeout_ms ?? liveConfig.agent_api_timeout_ms ?? AGENT_TIMEOUT_MS;
            const action = await handleDecideRoute(p.agentId, p.payload, timeout);
            resolveAction({ agentId: p.agentId, action });
          })
        );

        const results = await Promise.all(actionPromises);
        const actions: Record<AgentId, AgentAction> = {} as Record<AgentId, AgentAction>;
        for (const r of results) { actions[r.agentId] = r.action; }

        // Log AGENT_ACTION events for evaluator decision counting
        for (const [aId, action] of Object.entries(actions)) {
          logEvent({
            type: "AGENT_ACTION",
            timestamp: new Date().toISOString(),
            round: roundNumber,
            phase: state.phase,
            data: { agentId: aId, goal: action.goal, targetId: action.targetId ?? null, reasoning: action.reasoning },
          });
        }

        // Resolve conflicts
        const resolved = resolveConflicts(actions);

        // Stamp lastReasoning on each agent so dashboard can show thought bubbles
        for (const [agentId, action] of Object.entries(actions)) {
          const agent = state.agents[agentId as AgentId];
          if (agent) {
            state = {
              ...state,
              agents: {
                ...state.agents,
                [agentId]: { ...agent, lastReasoning: action.reasoning },
              },
            };
          }
        }

        // Apply agent actions
        for (const [agentId, action] of Object.entries(resolved)) {
          state = applyAgentAction(state, agentId as AgentId, action, liveConfig);
        }

        // Boss spawns: check if any agent reached boss entrance
        state = processBossSpawns(state, liveConfig);

        // Agent stamina regen
        for (const id of AGENT_IDS) {
          const agent = state.agents[id];
          if (!agent || agent.status === "eliminated") continue;
          const regenAmount = calcStaminaRegen(agent.combat, liveConfig);
          agent.combat = {
            ...agent.combat,
            stamina: Math.min(agent.combat.maxStamina, agent.combat.stamina + regenAmount),
          };
        }

        // Resolve enemy actions
        const enemyActions = resolveEnemyActions(state);

        // Apply enemy moves
        const enemies = state.enemies.map(e => {
          const ea = enemyActions.find(a => a.enemyId === e.id);
          if (!ea || !e.isAlive) return e;
          if (ea.action === "move" && ea.newPosition) {
            return { ...e, position: { ...ea.newPosition } };
          }
          return e;
        });

        // Apply enemy attacks (skip round 1 — agents haven't had a chance to act yet)
        const skipEnemyAttacks = roundNumber === 1;
        const enemiesAfterAttacks = skipEnemyAttacks ? enemies : enemies.map(e => {
          const ea = enemyActions.find(a => a.enemyId === e.id);
          if (!ea || ea.action !== "attack" || !ea.targetAgentId || !e.isAlive) return e;
          const target = state.agents[ea.targetAgentId];
          if (!target || target.status === "eliminated") return e;
          const atkResult = resolveEnemyAttack(e.tier, target.combat, target.inventory, false, liveConfig);
          target.combat = { ...target.combat, hp: atkResult.defenderHpAfter };
          if (target.combat.hp <= 0) target.status = "eliminated";
          return e;
        });

        state = { ...state, enemies: enemiesAfterAttacks, roundNumber };

        // Boss combat: boss and agent trade damage each round
        state = processBossCombat(state, liveConfig);

        // Decrement timer
        timer -= (roundInterval / 1000);
        state = { ...state, dungeonTimer: Math.max(0, Math.ceil(timer)) };

        // Broadcast and log ROUND_STATE
        broadcast(state);
        logEvent({
          type: "ROUND_STATE",
          timestamp: new Date().toISOString(),
          round: roundNumber,
          phase: state.phase,
          data: {
            agents: Object.fromEntries(
              AGENT_IDS.map(id => [id, {
                position: state.agents[id]?.position,
                hp: state.agents[id]?.combat?.hp,
                status: state.agents[id]?.status,
              }])
            ),
            enemies: enemiesAfterAttacks.filter(e => e.isAlive).map(e => ({
              id: e.id,
              position: e.position,
              hp: e.hp,
              isAlive: e.isAlive,
            })),
          },
        });

        // Patch trigger: evaluate every 3 rounds, up to 3 patches per dungeon phase
        const patchesApplied = state.recentPatches?.length ?? 0;
        if (roundNumber > 2 && roundNumber % 3 === 0 && patchesApplied < 3) {
          const suggestion = choosePatch(state, liveConfig);
          if (suggestion) {
            const patchEvent = applyPatch(suggestion);
            if (patchEvent) {
              state.recentPatches = [...(state.recentPatches ?? []), patchEvent];
              broadcastPatch(patchEvent);
              logEvent({
                type: "PATCH_APPLIED",
                timestamp: patchEvent.timestamp,
                round: roundNumber,
                phase: state.phase,
                data: {
                  key: patchEvent.key,
                  oldValue: patchEvent.oldValue,
                  newValue: patchEvent.newValue,
                  reason: patchEvent.reason,
                },
              });
            }
          }
        }

        // Check timer
        if (timer <= 0) {
          clearInterval(interval);
          const arenaState = await teleportToArena(state);
          resolve(arenaState);
        }
      } catch (err) {
        console.error(`[GameLoop] round ${roundNumber} error:`, err);
      } finally {
        roundLock = false;
      }
    }, roundInterval);
  });
}

/**
 * Teleport all agents from dungeon to arena.
 */
export async function teleportToArena(state: GameState): Promise<GameState> {
  // Sort agents by dungeon score desc, tiebreaker: HP remaining desc
  const ranked = (AGENT_IDS as AgentId[])
    .filter(id => state.agents[id]?.status !== "eliminated")
    .sort((a, b) => {
      const sa = state.agents[a]?.dungeonScore ?? 0;
      const sb = state.agents[b]?.dungeonScore ?? 0;
      if (sb !== sa) return sb - sa;
      return (state.agents[b]?.combat?.hp ?? 0) - (state.agents[a]?.combat?.hp ?? 0);
    });

  // Create arena matchups. Full bracket requires 4 survivors; degrade gracefully.
  const matchups: ArenaMatchup[] = [];
  if (ranked.length >= 4) {
    // Full: seed1 vs seed4, seed2 vs seed3 → winners meet in final
    matchups.push({ agentA: ranked[0], agentB: ranked[3], turnCount: 0 });
    matchups.push({ agentA: ranked[1], agentB: ranked[2], turnCount: 0 });
  } else if (ranked.length >= 2) {
    // Degraded: skip semis, go straight to a single final
    matchups.push({ agentA: ranked[0], agentB: ranked[1], turnCount: 0 });
  }

  // Transition to ARENA_SEMI1
  let newState = transitionPhase(state, "ARENA_SEMI1");
  newState = { ...newState, arenaMatchups: matchups };

  // Log teleport event
  logEvent({
    type: "PHASE_TRANSITION",
    timestamp: new Date().toISOString(),
    round: newState.roundNumber,
    phase: "ARENA_SEMI1",
    data: { from: "DUNGEON", to: "ARENA_SEMI1", seeds: ranked },
  });

  broadcast(newState);
  return newState;
}

/**
 * Run a single 1v1 arena match. Alternating turns.
 */
export async function runArenaMatch(
  state: GameState,
  config: GameConfig,
  matchup: ArenaMatchup
): Promise<AgentId> {
  const turnCap = config.arena_turn_cap > 0 ? config.arena_turn_cap : 30;
  const arenaTimeout = config.agent_api_timeout_ms ?? AGENT_TIMEOUT_MS;
  let turnCount = 0;
  let currentState = deepClone(state);

  const aId = matchup.agentA;
  const bId = matchup.agentB;

  // Position agents adjacent for arena combat
  if (currentState.agents[aId] && currentState.agents[bId]) {
    const arenaX = Math.floor(state.map.width / 2);
    const arenaY = Math.floor(state.map.height / 2);
    currentState.agents[aId].position = { x: arenaX, y: arenaY };
    currentState.agents[bId].position = { x: arenaX + 1, y: arenaY };
  }

  while (turnCount < turnCap) {
    turnCount++;

    // Agent A's turn
    const aAgent = currentState.agents[aId];
    if (aAgent && aAgent.status !== "eliminated" && aAgent.combat.hp > 0) {
      const payload = toAgentPayload(currentState, aId);
      const action = await handleDecideRoute(aId, payload, arenaTimeout);
      currentState = applyAgentAction(currentState, aId, action, config);
    }

    // Check if B is dead
    const bAfter = currentState.agents[bId];
    if (bAfter && (bAfter.status === "eliminated" || bAfter.combat.hp <= 0)) {
      return aId;
    }

    // Agent B's turn
    const bAgent = currentState.agents[bId];
    if (bAgent && bAgent.status !== "eliminated" && bAgent.combat.hp > 0) {
      const payload = toAgentPayload(currentState, bId);
      const action = await handleDecideRoute(bId, payload, arenaTimeout);
      currentState = applyAgentAction(currentState, bId, action, config);
    }

    // Check if A is dead
    const aAfter = currentState.agents[aId];
    if (aAfter && (aAfter.status === "eliminated" || aAfter.combat.hp <= 0)) {
      return bId;
    }

    // Stamina regen after both turns
    for (const id of [aId, bId]) {
      const agent = currentState.agents[id];
      if (!agent || agent.status === "eliminated") continue;
      const regenAmount = calcStaminaRegen(agent.combat, config);
      agent.combat = {
        ...agent.combat,
        stamina: Math.min(agent.combat.maxStamina, agent.combat.stamina + regenAmount),
      };
    }

    broadcast(currentState);
  }

  // Turn cap reached: higher HP% wins
  const aHpPct = (currentState.agents[aId]?.combat?.hp ?? 0) / (currentState.agents[aId]?.combat?.maxHp ?? 1);
  const bHpPct = (currentState.agents[bId]?.combat?.hp ?? 0) / (currentState.agents[bId]?.combat?.maxHp ?? 1);
  return aHpPct >= bHpPct ? aId : bId;
}
