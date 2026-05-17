// ReplayStore: serves pre-recorded agent actions in demo/replay mode.
// Initialized once at startup via initReplay(). Zero cost when not initialized.

import { readFileSync } from "fs";
import type { AgentAction, AgentId } from "./types.js";

interface ReplayData {
  seed: number;
  actions: Record<string, AgentAction>;
}

let _replay: ReplayData | null = null;

export function initReplay(path: string): void {
  const raw = readFileSync(path, "utf8");
  _replay = JSON.parse(raw) as ReplayData;
  console.error(`[ReplayStore] Loaded ${Object.keys(_replay.actions).length} recorded actions (seed=${_replay.seed})`);
}

export function isReplayMode(): boolean {
  return _replay !== null;
}

export function getReplaySeed(): number | null {
  return _replay?.seed ?? null;
}

export function getReplayAction(round: number, agentId: AgentId): AgentAction | null {
  if (!_replay) return null;
  return _replay.actions[`${round}_${agentId}`] ?? null;
}
