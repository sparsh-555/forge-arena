// GameView — shown when mode === "play"
// Layout: left=Phaser canvas (game map), center=agent thought panels, right=patch feed
//
// TODO (workers): implement Phaser scene, WebSocket state updates, thought panel rendering
//
// Phaser receives DashboardPayload from /ws/game WebSocket.
// Agent thought panels show the last `reasoning` string from each agent's AgentAction.
// Patch feed shows PATCH_APPLIED events from game-events.jsonl streamed via SSE.

import { useEffect, useRef } from "react";

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
    // import Phaser dynamically, create game with WebGL renderer
    // connect to ws://localhost:3000/ws/game
    // on DashboardPayload: update tile sprites, agent sprites, entity sprites
  }, []);

  return (
    <div className="flex h-[calc(100vh-41px)] gap-2 p-2">
      {/* Game canvas */}
      <div
        ref={canvasRef}
        className="flex-1 min-w-0 bg-forge-panel border border-forge-border rounded flex items-center justify-center"
      >
        <span className="text-forge-dim text-xs">game map loading...</span>
      </div>

      {/* Agent thought panels */}
      <div className="w-72 flex flex-col gap-2 overflow-hidden">
        {AGENT_IDS.map((id) => (
          <div
            key={id}
            className="flex-1 bg-forge-panel border border-forge-border rounded p-2 overflow-hidden flex flex-col"
          >
            <div className={`text-xs font-bold uppercase mb-1 ${AGENT_COLORS[id]}`}>
              {id}
            </div>
            {/* TODO: render last reasoning string from agent's AgentAction */}
            <div className="text-forge-dim text-xs flex-1 overflow-hidden leading-relaxed">
              waiting for decision...
            </div>
          </div>
        ))}
      </div>

      {/* Patch feed */}
      <div className="w-56 bg-forge-panel border border-forge-border rounded p-2 flex flex-col">
        <div className="text-xs font-bold uppercase text-forge-accent mb-2">
          Patch Feed
        </div>
        {/* TODO: tail game-events.jsonl via SSE, render PATCH_APPLIED events */}
        <div className="text-forge-dim text-xs">
          no patches yet
        </div>
      </div>
    </div>
  );
}
