// Single source of truth for all shared types in forge-arena.
// Workers must import from here. Never redefine types in implementation files.

// ─── Map Constants ─────────────────────────────────────────────────────────────

export const MAP_WIDTH = 30;
export const MAP_HEIGHT = 22;

// ─── Agent Identity ───────────────────────────────────────────────────────────

export type AgentId = "aggressive" | "cautious" | "hoarder" | "speedrunner";

export const AGENT_IDS: AgentId[] = ["aggressive", "cautious", "hoarder", "speedrunner"];

// Conflict resolution priority: index 0 wins ties
export const CONFLICT_PRIORITY: AgentId[] = ["aggressive", "cautious", "hoarder", "speedrunner"];

export type AgentStatus = "active" | "eliminated" | "in_boss_fight";

// ─── Game Phase State Machine ─────────────────────────────────────────────────

export type GamePhase =
  | "BUILD"
  | "DUNGEON"
  | "ARENA_SEMI1"
  | "ARENA_SEMI2"
  | "ARENA_FINAL"
  | "ENDED";

// Valid transitions only. Server rejects all others.
export const PHASE_TRANSITIONS: Record<GamePhase, GamePhase | null> = {
  BUILD: "DUNGEON",
  DUNGEON: "ARENA_SEMI1",
  ARENA_SEMI1: "ARENA_SEMI2",
  ARENA_SEMI2: "ARENA_FINAL",
  ARENA_FINAL: "ENDED",
  ENDED: null,
};

// ─── Map & Dungeon ─────────────────────────────────────────────────────────────

export interface Position {
  x: number;
  y: number;
}

export type TileType = "floor" | "wall" | "door" | "boss_entrance" | "arena_floor" | "chest" | "chest_open";

export interface Tile {
  type: TileType;
  explored: boolean; // has any agent visited this tile
  visibleTo: AgentId[]; // agents who can currently see this tile (FOV)
}

export interface DungeonMap {
  width: number;
  height: number;
  tiles: Tile[][];
  rooms: Room[];
  bossEntrancePosition: Position;
  dungeonEntrancePosition: Position;
}

