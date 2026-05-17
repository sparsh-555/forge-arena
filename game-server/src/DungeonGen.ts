// DungeonGen: procedural dungeon generation using rot.js Digger.
// Output is consumed by DungeonBridge — never by other modules directly.

import ROT from "rot-js";
import type { DungeonMap, Position, Room, Tile } from "./types.js";
import { MAP_WIDTH, MAP_HEIGHT } from "./types.js";

const ITEM_POOL = [
  "sword", "axe", "dagger", "greatsword",
  "leather_armor", "chain_armor", "plate_armor", "shield",
  "estus", "strength_potion"
];

function roomArea(r: Room): number {
  return r.width * r.height;
}

/**
 * Generate a dungeon map using rot.js Digger algorithm.
 * ~20 rooms connected by corridors. MAP_WIDTH=30, MAP_HEIGHT=22.
 */
export function generateDungeon(seed: number): DungeonMap {
  ROT.RNG.setSeed(seed);

  const digger = new ROT.Map.Digger(MAP_WIDTH, MAP_HEIGHT, {
    roomWidth: [3, 7],
    roomHeight: [3, 5],
    corridorLength: [2, 6],
    dugPercentage: 0.25,
  });

  // Build tile grid from digger callback
  const tiles: Tile[][] = Array.from({ length: MAP_HEIGHT }, () =>
    Array.from({ length: MAP_WIDTH }, (): Tile => ({
      type: "wall" as const,
      explored: false,
      visibleTo: [],
    }))
  );

  digger.create((x, y, value) => {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return;
    if (value === 0) {
      tiles[y][x].type = "floor";
    } else if (value === 2) {
      tiles[y][x].type = "door";
    }
    // value 1 = wall — leave as default
  });

  // Convert rot.js rooms to our Room format
  const rotRooms = digger.getRooms();
  const rooms: Room[] = rotRooms.map((r, i) => ({
    id: `room_${i}`,
    x: r.getLeft(),
    y: r.getTop(),
    width: r.getRight() - r.getLeft() + 1,
    height: r.getBottom() - r.getTop() + 1,
  }));

  // Boss room = furthest from bottom-left corner (top-right area)
  let bossRoomIdx = 0;
  let maxDist = -1;
  rooms.forEach((r, i) => {
    const rx = r.x + r.width / 2;
    const ry = r.y + r.height / 2;
    // Distance from bottom-left (0, MAP_HEIGHT) — boss goes top-right
    const d = rx + (MAP_HEIGHT - ry);
    if (d > maxDist) { maxDist = d; bossRoomIdx = i; }
  });

  // Place boss entrance at center of boss room
  const bossRoom = rooms[bossRoomIdx];
  const bossX = Math.round(bossRoom.x + bossRoom.width / 2);
  const bossY = Math.round(bossRoom.y + bossRoom.height / 2);
  if (bossX >= 0 && bossX < MAP_WIDTH && bossY >= 0 && bossY < MAP_HEIGHT) {
    tiles[bossY][bossX].type = "boss_entrance";
  }

  // Dungeon entrance room = most bottom-left room (agents enter here)
  let entranceRoomIdx = 0;
  let minScore = Infinity;
  rooms.forEach((r, i) => {
    if (i === bossRoomIdx) return;
    const rx = r.x + r.width / 2;
    const ry = r.y + r.height / 2;
    // Low x + high y = bottom-left
    const score = rx - (MAP_HEIGHT - ry);
    if (score < minScore) { minScore = score; entranceRoomIdx = i; }
  });
  const entranceRoom = rooms[entranceRoomIdx];
  const entranceX = Math.round(entranceRoom.x + entranceRoom.width / 2);
  const entranceY = Math.round(entranceRoom.y + entranceRoom.height / 2);
  // Mark bottom edge of entrance room as door (visual entrance)
  const doorY = Math.min(entranceRoom.y + entranceRoom.height, MAP_HEIGHT - 1);
  if (tiles[doorY]?.[entranceX]) tiles[doorY][entranceX].type = "door";

  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    tiles,
    rooms,
    bossEntrancePosition: { x: bossX, y: bossY },
    dungeonEntrancePosition: { x: entranceX, y: entranceY },
  };
}

