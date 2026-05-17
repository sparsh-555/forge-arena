// GameLoop: orchestrates the full game state machine.
// Owns the round timer, round lock, conflict resolution, phase transitions.
// Calls AgentAPI, EnemyAI, CombatSystem, PatchApplier. Never calls Claude directly.
//
// Required imports when implementing:
//   import { AGENT_IDS, CONFLICT_PRIORITY } from "./types.js";
//   import { callClaude, getFallbackAction } from "./AgentAPI.js";
//   import { resolveEnemyActions } from "./EnemyAI.js";
//   import { applyPatch, readConfig } from "./PatchApplier.js";
//   import { broadcast, logEvent } from "./StateEmitter.js";

import type {
  AgentAction,
  AgentId,
  ArenaMatchup,
  GameConfig,
  GamePhase,
  GameState,
} from "./types.js";
import { PHASE_TRANSITIONS } from "./types.js";

/**
 * Start the dungeon phase loop.
 * Fires every config.round_interval_ms (or waits if previous round is still resolving).
 * Stops when dungeon timer expires (plus any active grace periods).
 *
 * Implementation notes:
 * - Declare: let roundLock = false; at module scope
 * - On each interval tick: if roundLock, skip
 * - Set roundLock = true; fire 4 parallel Claude calls (staggered agent_call_stagger_ms)
 * - Collect responses (agent_api_timeout_ms timeout); timed-out → getFallbackAction()
 * - resolveConflicts(actions); apply actions; resolve enemy actions
 * - Update dungeonTimer; check grace periods; emit round via StateEmitter
 * - roundLock = false
 * - When timer expires + all grace periods done: call teleportToArena()
 */
export async function runDungeonPhase(_state: GameState, _config: GameConfig): Promise<void> {
  throw new Error("runDungeonPhase not implemented");
}

/**
 * Teleport all agents from dungeon to arena.
 * Finalizes dungeon scores, computes seeds, transitions GamePhase.
 *
 * Implementation notes:
 * - For agents in boss fight: if boss alive, grant no-kill teleport
 * - Auto-move any ground loot in boss room to agent backpack
 * - Sort agents by dungeonScore desc, tiebreaker: hp remaining desc → arena seeds
 * - Seed1 vs Seed4 (SEMI1), Seed2 vs Seed3 (SEMI2) → state.arenaMatchups
 * - Reposition all agents to arena starting positions
 * - Emit AGENT_TELEPORTED events; transition DUNGEON → ARENA_SEMI1
 */
export async function teleportToArena(_state: GameState): Promise<void> {
  throw new Error("teleportToArena not implemented");
}

/**
 * Run a single 1v1 arena match.
 * Alternating turns: agentA acts, then agentB acts.
 * Continues until one agent reaches 0 HP or turn cap exceeded.
 *
 * Implementation notes:
 * - Alternate turns between matchup.agentA and matchup.agentB
 * - callClaude for current agent on each turn
 * - Resolve combat via CombatSystem.resolveCombat
 * - Win condition: hp <= 0. Turn cap: config.arena_turn_cap (0 = unlimited)
 * - If cap exceeded: winner = higher HP% agent
 * - Emit ARENA_MATCH_END; mark loser eliminated; return winner AgentId
 */
export async function runArenaMatch(
  _state: GameState,
  _config: GameConfig,
  _matchup: ArenaMatchup
): Promise<AgentId> {
  throw new Error("runArenaMatch not implemented");
}

/**
 * Resolve conflicts when multiple agents choose the same target.
 * Uses CONFLICT_PRIORITY ordering: aggressive > cautious > hoarder > speedrunner.
 * Lower-priority conflicting action is replaced with { goal: "pass", reasoning: "conflict resolved" }.
 * Never mutates input — returns new Record.
 */
export function resolveConflicts(
  _actions: Record<AgentId, AgentAction>
): Record<AgentId, AgentAction> {
  // For each pair of actions targeting the same tile/entity:
  //   Find higher priority agent (lower index in CONFLICT_PRIORITY)
  //   Replace lower-priority agent's action with { goal: "pass", reasoning: "conflict resolved" }
  throw new Error("resolveConflicts not implemented");
}

/**
 * Transition the game to the next phase.
 * Validates the transition is allowed — rejects invalid transitions.
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
 *
 * Implementation notes:
 * - move_to_*: update agent position (use pathfindStep from EnemyAI)
 * - attack_*: call CombatSystem.resolveCombat, update HP values
 * - block: set agent blocking flag for this round (cleared next round)
 * - use_estus: restore 60% max HP, decrement estusCount
 * - pick_up_item: move ground item to agent backpack
 * - equip_from_backpack: swap item from backpack to equipped slot (costs full turn)
 * - pass: no-op
 * Always return new immutable state object ({ ...state, agents: { ...state.agents, ... } })
 */
export function applyAgentAction(
  _state: GameState,
  _agentId: AgentId,
  _action: AgentAction,
  _config: GameConfig
): GameState {
  throw new Error("applyAgentAction not implemented");
}
