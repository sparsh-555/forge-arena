// StateEmitter: broadcasts game state to dashboard via WebSocket.
// Also writes events to state/game-events.jsonl for the Evaluator to read.

import { appendFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { WebSocket } from "ws";
import type { GameEvent, GameState, PatchEvent } from "./types.js";
import { toDashboardPayload } from "./DungeonBridge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const EVENTS_LOG_PATH = path.resolve(__dirname, "../../state/game-events.jsonl");

// WebSocket clients connected to /ws/game
export const wsClients: Set<WebSocket> = new Set();

const WS_OPEN = 1;

/**
 * Broadcast current game state to all connected dashboard clients.
 */
export function broadcast(state: GameState): void {
  const payload = toDashboardPayload(state);
  const msg = JSON.stringify(payload);

  for (const ws of wsClients) {
    try {
      if (ws.readyState === WS_OPEN) {
        ws.send(msg);
      } else {
        wsClients.delete(ws);
      }
    } catch {
      wsClients.delete(ws);
    }
  }
}

/**
 * Append a structured event to game-events.jsonl (NDJSON).
 */
export function logEvent(event: GameEvent): void {
  appendFileSync(EVENTS_LOG_PATH, JSON.stringify(event) + "\n");
}

/**
 * Broadcast a patch event immediately when a patch lands.
 */
export function broadcastPatch(patch: PatchEvent): void {
  const msg = JSON.stringify({ type: "PATCH_EVENT", patch });

  for (const ws of wsClients) {
    try {
      if (ws.readyState === WS_OPEN) {
        ws.send(msg);
      }
    } catch {
      wsClients.delete(ws);
    }
  }
}

/**
 * Send current full game state snapshot to a single newly-connected client.
 */
export function sendSnapshot(ws: WebSocket, state: GameState): void {
  if (ws.readyState === WS_OPEN) {
    const payload = toDashboardPayload(state);
    ws.send(JSON.stringify(payload));
  }
}