/** BFS reachability check — returns true if target is reachable from start on floor tiles. */
function isReachable(map: DungeonMap, start: Position, target: Position): boolean {
  const passable = (x: number, y: number) =>
    x >= 0 && x < map.width && y >= 0 && y < map.height &&
    map.tiles[y][x].type !== "wall";

  const visited = new Set<string>();
  const queue: Position[] = [start];
  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.x === target.x && cur.y === target.y) return true;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      const key = `${nx},${ny}`;
      if (!visited.has(key) && passable(nx, ny)) {
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return false;
}

/**
 * Compute spawn positions for all 4 agents.
 * All agents spawn clustered in the bottom-left entrance room, spread 1-2 tiles apart.
 * Validates all spawns can pathfind to boss entrance.
 */
export function computeAgentSpawns(map: DungeonMap): Record<string, Position> {
  const agentIds = ["aggressive", "cautious", "hoarder", "speedrunner"];
  const entrance = map.dungeonEntrancePosition;

  // Collect walkable floor tiles near the entrance room (within 5 tiles)
  const nearEntrance: Position[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[y][x];
      if (tile.type !== "wall" && tile.type !== "boss_entrance") {
        const dist = Math.abs(x - entrance.x) + Math.abs(y - entrance.y);
        if (dist <= 5) nearEntrance.push({ x, y });
      }
    }
  }

  // Sort by proximity to entrance center, pick 4 well-spread tiles
  nearEntrance.sort((a, b) =>
    (Math.abs(a.x - entrance.x) + Math.abs(a.y - entrance.y)) -
    (Math.abs(b.x - entrance.x) + Math.abs(b.y - entrance.y))
  );

  const spawns: Position[] = [];
  for (const candidate of nearEntrance) {
    if (spawns.length >= 4) break;
    const tooClose = spawns.some(s => Math.abs(s.x - candidate.x) + Math.abs(s.y - candidate.y) < 2);
    if (!tooClose) spawns.push(candidate);
  }

  // Fallback: if we couldn't find 4 spread tiles, pack tighter
  if (spawns.length < 4) {
    for (const candidate of nearEntrance) {
      if (spawns.length >= 4) break;
      if (!spawns.some(s => s.x === candidate.x && s.y === candidate.y)) {
        spawns.push(candidate);
      }
    }
  }

  const result: Record<string, Position> = {};
  agentIds.forEach((id, i) => {
    result[id] = spawns[i] ?? entrance;
  });

  return result;
}

/**
 * Validate all agent spawns can reach the boss entrance.
 * Returns true if all connected, false if any spawn is isolated.
 */
export function validateSpawnConnectivity(map: DungeonMap, spawns: Record<string, Position>): boolean {
  const boss = map.bossEntrancePosition;
  return Object.values(spawns).every(spawn => isReachable(map, spawn, boss));
}

/**
 * Compute enemy spawn positions and tiers.
 * Grunts in all rooms, brutes in medium/large rooms, sentinels/hex_casters 50/50 in large rooms.
 */
