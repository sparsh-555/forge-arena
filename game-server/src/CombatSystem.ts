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
  blocked: boolean; // true if defender used block action this turn
  actionFailed: boolean; // true if stamina was 0 — wasted turn
  description: string; // human-readable for event log
}

/**
 * Resolve one combat action (agent attacking enemy, or agent vs agent).
 * @param attacker - attacker's current combat stats
 * @param attackerInventory - attacker's equipped items
 * @param defenderHp - defender's current HP
 * @param defenderArmorReduction - fraction of damage blocked by armor
 * @param defenderBlocking - true if defender chose "block" this turn
 * @param action - the attack type chosen
 * @param config - current game config (patchable values)
 */
export function resolveCombat(
  attacker: AgentCombatStats,
  attackerInventory: AgentInventory,
  defenderHp: number,
  defenderArmorReduction: number,
  defenderBlocking: boolean,
  action: AgentGoal,
  config: GameConfig
): CombatResult {
  // TODO: implement full combat resolution
  // 1. Check if attacker has enough stamina for the action (use calcStaminaCost)
  //    If not: return { actionFailed: true, staminaUsed: 0, damageDealt: 0, ... }
  // 2. Calculate base damage (use calcDamage)
  // 3. Apply block reduction if defenderBlocking
  // 4. Apply arena damage bonus (attacker.arenaDamageBonus)
  // 5. Subtract from defenderHp (floor at 0)
  // 6. Build human-readable description
  throw new Error("resolveCombat not implemented");
}

/**
 * Calculate stamina cost for an action using current game config.
 * Returns the stamina cost. Caller checks if attacker.stamina >= cost.
 */
export function calcStaminaCost(action: AgentGoal, config: GameConfig): number {
  // TODO: map action to config.stamina cost field
  // heavy_attack → config.stamina.heavy_attack_cost
  // etc.
  throw new Error("calcStaminaCost not implemented");
}

/**
 * Calculate damage dealt by an attack.
 * Considers: weapon base damage, attack multiplier, armor reduction.
 */
export function calcDamage(
  inventory: AgentInventory,
  attackType: AgentGoal,
  armorReduction: number
): number {
  // TODO: get weapon from inventory.equipped.weapon
  // Apply attack multiplier: heavy = 1.5, medium = 1.0, light = 0.6
  // Apply armor reduction: finalDamage = baseDamage * multiplier * (1 - armorReduction)
  // Return Math.floor result, minimum 1
  throw new Error("calcDamage not implemented");
}

/**
 * Calculate the equipment load tier based on equipped items.
 * Only equipped items (not backpack) count toward load.
 */
export function calcEquipmentLoad(inventory: AgentInventory): {
  tier: LoadTier;
  load: number;
  maxLoad: number;
} {
  // TODO: sum loadContribution of all equipped items
  // maxLoad = 100 (constant)
  // tier: load/maxLoad < 0.4 → light, < 0.7 → medium, else heavy
  throw new Error("calcEquipmentLoad not implemented");
}

/**
 * Calculate stamina regenerated at the start of a turn.
 * Applies equipment load modifier from config.
 */
export function calcStaminaRegen(combat: AgentCombatStats, config: GameConfig): number {
  // TODO: base = config.stamina.base_regen_per_turn
  // Apply LOAD_REGEN_MODIFIER[combat.loadTier]
  // Return Math.floor, minimum 0
  throw new Error("calcStaminaRegen not implemented");
}

/**
 * Resolve enemy attack on agent (rule-based, no agent API involved).
 * Called by EnemyAI for grunt/brute/sentinel attacks.
 */
export function resolveEnemyAttack(
  enemyTier: EnemyState["tier"],
  targetCombat: AgentCombatStats,
  targetInventory: AgentInventory,
  targetBlocking: boolean,
  config: GameConfig
): { damageDealt: number; defenderHpAfter: number } {
  // TODO: get enemy damage from config.enemies[tier + "_damage"]
  // Apply block reduction if targetBlocking
  // Apply target armor reduction
  // Return result
  throw new Error("resolveEnemyAttack not implemented");
}
