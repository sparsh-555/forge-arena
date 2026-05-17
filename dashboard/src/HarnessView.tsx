// HarnessView — shown when mode === "build"
// Layout: task queue (left), worker activity log (center), build health (right)
//
// TODO (workers): implement SSE consumer for /api/harness-events
// TODO (workers): render task list with claimed/pending/completed counts
// TODO (workers): render build health grade with history sparkline

import { useEffect, useState } from "react";

interface BuildHealth {
  grade: string | null;
  consecutive_passing: number;
  last_run: string | null;
  last_error: string | null;
  converged: boolean;
  mode: string;
  history: Array<{ grade: string; timestamp: string }>;
}

interface HarnessEvent {
  type: string;
  timestamp: string;
  [key: string]: unknown;
}

const GRADE_COLOR: Record<string, string> = {
  A: "text-green-400",
  B: "text-green-300",
  C: "text-yellow-400",
  D: "text-orange-400",
  F: "text-red-400",
};

export default function HarnessView() {
  const [health, setHealth] = useState<BuildHealth | null>(null);
  const [events, setEvents] = useState<HarnessEvent[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchHealth() {
      try {
        const res = await fetch("/api/build-health", { signal: controller.signal });
        if (res.ok) setHealth(await res.json());
      } catch {
        /* ignore */
      }
    }

    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);

    const es = new EventSource("/api/harness-events");
    es.onmessage = (e) => {
      try {
        const event: HarnessEvent = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev].slice(0, 100));
      } catch {
        /* ignore malformed events */
      }
    };

    return () => {
      controller.abort();
      clearInterval(interval);
      es.close();
    };
  }, []);

  return (
    <div className="flex h-[calc(100vh-41px)] gap-2 p-2">
      {/* Harness event log */}
      <div className="flex-1 bg-forge-panel border border-forge-border rounded p-2 overflow-hidden flex flex-col">
        <div className="text-xs font-bold uppercase text-forge-accent mb-2">
          Harness Activity
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {events.length === 0 ? (
            <div className="text-forge-dim text-xs">waiting for harness events...</div>
          ) : (
            events.map((e, i) => (
              <div key={i} className="text-xs border-b border-forge-border/30 pb-1">
                <span className="text-forge-dim">{e.timestamp?.slice(11, 19)} </span>
                <span className="text-forge-accent">[{e.type}] </span>
                <span className="text-forge-text">
                  {JSON.stringify(e, (k) => (k === "type" || k === "timestamp" ? undefined : k)).slice(0, 120)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Build health panel */}
      <div className="w-56 bg-forge-panel border border-forge-border rounded p-3 flex flex-col gap-3">
        <div className="text-xs font-bold uppercase text-forge-accent">Build Health</div>

        <div className="text-center">
          <span className={`text-5xl font-bold ${health?.grade ? GRADE_COLOR[health.grade] ?? "text-forge-dim" : "text-forge-dim"}`}>
            {health?.grade ?? "–"}
          </span>
        </div>

        <div className="text-xs space-y-1 text-forge-dim">
          <div>
            Consecutive passing:{" "}
            <span className="text-forge-text">{health?.consecutive_passing ?? 0}</span>
          </div>
          <div>
            Converged:{" "}
            <span className={health?.converged ? "text-forge-safe" : "text-forge-dim"}>
              {health?.converged ? "YES" : "no"}
            </span>
          </div>
          {health?.last_run && (
            <div>Last run: {health.last_run.slice(11, 19)}</div>
          )}
        </div>

        {health?.last_error && (
          <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded overflow-hidden">
            {health.last_error.slice(0, 200)}
          </div>
        )}

        <div className="text-xs font-bold uppercase text-forge-accent mt-auto">Grade History</div>
        <div className="flex gap-1 flex-wrap">
          {(health?.history ?? []).slice(-12).map((h, i) => (
            <span key={i} className={`text-sm font-bold ${GRADE_COLOR[h.grade] ?? "text-forge-dim"}`}>
              {h.grade}
            </span>
          ))}
          {(health?.history ?? []).length === 0 && (
            <span className="text-forge-dim text-xs">no history</span>
          )}
        </div>
      </div>
    </div>
  );
}
