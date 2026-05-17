// DungeonBridge: the only file that knows about both rot.js internals and GameState.
// Workers building DungeonGen write rot.js output here.
// Workers building GameLoop/AgentAPI consume from here.

import ROT from "rot-js";
import type {
  AgentId,
  AgentStatePayload,
  DashboardPayload,
  GameState,
  Position,
  VisibleEntity,
} from "./types.js";

const FOV_RADIUS = 6;

function computeVisiblePositions(
  state: GameState,
  agentId: AgentId
): Set<string> {
  const agent = state.agents[agentId];
  if (!agent) return new Set();

  const { map } = state;
  const visible = new Set<string>();

  const lightPasses = (x: number, y: number): boolean => {
    const tile = map.tiles[y]?.[x];
    return tile != null && tile.type !== "wall";
  };

  const fov = new ROT.FOV.PreciseShadowcasting(lightPasses);
  fov.compute(agent.position.x, agent.position.y, FOV_RADIUS, (x, y) => {
    visible.add(`${x},${y}`);
  });

  return visible;
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Build visible entities list for a given agent based on their FOV.
 */
export function getVisibleEntities(state: GameState, agentId: AgentId): VisibleEntity[] {
  const agent = state.agents[agentId];
  if (!agent) return [];

  const visible = computeVisiblePositions(state, agentId);
  const entities: VisibleEntity[] = [];
  const inArena = state.phase.startsWith("ARENA");

  // Enemies
  for (const enemy of state.enemies) {
    if (!enemy.isAlive) continue;
    const key = `${enemy.position.x},${enemy.position.y}`;
    if (visible.has(key)) {
      entities.push({
        type: "enemy",
        id: enemy.id,
        tier: enemy.tier,
        position: enemy.position,
        distance: manhattan(agent.position, enemy.position),
        hp: enemy.hp,
        telegraphedAction: enemy.telegraphedAction,
      });
    }
  }

  // Boss instances (for this agent)
  for (const [ownerId, boss] of Object.entries(state.bossInstances)) {
    if (!boss || !boss.isAlive) continue;
    const key = `${boss.position.x},${boss.position.y}`;
    if (visible.has(key)) {
      entities.push({
        type: "boss" as const,
        id: `boss_${ownerId}`,
        position: boss.position,
        distance: manhattan(agent.position, boss.position),
        hp: boss.hp,
      });
    }
  }

  // Ground items
  for (const gi of state.groundItems) {
    const key = `${gi.position.x},${gi.position.y}`;
    if (visible.has(key)) {
      entities.push({
        type: "item",
        id: gi.item.id,
        name: gi.item.name,
        position: gi.position,
        distance: manhattan(agent.position, gi.position),
      });
    }
  }

  // Other agents — only visible in arena phases (dungeon PvP is disabled)
  if (inArena) {
    for (const [id, other] of Object.entries(state.agents)) {
      if (id === agentId || other.status === "eliminated") continue;
      const key = `${other.position.x},${other.position.y}`;
      if (visible.has(key)) {
        entities.push({
          type: "agent",
          id: other.id,
          position: other.position,
          distance: manhattan(agent.position, other.position),
        });
      }
    }
  }

  // Chests and boss entrances
  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) {
      const key = `${x},${y}`;
      if (!visible.has(key)) continue;
      const tile = state.map.tiles[y][x];
      if (tile.type === "chest") {
        entities.push({
          type: "chest",
          id: `chest_${x}_${y}`,
          position: { x, y },
          distance: manhattan(agent.position, { x, y }),
        });
      } else if (tile.type === "boss_entrance") {
        entities.push({
          type: "boss_entrance",
          id: `boss_entrance`,
          position: { x, y },
          distance: manhattan(agent.position, { x, y }),
        });
      }
    }
  }

  entities.sort((a, b) => a.distance - b.distance);
  return entities;
}

/**
 * Format recent patches as human-readable strings for agent payload.
 */
export function formatPatchesForAgent(state: GameState): string[] {
  return state.recentPatches.map(
    (p) => `${p.key} changed from ${p.oldValue} to ${p.newValue}: ${p.reason}`
  );
}

/**
 * Serialize game state for a specific agent (FOV-filtered).
 */
export function toAgentPayload(state: GameState, agentId: AgentId): AgentStatePayload {
  const agent = state.agents[agentId];
  return {
    agentId,
    phase: state.phase,
    position: agent.position,
    combat: agent.combat,
    inventory: agent.inventory,
    dungeonScore: agent.dungeonScore,
    timeRemaining: state.dungeonTimer,
    visibleEntities: getVisibleEntities(state, agentId),
    recentPatches: formatPatchesForAgent(state),
    roundNumber: state.roundNumber,
    bossKilled: agent.bossKilled,
  };
}

/**
 * Serialize game state for dashboard broadcast (full map, no FOV restriction).
 */
export function toDashboardPayload(state: GameState): DashboardPayload {
  return {
    phase: state.phase,
    roundNumber: state.roundNumber,
    agents: state.agents,
    enemies: state.enemies,
    bossInstances: state.bossInstances,
    groundItems: state.groundItems,
    recentPatches: state.recentPatches,
    arenaMatchups: state.arenaMatchups,
    finalScores: state.finalScores,
    arenaActiveTurn: state.arenaActiveTurn ?? null,
    dungeonTimer: state.dungeonTimer,
    tiles: state.map.tiles,
    mapWidth: state.map.width,
    mapHeight: state.map.height,
  };
}
