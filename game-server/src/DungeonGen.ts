// DungeonGen: procedural dungeon generation using rot.js BSP.
// Output is consumed by DungeonBridge — never by other modules directly.

import type { DungeonMap, Position } from "./types.js";

/**
 * Generate a dungeon map using rot.js BSP algorithm.
 * @param seed - deterministic seed for reproducible maps
 * @returns DungeonMap with ~20 rooms connected by corridors
 *
 * Constraints from SPEC.md:
 * - ~20 rooms (BSP will produce 18-22)
 * - Rooms connected by corridors
 * - One boss_entrance tile at the deepest room (furthest from spawn)
 * - 3-5 chest tiles distributed across rooms (not corridors)
 * - Each room has at least one floor tile for agent/enemy spawning
 * - All tiles start with explored: false, visibleTo: []
 */
export function generateDungeon(seed: number): DungeonMap {
  // TODO: use rot.js Map.BSP to generate rooms
  // Use rot.js Path.AStar for connecting rooms with corridors
  // Identify the room furthest from center as boss room
  // Place boss_entrance tile at entrance to boss room
  // Place chests in random non-boss rooms
  // Return fully initialized DungeonMap
  throw new Error("generateDungeon not implemented");
}

/**
 * Compute spawn positions for all 4 agents.
 * Agents must start in different rooms, each near room center.
 * @returns map of agentId to starting Position
 */
export function computeAgentSpawns(map: DungeonMap): Record<string, Position> {
  // TODO: select 4 rooms (excluding boss room), return center positions
  throw new Error("computeAgentSpawns not implemented");
}

/**
 * Compute enemy spawn positions and tiers.
 * Called once at dungeon generation. Returns initial enemy list.
 * Grunts in small rooms, brutes in medium, sentinels in large.
 */
export function computeEnemySpawns(map: DungeonMap): Array<{
  tier: "grunt" | "brute" | "sentinel";
  position: Position;
}> {
  // TODO: assign enemies based on room size
  // Ensure at least 1 enemy per room (excluding boss room and spawn rooms)
  // Total enemies: ~15-25 across the dungeon
  throw new Error("computeEnemySpawns not implemented");
}

/**
 * Compute initial item chest contents.
 * Each chest gets 1-3 items drawn from the item pool.
 */
export function computeChestContents(map: DungeonMap): Record<string, string[]> {
  // TODO: return map of chest tile key (e.g. "5,7") to item id array
  throw new Error("computeChestContents not implemented");
}

/**
 * Spawn a new enemy in an unexplored tile (Hand of God mechanic).
 * Called by Balance Worker when Evaluator requests a mid-game spawn.
 * Returns null if no valid unexplored tile exists.
 */
export function spawnEnemyInUnexplored(
  map: DungeonMap,
  tier: "grunt" | "brute" | "sentinel" | "hex_caster" | "shade"
): Position | null {
  // TODO: find all tiles where explored === false and type === "floor"
  // Return random position from that set, or null if empty
  throw new Error("spawnEnemyInUnexplored not implemented");
}
