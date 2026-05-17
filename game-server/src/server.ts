// Unified server: serves harness build events (SSE) and live game state (WebSocket).
// Runs on port 3000 throughout both build phase and demo phase.
// Dashboard detects mode from /api/game-state response.
//
// IMPORTANT: Run from game-server/ directory so relative paths resolve correctly.
//   cd game-server && node dist/server.js

import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import type { GameState } from "./types.js";
import { wsClients, sendSnapshot } from "./StateEmitter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

// Paths relative to compiled dist/ output (one level up = game-server/)
const STATE_DIR = path.join(__dirname, "../../state");
const HARNESS_EVENTS_LOG = path.join(STATE_DIR, "harness-events.jsonl");
const BUILD_HEALTH_FILE = path.join(STATE_DIR, "build-health.json");
const DASHBOARD_DIST = path.join(__dirname, "../../dashboard/dist");

// Current game state — set by GameLoop when game starts.
// null during build phase (server shows build health view).
export let currentGameState: GameState | null = null;

export function setGameState(state: GameState): void {
  currentGameState = state;
}

export function createApp(): express.Application {
  const app = express();
  app.use(express.json());

  // Serve compiled dashboard static files
  app.use(express.static(DASHBOARD_DIST));

  // ── Build Phase: SSE harness events ─────────────────────────────────────────
  // Dashboard polls this during build phase (12:30–3:30) to show progress.
  // Streams NDJSON from harness-events.jsonl as SSE events.
  //
  // Implementation notes:
  // - Set headers: Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive
  // - Read existing lines from HARNESS_EVENTS_LOG, send each as: "data: <line>\n\n"
  // - Watch file with fs.watchFile or chokidar, send new lines as they appear
  // - On client disconnect (req.on("close")): stop watcher
  app.get("/api/harness-events", (_req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    // TODO: stream HARNESS_EVENTS_LOG (existing + new lines) as SSE
    void HARNESS_EVENTS_LOG;
    res.write("data: {\"type\":\"connected\"}\n\n");
  });

  // ── Build Phase: build health snapshot ──────────────────────────────────────
  // Returns latest build-health.json or a "not_started" default.
  //
  // Implementation notes:
  // - Try readFileSync(BUILD_HEALTH_FILE, "utf8"), JSON.parse
  // - Catch ENOENT: return { grade: null, status: "not_started" }
  app.get("/api/build-health", (_req, res) => {
    // TODO: read and return BUILD_HEALTH_FILE
    void BUILD_HEALTH_FILE;
    res.json({ grade: null, status: "not_started", converged: false });
  });

  // ── Mode detection + game state snapshot ─────────────────────────────────────
  // Called by dashboard on load and every 3s to detect build vs play mode.
  // Also used by WebSocket reconnect to recover current state.
  app.get("/api/game-state", (_req, res) => {
    if (currentGameState === null) {
      res.json({ mode: "build", state: null });
    } else {
      res.json({ mode: "play", state: currentGameState });
    }
  });

  return app;
}

export function startServer(): void {
  const app = createApp();
  const httpServer = createServer(app);

  // ── WebSocket server for live game state ─────────────────────────────────────
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/game" });

  wss.on("connection", (ws) => {
    wsClients.add(ws);

    // Send current snapshot immediately on connect (handles reconnection)
    if (currentGameState !== null) {
      sendSnapshot(ws, currentGameState);
    }

    ws.on("close", () => wsClients.delete(ws));
    ws.on("error", () => wsClients.delete(ws));
  });

  httpServer.listen(PORT, () => {
    console.error(`forge-arena server running at http://localhost:${PORT}`);
    console.error(`Dashboard: http://localhost:${PORT}`);
    console.error(`Game WS:   ws://localhost:${PORT}/ws/game`);
    console.error(`State dir: ${STATE_DIR}`);
  });
}

// Start server when run directly
startServer();
