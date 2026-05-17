// AgentAPI: handles all Claude API calls for agent decisions.
// POST /decide/:agentId receives agent state, calls Claude with personality CLAUDE.md,
// returns AgentAction.
//
// TODO (workers implementing this file): add these imports at top:
//   import { readFileSync } from "fs";
//   import path from "path";
//   import { fileURLToPath } from "url";
//   const __dirname = path.dirname(fileURLToPath(import.meta.url));
//   const PERSONALITIES_DIR = path.join(__dirname, "../../personalities");

import type { AgentAction, AgentId, AgentStatePayload } from "./types.js";

// Model routing per game phase.
// Haiku for dungeon/semis (high frequency, tactical — fast + cheap).
// Sonnet for arena final only (high-stakes reasoning showcase for judges).
export const MODEL_BY_PHASE: Record<string, string> = {
  DUNGEON: "claude-haiku-4-5-20251001",
  ARENA_SEMI1: "claude-haiku-4-5-20251001",
  ARENA_SEMI2: "claude-haiku-4-5-20251001",
  ARENA_FINAL: "claude-sonnet-4-6",
};

// Anthropic API base — no SDK dependency (direct fetch per SPEC banned-deps list)
export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_API_VERSION = "2023-06-01";

/**
 * Load personality system prompt for a given agent.
 * Reads personalities/{agentId}/CLAUDE.md at call time (not cached — allows hot updates).
 *
 * Implementation: readFileSync(path.join(PERSONALITIES_DIR, agentId, "CLAUDE.md"), "utf8")
 * Throw descriptive error if file missing — missing personality is a hard error.
 */
export function loadPersonalityPrompt(_agentId: AgentId): string {
  throw new Error("loadPersonalityPrompt not implemented");
}

/**
 * Call Claude API with agent state payload and personality system prompt.
 * Returns parsed AgentAction. Throws on API error (caller handles with getFallbackAction).
 *
 * Implementation notes:
 * 1. loadPersonalityPrompt(agentId) → system prompt
 * 2. MODEL_BY_PHASE[payload.phase] → model; ANTHROPIC_API_KEY from process.env
 * 3. User message: JSON.stringify(payload, null, 2)
 * 4. POST ANTHROPIC_API_URL with headers:
 *    "x-api-key": process.env.ANTHROPIC_API_KEY
 *    "anthropic-version": ANTHROPIC_API_VERSION
 *    "content-type": "application/json"
 *    body: { model, system, messages: [{ role: "user", content }], max_tokens: 512 }
 * 5. Parse response.content[0].text → JSON → AgentAction
 * 6. Validate: action.reasoning must be non-empty string
 * 7. Validate: action.goal must be a valid AgentGoal value
 * 8. AbortController + setTimeout(timeoutMs) for deadline enforcement
 */
export async function callClaude(
  _agentId: AgentId,
  _payload: AgentStatePayload,
  _timeoutMs: number
): Promise<AgentAction> {
  throw new Error("callClaude not implemented");
}

/**
 * Express route handler: POST /decide/:agentId
 * Called by GameLoop in parallel for all agents each round.
 *
 * Implementation notes:
 * - Validate agentId is a valid AgentId (reject 400 if not)
 * - Parse req.body as AgentStatePayload
 * - try { return await callClaude(...) } catch { return getFallbackAction(agentId) }
 * - Log each decision: agentId, goal, first 100 chars of reasoning
 */
export async function handleDecideRoute(
  _agentId: AgentId,
  _payload: AgentStatePayload,
  _timeoutMs: number
): Promise<AgentAction> {
  throw new Error("handleDecideRoute not implemented");
}

/**
 * Fallback action when Claude call fails or times out.
 * Returns a personality-appropriate default action.
 * Never throws. Called in catch blocks.
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
