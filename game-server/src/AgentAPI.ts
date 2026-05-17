// AgentAPI: REST endpoint that proxies game turns to Claude.
// POST /decide/:agentId receives agent state, calls Claude with personality CLAUDE.md,
// returns AgentAction.

import { readFileSync } from "fs";
import path from "path";
import type { AgentAction, AgentId, AgentStatePayload } from "./types.js";

const PERSONALITIES_DIR = path.join(process.cwd(), "..", "personalities");

// Model routing per game phase
// Haiku for dungeon (high frequency, tactical decisions)
// Sonnet only for arena final (high-stakes reasoning)
const MODEL_BY_PHASE: Record<string, string> = {
  DUNGEON: "claude-haiku-4-5-20251001",
  ARENA_SEMI1: "claude-haiku-4-5-20251001",
  ARENA_SEMI2: "claude-haiku-4-5-20251001",
  ARENA_FINAL: "claude-sonnet-4-6",
};

/**
 * Load personality system prompt for a given agent.
 * Reads personalities/{agentId}/CLAUDE.md at call time (not cached — allows hot updates).
 */
export function loadPersonalityPrompt(agentId: AgentId): string {
  // TODO: read file at PERSONALITIES_DIR/{agentId}/CLAUDE.md
  // Throw descriptive error if file missing (not silently return empty)
  throw new Error("loadPersonalityPrompt not implemented");
}

/**
 * Call Claude API with agent state payload and personality system prompt.
 * Returns parsed AgentAction. Throws on API error.
 */
export async function callClaude(
  agentId: AgentId,
  payload: AgentStatePayload,
  timeoutMs: number
): Promise<AgentAction> {
  // TODO:
  // 1. Load personality prompt via loadPersonalityPrompt(agentId)
  // 2. Select model via MODEL_BY_PHASE[payload.phase]
  // 3. Build user message: JSON.stringify(payload, null, 2)
  // 4. POST to https://api.anthropic.com/v1/messages with:
  //    - Authorization: Bearer process.env.ANTHROPIC_API_KEY
  //    - anthropic-version header
  //    - model, system, messages, max_tokens: 512
  // 5. Parse response into AgentAction
  // 6. Validate: action.reasoning must be non-empty string
  // 7. Validate: action.goal must be a valid AgentGoal
  // 8. Respect timeoutMs via AbortController
  throw new Error("callClaude not implemented");
}

/**
 * Express route handler: POST /decide/:agentId
 * Called by GameLoop in parallel for all agents each round.
 */
export async function handleDecideRoute(
  agentId: AgentId,
  payload: AgentStatePayload,
  timeoutMs: number
): Promise<AgentAction> {
  // TODO: validate agentId is a valid AgentId
  // Call callClaude with timeout
  // On any error: return fallback action (see getFallbackAction)
  // Log decision to console with agentId and reasoning (first 100 chars)
  throw new Error("handleDecideRoute not implemented");
}

/**
 * Fallback action when Claude call fails or times out.
 * Used when DEMO_MODE=true and timeout exceeded, or on any API error.
 * Returns a personality-appropriate default action.
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
