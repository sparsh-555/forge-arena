// StateEmitter: broadcasts game state to the dashboard via WebSocket.
// Also writes events to state/game-events.jsonl for the Evaluator to read.
// Imported by GameLoop. Never contains game logic.

import { appendFileSync } from "fs";
import path from "path";
import type { DashboardPayload, GameEvent, GameState, PatchEvent } from "./types.js";
import { toDashboardPayload } from "./DungeonBridge.js";

const EVENTS_LOG = path.join(process.cwd(), "..", "state", "game-events.jsonl");

// WebSocket clients connected to /ws/game
// Populated by server.ts when clients connect
export const wsClients: Set<import("ws").WebSocket> = new Set();

/**
 * Broadcast current game state to all connected dashboard clients.
 * Called by GameLoop after every round resolves.
 */
export function broadcast(state: GameState): void {
  // TODO: call toDashboardPayload(state), JSON.stringify
  // Send to all clients in wsClients set
  // Remove dead connections (readyState !== OPEN)
  throw new Error("broadcast not implemented");
}

/**
 * Append a structured event to game-events.jsonl.
 * Called for every round, combat result, patch, and phase transition.
 * Evaluator reads this file to compute metrics.
 */
export function logEvent(event: GameEvent): void {
  // TODO: appendFileSync(EVENTS_LOG, JSON.stringify(event) + "\n")
  throw new Error("logEvent not implemented");
}

/**
 * Broadcast a patch event specifically — emitted immediately when patch lands,
 * not waiting for next full game state broadcast.
 */
export function broadcastPatch(patch: PatchEvent): void {
  // TODO: send { type: "PATCH_EVENT", patch } to all ws clients
  throw new Error("broadcastPatch not implemented");
}

/**
 * Send current full game state snapshot to a single newly-connected client.
 * Called by server.ts when a dashboard browser connects or reconnects.
 */
export function sendSnapshot(ws: import("ws").WebSocket, state: GameState): void {
  // TODO: send toDashboardPayload(state) to single ws connection
  throw new Error("sendSnapshot not implemented");
}
