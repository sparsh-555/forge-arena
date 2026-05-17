// DungeonGen: procedural dungeon generation using rot.js BSP.
// Output is consumed by DungeonBridge — never by other modules directly.
//
// TODO (workers implementing this file): add these imports at top:
//   import { Map as RotMap, Path, FOV } from "rot-js";

import type { DungeonMap, Position } from "./types.js";

/**
 * Generate a dungeon map using rot.js BSP algorithm.
 * @param seed - deterministic seed for reproducible maps (use new ROT.RNG().setSeed(seed))
 * @returns DungeonMap with ~20 rooms connected by corridors
 *
 * Implementation notes:
 * - new RotMap.BspDungeon(width, height) — typical: 60×40
 * - bsp.create(digger) callback — record floor tiles
 * - Use RotMap.Corridor or RotMap.Rogue for corridor connection
 * - Identify boss room: room furthest from map center (Euclidean distance of room center)
 * - Place boss_entrance tile at entrance to boss room (first floor tile adjacent to corridor)
 * - Place 3-5 chests in random non-boss rooms (1 per room max)
 * - All tiles initialized: { explored: false, visibleTo: [] }
 */
export function generateDungeon(_seed: number): DungeonMap {
  throw new Error("generateDungeon not implemented");
}

/**
 * Compute spawn positions for all 4 agents.
 * Agents must start in different rooms, each near room center.
 *
 * Implementation notes:
 * - Select 4 rooms (excluding boss room and corridor-only areas)
 * - Return center position of each room (closest floor tile to room center)
 * - Keys: "aggressive", "cautious", "hoarder", "speedrunner"
 */
export function computeAgentSpawns(_map: DungeonMap): Record<string, Position> {
  throw new Error("computeAgentSpawns not implemented");
}

/**
 * Compute enemy spawn positions and tiers.
 * Called once at dungeon generation. Returns initial enemy list.
 *
 * Implementation notes:
 * - Grunt: rooms with area < 25 tiles
 * - Brute: rooms with area 25-50 tiles
 * - Sentinel: rooms with area > 50 tiles
 * - At least 1 enemy per non-agent, non-boss room
 * - Total: aim for 15-25 enemies across dungeon
 * - Never spawn in agent start rooms or boss room
 */
export function computeEnemySpawns(_map: DungeonMap): Array<{
  tier: "grunt" | "brute" | "sentinel";
  position: Position;
}> {
  throw new Error("computeEnemySpawns not implemented");
}

/**
 * Compute initial chest contents.
 * Each chest gets 1-3 items drawn from the item pool.
 *
 * Implementation notes:
 * - Key: "${x},${y}" for each chest tile position
 * - Items from predefined pool: weapons, armor, consumables
 * - Rare items (boss reward) NOT in chest pool — only from boss kill
 */
export function computeChestContents(_map: DungeonMap): Record<string, string[]> {
  throw new Error("computeChestContents not implemented");
}

/**
 * Spawn a new enemy in an unexplored tile (Hand of God mechanic).
 * Called by Balance Worker when Evaluator requests a mid-game spawn.
 * Returns null if no valid unexplored tile exists.
 *
 * Implementation notes:
 * - Filter: tiles where explored === false AND type === "floor"
 * - Return random position from that set, or null if empty
 * - hex_caster and shade are special variants of grunt/brute with personality tags
 */
export function spawnEnemyInUnexplored(
  _map: DungeonMap,
  _tier: "grunt" | "brute" | "sentinel" | "hex_caster" | "shade"
): Position | null {
  throw new Error("spawnEnemyInUnexplored not implemented");
}
