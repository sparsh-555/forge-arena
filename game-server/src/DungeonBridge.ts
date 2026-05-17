// DungeonBridge: the only file that knows about both rot.js internals and GameState.
// Workers building DungeonGen write rot.js output here.
// Workers building GameLoop/AgentAPI consume from here.
// Nothing else crosses this boundary.

import type {
  AgentId,
  AgentStatePayload,
  DashboardPayload,
  GameState,
  VisibleEntity,
} from "./types.js";

/**
 * Serialize game state for a specific agent.
 * Applies FOV filter: agent only receives entities within their visible tiles.
 * Called by AgentAPI before each Claude call.
 *
 * Implementation notes:
 * - visibleEntities: filter enemies, groundItems, bossInstances, other agents
 *   by whether state.map.tiles[y][x].visibleTo includes agentId
 * - recentPatches: call formatPatchesForAgent(state)
 * - Include all fields from AgentStatePayload type
 */
export function toAgentPayload(_state: GameState, _agentId: AgentId): AgentStatePayload {
  throw new Error("toAgentPayload not implemented");
}

/**
 * Serialize game state for dashboard broadcast.
 * Full map — no FOV restriction. All agent positions visible.
 * Called by StateEmitter every round.
 *
 * Implementation notes:
 * - Include: tiles (full), all agents, all enemies, all boss instances,
 *   ground items, recent patches, arena matchups, final scores, dungeon timer
 * - Include mapWidth and mapHeight from state.map
 */
export function toDashboardPayload(_state: GameState): DashboardPayload {
  throw new Error("toDashboardPayload not implemented");
}

/**
 * Build visible entities list for a given agent based on their FOV.
 * Returns all enemies, items, chests, boss entrances, and other agents within FOV radius.
 *
 * Implementation notes:
 * - Filter all entities by: state.map.tiles[entity.y][entity.x].visibleTo.includes(agentId)
 * - Compute distance from agent's position
 * - Sort by distance ascending
 */
export function getVisibleEntities(_state: GameState, _agentId: AgentId): VisibleEntity[] {
  throw new Error("getVisibleEntities not implemented");
}

/**
 * Format recent patches as human-readable strings for agent payload.
 * Example: "Heavy attack stamina cost: 30 → 45 (reason: aggressive win rate 87%)"
 */
export function formatPatchesForAgent(_state: GameState): string[] {
  throw new Error("formatPatchesForAgent not implemented");
}
