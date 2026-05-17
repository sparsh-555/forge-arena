// EnemyAI: rule-based enemy decision making. No Claude calls. Deterministic.
// Called by GameLoop after all agent actions resolve each round.

import ROT from "rot-js";
import type { AgentId, EnemyAction, EnemyState, GameState, Position } from "./types.js";

// Module-level state — PITFALL 2: must be reset between game runs.
const bruteTurnCounters = new Map<string, number>();
const sentinelTurnCounters = new Map<string, number>();
const sentinelHasSummoned = new Set<string>();
const shadeFirstStrikeUsed = new Set<string>();

export function resetEnemyAIState(): void {
  bruteTurnCounters.clear();
  sentinelTurnCounters.clear();
  sentinelHasSummoned.clear();
  shadeFirstStrikeUsed.clear();
}

function passableCallback(state: GameState) {
  return (x: number, y: number): boolean => {
    const tile = state.map.tiles[y]?.[x];
    return tile != null && tile.type !== "wall";
  };
}

/**
 * Find the nearest active agent to a position (Manhattan distance).
 */
export function findNearestAgent(position: Position, state: GameState): AgentId | null {
  let best: AgentId | null = null;
  let bestDist = Infinity;
  for (const [id, agent] of Object.entries(state.agents)) {
    if (agent.status === "eliminated") continue;
    const d = Math.abs(agent.position.x - position.x) + Math.abs(agent.position.y - position.y);
    if (d < bestDist) { bestDist = d; best = id as AgentId; }
  }
  return best;
}

/**
 * Check if position a is adjacent (including diagonals) to position b.
 */
export function isAdjacent(a: Position, b: Position): boolean {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}

/**
 * Compute next move step toward target using rot.js A* pathfinding.
 * Returns the next position to move to (one step only).
 */
export function pathfindStep(from: Position, to: Position, state: GameState): Position {
  const passable = passableCallback(state);
  const pathFinder = new ROT.Path.AStar(to.x, to.y, passable, { topology: 8 });

  const steps: Position[] = [];
  pathFinder.compute(from.x, from.y, (x, y) => {
    steps.push({ x, y });
  });

  if (steps.length <= 1) return { ...from };
  return { x: steps[1].x, y: steps[1].y };
}

function pathfindAway(from: Position, awayFrom: Position, state: GameState): Position {
  // Move one step away from the target. Try all 8 adjacent tiles, pick the furthest.
  const dirs = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
    { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: -1 },
  ];
  let best: Position = { ...from };
  let bestDist = -Infinity;
  for (const { dx, dy } of dirs) {
    const nx = from.x + dx;
    const ny = from.y + dy;
    if (nx < 0 || ny < 0 || nx >= state.map.width || ny >= state.map.height) continue;
    const tile = state.map.tiles[ny][nx];
    if (tile.type === "wall") continue;
    const d = Math.abs(nx - awayFrom.x) + Math.abs(ny - awayFrom.y);
    if (d > bestDist) { bestDist = d; best = { x: nx, y: ny }; }
  }
  return best;
}

/**
 * Resolve a single enemy's action based on its tier and current state.
 */
function resolveOneEnemy(enemy: EnemyState, state: GameState): EnemyAction {
  const targetId = findNearestAgent(enemy.position, state);
  const targetAgent = targetId ? state.agents[targetId] : null;

  switch (enemy.tier) {
    case "grunt":
      return resolveGrunt(enemy, state, targetId, targetAgent?.position);
    case "brute":
      return resolveBrute(enemy, state, targetId, targetAgent?.position);
    case "sentinel":
      return resolveSentinel(enemy, state, targetId, targetAgent?.position);
    case "hex_caster":
      return resolveHexCaster(enemy, state, targetId, targetAgent?.position);
    case "shade":
      return resolveShade(enemy, state, targetId, targetAgent?.position);
    default:
      return { enemyId: enemy.id, action: "move", newPosition: { ...enemy.position } };
  }
}

function resolveGrunt(
  enemy: EnemyState, state: GameState,
  targetId: AgentId | null, targetPos: Position | undefined
): EnemyAction {
  if (!targetId || !targetPos) return { enemyId: enemy.id, action: "move", newPosition: { ...enemy.position } };
  if (isAdjacent(enemy.position, targetPos)) {
    return { enemyId: enemy.id, action: "attack", targetAgentId: targetId };
  }
  const next = pathfindStep(enemy.position, targetPos, state);
  return { enemyId: enemy.id, action: "move", newPosition: next };
}

