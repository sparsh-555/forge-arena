// CombatSystem: all damage, stamina, and equipment load calculations.
// Pure functions only — no state mutation, no side effects.
// Called by GameLoop for both dungeon and arena combat.

import type {
  AgentCombatStats,
  AgentGoal,
  AgentInventory,
  EnemyState,
  GameConfig,
  LoadTier,
} from "./types.js";

export interface CombatResult {
  damageDealt: number;
  staminaUsed: number;
  attackerStaminaAfter: number;
  defenderHpAfter: number;
  blocked: boolean;       // true if defender used block action this turn
  actionFailed: boolean;  // true if stamina was 0 — wasted turn
  description: string;    // human-readable for event log
}

/**
 * Resolve one combat action (agent attacking enemy, or agent vs agent in arena).
 *
 * Implementation notes:
 * 1. calcStaminaCost(action, config) → cost; if attacker.stamina < cost → actionFailed
 * 2. calcDamage(attackerInventory, action, defenderArmorReduction) → baseDmg
 * 3. If defenderBlocking: baseDmg *= (1 - 0.60) — block reduces 60% of damage
 * 4. Apply attacker.arenaDamageBonus: baseDmg *= (1 + arenaDamageBonus)
 * 5. defenderHpAfter = Math.max(0, defenderHp - Math.floor(baseDmg))
 * 6. attackerStaminaAfter = attacker.stamina - cost
 */
export function resolveCombat(
  _attacker: AgentCombatStats,
  _attackerInventory: AgentInventory,
  _defenderHp: number,
  _defenderArmorReduction: number,
  _defenderBlocking: boolean,
  _action: AgentGoal,
  _config: GameConfig
): CombatResult {
  throw new Error("resolveCombat not implemented");
}

/**
 * Calculate stamina cost for an action using current (patchable) game config.
 * heavy_attack → config.stamina.heavy_attack_cost, etc.
 * Non-attack actions (move, pass, pick_up_item) cost 0.
 */
export function calcStaminaCost(_action: AgentGoal, _config: GameConfig): number {
  throw new Error("calcStaminaCost not implemented");
}

/**
 * Calculate damage dealt by an attack.
 * formula: weapon.baseDamage × multiplier × (1 - armorReduction)
 * Multipliers: heavy=1.5, medium=1.0, light=0.6. Minimum 1. Returns 0 for non-attacks.
 */
export function calcDamage(
  _inventory: AgentInventory,
  _attackType: AgentGoal,
  _armorReduction: number
): number {
  throw new Error("calcDamage not implemented");
}

/**
 * Calculate equipment load tier based on equipped items only (not backpack).
 * Load thresholds: < 40% → light, 40–70% → medium, > 70% → heavy. maxLoad = 100.
 */
export function calcEquipmentLoad(_inventory: AgentInventory): {
  tier: LoadTier;
  load: number;
  maxLoad: number;
} {
  throw new Error("calcEquipmentLoad not implemented");
}

/**
 * Calculate stamina regenerated at the start of a turn.
 * base = config.stamina.base_regen_per_turn × LOAD_REGEN_MODIFIER[loadTier].
 * Modifiers: light=1.0, medium=0.9, heavy=0.8. Floor at 0.
 */
export function calcStaminaRegen(_combat: AgentCombatStats, _config: GameConfig): number {
  throw new Error("calcStaminaRegen not implemented");
}

/**
 * Resolve enemy attack on agent (rule-based, no API call).
 * Enemy damage from config.enemies[tier_damage] (patchable).
 * Apply block reduction (60%) if targetBlocking. Apply armor reduction.
 */
export function resolveEnemyAttack(
  _enemyTier: EnemyState["tier"],
  _targetCombat: AgentCombatStats,
  _targetInventory: AgentInventory,
  _targetBlocking: boolean,
  _config: GameConfig
): { damageDealt: number; defenderHpAfter: number } {
  throw new Error("resolveEnemyAttack not implemented");
}