export interface Room {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Items ────────────────────────────────────────────────────────────────────

export type EquipSlot = "weapon" | "armor" | "shield" | "consumable";

export type ItemRarity = "common" | "rare";

export interface Item {
  id: string;
  name: string;
  slot: EquipSlot;
  rarity: ItemRarity;
  stats: ItemStats;
}

export interface ItemStats {
  // Weapon stats
  baseDamage?: number;
  attackMultiplier?: number; // heavy/medium/light modifier
  // Armor stats
  armorReduction?: number; // 0.0–1.0 fraction of damage blocked
  loadContribution?: number; // how much this adds to equipment load
  // Shield stats
  blockReduction?: number; // damage reduction when blocking
  // Consumable stats
  healPercent?: number; // fraction of max HP restored
  buffType?: string;
  buffDuration?: number; // in rounds
}

// ─── Equipment Load ───────────────────────────────────────────────────────────

export type LoadTier = "light" | "medium" | "heavy";

// Thresholds as fraction of max load capacity
export const LOAD_THRESHOLDS = {
  light: 0.4,
  medium: 0.7,
} as const;

export const LOAD_REGEN_MODIFIER: Record<LoadTier, number> = {
  light: 1.0,
  medium: 0.9,
  heavy: 0.8,
};

// ─── Agent State ──────────────────────────────────────────────────────────────

export interface AgentInventory {
  equipped: Partial<Record<EquipSlot, Item>>;
  backpack: Item[];
  estusCount: number; // starts at 3
  maxEstus: number;
}

export interface AgentCombatStats {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  loadTier: LoadTier;
  equipmentLoad: number; // 0–100
  maxEquipmentLoad: number;
  arenaDamageBonus: number; // +0.10 from boss kill, else 0
}

export interface AgentState {
  id: AgentId;
  status: AgentStatus;
  position: Position;
  combat: AgentCombatStats;
  inventory: AgentInventory;
  dungeonScore: number;
  kills: { grunt: number; brute: number; sentinel: number };
  bossKilled: boolean;
  lastReasoning?: string;
}

// ─── Enemies ──────────────────────────────────────────────────────────────────

export type EnemyTier = "grunt" | "brute" | "sentinel" | "hex_caster" | "shade";

export type BossTier = "dungeon_boss";

export interface EnemyState {
  id: string;
  tier: EnemyTier;
  position: Position;
  hp: number;
  maxHp: number;
  telegraphedAction?: string; // set one turn ahead for brute/sentinel
  sentinelBlockCooldown?: number; // rounds until next block
  isAlive: boolean;
  ownedByAgent?: AgentId; // for boss instances only
}

export interface BossInstance {
  agentId: AgentId;
  position: Position;
  hp: number;
  maxHp: number;
  phase: 1 | 2; // phase 2 triggers at 50% HP
  telegraphedAction?: string;
  isAlive: boolean;
  graceDeadline?: number; // timestamp when grace period expires
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type AgentGoal =
  | "move_to_item"
  | "move_to_enemy"
  | "move_to_boss"
  | "move_to_safe"
  | "attack_heavy"
  | "attack_medium"
  | "attack_light"
  | "block"
  | "use_estus"
  | "pick_up_item"
  | "equip_from_backpack"
  | "pass";

export interface AgentAction {
  goal: AgentGoal;
  targetId?: string; // entity id for move/attack targets, item id for equip
  reasoning: string; // mandatory — shown in dashboard thought panel
}

export type EnemyActionType = "move" | "attack" | "telegraph" | "summon" | "block";

export interface EnemyAction {
  enemyId: string;
  action: EnemyActionType;
  targetAgentId?: AgentId;
  newPosition?: Position;
}

// ─── Game Config (live patch surface) ────────────────────────────────────────

export interface StaminaCosts {
  heavy_attack_cost: number;
  medium_attack_cost: number;
  light_attack_cost: number;
  block_cost: number;
}

export interface StaminaRegen {
  base_regen_per_turn: number;
}

export interface EnemyBaseStats {
  grunt_hp: number;
  grunt_damage: number;
  brute_hp: number;
  brute_damage: number;
  sentinel_hp: number;
  sentinel_damage: number;
  hex_caster_hp: number;
  hex_caster_damage: number;
  shade_hp: number;
  shade_damage: number;
}

export interface BossBaseStats {
  boss_hp: number;
  boss_phase2_threshold: number; // fraction, e.g. 0.5
}

export interface GameConfig {
  stamina: StaminaCosts & StaminaRegen;
  enemies: EnemyBaseStats;
  boss: BossBaseStats;
  dungeon_timer_seconds: number;
  boss_grace_seconds: number;
  arena_turn_cap: number; // 0 = unlimited
  fov_radius: number;
  round_interval_ms: number;
  agent_api_timeout_ms: number;
  agent_call_stagger_ms: number;
}

// ─── Patches ──────────────────────────────────────────────────────────────────

export interface PatchSuggestion {
  key: string; // dot-path into GameConfig, e.g. "stamina.heavy_attack_cost"
  newValue: number;
  reason: string;
  timestamp: string;
  status?: "pending" | "applied" | "rejected";
  applied_at?: string;
}

export interface PatchEvent {
  type: "PATCH_APPLIED";
  key: string;
  oldValue: number;
  newValue: number;
  reason: string;
  timestamp: string;
}

// ─── Game State ───────────────────────────────────────────────────────────────

export interface ArenaMatchup {
  agentA: AgentId;
  agentB: AgentId;
  winner?: AgentId;
  turnCount: number;
}

export interface GameState {
  phase: GamePhase;
  roundNumber: number;
  dungeonTimer: number; // seconds remaining
  map: DungeonMap;
  agents: Record<AgentId, AgentState>;
  enemies: EnemyState[];
  bossInstances: Partial<Record<AgentId, BossInstance>>;
  groundItems: Array<{ position: Position; item: Item }>;
  recentPatches: PatchEvent[];
  arenaMatchups: ArenaMatchup[];
  finalScores: Partial<Record<AgentId, number>>;
  seed: number; // dungeon generation seed for replay
}

// ─── Serialization Contracts ──────────────────────────────────────────────────

// What each agent sees (FOV-limited, used as AgentAPI input)
export interface VisibleEntity {
  type: "enemy" | "item" | "boss_entrance" | "boss" | "agent" | "chest";
  id: string;
  name?: string;
  tier?: EnemyTier;
  position: Position;
  distance: number;
  hp?: number;
  telegraphedAction?: string;
}

export interface AgentStatePayload {
  agentId: AgentId;
  phase: GamePhase;
  position: Position;
  combat: AgentCombatStats;
  inventory: AgentInventory;
  dungeonScore: number;
  timeRemaining: number;
  visibleEntities: VisibleEntity[];
  recentPatches: string[]; // human-readable patch descriptions
  roundNumber: number;
}

// What the dashboard sees (full map, all agent positions)
export interface DashboardPayload {
  phase: GamePhase;
  roundNumber: number;
  agents: Record<AgentId, AgentState>;
  enemies: EnemyState[];
  bossInstances: Partial<Record<AgentId, BossInstance>>;
  groundItems: Array<{ position: Position; item: Item }>;
  recentPatches: PatchEvent[];
  arenaMatchups: ArenaMatchup[];
  finalScores: Partial<Record<AgentId, number>>;
  dungeonTimer: number;
  // Tiles: send full map for dashboard rendering
  tiles: Tile[][];
  mapWidth: number;
  mapHeight: number;
}

// ─── Events (game-events.jsonl) ───────────────────────────────────────────────

export type GameEventType =
  | "ROUND_START"
  | "ROUND_STATE"
  | "AGENT_ACTION"
  | "ENEMY_ACTION"
  | "COMBAT_RESULT"
  | "ITEM_PICKUP"
  | "BOSS_SPAWN"
  | "BOSS_DEFEATED"
  | "GRACE_PERIOD_START"
  | "GRACE_PERIOD_EXPIRED"
  | "AGENT_TELEPORTED"
  | "ARENA_MATCH_START"
  | "ARENA_MATCH_END"
  | "PATCH_APPLIED"
  | "PHASE_TRANSITION"
  | "GAME_COMPLETE";

export interface GameEvent {
  type: GameEventType;
  timestamp: string;
  round: number;
  phase: GamePhase;
  data: Record<string, unknown>;
}

// ─── Asset Constants ──────────────────────────────────────────────────────────
// Workers reference these constants. Never hardcode asset paths.

export const ASSETS = {
  tiles: {
    floor: "/assets/tiles/floor.png",
    wall: "/assets/tiles/wall.png",
    wall_top: "/assets/tiles/wall_top.png",
    wall_side: "/assets/tiles/wall_side.png",
    wall_corner: "/assets/tiles/wall_corner.png",
    corridor: "/assets/tiles/floor.png", // reuse floor
    door: "/assets/tiles/door.png",
    boss_entrance: "/assets/tiles/boss_entrance.png",
    arena_floor: "/assets/tiles/arena_floor.png",
    chest: "/assets/tiles/chest.png",
    chest_open: "/assets/tiles/chest_open.png",
  },
  enemies: {
    grunt: "/assets/enemies/grunt.png",
    brute: "/assets/enemies/brute.png",
    sentinel: "/assets/enemies/sentinel.png",
    hex_caster: "/assets/enemies/hex_caster.png",
    shade: "/assets/enemies/shade.png",
  },
  boss: {
    dungeon_boss: "/assets/boss/boss.png",
  },
  agents: {
    aggressive: "/assets/agents/aggressive.png",
    cautious: "/assets/agents/cautious.png",
    hoarder: "/assets/agents/hoarder.png",
    speedrunner: "/assets/agents/speedrunner.png",
  },
  items: {
    sword: "/assets/items/sword.png",
    axe: "/assets/items/axe.png",
    dagger: "/assets/items/dagger.png",
    greatsword: "/assets/items/greatsword.png",
    leather_armor: "/assets/items/leather_armor.png",
    chain_armor: "/assets/items/chain_armor.png",
    plate_armor: "/assets/items/plate_armor.png",
    shield: "/assets/items/shield.png",
    estus: "/assets/items/estus.png",
    estus_flask_icon: "/assets/items/estus_flask_icon.png",
    poison: "/assets/items/poison.png",
    strength_potion: "/assets/items/strength_potion.png",
  },
  ui: {
    portraits: {
      aggressive: "/assets/ui/portraits/aggressive_portrait.png",
      cautious: "/assets/ui/portraits/cautious_portrait.png",
      hoarder: "/assets/ui/portraits/hoarder_portrait.png",
      speedrunner: "/assets/ui/portraits/speedrunner_portrait.png",
    },
  },
} as const;
