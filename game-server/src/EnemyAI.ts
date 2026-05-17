// EnemyAI: rule-based enemy decision making. No Claude calls. Deterministic.
// Called by GameLoop after all agent actions resolve each round.
//
// TODO (workers implementing this file): add this import at top:
//   import { Path } from "rot-js";

import type { AgentId, EnemyAction, EnemyState, GameState, Position } from "./types.js";

/**
 * Resolve all enemy actions for the current round.
 * Pure function — returns actions list, does not mutate state.
 * GameLoop applies the returned actions to game state.
 *
 * Implementation notes:
 * - Filter state.enemies to living enemies (enemy.isAlive)
 * - For each living enemy: resolveOneEnemy(enemy, state)
 * - Return all collected EnemyActions
 */
export function resolveEnemyActions(_state: GameState): EnemyAction[] {
  throw new Error("resolveEnemyActions not implemented");
}

/**
 * Resolve a single enemy's action based on its tier and current state.
 *
 * Grunt: move toward nearest active agent, attack if adjacent.
 * Brute: same movement. Every 3rd turn, telegraph heavy strike (set telegraphedAction).
 *        On the telegraphed turn, deal heavy damage instead.
 * Sentinel: same movement. Block every 3rd turn (no attack that turn).
 *           At 30% HP: summon a grunt on adjacent unexplored tile (once per battle).
 *
 * Implementation notes:
 * - Use findNearestAgent(enemy.position, state) to find target
 * - Use pathfindStep(enemy.position, targetPosition, state) for movement
 * - isAdjacent(enemy.position, targetPosition) to check attack range
 */
function resolveOneEnemy(enemy: EnemyState, state: GameState): EnemyAction {
  // Stub — needed so resolveEnemyActions can call it when implemented
  void enemy;
  void state;
  throw new Error("resolveOneEnemy not implemented");
}

// Export for testing (workers: remove this export once resolveEnemyActions calls it)
export { resolveOneEnemy };

/**
 * Find the nearest active agent to a position (Manhattan distance).
 * Ignores eliminated agents.
 */
export function findNearestAgent(_position: Position, _state: GameState): AgentId | null {
  throw new Error("findNearestAgent not implemented");
}

/**
 * Check if position a is adjacent (including diagonals) to position b.
 * Implemented — no stub needed.
 */
export function isAdjacent(a: Position, b: Position): boolean {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}

/**
 * Compute next move step toward target using rot.js A* pathfinding.
 * Returns the next position to move to (one step only).
 * Returns current position if already adjacent or no path exists.
 *
 * Implementation notes:
 * - new Path.AStar(to.x, to.y, passable, { topology: 8 })
 * - passable callback: (x, y) => state.map.tiles[y]?.[x]?.type !== "wall"
 * - path.compute(from.x, from.y, (x, y) => steps.push({ x, y }))
 * - Return steps[1] (first step after current position), or from if steps.length <= 1
 */
export function pathfindStep(_from: Position, _to: Position, _state: GameState): Position {
  throw new Error("pathfindStep not implemented");
}