function resolveBrute(
  enemy: EnemyState, state: GameState,
  targetId: AgentId | null, targetPos: Position | undefined
): EnemyAction {
  if (!targetId || !targetPos) return { enemyId: enemy.id, action: "move", newPosition: { ...enemy.position } };

  const counter = (bruteTurnCounters.get(enemy.id) ?? 0) + 1;
  bruteTurnCounters.set(enemy.id, counter);

  if (counter % 3 === 0) {
    // Telegraph turn — set telegraph, still move if not adjacent
    if (isAdjacent(enemy.position, targetPos)) {
      return { enemyId: enemy.id, action: "telegraph", targetAgentId: targetId };
    }
    const next = pathfindStep(enemy.position, targetPos, state);
    return { enemyId: enemy.id, action: "telegraph", targetAgentId: targetId, newPosition: next };
  }

  // Non-telegraph turn — move toward or attack
  if (isAdjacent(enemy.position, targetPos)) {
    return { enemyId: enemy.id, action: "attack", targetAgentId: targetId };
  }
  const next = pathfindStep(enemy.position, targetPos, state);
  return { enemyId: enemy.id, action: "move", newPosition: next };
}

function resolveSentinel(
  enemy: EnemyState, state: GameState,
  targetId: AgentId | null, targetPos: Position | undefined
): EnemyAction {
  if (!targetId || !targetPos) return { enemyId: enemy.id, action: "move", newPosition: { ...enemy.position } };

  const counter = (sentinelTurnCounters.get(enemy.id) ?? 0) + 1;
  sentinelTurnCounters.set(enemy.id, counter);

  // Summon at ≤30% HP (once per battle)
  const hpFraction = enemy.hp / enemy.maxHp;
  if (hpFraction <= 0.3 && !sentinelHasSummoned.has(enemy.id)) {
    sentinelHasSummoned.add(enemy.id);
    return { enemyId: enemy.id, action: "summon" };
  }

  // Block every 3rd turn
  if (counter % 3 === 0) {
    return { enemyId: enemy.id, action: "block" };
  }

  if (isAdjacent(enemy.position, targetPos)) {
    return { enemyId: enemy.id, action: "attack", targetAgentId: targetId };
  }
  const next = pathfindStep(enemy.position, targetPos, state);
  return { enemyId: enemy.id, action: "move", newPosition: next };
}

function resolveHexCaster(
  enemy: EnemyState, state: GameState,
  targetId: AgentId | null, targetPos: Position | undefined
): EnemyAction {
  if (!targetId || !targetPos) return { enemyId: enemy.id, action: "move", newPosition: { ...enemy.position } };

  const dist = Math.abs(enemy.position.x - targetPos.x) + Math.abs(enemy.position.y - targetPos.y);

  if (dist >= 3 && dist <= 4) {
    // Optimal range — hex attack (bypasses armor in CombatSystem via resolveEnemyAttack)
    return { enemyId: enemy.id, action: "attack", targetAgentId: targetId };
  }
  if (dist < 3) {
    // Too close — move away
    const away = pathfindAway(enemy.position, targetPos, state);
    return { enemyId: enemy.id, action: "move", newPosition: away };
  }
  // Too far — move closer
  const next = pathfindStep(enemy.position, targetPos, state);
  return { enemyId: enemy.id, action: "move", newPosition: next };
}

function resolveShade(
  enemy: EnemyState, state: GameState,
  targetId: AgentId | null, targetPos: Position | undefined
): EnemyAction {
  if (!targetId || !targetPos) return { enemyId: enemy.id, action: "move", newPosition: { ...enemy.position } };

  const tile = state.map.tiles[enemy.position.y]?.[enemy.position.x];
  const isUnexplored = tile != null && !tile.explored;

  if (isAdjacent(enemy.position, targetPos)) {
    // First strike from unexplored: 50% miss
    if (isUnexplored && !shadeFirstStrikeUsed.has(enemy.id)) {
      shadeFirstStrikeUsed.add(enemy.id);
      if (Math.random() < 0.5) {
        return { enemyId: enemy.id, action: "attack", targetAgentId: targetId };
      }
      // Miss — just move
      const next = pathfindStep(enemy.position, targetPos, state);
      return { enemyId: enemy.id, action: "move", newPosition: next };
    }
    return { enemyId: enemy.id, action: "attack", targetAgentId: targetId };
  }

  const next = pathfindStep(enemy.position, targetPos, state);
  return { enemyId: enemy.id, action: "move", newPosition: next };
}

/**
 * Resolve all enemy actions for the current round.
 */
export function resolveEnemyActions(state: GameState): EnemyAction[] {
  return state.enemies
    .filter(e => e.isAlive)
    .map(e => resolveOneEnemy(e, state));
}

export { resolveOneEnemy };
