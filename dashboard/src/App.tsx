import { useEffect, useState } from "react";
import GameView from "./GameView.js";
import HarnessView from "./HarnessView.js";

type Mode = "build" | "play" | "loading";
type ViewOverride = "build" | "play" | null;

interface GameStateResponse {
  mode: "build" | "play";
  phase?: string;
}

export default function App() {
  const [mode, setMode] = useState<Mode>("loading");
  const [viewOverride, setViewOverride] = useState<ViewOverride>(null);

  useEffect(() => {
    let cancelled = false;

    async function pollMode() {
      try {
        const res = await fetch("/api/game-state");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: GameStateResponse = await res.json();
        if (!cancelled) setMode(data.mode);
      } catch {
        if (!cancelled) setMode("build");
      }
    }

    pollMode();
    const interval = setInterval(pollMode, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (mode === "loading") {
    return (
      <div className="flex h-screen items-center justify-center text-forge-dim text-sm">
        connecting to forge-arena...
      </div>
    );
  }

  const activeView = viewOverride ?? mode;

  return (
    <div className="h-screen w-screen overflow-hidden">
      <header className="flex items-center justify-between border-b border-forge-border px-4 py-2">
        <div className="flex items-center gap-2">
          <img src="/assets/ui/logo.png" alt="forge-arena" className="h-7 w-auto" style={{ imageRendering: "pixelated" }} />
          <span className="text-forge-accent font-bold tracking-widest text-xs uppercase">
            forge-arena
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* View toggle — only shown once game is live */}
          {mode === "play" && (
            <button
              onClick={() =>
                setViewOverride(activeView === "build" ? "play" : "build")
              }
              className="text-xs px-2 py-0.5 rounded border border-forge-border text-forge-dim hover:text-forge-text hover:border-forge-accent transition-colors"
            >
              {activeView === "build" ? "▶ Game" : "📋 Build Log"}
            </button>
          )}

          <span
            className={`text-xs px-2 py-0.5 rounded ${
              mode === "play"
                ? "bg-forge-safe/20 text-forge-safe"
                : "bg-forge-accent/20 text-forge-accent"
            }`}
          >
            {mode === "play" ? "LIVE" : "BUILDING"}
          </span>
        </div>
      </header>

      {activeView === "play" ? <GameView /> : <HarnessView />}
    </div>
  );
}