export function computeEnemySpawns(map: DungeonMap): Array<{
  tier: "grunt" | "brute" | "sentinel" | "hex_caster" | "shade";
  position: Position;
}> {
  const enemies: Array<{
    tier: "grunt" | "brute" | "sentinel" | "hex_caster" | "shade";
    position: Position;
  }> = [];

  // Categorize rooms by size
  const small: Room[] = [];
  const medium: Room[] = [];
  const large: Room[] = [];
  for (const r of map.rooms) {
    const area = roomArea(r);
    if (area < 25) small.push(r);
    else if (area <= 50) medium.push(r);
    else large.push(r);
  }

  const floorTiles = (r: Room): Position[] => {
    const pts: Position[] = [];
    for (let y = r.y; y < r.y + r.height; y++) {
      for (let x = r.x; x < r.x + r.width; x++) {
        if (y >= 0 && y < map.height && x >= 0 && x < map.width &&
            map.tiles[y][x].type !== "wall" && map.tiles[y][x].type !== "boss_entrance") {
          pts.push({ x, y });
        }
      }
    }
    return pts;
  };

  const pickRandom = (pts: Position[]): Position | null => {
    if (pts.length === 0) return null;
    return pts[Math.floor(ROT.RNG.getUniform() * pts.length)];
  };

  // Grunts: 1-2 per room in all rooms
  for (const r of map.rooms) {
    const pts = floorTiles(r);
    const count = r.width >= 5 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const pos = pickRandom(pts);
      if (pos) {
        enemies.push({ tier: "grunt", position: pos });
        pts.splice(pts.findIndex(p => p.x === pos.x && p.y === pos.y), 1);
      }
    }
  }

  // Brutes: 1 per medium room
  for (const r of medium) {
    const pos = pickRandom(floorTiles(r));
    if (pos) enemies.push({ tier: "brute", position: pos });
  }

  // Sentinels and hex_casters: 50/50 split in large rooms
  for (const r of large) {
    const isSentinel = ROT.RNG.getUniform() < 0.5;
    const pos = pickRandom(floorTiles(r));
    if (pos) enemies.push({ tier: isSentinel ? "sentinel" : "hex_caster", position: pos });
  }

  // Shades: 3-5 placed on floor tiles in corridors (tiles not in any room)
  const roomFloorSet = new Set<string>();
  for (const r of map.rooms) {
    for (let y = r.y; y < r.y + r.height; y++) {
      for (let x = r.x; x < r.x + r.width; x++) {
        roomFloorSet.add(`${x},${y}`);
      }
    }
  }
  const corridorTiles: Position[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!roomFloorSet.has(`${x},${y}`) && map.tiles[y][x].type === "floor") {
        corridorTiles.push({ x, y });
      }
    }
  }
  const shadeCount = Math.min(5, Math.max(3, Math.floor(corridorTiles.length / 8)));
  for (let i = 0; i < shadeCount; i++) {
    const pos = pickRandom(corridorTiles);
    if (pos) {
      enemies.push({ tier: "shade", position: pos });
      corridorTiles.splice(corridorTiles.findIndex(p => p.x === pos.x && p.y === pos.y), 1);
    }
  }

  return enemies;
}

/**
 * Compute initial chest contents. 6-8 chests scattered in random non-boss rooms.
 * Returns map of "x,y" key to array of item names.
 */
export function computeChestContents(map: DungeonMap): Record<string, string[]> {
  const contents: Record<string, string[]> = {};
  const chestCount = 6 + Math.floor(ROT.RNG.getUniform() * 3); // 6-8

  // Pick random non-boss rooms
  const nonBossRooms = map.rooms.filter(r => {
    const cx = Math.round(r.x + r.width / 2);
    const cy = Math.round(r.y + r.height / 2);
    return map.tiles[cy]?.[cx]?.type !== "boss_entrance";
  });

  const placed = new Set<string>();
  for (let i = 0; i < chestCount && nonBossRooms.length > 0; i++) {
    const room = nonBossRooms[Math.floor(ROT.RNG.getUniform() * nonBossRooms.length)];
    // Pick a random floor tile in the room
    const candidates: Position[] = [];
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        if (map.tiles[y]?.[x]?.type === "floor" && !placed.has(`${x},${y}`)) {
          candidates.push({ x, y });
        }
      }
    }
    if (candidates.length === 0) continue;
    const pos = candidates[Math.floor(ROT.RNG.getUniform() * candidates.length)];
    const key = `${pos.x},${pos.y}`;
    placed.add(key);

    // 1-3 items per chest
    const itemCount = 1 + Math.floor(ROT.RNG.getUniform() * 3);
    const items: string[] = [];
    for (let j = 0; j < itemCount; j++) {
      items.push(ITEM_POOL[Math.floor(ROT.RNG.getUniform() * ITEM_POOL.length)]);
    }
    contents[key] = items;
  }

  return contents;
}

/**
 * Spawn a new enemy in an unexplored floor tile (Hand of God mechanic).
 * Returns position or null if no valid tile exists.
 */
export function spawnEnemyInUnexplored(
  map: DungeonMap,
  _tier: "grunt" | "brute" | "sentinel" | "hex_caster" | "shade"
): Position | null {
  const candidates: Position[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[y][x];
      if (!tile.explored && tile.type === "floor") {
        candidates.push({ x, y });
      }
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(ROT.RNG.getUniform() * candidates.length)];
}
