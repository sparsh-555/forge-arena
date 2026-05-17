// StateEmitter: broadcasts game state to dashboard via WebSocket.
// Also writes events to state/game-events.jsonl for the Evaluator to read.
// Imported by GameLoop. Never contains game logic.
//
// TODO (workers implementing this file): add this import at top:
//   import { appendFileSync } from "fs";
//   import { fileURLToPath } from "url";
//   const __dirname = path.dirname(fileURLToPath(import.meta.url));
//   const EVENTS_LOG = path.join(__dirname, "../../state/game-events.jsonl");

import path from "path";
import type { GameEvent, GameState, PatchEvent } from "./types.js";
// TODO (workers): import { toDashboardPayload } from "./DungeonBridge.js"; when implementing broadcast/sendSnapshot
import type { WebSocket } from "ws";

// Events log path — workers use this when implementing logEvent
export const EVENTS_LOG_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "../../state/game-events.jsonl"
);

// WebSocket clients connected to /ws/game
// Populated by server.ts when dashboard clients connect
export const wsClients: Set<WebSocket> = new Set();

// TODO (workers): const WS_OPEN = 1; — WebSocket OPEN readyState constant

/**
 * Broadcast current game state to all connected dashboard clients.
 * Called by GameLoop after every round resolves.
 *
 * Implementation notes:
 * - payload = toDashboardPayload(state)
 * - msg = JSON.stringify(payload)
 * - For each client in wsClients: if ws.readyState === WS_OPEN, ws.send(msg)
 * - Remove dead connections: wsClients.delete(ws) if readyState !== WS_OPEN
 */
export function broadcast(_state: GameState): void {
  // Workers: use toDashboardPayload(state) and WS_OPEN when implementing
  // payload = toDashboardPayload(state); send JSON to all wsClients where readyState === WS_OPEN
  throw new Error("broadcast not implemented");
}

/**
 * Append a structured event to game-events.jsonl.
 * Called for every round, combat result, patch, and phase transition.
 * Evaluator tails this file to compute metrics.
 *
 * Implementation: appendFileSync(EVENTS_LOG, JSON.stringify(event) + "\n")
 */
export function logEvent(_event: GameEvent): void {
  throw new Error("logEvent not implemented");
}

/**
 * Broadcast a patch event immediately when a patch lands.
 * Sent to all dashboard clients so the PATCH FEED updates without waiting for next round.
 *
 * Implementation: send { type: "PATCH_EVENT", patch } JSON to all wsClients
 */
export function broadcastPatch(_patch: PatchEvent): void {
  throw new Error("broadcastPatch not implemented");
}

/**
 * Send current full game state snapshot to a single newly-connected client.
 * Called by server.ts when a dashboard browser connects or reconnects.
 *
 * Implementation: ws.send(JSON.stringify(toDashboardPayload(state)))
 */
export function sendSnapshot(_ws: WebSocket, _state: GameState): void {
  throw new Error("sendSnapshot not implemented");
}
