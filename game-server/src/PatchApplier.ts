// PatchApplier: validates and atomically applies patches to game-config.json.
// Never modifies game-config.baseline.json.
// Uses tmp → rename pattern to prevent race conditions with GameLoop reads.
//
// Required imports when implementing:
//   import { readFileSync, writeFileSync, renameSync } from "fs";
//   import { fileURLToPath } from "url";
//   const __dirname = path.dirname(fileURLToPath(import.meta.url));
//   const CONFIG_PATH = path.join(__dirname, "../game-config.json");
//   const CONFIG_TMP_PATH = path.join(__dirname, "../game-config.tmp.json");
//   const BASELINE_PATH = path.join(__dirname, "../game-config.baseline.json");

import path from "path";
import type { GameConfig, PatchEvent, PatchSuggestion } from "./types.js";

// Config directory — exported so server.ts can reference it if needed
export const CONFIG_DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  ".."
);

/**
 * Read the current live game config.
 * Called by GameLoop at the start of each round to pick up any mid-game patches.
 *
 * Implementation: JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as GameConfig
 */
export function readConfig(): GameConfig {
  throw new Error("readConfig not implemented");
}

/**
 * Read the baseline config (read-only reference for patch validation).
 * Never write to this path.
 *
 * Implementation: JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as GameConfig
 */
export function readBaseline(): GameConfig {
  throw new Error("readBaseline not implemented");
}

/**
 * Apply a validated patch to game-config.json.
 * Validates: value within ±30% of baseline, value > 0.
 * Writes atomically via tmp file → rename.
 * Returns PatchEvent to emit to StateEmitter, or null if rejected.
 *
 * Implementation:
 * 1. baseline = readBaseline()
 * 2. baselineValue = getNestedValue(baseline as Record<string, unknown>, suggestion.key)
 * 3. Validate: Math.abs(suggestion.newValue - baselineValue) / baselineValue <= 0.30
 * 4. Validate: suggestion.newValue > 0
 * 5. If invalid: return null
 * 6. current = readConfig() as Record<string, unknown>
 * 7. updated = setNestedValue(current, suggestion.key, suggestion.newValue)
 * 8. writeFileSync(CONFIG_TMP_PATH, JSON.stringify(updated, null, 2))
 * 9. renameSync(CONFIG_TMP_PATH, CONFIG_PATH)  ← atomic on POSIX
 * 10. Return PatchEvent { type: "PATCH_APPLIED", key, oldValue, newValue, reason, timestamp }
 */
export function applyPatch(_suggestion: PatchSuggestion): PatchEvent | null {
  throw new Error("applyPatch not implemented");
}

/**
 * Get a value from a nested object using dot-path notation.
 * Example: getNestedValue(config, "stamina.heavy_attack_cost") → 30
 */
export function getNestedValue(_obj: Record<string, unknown>, _dotPath: string): number {
  throw new Error("getNestedValue not implemented");
}

/**
 * Return a new object with the value at dot-path set to newValue.
 * Never mutates input object.
 */
export function setNestedValue(
  _obj: Record<string, unknown>,
  _dotPath: string,
  _newValue: number
): Record<string, unknown> {
  throw new Error("setNestedValue not implemented");
}
