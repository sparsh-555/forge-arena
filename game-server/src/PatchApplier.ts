// PatchApplier: validates and atomically applies patches to game-config.json.
// Never modifies game-config.baseline.json.

import { readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { GameConfig, PatchEvent, PatchSuggestion } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG_PATH = path.resolve(__dirname, "../game-config.json");
const CONFIG_TMP_PATH = path.resolve(__dirname, "../game-config.tmp.json");
const BASELINE_PATH = path.resolve(__dirname, "../game-config.baseline.json");

export const CONFIG_DIR = path.resolve(__dirname, "..");

/**
 * Read the current live game config.
 */
export function readConfig(): GameConfig {
  const raw = readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw) as GameConfig;
}

/**
 * Read the baseline config (read-only reference for patch validation).
 */
export function readBaseline(): GameConfig {
  const raw = readFileSync(BASELINE_PATH, "utf8");
  return JSON.parse(raw) as GameConfig;
}

/**
 * Get a value from a nested object using dot-path notation.
 */
export function getNestedValue(obj: Record<string, unknown>, dotPath: string): number {
  const parts = dotPath.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") {
      throw new Error(`Cannot read path "${dotPath}" from non-object at "${part}"`);
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current !== "number") {
    throw new Error(`Value at "${dotPath}" is not a number: ${typeof current}`);
  }
  return current;
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
  const parts = dotPath.split(".");
  const clone = (o: unknown): Record<string, unknown> => {
    if (Array.isArray(o)) return [...o] as unknown as Record<string, unknown>;
    if (o != null && typeof o === "object") return { ...o as Record<string, unknown> };
    return {} as Record<string, unknown>;
  };

  const setAt = (current: Record<string, unknown>, idx: number): Record<string, unknown> => {
    const key = parts[idx];
    if (idx === parts.length - 1) {
      return { ...current, [key]: newValue };
    }
    const child = clone(current[key]);
    return { ...current, [key]: setAt(child, idx + 1) };
  };

  return setAt(clone(obj), 0);
}

/**
 * Apply a validated patch to game-config.json.
 * Validates value > 0. Writes atomically via tmp → rename.
 */
export function applyPatch(suggestion: PatchSuggestion): PatchEvent | null {
  // Validate positive
  if (suggestion.newValue <= 0) {
    console.error(
      `[PatchApplier] REJECTED "${suggestion.key}" ${suggestion.newValue}: value must be > 0`
    );
    return null;
  }

  const current = readConfig();
  const oldValue = getNestedValue(
    current as unknown as Record<string, unknown>,
    suggestion.key
  );

  const updated = setNestedValue(
    current as unknown as Record<string, unknown>,
    suggestion.key,
    suggestion.newValue
  );

  // Atomic write: tmp file → rename
  writeFileSync(CONFIG_TMP_PATH, JSON.stringify(updated, null, 2) + "\n");
  renameSync(CONFIG_TMP_PATH, CONFIG_PATH);

  const timestamp = new Date().toISOString();

  return {
    type: "PATCH_APPLIED",
    key: suggestion.key,
    oldValue,
    newValue: suggestion.newValue,
    reason: suggestion.reason,
    timestamp,
  };
}
