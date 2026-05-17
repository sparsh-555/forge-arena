// Unified server: serves harness build events (SSE) and live game state (WebSocket).
// Runs on port 3000 throughout both build phase and demo phase.
// Dashboard detects mode from /api/game-state response.
//
// IMPORTANT: Run from game-server/ directory so relative paths resolve correctly.
//   cd game-server && node dist/server.js

import express from "express";
import { createServer } from "http";
import { readFileSync } from "fs";
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
const TASKS_FILE = path.join(STATE_DIR, "tasks.json");
const DASHBOARD_DIST = path.join(__dirname, "../../dashboard/dist");
// game-server/public/ holds all PNG sprites — __dirname is game-server/dist/ at runtime
const PUBLIC_DIR = path.join(__dirname, "../public");

// Current game state — set by GameLoop when game starts.
// null during build phase (server shows build health view).
export let currentGameState: GameState | null = null;

export function setGameState(state: GameState): void {
  currentGameState = state;
}

export function createApp(): express.Application {
  const app = express();
  app.use(express.json());

  // Serve sprite assets (/assets/agents/, /assets/enemies/, /assets/tiles/)
  // MUST come before dashboard static so /assets/ requests resolve to PNGs, not JS bundles
  app.use(express.static(PUBLIC_DIR));
  // Serve compiled dashboard (index.html, JS bundle, CSS)
  app.use(express.static(DASHBOARD_DIST));

  // ── Build Phase: SSE harness events ─────────────────────────────────────────
  // Dashboard streams this during the build phase to show harness progress live.
  // Streams NDJSON from harness-events.jsonl as SSE events — one line = one SSE message.
  //
  // Implementation notes:
  // - Set headers: Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive
  // - Read existing lines from HARNESS_EVENTS_LOG, send each as: "data: <line>\n\n"
  // - Watch file with fs.watchFile, send new lines as they appear
  // - On client disconnect (req.on("close")): stop watcher and unwatchFile
  app.get("/api/harness-events", (_req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    // TODO: stream HARNESS_EVENTS_LOG (existing + new lines) as SSE
    void HARNESS_EVENTS_LOG;
    res.write("data: {\"type\":\"connected\"}\n\n");
  });

  // ── Build Phase: full harness event log (historical replay) ─────────────────
  // Returns ALL historical harness-events.jsonl lines as a JSON array.
  // Dashboard fetches this once on mount to replay the full build history,
  // then switches to SSE for live tail.
  //
  // Implementation notes:
  // - Try readFileSync(HARNESS_EVENTS_LOG, "utf8")
  // - Split by newline, filter empty lines, JSON.parse each line
  // - Return JSON array of event objects, oldest first
  // - On ENOENT: return []
  app.get("/api/harness-log", (_req, res) => {
    // TODO: read HARNESS_EVENTS_LOG, parse all NDJSON lines, return as array
    void HARNESS_EVENTS_LOG;
    res.json([]);
  });

  // ── Build Phase: task queue state ───────────────────────────────────────────
  // Returns state/tasks.json as-is. Dashboard polls every 5s during build phase
  // to show task queue with pending/in_progress/completed status and checkmarks.
  //
  // Implementation notes:
  // - Try readFileSync(TASKS_FILE, "utf8"), JSON.parse
  // - Return parsed object (includes sprint number and tasks array)
  // - On ENOENT: return { sprint: 1, tasks: [] }
  app.get("/api/task-state", (_req, res) => {
    // TODO: read TASKS_FILE and return parsed JSON
    void TASKS_FILE;
    res.json({ sprint: 1, tasks: [] });
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
  // Exposes agent reasoning strings for the CENTER thought panels in GameView.
  //
  // Implementation notes (when currentGameState is set):
  // Return mode: "play" and agents map:
  //   agents: { [id]: { status, hp, maxHp, kills, lastReasoning, goal, inventoryCount } }
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
