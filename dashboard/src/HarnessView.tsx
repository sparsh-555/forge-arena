// HarnessView — shown when mode === "build" (or when toggle overrides to "build" during play)
//
// THREE-PANEL LAYOUT (all visible simultaneously):
//
//  ┌───────────────────┬──────────────────────────────┬──────────────────┐
//  │  LEFT: Task Queue │  CENTER: Harness Activity    │  RIGHT: Build    │
//  │  (w-56)           │  Log (flex-1, scrollable)    │  Health (w-56)   │
//  └───────────────────┴──────────────────────────────┴──────────────────┘
//
// LEFT — Task Queue (w-56):
//   Header: "Sprint N" — from latest SPRINT_START event in harness-events.jsonl
//   - Task list from GET /api/task-state (state/tasks.json), polled every 5s
//   - Completed tasks: "✓" green + task name (dimmed)
//   - In-progress/claimed tasks: "⟳" yellow + task name
//   - Pending tasks: "·" grey + task name
//   - Progress bar: N of total tasks complete
//   - Sprint number shown in header; each task shows its sprint if available
//
// CENTER — Harness Activity Log (flex-1):
//   - On mount: fetch GET /api/harness-log → full historical harness-events.jsonl as JSON array
//     Display all historical events newest-first, then prepend live events as they arrive
//   - SSE /api/harness-events → append new live events to top of list
//   - Each row: [HH:MM:SS] [EVENT_TYPE] short summary
//   - Colour coding:
//       TASK_COMPLETED → green
//       TASK_FAILED, BUILD_FAILED → red
//       SPRINT_START, SPRINT_END → blue
//       BUILD_HEALTH → yellow (show grade)
//       RECONCILER_* → purple
//       default → forge-dim
//   - Show event detail: worker name, task id, or error snippet
//   - Keep last 200 events in memory
//
// RIGHT — Build Health (w-56):
//   - Large grade letter (A/B/C/D/F) centre-aligned, colour shifts green→red
//   - "Consecutive passing: N" below grade
//   - Converged badge: green "✓ CONVERGED" or grey "building..."
//   - Last error (truncated to 200 chars) in red box if present
//   - Grade history: last 12 grades as coloured letters (left to right = oldest to newest)
//   Source: GET /api/build-health polled every 5s
//
// DATA SOURCES:
//   - GET /api/harness-log → all harness-events.jsonl lines as JSON array (historical replay)
//   - SSE /api/harness-events → live event stream during active build
//   - GET /api/task-state → state/tasks.json (task list with status, sprint, description)
//   - GET /api/build-health → state/build-health.json

import { useEffect, useRef, useState } from "react";

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

interface Task {
  id: string;
  name: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  sprint?: number;
  description?: string;
}

interface TaskState {
  sprint: number;
  tasks: Task[];
}

const GRADE_COLOR: Record<string, string> = {
  A: "text-green-400",
  B: "text-green-300",
  C: "text-yellow-400",
  D: "text-orange-400",
  F: "text-red-400",
};

const EVENT_COLOR: Record<string, string> = {
  TASK_COMPLETED: "text-green-400",
  TASK_FAILED: "text-red-400",
  BUILD_FAILED: "text-red-400",
  SPRINT_START: "text-blue-400",
  SPRINT_END: "text-blue-300",
  BUILD_HEALTH: "text-yellow-400",
  RECONCILER_START: "text-purple-400",
  RECONCILER_END: "text-purple-300",
};

function eventSummary(e: HarnessEvent): string {
  if (e.task) return String(e.task);
  if (e.grade) return `grade ${String(e.grade)}`;
  if (e.sprint) return `sprint ${String(e.sprint)}`;
  if (e.error) return String(e.error).slice(0, 80);
  if (e.worker) return `worker: ${String(e.worker)}`;
  return "";
}

