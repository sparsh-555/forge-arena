// AgentAPI: handles all Claude API calls for agent decisions.
// Called by GameLoop for each agent every round. Direct function calls — no Express routes.

import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { AgentAction, AgentId, AgentStatePayload } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONALITIES_DIR = path.resolve(__dirname, "../../personalities");

// Model routing per game phase.
export const MODEL_BY_PHASE: Record<string, string> = {
  DUNGEON: "claude-haiku-4-5-20251001",
  ARENA_SEMI1: "claude-haiku-4-5-20251001",
  ARENA_SEMI2: "claude-haiku-4-5-20251001",
  ARENA_FINAL: "claude-sonnet-4-6",
};

export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_API_VERSION = "2023-06-01";

const VALID_GOALS = new Set([
  "move_to_item", "move_to_enemy", "move_to_boss", "move_to_safe",
  "attack_heavy", "attack_medium", "attack_light",
  "block", "use_estus", "pick_up_item", "equip_from_backpack", "pass",
]);

/**
 * Load personality system prompt for a given agent.
 */
export function loadPersonalityPrompt(agentId: AgentId): string {
  const filePath = path.join(PERSONALITIES_DIR, agentId, "CLAUDE.md");
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    throw new Error(`Personality file missing for agent ${agentId}: ${filePath}`);
  }
}

/**
 * Call Claude API with agent state payload and personality system prompt.
 */
export async function callClaude(
  agentId: AgentId,
  payload: AgentStatePayload,
  timeoutMs: number
): Promise<AgentAction> {
  // Try primary call, retry once with double timeout on failure
  try {
    return await callClaudeOnce(agentId, payload, timeoutMs);
  } catch (firstErr: unknown) {
    const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    if (msg.includes("abort") || msg.includes("timeout") || msg.includes("fetch")) {
      console.error(`[AgentAPI] ${agentId} primary call failed, retrying: ${msg}`);
      return await callClaudeOnce(agentId, payload, Math.min(timeoutMs * 2, 15000));
    }
    throw firstErr;
  }
}

async function callClaudeOnce(
  agentId: AgentId,
  payload: AgentStatePayload,
  timeoutMs: number
): Promise<AgentAction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set in environment");
  }

  const systemPrompt = loadPersonalityPrompt(agentId);
  const model = MODEL_BY_PHASE[payload.phase] ?? MODEL_BY_PHASE.DUNGEON;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        messages: [{ role: "user", content: JSON.stringify(payload, null, 2) }],
        max_tokens: 600,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json() as {
      content: Array<{ text: string }>;
    };

    const text = json.content?.[0]?.text;
    if (!text) {
      throw new Error("Empty response from Claude API");
    }

    // Extract JSON from response — personalities output JSON FIRST, then analysis prose.
    // Find the first valid JSON object that contains goal + reasoning fields.
    const jsonMatches = text.match(/\{[^{}]*\}/g);
    if (!jsonMatches || jsonMatches.length === 0) {
      throw new Error(`No JSON found in Claude response: ${text.slice(0, 200)}`);
    }
    const lastJson = jsonMatches.find(m => m.includes('"goal"')) ?? jsonMatches[0];

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(lastJson) as Record<string, unknown>;
    } catch {
      throw new Error(`Invalid JSON in Claude response: ${lastJson.slice(0, 200)}`);
    }

    if (typeof parsed.reasoning !== "string" || !parsed.reasoning.trim()) {
      throw new Error("Claude response missing required 'reasoning' field");
    }
    if (typeof parsed.goal !== "string" || !VALID_GOALS.has(parsed.goal)) {
      throw new Error(`Invalid or missing goal in Claude response: ${String(parsed.goal)}`);
    }

    return {
      goal: parsed.goal as AgentAction["goal"],
      targetId: typeof parsed.targetId === "string" ? parsed.targetId : undefined,
      reasoning: parsed.reasoning,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Main entry point for agent decisions. Wraps callClaude with fallback on error.
 */
export async function handleDecideRoute(
  agentId: AgentId,
  payload: AgentStatePayload,
  timeoutMs: number
): Promise<AgentAction> {
  try {
    return await callClaude(agentId, payload, timeoutMs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[AgentAPI] ${agentId} fallback: ${msg}`);
    return getFallbackAction(agentId, payload);
  }
}

/**
 * Fallback action when Claude call fails or times out.
 * Uses visibleEntities from the agent's payload to make smarter rule-based decisions.
 */
export function getFallbackAction(agentId: AgentId, _payload?: AgentStatePayload): AgentAction {
  const entities = _payload?.visibleEntities ?? [];

  const nearestEnemy = entities
    .filter(e => e.type === "enemy")
    .sort((a, b) => a.distance - b.distance)[0];

  const nearestItem = entities
    .filter(e => e.type === "item" || e.type === "chest")
    .sort((a, b) => a.distance - b.distance)[0];

  switch (agentId) {
    case "aggressive":
      if (nearestEnemy) {
        return { goal: "attack_medium", targetId: nearestEnemy.id, reasoning: "[fallback] attacking nearest enemy" };
      }
      return { goal: "move_to_enemy", reasoning: "[fallback] seeking enemies" };

    case "cautious":
      if (nearestEnemy && nearestEnemy.distance <= 2) {
        return { goal: "block", reasoning: "[fallback] blocking nearby threat" };
      }
      if (nearestEnemy) {
        return { goal: "move_to_safe", reasoning: "[fallback] retreating from enemy" };
      }
      if (nearestItem) {
        return { goal: "move_to_item", targetId: nearestItem.id, reasoning: "[fallback] collecting item" };
      }
      return { goal: "block", reasoning: "[fallback] holding position" };

    case "hoarder":
      if (nearestItem) {
        return { goal: "move_to_item", targetId: nearestItem.id, reasoning: "[fallback] collecting item" };
      }
      if (nearestEnemy && nearestEnemy.distance <= 3) {
        return { goal: "move_to_safe", reasoning: "[fallback] avoiding enemy" };
      }
      return { goal: "pass", reasoning: "[fallback] searching for loot" };

    case "speedrunner":
      return { goal: "move_to_boss", reasoning: "[fallback] rushing boss" };

    default:
      return { goal: "pass", reasoning: "[fallback] waiting" };
  }
}
