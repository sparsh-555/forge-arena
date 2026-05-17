// EnemyAI: rule-based enemy decision making. No Claude calls. Deterministic.
// Called by GameLoop after all agent actions resolve each round.

import type { AgentId, EnemyAction, EnemyState, GameState, Position } from "./types.js";

/**
 * Resolve all enemy actions for the current round.
 * Pure function — returns actions, does not mutate state.
 * GameLoop applies the returned actions to game state.
 */
export function resolveEnemyActions(state: GameState): EnemyAction[] {
  // TODO: for each living enemy, call resolveOneEnemy
  // Collect and return all results
  throw new Error("resolveEnemyActions not implemented");
}

/**
 * Resolve a single enemy's action based on its tier and current state.
 *
 * Grunt: move toward nearest active agent, attack if adjacent.
 * Brute: same movement. Every 3rd turn, telegraph heavy strike. On telegraphed turn, deal heavy strike.
 * Sentinel: same movement. Block every 3rd turn (no attack). At 30% HP: summon a grunt on adjacent tile.
 */
function resolveOneEnemy(enemy: EnemyState, state: GameState): EnemyAction {
  // TODO: implement per-tier logic
  // Use rot.js pathfinding to compute next move toward nearest agent
  // Apply tier-specific action patterns
  // Return EnemyAction
  throw new Error("resolveOneEnemy not implemented");
}

/**
 * Find the nearest active agent to a position.
 * Ignores eliminated agents.
 */
export function findNearestAgent(position: Position, state: GameState): AgentId | null {
  // TODO: filter active agents, compute Manhattan distance, return closest
  throw new Error("findNearestAgent not implemented");
}

/**
 * Check if position is adjacent (including diagonals) to a target.
 */
export function isAdjacent(a: Position, b: Position): boolean {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}

/**
 * Compute next move step toward target using rot.js A* pathfinding.
 * Returns the next position to move to, or current position if already adjacent/blocked.
 */
export function pathfindStep(from: Position, to: Position, state: GameState): Position {
  // TODO: use rot.js Path.AStar
  // Pass passable callback that checks tile type (walls/doors block movement)
  // Return the first step along the path
  throw new Error("pathfindStep not implemented");
}
