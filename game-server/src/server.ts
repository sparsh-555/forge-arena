// Unified server: serves both harness build events (SSE) and game state (WebSocket).
// Runs from 12:30 onward throughout build phase and demo phase.
// Dashboard auto-detects which mode is active based on which endpoint has data.

import express from "express";
import { createServer } from "http";
import { readFileSync, existsSync, createReadStream } from "fs";
import path from "path";
import { WebSocketServer } from "ws";
import type { GameState } from "./types.js";
import { wsClients, sendSnapshot } from "./StateEmitter.js";

const PORT = 3000;
const STATE_DIR = path.join(process.cwd(), "..", "state");
const HARNESS_EVENTS_LOG = path.join(STATE_DIR, "progress.jsonl");
const BUILD_HEALTH_FILE = path.join(STATE_DIR, "build-health.json");

// Current game state — set by GameLoop when game starts
// null during build phase
export let currentGameState: GameState | null = null;

export function setGameState(state: GameState): void {
  currentGameState = state;
}

export function createApp(): express.Application {
  const app = express();

  // Serve dashboard static files
  app.use(express.static(path.join(process.cwd(), "..", "dashboard", "dist")));

  // ── Build Phase: SSE harness events ─────────────────────────────────────────
  // Dashboard polls this during 12:30–3:30 to show build progress.
  // Returns NDJSON stream of harness-events.jsonl.
  app.get("/api/harness-events", (req, res) => {
    // TODO: set SSE headers (Content-Type: text/event-stream, Cache-Control: no-cache)
    // Stream HARNESS_EVENTS_LOG line by line
    // Keep connection open and send new lines as they appear
    // On client disconnect: cleanup
    throw new Error("/api/harness-events not implemented");
  });

  // ── Build Phase: build health snapshot ──────────────────────────────────────
  app.get("/api/build-health", (req, res) => {
    // TODO: readFileSync(BUILD_HEALTH_FILE), return JSON
    // Return { grade: null, status: "not_started" } if file doesn't exist
    throw new Error("/api/build-health not implemented");
  });

  // ── Play Phase: current game state snapshot ──────────────────────────────────
  // Called by dashboard on WebSocket reconnect to get current state.
  app.get("/api/game-state", (req, res) => {
    // TODO: return { mode: "build" | "play", state: currentGameState | null }
    // mode is "play" when currentGameState !== null
    throw new Error("/api/game-state not implemented");
  });

  return app;
}

export function startServer(): void {
  const app = createApp();
  const httpServer = createServer(app);

  // ── WebSocket server for game state ─────────────────────────────────────────
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/game" });

  wss.on("connection", (ws) => {
    wsClients.add(ws);

    // Send current snapshot immediately on connect (reconnection recovery)
    if (currentGameState !== null) {
      sendSnapshot(ws, currentGameState);
    }

    ws.on("close", () => wsClients.delete(ws));
    ws.on("error", () => wsClients.delete(ws));
  });

  httpServer.listen(PORT, () => {
    console.log(`forge-arena server running at http://localhost:${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
    console.log(`Game WS: ws://localhost:${PORT}/ws/game`);
  });
}

// Start server when run directly
startServer();
