// GameLoop: orchestrates the full game state machine.
// Owns the round timer, round lock, conflict resolution, phase transitions.
// Calls AgentAPI, EnemyAI, CombatSystem, PatchApplier. Never calls Claude directly.

import type {
  AgentAction,
  AgentId,
  AgentState,
  ArenaMatchup,
  CONFLICT_PRIORITY,
  GameConfig,
  GamePhase,
  GameState,
} from "./types.js";
import { AGENT_IDS, PHASE_TRANSITIONS } from "./types.js";

// Round lock: prevents overlapping rounds.
// Set to true when round N is in progress; cleared when fully resolved.
let roundLock = false;

/**
 * Start the dungeon phase loop.
 * Fires every config.round_interval_ms (or waits if previous round is still resolving).
 * Stops when dungeon timer expires (plus any active grace periods).
 */
export async function runDungeonPhase(state: GameState, config: GameConfig): Promise<void> {
  // TODO:
  // 1. Start interval timer (config.round_interval_ms)
  // 2. On each tick: if roundLock, skip (previous round still resolving)
  // 3. Set roundLock = true
  // 4. Fire all 4 agent API calls in parallel (staggered by config.agent_call_stagger_ms each)
  // 5. Wait for all responses (config.agent_api_timeout_ms timeout per agent)
  // 6. Timed-out agents receive { goal: "pass", reasoning: "timeout" }
  // 7. resolveConflicts(actions) → apply resolved actions
  // 8. resolveEnemyActions(state) → apply enemy actions
  // 9. Update dungeon timer, check grace periods
  // 10. Emit round to StateEmitter
  // 11. roundLock = false
  // 12. If timer expired and all grace periods done: call teleportToArena()
  throw new Error("runDungeonPhase not implemented");
}

/**
 * Teleport all agents from dungeon to arena.
 * Finalizes dungeon scores, computes seeds, transitions GamePhase.
 */
export async function teleportToArena(state: GameState): Promise<void> {
  // TODO:
  // 1. For each agent in active boss fight: if boss alive, apply no-kill teleport
  //    Auto-move any dropped boss loot from ground to agent backpack
  // 2. Calculate final dungeon scores
  // 3. Sort agents by dungeonScore desc, tiebreaker: hp remaining desc
  // 4. Assign arena matchups: Seed1 vs Seed4 (SEMI1), Seed2 vs Seed3 (SEMI2)
  // 5. Reposition all agents to arena starting positions
  // 6. Emit AGENT_TELEPORTED events for all agents
  // 7. Emit PHASE_TRANSITION: DUNGEON → ARENA_SEMI1
  // 8. Call runArenaPhase(state, config, state.arenaMatchups[0])
  throw new Error("teleportToArena not implemented");
}

/**
 * Run a single 1v1 arena match.
 * Alternating turns: agentA acts, then agentB acts.
 * Continues until one agent reaches 0 HP or turn cap exceeded.
 */
export async function runArenaMatch(
  state: GameState,
  config: GameConfig,
  matchup: ArenaMatchup
): Promise<AgentId> {
  // TODO:
  // 1. Alternate turns between matchup.agentA and matchup.agentB
  // 2. On each turn: call AgentAPI for current agent (no timeout default: Haiku, Final: Sonnet)
  // 3. Resolve combat via CombatSystem
  // 4. Check win condition: hp <= 0
  // 5. Check turn cap (config.arena_turn_cap, 0 = unlimited)
  //    If cap exceeded: winner = higher HP% agent
  // 6. Emit ARENA_MATCH_END with winner
  // 7. Mark loser as eliminated in state
  // 8. Return winner AgentId
  throw new Error("runArenaMatch not implemented");
}

/**
 * Resolve conflicts when multiple agents choose the same target.
 * Uses CONFLICT_PRIORITY ordering: aggressive > cautious > hoarder > speedrunner.
 * Lower-priority conflicting action is replaced with { goal: "pass" }.
 */
export function resolveConflicts(
  actions: Record<AgentId, AgentAction>
): Record<AgentId, AgentAction> {
  // TODO:
  // For each pair of actions that target the same tile/entity:
  //   Find higher priority agent (lower index in CONFLICT_PRIORITY)
  //   Replace lower-priority agent's action with { goal: "pass", reasoning: "conflict resolved" }
  // Return new actions record (never mutate input)
  throw new Error("resolveConflicts not implemented");
}

/**
 * Transition the game to the next phase.
 * Validates the transition is allowed (rejects invalid transitions).
 */
export function transitionPhase(state: GameState, to: GamePhase): GameState {
  const allowed = PHASE_TRANSITIONS[state.phase];
  if (allowed !== to) {
    throw new Error(`Invalid phase transition: ${state.phase} → ${to}`);
  }
  return { ...state, phase: to };
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
  // TODO: switch on action.goal
  // move_to_* → update agent position (use rot.js pathfinding via EnemyAI.pathfindStep)
  // attack_* → call CombatSystem.resolveCombat, update HP values
  // block → set agent blocking flag for this round
  // use_estus → restore HP by 60%, decrement estusCount
  // pick_up_item → move ground item to agent backpack
  // equip_from_backpack → swap item from backpack to slot (costs full turn)
  // pass → no-op
  // Always return new immutable state object
  throw new Error("applyAgentAction not implemented");
}
