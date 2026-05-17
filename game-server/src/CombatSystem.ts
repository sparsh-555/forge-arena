// CombatSystem: all damage, stamina, and equipment load calculations.
// Pure functions only — no state mutation, no side effects.
// Called by GameLoop for both dungeon and arena combat.

import type {
  AgentCombatStats,
  AgentGoal,
  AgentInventory,
  GameConfig,
  LoadTier,
} from "./types.js";
import { LOAD_REGEN_MODIFIER, LOAD_THRESHOLDS } from "./types.js";

export interface CombatResult {
  damageDealt: number;
  staminaUsed: number;
  attackerStaminaAfter: number;
  defenderHpAfter: number;
  blocked: boolean;
  actionFailed: boolean;
  description: string;
}

const ATTACK_MULTIPLIER: Record<string, number> = {
  attack_heavy: 1.5,
  attack_medium: 1.0,
  attack_light: 0.6,
};

type StaminaKey = "heavy_attack_cost" | "medium_attack_cost" | "light_attack_cost" | "block_cost";

const ACTION_TO_STAMINA_KEY: Record<string, StaminaKey> = {
  attack_heavy: "heavy_attack_cost",
  attack_medium: "medium_attack_cost",
  attack_light: "light_attack_cost",
  block: "block_cost",
};

/**
 * Resolve one combat action (agent vs enemy, or agent vs agent in arena).
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
  const staminaCost = calcStaminaCost(action, config);

  if (attacker.stamina < staminaCost) {
    return {
      damageDealt: 0,
      staminaUsed: 0,
      attackerStaminaAfter: attacker.stamina,
      defenderHpAfter: defenderHp,
      blocked: false,
      actionFailed: true,
      description: "insufficient stamina — turn wasted",
    };
  }

  const baseDamage = calcDamage(attackerInventory, action, defenderArmorReduction);
  let finalDamage = baseDamage;

  if (defenderBlocking && action !== "pass" && action !== "block") {
    finalDamage = Math.floor(finalDamage * 0.4); // 60% reduction
  }

  finalDamage = Math.floor(finalDamage * (1 + attacker.arenaDamageBonus));
  finalDamage = Math.max(1, finalDamage);

  const defenderHpAfter = Math.max(0, defenderHp - finalDamage);
  const attackerStaminaAfter = attacker.stamina - staminaCost;

  return {
    damageDealt: finalDamage,
    staminaUsed: staminaCost,
    attackerStaminaAfter,
    defenderHpAfter,
    blocked: defenderBlocking,
    actionFailed: false,
    description: `dealt ${finalDamage} damage (${action}), defender at ${defenderHpAfter} HP`,
  };
}

/**
 * Calculate stamina cost for an action using current (patchable) game config.
 */
export function calcStaminaCost(action: AgentGoal, config: GameConfig): number {
  const key = ACTION_TO_STAMINA_KEY[action];
  if (!key) return 0;
  return config.stamina[key] ?? 0;
}

/**
 * Calculate damage dealt by an attack.
 * formula: weapon.baseDamage × multiplier × (1 - armorReduction)
 */
export function calcDamage(
  inventory: AgentInventory,
  attackType: AgentGoal,
  armorReduction: number
): number {
  const mult = ATTACK_MULTIPLIER[attackType];
  if (!mult) return 0;

  const weapon = inventory.equipped.weapon;
  const baseDamage = weapon?.stats?.baseDamage ?? 5;

  const raw = baseDamage * mult * (1 - armorReduction);
  return Math.max(1, Math.floor(raw));
}

/**
 * Calculate equipment load tier based on equipped items only (not backpack).
 */
const MAX_EQUIPMENT_LOAD = 100;

export function calcEquipmentLoad(inventory: AgentInventory): {
  tier: LoadTier;
  load: number;
  maxLoad: number;
} {
  const maxLoad = MAX_EQUIPMENT_LOAD;
  let load = 0;
  const slots = inventory.equipped;
  if (slots.weapon?.stats?.loadContribution) load += slots.weapon.stats.loadContribution;
  if (slots.armor?.stats?.loadContribution) load += slots.armor.stats.loadContribution;
  if (slots.shield?.stats?.loadContribution) load += slots.shield.stats.loadContribution;
  if (slots.consumable?.stats?.loadContribution) load += slots.consumable.stats.loadContribution;

  const fraction = maxLoad > 0 ? load / maxLoad : 0;
  let tier: LoadTier = "light";
  if (fraction > LOAD_THRESHOLDS.medium) tier = "heavy";
  else if (fraction >= LOAD_THRESHOLDS.light) tier = "medium";

  return { tier, load, maxLoad };
}

/**
 * Calculate stamina regenerated at the start of a turn.
 */
export function calcStaminaRegen(combat: AgentCombatStats, config: GameConfig): number {
  const base = config.stamina.base_regen_per_turn;
  const modifier = LOAD_REGEN_MODIFIER[combat.loadTier] ?? 1.0;
  return Math.max(0, Math.floor(base * modifier));
}

/**
 * Resolve enemy attack on agent (rule-based, no API call).
 */
function getEnemyBaseDamage(tier: string, config: GameConfig): number {
  const e = config.enemies;
  switch (tier) {
    case "grunt": return e.grunt_damage;
    case "brute": return e.brute_damage;
    case "sentinel": return e.sentinel_damage;
    case "hex_caster": return e.hex_caster_damage;
    case "shade": return e.shade_damage;
    default: return 8;
  }
}

export function resolveEnemyAttack(
  enemyTier: string,
  targetCombat: AgentCombatStats,
  targetInventory: AgentInventory,
  targetBlocking: boolean,
  config: GameConfig
): { damageDealt: number; defenderHpAfter: number } {
  const baseDamage = getEnemyBaseDamage(enemyTier, config);

  const armorItem = targetInventory.equipped.armor;
  const armorReduction = armorItem?.stats?.armorReduction ?? 0;

  let damage = Math.floor(baseDamage * (1 - armorReduction));

  if (targetBlocking) {
    const shield = targetInventory.equipped.shield;
    const blockReduction = shield?.stats?.blockReduction ?? 0.6;
    damage = Math.floor(damage * (1 - blockReduction));
  }

  damage = Math.max(1, damage);
  const defenderHpAfter = Math.max(0, targetCombat.hp - damage);

  return { damageDealt: damage, defenderHpAfter };
}
