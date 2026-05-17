// DungeonBridge: the only file that knows about both rot.js internals and GameState.
// Workers building DungeonGen write rot.js output here.
// Workers building GameLoop/AgentAPI consume from here.
// Nothing else crosses this boundary.

import type {
  AgentId,
  AgentState,
  AgentStatePayload,
  DashboardPayload,
  GameState,
  VisibleEntity,
} from "./types.js";

/**
 * Serialize game state for a specific agent.
 * Applies FOV filter: agent only receives entities within their visible tiles.
 * Called by AgentAPI before each Claude call.
 */
export function toAgentPayload(state: GameState, agentId: AgentId): AgentStatePayload {
  // TODO: implement FOV filtering using agent's explored tile set
  // Only include entities visible to this agent (visibleTo includes agentId)
  // Include all recent patches as human-readable strings
  // Return AgentStatePayload with correct types
  throw new Error("toAgentPayload not implemented");
}

/**
 * Serialize game state for dashboard broadcast.
 * Full map — no FOV restriction. All agent positions visible.
 * Called by StateEmitter every round.
 */
export function toDashboardPayload(state: GameState): DashboardPayload {
  // TODO: serialize full game state for spectator view
  // Include: tiles, all agents, all enemies, all boss instances, ground items,
  //          recent patches, arena matchups, final scores, timers
  throw new Error("toDashboardPayload not implemented");
}

/**
 * Build visible entities list for a given agent based on their FOV.
 * Returns all enemies, items, chests, boss entrances, and other agents within FOV radius.
 */
export function getVisibleEntities(state: GameState, agentId: AgentId): VisibleEntity[] {
  // TODO: iterate state.enemies, state.groundItems, state.agents, state.bossInstances
  // Filter by whether position is in agent's visible tiles
  // Include distance from agent's current position
  // Sort by distance ascending
  throw new Error("getVisibleEntities not implemented");
}

/**
 * Format recent patches as human-readable strings for agent payload.
 * Example: "Heavy attack stamina cost: 30 → 45 (reason: aggressive win rate 87%)"
 */
export function formatPatchesForAgent(state: GameState): string[] {
  // TODO: map state.recentPatches to human-readable strings
  // Include key, old value, new value, and reason
  throw new Error("formatPatchesForAgent not implemented");
}
