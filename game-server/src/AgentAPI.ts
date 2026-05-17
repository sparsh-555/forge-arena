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
        max_tokens: 300,
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

    // Extract JSON from response — may be wrapped in markdown or have leading text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`No JSON found in Claude response: ${text.slice(0, 200)}`);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

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
    const fallback = getFallbackAction(agentId);
    console.error(`[AgentAPI] ${agentId} fallback: ${msg}`);
    return fallback;
  }
}

/**
 * Fallback action when Claude call fails or times out.
 */
export function getFallbackAction(agentId: AgentId): AgentAction {
  const fallbacks: Record<AgentId, AgentAction> = {
    aggressive: { goal: "attack_medium", reasoning: "[fallback] default attack" },
    cautious: { goal: "block", reasoning: "[fallback] default block" },
    hoarder: { goal: "pass", reasoning: "[fallback] waiting" },
    speedrunner: { goal: "move_to_boss", reasoning: "[fallback] rushing boss" },
  };
  return fallbacks[agentId];
}