export default function HarnessView() {
  const [health, setHealth] = useState<BuildHealth | null>(null);
  const [events, setEvents] = useState<HarnessEvent[]>([]);
  const [taskState, setTaskState] = useState<TaskState | null>(null);
  const loadedHistoryRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchHealth() {
      try {
        const res = await fetch("/api/build-health", { signal: controller.signal });
        if (res.ok) setHealth(await res.json());
      } catch { /* ignore */ }
    }

    async function fetchTaskState() {
      try {
        const res = await fetch("/api/task-state", { signal: controller.signal });
        if (res.ok) setTaskState(await res.json());
      } catch { /* ignore */ }
    }

    async function loadHistory() {
      if (loadedHistoryRef.current) return;
      loadedHistoryRef.current = true;
      try {
        const res = await fetch("/api/harness-log", { signal: controller.signal });
        if (res.ok) {
          const history: HarnessEvent[] = await res.json();
          setEvents(history.reverse().slice(0, 200));
        }
      } catch { /* ignore */ }
    }

    loadHistory();
    fetchHealth();
    fetchTaskState();

    const healthInterval = setInterval(fetchHealth, 5000);
    const taskInterval = setInterval(fetchTaskState, 5000);

    const es = new EventSource("/api/harness-events");
    es.onmessage = (e) => {
      try {
        const event: HarnessEvent = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev].slice(0, 200));
      } catch { /* ignore malformed events */ }
    };

    return () => {
      controller.abort();
      clearInterval(healthInterval);
      clearInterval(taskInterval);
      es.close();
    };
  }, []);

  const tasks = taskState?.tasks ?? [];
  const sprint = taskState?.sprint ?? 1;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const totalCount = tasks.length;

  return (
    <div className="flex h-[calc(100vh-41px)] gap-2 p-2">
      {/* LEFT: Task queue */}
      <div className="w-56 bg-forge-panel border border-forge-border rounded p-2 flex flex-col gap-2 overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase text-forge-accent">
            Sprint {sprint}
          </span>
          <span className="text-[10px] text-forge-dim">
            {completedCount}/{totalCount}
          </span>
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="h-1 bg-forge-border rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${Math.round((completedCount / totalCount) * 100)}%` }}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-1 text-[10px]">
          {tasks.length === 0 ? (
            <div className="text-forge-dim">waiting for tasks...</div>
          ) : (
            tasks.map((t) => (
              <div key={t.id} className="flex items-start gap-1 leading-relaxed">
                <span
                  className={
                    t.status === "completed"
                      ? "text-green-400 shrink-0"
                      : t.status === "in_progress"
                      ? "text-yellow-400 shrink-0"
                      : t.status === "failed"
                      ? "text-red-400 shrink-0"
                      : "text-forge-dim shrink-0"
                  }
                >
                  {t.status === "completed"
                    ? "✓"
                    : t.status === "in_progress"
                    ? "⟳"
                    : t.status === "failed"
                    ? "✗"
                    : "·"}
                </span>
                <span
                  className={
                    t.status === "completed"
                      ? "text-forge-dim line-through"
                      : t.status === "in_progress"
                      ? "text-forge-text"
                      : t.status === "failed"
                      ? "text-red-400"
                      : "text-forge-dim"
                  }
                >
                  {t.name}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* CENTER: Harness activity log */}
      <div className="flex-1 bg-forge-panel border border-forge-border rounded p-2 flex flex-col overflow-hidden">
        <div className="text-xs font-bold uppercase text-forge-accent mb-2">
          Harness Activity
        </div>
        <div className="flex-1 overflow-y-auto space-y-0.5">
          {events.length === 0 ? (
            <div className="text-forge-dim text-xs">waiting for harness events...</div>
          ) : (
            events.map((e, i) => (
              <div key={i} className="text-[10px] flex gap-2 border-b border-forge-border/20 pb-0.5">
                <span className="text-forge-dim shrink-0 font-mono">
                  {e.timestamp?.slice(11, 19) ?? "??:??:??"}
                </span>
                <span
                  className={`shrink-0 font-bold ${EVENT_COLOR[e.type] ?? "text-forge-dim"}`}
                >
                  [{e.type}]
                </span>
                <span className="text-forge-text truncate">{eventSummary(e)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT: Build health */}
      <div className="w-56 bg-forge-panel border border-forge-border rounded p-3 flex flex-col gap-3">
        <div className="text-xs font-bold uppercase text-forge-accent">Build Health</div>

        <div className="text-center">
          <span
            className={`text-5xl font-bold ${
              health?.grade ? (GRADE_COLOR[health.grade] ?? "text-forge-dim") : "text-forge-dim"
            }`}
          >
            {health?.grade ?? "–"}
          </span>
        </div>

        <div className="text-xs space-y-1 text-forge-dim">
          <div>
            Consecutive passing:{" "}
            <span className="text-forge-text">{health?.consecutive_passing ?? 0}</span>
          </div>
          <div>
            Status:{" "}
            <span className={health?.converged ? "text-green-400 font-bold" : "text-forge-dim"}>
              {health?.converged ? "✓ CONVERGED" : "building..."}
            </span>
          </div>
          {health?.last_run && (
            <div>Last run: {health.last_run.slice(11, 19)}</div>
          )}
        </div>

        {health?.last_error && (
          <div className="text-[10px] text-red-400 bg-red-900/20 p-2 rounded overflow-hidden break-all">
            {health.last_error.slice(0, 200)}
          </div>
        )}

        <div className="text-xs font-bold uppercase text-forge-accent mt-auto">
          Grade History
        </div>
        <div className="flex gap-1 flex-wrap">
          {(health?.history ?? []).slice(-12).map((h, i) => (
            <span
              key={i}
              className={`text-sm font-bold ${GRADE_COLOR[h.grade] ?? "text-forge-dim"}`}
            >
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
