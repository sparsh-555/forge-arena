// PatchApplier: validates and atomically applies patches to game-config.json.
// Never modifies game-config.baseline.json.
// Uses tmp → rename pattern to prevent race conditions.

import { readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import type { GameConfig, PatchEvent, PatchSuggestion } from "./types.js";

const CONFIG_PATH = path.join(process.cwd(), "game-config.json");
const CONFIG_TMP_PATH = path.join(process.cwd(), "game-config.tmp.json");
const BASELINE_PATH = path.join(process.cwd(), "game-config.baseline.json");

/**
 * Read the current live game config.
 * Called by GameLoop at the start of each round.
 */
export function readConfig(): GameConfig {
  // TODO: readFileSync(CONFIG_PATH, "utf8"), JSON.parse, validate against GameConfig shape
  throw new Error("readConfig not implemented");
}

/**
 * Read the baseline config (read-only reference for patch validation).
 */
export function readBaseline(): GameConfig {
  // TODO: readFileSync(BASELINE_PATH, "utf8"), JSON.parse
  throw new Error("readBaseline not implemented");
}

/**
 * Apply a validated patch to game-config.json.
 * Validates: value within ±30% of baseline, value > 0.
 * Writes atomically via tmp file → rename.
 * Returns PatchEvent to emit to StateEmitter, or null if rejected.
 */
export function applyPatch(suggestion: PatchSuggestion): PatchEvent | null {
  // TODO:
  // 1. Read baseline
  // 2. Get baseline value at suggestion.key (use getNestedValue)
  // 3. Validate: Math.abs(suggestion.newValue - baselineValue) / baselineValue <= 0.30
  // 4. Validate: suggestion.newValue > 0
  // 5. If invalid: return null (caller marks suggestion as rejected)
  // 6. Read current config
  // 7. Set new value at suggestion.key (use setNestedValue — returns new object, immutable)
  // 8. Write to CONFIG_TMP_PATH
  // 9. renameSync(CONFIG_TMP_PATH, CONFIG_PATH)
  // 10. Return PatchEvent with old and new values
  throw new Error("applyPatch not implemented");
}

/**
 * Get a value from a nested object using dot-path notation.
 * Example: getNestedValue(config, "stamina.heavy_attack_cost") → 30
 */
export function getNestedValue(obj: Record<string, unknown>, path: string): number {
  // TODO: split path by ".", traverse object, return leaf value
  throw new Error("getNestedValue not implemented");
}

/**
 * Return a new object with the value at dot-path set to newValue.
 * Never mutates input object.
 */
export function setNestedValue(
  obj: Record<string, unknown>,
  dotPath: string,
  newValue: number
): Record<string, unknown> {
  // TODO: immutable deep set using dot-path
  // Return new object with updated value, all other values preserved
  throw new Error("setNestedValue not implemented");
}
