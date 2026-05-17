// GameView — shown when mode === "play"
//
// THREE-COLUMN LAYOUT (all visible simultaneously, no tabs):
//
//  ┌──────────────────────────┬──────────────────┬──────────────────────┐
//  │  LEFT: Phaser game map   │ CENTER: 4 agent  │  RIGHT: Hand of God  │
//  │  (Phaser canvas, fills   │ thought panels   │  Evolution panel     │
//  │   remaining width)       │ stacked vertically│ (balance AI feed)   │
//  └──────────────────────────┴──────────────────┴──────────────────────┘
//
// LEFT — Phaser canvas (flex-1, min-w-0):
//   - Renders dungeon map tiles using coloured rectangles (no sprites needed)
//   - Agents drawn as coloured circles (red/blue/yellow/green per personality)
//   - Enemies drawn as smaller rectangles
//   - Phase label + dungeon timer displayed above canvas
//   - Updates every WebSocket message (DashboardPayload on /ws/game)
//   - When phase === "ARENA": tint arena_floor tiles purple, hide dungeon enemies
//
// CENTER — Agent thought panels (w-72, 4 panels stacked, each flex-1):
//   Each panel shows one agent (aggressive / cautious / hoarder / speedrunner):
//   - Agent name in personality colour (red/blue/yellow/green)
//   - HP bar (green→yellow→red based on hp/maxHp)
//   - Current goal (short string)
//   - Last reasoning text (scrollable, shows the Claude API response reasoning field)
//   - Status badge: ALIVE / IN_BOSS_FIGHT / ELIMINATED (greyed out if eliminated)
//   - Inventory count badge (e.g. "3 items")
//   - Source: poll /api/game-state every 2s, read state.agents[id].lastReasoning
//
// RIGHT — "Hand of God" Evolution panel (w-64):
//   Header: "⚡ Hand of God" in forge-accent colour
//   Live balance feed — three sections:
//
//   1. BALANCE METER (top):
//      - Per-agent kill count bar chart (4 bars, coloured per agent)
//      - Updates from DashboardPayload.agents[].kills
//      - Visually shows which agent is dominating
//
//   2. AI ANALYSIS (middle, scrollable):
//      - Shows the Balance Worker's latest reasoning text
//      - Source: SSE stream on /api/events (game-events.jsonl tail)
//      - Filter for BALANCE_ANALYSIS events
//      - Display as italicised grey text, newest first
//      - Label: "Evaluator thinks:" above each entry
//
//   3. PATCH FEED (bottom):
//      - Each PATCH_APPLIED event rendered as a dramatic card:
//        ┌─────────────────────────────┐
//        │ ⚡ PATCH APPLIED            │
//        │ enemies.grunt_hp            │
//        │ 30 → 20  (-33%)            │
//        │ "aggressive dominating..."  │
//        └─────────────────────────────┘
//      - Flash animation on new patch (yellow border for 2s then fades)
//      - Show last 10 patches, newest at top
//      - Source: WebSocket PATCH_APPLIED events
//
// DATA SOURCES:
//   - WebSocket ws://localhost:3000/ws/game → DashboardPayload (map + agents + enemies)
//   - SSE /api/events → game-events.jsonl tail (PATCH_APPLIED, BALANCE_ANALYSIS, ROUND_END)
//   - Poll /api/game-state every 2s → agent reasoning strings
//
// WebSocket reconnect: on close, retry with 2s backoff (infinite retries)
// SSE reconnect: EventSource handles reconnect automatically

import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";

const AGENT_IDS = ["aggressive", "cautious", "hoarder", "speedrunner"] as const;

const AGENT_COLORS: Record<string, string> = {
  aggressive: "text-red-400",
  cautious: "text-blue-400",
  hoarder: "text-yellow-400",
  speedrunner: "text-green-400",
};

export default function GameView() {
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // TODO: initialize Phaser scene in canvasRef.current
    // Connect to /ws/game WebSocket
    // On DashboardPayload: render tiles, agents, enemies
  }, []);

  return (
    <div className="flex h-[calc(100vh-41px)] gap-2 p-2">
      {/* LEFT: Game canvas */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between mb-1 px-1">
          <span className="text-xs text-forge-accent font-bold uppercase">DUNGEON</span>
          <span className="text-xs text-forge-dim">0:00</span>
        </div>
        <div
          ref={canvasRef}
          className="flex-1 bg-forge-panel border border-forge-border rounded flex items-center justify-center overflow-hidden"
        >
          <span className="text-forge-dim text-xs">connecting to game...</span>
        </div>
      </div>

      {/* CENTER: Agent thought panels */}
      <div className="w-72 flex flex-col gap-2 overflow-hidden">
        {AGENT_IDS.map((id) => (
          <div
            key={id}
            className="flex-1 bg-forge-panel border border-forge-border rounded p-2 overflow-hidden flex flex-col"
          >
            <div className={`text-xs font-bold uppercase mb-1 ${AGENT_COLORS[id]}`}>
              {id}
            </div>
            {/* TODO: HP bar, goal, reasoning, status badge, inventory count */}
            <div className="text-forge-dim text-xs flex-1 overflow-hidden leading-relaxed">
              waiting for decision...
            </div>
          </div>
        ))}
      </div>

      {/* RIGHT: Hand of God Evolution panel */}
      <div className="w-64 bg-forge-panel border border-forge-border rounded p-2 flex flex-col gap-2">
        <div className="text-xs font-bold uppercase text-forge-accent">
          ⚡ Hand of God
        </div>

        {/* Balance meter */}
        <div className="flex flex-col gap-1">
          <div className="text-[10px] text-forge-dim uppercase tracking-wide">Kill Balance</div>
          {/* TODO: per-agent kill count bars from DashboardPayload */}
          {AGENT_IDS.map((id) => (
            <div key={id} className="flex items-center gap-1">
              <span className={`text-[10px] w-20 truncate ${AGENT_COLORS[id]}`}>{id}</span>
              <div className="flex-1 h-1.5 bg-forge-border rounded-full overflow-hidden">
                <div className="h-full bg-current rounded-full w-0" />
              </div>
              <span className="text-[10px] text-forge-dim w-4 text-right">0</span>
            </div>
          ))}
        </div>

        {/* AI analysis */}
        <div className="flex flex-col gap-1 flex-1 min-h-0">
          <div className="text-[10px] text-forge-dim uppercase tracking-wide">Evaluator thinks:</div>
          {/* TODO: BALANCE_ANALYSIS events from SSE /api/events */}
          <div className="flex-1 overflow-y-auto text-[10px] text-forge-dim italic leading-relaxed">
            waiting for balance analysis...
          </div>
        </div>

        {/* Patch feed */}
        <div className="flex flex-col gap-1">
          <div className="text-[10px] text-forge-dim uppercase tracking-wide">Patches Applied</div>
          {/* TODO: PATCH_APPLIED events — flash yellow border on new patch for 2s */}
          <div className="text-forge-dim text-[10px]">no patches yet</div>
        </div>
      </div>
    </div>
  );
}
