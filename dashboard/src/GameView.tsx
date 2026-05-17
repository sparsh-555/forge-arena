// GameView — shown when mode === "play"
// THREE-COLUMN LAYOUT: Phaser map | Agent panels | Hand of God

import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";

const AGENT_IDS = ["aggressive", "cautious", "hoarder", "speedrunner"] as const;
type AgentId = typeof AGENT_IDS[number];

const AGENT_COLORS: Record<AgentId, string> = {
  aggressive: "#f87171",
  cautious: "#60a5fa",
  hoarder: "#facc15",
  speedrunner: "#4ade80",
};

const AGENT_TEXT_COLORS: Record<AgentId, string> = {
  aggressive: "text-red-400",
  cautious: "text-blue-400",
  hoarder: "text-yellow-400",
  speedrunner: "text-green-400",
};

const AGENT_BG: Record<AgentId, string> = {
  aggressive: "border-red-400/40",
  cautious: "border-blue-400/40",
  hoarder: "border-yellow-400/40",
  speedrunner: "border-green-400/40",
};

interface AgentState {
  position: { x: number; y: number };
  status: string;
  combat: { hp: number; maxHp: number; stamina: number; maxStamina: number };
  lastReasoning?: string;
  kills?: { grunt: number; brute: number; sentinel: number };
  dungeonScore?: number;
  inventory?: {
    equipped: Record<string, { name: string; slot: string; stats?: Record<string, number> } | null>;
    backpack: unknown[];
    estusCount: number;
  };
}

interface EnemyState {
  id: string;
  tier: string;
  position: { x: number; y: number };
  hp: number;
  maxHp: number;
  isAlive: boolean;
}

interface DashboardPayload {
  phase: string;
  roundNumber: number;
  dungeonTimer: number;
  agents: Record<AgentId, AgentState>;
  enemies: EnemyState[];
  bossInstances?: Record<string, { position: { x: number; y: number }; hp: number; maxHp: number; phase: number; isAlive: boolean }>;
  groundItems?: Array<{ position: { x: number; y: number }; item: { name: string; id: string } }>;
  // Server sends tiles flat (not nested under map)
  tiles: Array<Array<{ type: string }>>;
  mapWidth: number;
  mapHeight: number;
  recentPatches: Array<{ key: string; oldValue?: number; newValue: number; reason: string; timestamp?: string }>;
  finalScores?: Partial<Record<AgentId, number>>;
}

interface PatchEvent {
  key: string;
  oldValue?: number;
  newValue: number;
  reason: string;
  timestamp: string;
}

const TILE_SIZE = 32; // Render at 32px to fit 30×22 map in viewport

// ── Phaser Scene ────────────────────────────────────────────────────────────

class DungeonScene extends Phaser.Scene {
  private tileSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private agentSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private agentHpBars: Map<string, { bg: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle }> = new Map();
  private enemySprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private enemyHpBars: Map<string, { bg: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle }> = new Map();
  private bossSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private bossHpBars: Map<string, { bg: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle }> = new Map();
  private enemyFallback: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private initialized = false;
  // Queue payloads that arrive before preload() finishes to avoid missing-texture frames
  private sceneReady = false;
  private pendingPayload: DashboardPayload | null = null;
  public onPayload?: (payload: DashboardPayload) => void;

  constructor() {
    super({ key: "DungeonScene" });
  }

  preload() {
    this.load.on("loaderror", (file: { key: string; src: string }) => {
      console.warn(`[Phaser] texture load failed: ${file.key} (${file.src})`);
    });

    const agentIds = ["aggressive", "cautious", "hoarder", "speedrunner"];
    const dirs = ["north", "south", "east", "west"];
    agentIds.forEach(id => {
      this.load.image(id, `/assets/agents/${id}.png`);
      dirs.forEach(dir => this.load.image(`${id}_${dir}`, `/assets/agents/${id}_${dir}.png`));
    });

    const enemyIds = ["grunt", "brute", "sentinel", "hex_caster", "shade"];
    enemyIds.forEach(id => {
      this.load.image(id, `/assets/enemies/${id}.png`);
    });

    const tileTypes = ["floor", "wall", "wall_top", "wall_side", "wall_corner", "door",
      "boss_entrance", "arena_floor", "chest", "chest_open", "floor_cracked", "floor_mossy", "wall_torch"];
    tileTypes.forEach(t => this.load.image(t, `/assets/tiles/${t}.png`));

    this.load.image("boss", "/assets/boss/boss.png");
    this.load.image("boss_phase2", "/assets/boss/boss_phase2.png");
    this.load.image("boss_death", "/assets/boss/boss_death.png");
  }

  create() {
    this.cameras.main.setBackgroundColor("#111111");
    this.sceneReady = true;
    // Drain any payload that arrived while textures were still loading
    if (this.pendingPayload) {
      this.applyPayload(this.pendingPayload);
      this.pendingPayload = null;
    }
  }

  applyPayload(payload: DashboardPayload) {
    // Buffer until preload is done — prevents missing-texture placeholders
    if (!this.sceneReady) {
      this.pendingPayload = payload;
      return;
    }
    if (payload.tiles && payload.mapWidth && payload.mapHeight) {
      this.updateMap(payload.tiles, payload.mapWidth, payload.mapHeight);
      if (!this.initialized) {
        const mapW = payload.mapWidth * TILE_SIZE;
        const mapH = payload.mapHeight * TILE_SIZE;
        this.cameras.main.setBounds(0, 0, mapW, mapH);
        this.cameras.main.centerOn(mapW / 2, mapH / 2);
        const scaleX = this.scale.width / mapW;
        const scaleY = this.scale.height / mapH;
        this.cameras.main.setZoom(Math.min(scaleX, scaleY));
        this.initialized = true;
      }
    }
    this.updateAgents(payload.agents, payload.phase);
    this.updateEnemies(payload.enemies ?? []);
    this.updateBosses(payload.bossInstances ?? {});
    this.onPayload?.(payload);
  }

  private updateMap(tiles: Array<Array<{ type: string }>>, width: number, height: number) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[y]?.[x];
        if (!tile) continue;
        const tileType = tile.type === "wall" ? "wall" : tile.type;
        const key = `${x},${y}`;
        const px = x * TILE_SIZE + TILE_SIZE / 2;
        const py = y * TILE_SIZE + TILE_SIZE / 2;
        const existing = this.tileSprites.get(key);
        if (existing) {
          existing.setTexture(tileType);
        } else {
          const img = this.add.image(px, py, tileType).setDisplaySize(TILE_SIZE, TILE_SIZE);
          this.tileSprites.set(key, img);
        }
      }
    }
  }

  private updateAgents(agents: Record<AgentId, AgentState>, _phase: string) {
    for (const id of AGENT_IDS) {
      const agent = agents[id];
      if (!agent) continue;
      const px = agent.position.x * TILE_SIZE + TILE_SIZE / 2;
      const py = agent.position.y * TILE_SIZE + TILE_SIZE / 2;

      // Sprite — always refresh texture in case it loaded after sprite was created
      const texKey = this.textures.exists(id) ? id : "floor";
      if (!this.agentSprites.has(id)) {
        const sprite = this.add.image(px, py, texKey).setDisplaySize(TILE_SIZE - 4, TILE_SIZE - 4).setDepth(10);
        this.agentSprites.set(id, sprite);
      }
      const sprite = this.agentSprites.get(id)!;
      if (sprite.texture.key !== texKey) sprite.setTexture(texKey);
      sprite.setPosition(px, py);
      sprite.setAlpha(agent.status === "eliminated" ? 0.3 : 1.0);

      // HP bar above sprite
      const barW = TILE_SIZE - 4;
      const barX = px - barW / 2;
      const barY = py - TILE_SIZE / 2 - 5;
      if (!this.agentHpBars.has(id)) {
        const bg = this.add.rectangle(barX + barW / 2, barY, barW, 3, 0x333333).setDepth(11);
        const fill = this.add.rectangle(barX + barW / 2, barY, barW, 3, 0x22c55e).setDepth(12);
        this.agentHpBars.set(id, { bg, fill });
      }
      const { fill } = this.agentHpBars.get(id)!;
      const ratio = agent.combat.maxHp > 0 ? agent.combat.hp / agent.combat.maxHp : 0;
      const color = ratio > 0.5 ? 0x22c55e : ratio > 0.25 ? 0xfacc15 : 0xef4444;
      fill.setFillStyle(color);
      fill.setPosition(barX + (ratio * barW) / 2, barY);
      fill.setSize(ratio * barW, 3);
    }
  }

  private updateEnemies(enemies: EnemyState[]) {
    const ENEMY_COLORS: Record<string, number> = {
      grunt: 0x888899, brute: 0xcc4400, sentinel: 0x4488cc,
      hex_caster: 0x9933cc, shade: 0x44aa55,
    };

    const seen = new Set<string>();
    for (const e of enemies) {
      if (!e.isAlive) {
        // Hide sprite, fallback graphic, AND hp bars for dead enemies
        this.enemySprites.get(e.id)?.setVisible(false);
        this.enemyFallback.get(e.id)?.setVisible(false);
        const deadBar = this.enemyHpBars.get(e.id);
        if (deadBar) { deadBar.bg.setVisible(false); deadBar.fill.setVisible(false); }
        continue;
      }
      seen.add(e.id);
      const px = e.position.x * TILE_SIZE + TILE_SIZE / 2;
      const py = e.position.y * TILE_SIZE + TILE_SIZE / 2;

      const texLoaded = this.textures.exists(e.tier) && this.textures.get(e.tier).key !== "__MISSING";
      if (texLoaded) {
        // Texture loaded — use sprite image
        this.enemyFallback.get(e.id)?.setVisible(false);
        if (!this.enemySprites.has(e.id)) {
          const sprite = this.add.image(px, py, e.tier).setDisplaySize(TILE_SIZE - 8, TILE_SIZE - 8).setDepth(8);
          this.enemySprites.set(e.id, sprite);
        }
        const sprite = this.enemySprites.get(e.id)!;
        if (sprite.texture.key !== e.tier) sprite.setTexture(e.tier);
        sprite.setPosition(px, py).setVisible(true);
      } else {
        // Texture missing — colored rectangle fallback (always visible)
        this.enemySprites.get(e.id)?.setVisible(false);
        if (!this.enemyFallback.has(e.id)) {
          const g = this.add.graphics();
          const col = ENEMY_COLORS[e.tier] ?? 0xff0000;
          const sz = TILE_SIZE - 8;
          g.fillStyle(col, 0.9);
          g.fillRect(-sz / 2, -sz / 2, sz, sz);
          g.lineStyle(1, 0xffffff, 0.4);
          g.strokeRect(-sz / 2, -sz / 2, sz, sz);
          g.setDepth(8);
          this.enemyFallback.set(e.id, g);
        }
        this.enemyFallback.get(e.id)!.setPosition(px, py).setVisible(true);
      }

      // HP bar above sprite
      const barW = TILE_SIZE - 8;
      const barX = px - barW / 2;
      const barY = py - TILE_SIZE / 2 - 4;
      if (!this.enemyHpBars.has(e.id)) {
        const bg = this.add.rectangle(barX + barW / 2, barY, barW, 2, 0x333333).setDepth(9);
        const fill = this.add.rectangle(barX + barW / 2, barY, barW, 2, 0xef4444).setDepth(9);
        this.enemyHpBars.set(e.id, { bg, fill });
      }
      const bar = this.enemyHpBars.get(e.id)!;
      bar.bg.setVisible(true);
      bar.fill.setVisible(true);
      const ratio = e.maxHp > 0 ? e.hp / e.maxHp : 0;
      bar.fill.setPosition(barX + (ratio * barW) / 2, barY);
      bar.fill.setSize(ratio * barW, 2);
    }
    // Hide everything for enemies no longer in the list
    for (const [id, sprite] of this.enemySprites) {
      if (!seen.has(id)) {
        sprite.setVisible(false);
        const bar = this.enemyHpBars.get(id);
        if (bar) { bar.bg.setVisible(false); bar.fill.setVisible(false); }
      }
    }
    for (const [id, g] of this.enemyFallback) {
      if (!seen.has(id)) g.setVisible(false);
    }
  }

  private updateBosses(bossInstances: Partial<Record<AgentId, { position: { x: number; y: number }; hp: number; maxHp: number; phase: number; isAlive: boolean }>>) {
    const seen = new Set<string>();
    for (const [agentId, boss] of Object.entries(bossInstances)) {
      if (!boss || !boss.isAlive) {
        this.bossSprites.get(agentId)?.setVisible(false);
        continue;
      }
      seen.add(agentId);
      const px = boss.position.x * TILE_SIZE + TILE_SIZE / 2;
      const py = boss.position.y * TILE_SIZE + TILE_SIZE / 2;
      const texKey = boss.phase === 2 ? "boss_phase2" : "boss";

      if (!this.bossSprites.has(agentId)) {
        const sprite = this.add.image(px, py, texKey).setDisplaySize(TILE_SIZE * 2, TILE_SIZE * 2).setDepth(15);
        this.bossSprites.set(agentId, sprite);
      }
      const sprite = this.bossSprites.get(agentId)!;
      sprite.setPosition(px, py).setTexture(texKey).setVisible(true);

      // Boss HP bar
      const barW = TILE_SIZE * 2;
      const barX = px - barW / 2;
      const barY = py - TILE_SIZE - 8;
      if (!this.bossHpBars.has(agentId)) {
        const bg = this.add.rectangle(barX + barW / 2, barY, barW, 4, 0x333333).setDepth(16);
        const fill = this.add.rectangle(barX + barW / 2, barY, barW, 4, 0xdc2626).setDepth(17);
        this.bossHpBars.set(agentId, { bg, fill });
      }
      const { bg, fill } = this.bossHpBars.get(agentId)!;
      const ratio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
      fill.setPosition(barX + (ratio * barW) / 2, barY);
      fill.setSize(ratio * barW, 4);
      bg.setPosition(barX + barW / 2, barY);
    }
    // Hide removed boss sprites
    for (const [agentId, sprite] of this.bossSprites) {
      if (!seen.has(agentId)) sprite.setVisible(false);
    }
  }
}

// ── Agent Panel ──────────────────────────────────────────────────────────────

function AgentPanel({ id, agent }: { id: AgentId; agent: AgentState | undefined }) {
  const hpRatio = agent ? agent.combat.hp / agent.combat.maxHp : 0;
  const hpColor = hpRatio > 0.5 ? "bg-green-500" : hpRatio > 0.25 ? "bg-yellow-400" : "bg-red-500";
  const eliminated = agent?.status === "eliminated";

  const equipped = agent?.inventory?.equipped ?? {};
  const backpackCount = agent?.inventory?.backpack?.length ?? 0;
  const estus = agent?.inventory?.estusCount ?? 0;

  const kills = agent?.kills;
  const totalKills = kills ? kills.grunt + kills.brute + kills.sentinel : 0;

  return (
    <div className={`flex-1 bg-forge-panel border rounded p-2 overflow-hidden flex flex-col gap-1 ${AGENT_BG[id]} ${eliminated ? "opacity-50" : ""}`}>
      {/* Header row: portrait + name + status */}
      <div className="flex items-center gap-2">
        <img
          src={`/assets/ui/portraits/${id}_portrait.png`}
          alt={id}
          className="w-10 h-10 rounded object-cover border border-forge-border shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-bold uppercase ${AGENT_TEXT_COLORS[id]}`}>{id}</div>
          <div className="text-[10px] text-forge-dim">
            {eliminated ? "ELIMINATED" : agent?.status === "active" ? `${agent.combat.hp}/${agent.combat.maxHp} HP` : "—"}
          </div>
        </div>
        {kills && <div className="text-[10px] text-forge-dim shrink-0">{totalKills}⚔</div>}
      </div>

      {/* HP bar */}
      <div className="h-1.5 bg-forge-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${hpColor}`} style={{ width: `${hpRatio * 100}%` }} />
      </div>

      {/* Loadout row */}
      <div className="flex gap-1 flex-wrap">
        {Object.entries(equipped).map(([slot, item]) =>
          item ? (
            <div key={slot} className="flex items-center gap-0.5 bg-forge-border/30 rounded px-1 py-0.5">
              <img src={`/assets/items/${item.name}.png`} alt={item.name}
                className="w-3 h-3 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <span className="text-[9px] text-forge-dim">{item.name.replace(/_/g, " ")}</span>
            </div>
          ) : null
        )}
        {backpackCount > 0 && (
          <div className="text-[9px] text-forge-dim bg-forge-border/20 rounded px-1 py-0.5">
            +{backpackCount} bag
          </div>
        )}
        {estus > 0 && (
          <div className="text-[9px] text-yellow-400/70 bg-forge-border/20 rounded px-1 py-0.5">
            {estus}🧪
          </div>
        )}
      </div>

      {/* Reasoning text */}
      <div className="flex-1 overflow-hidden min-h-0">
        <div className="text-[10px] text-forge-dim leading-relaxed line-clamp-3 italic">
          {agent?.lastReasoning
            ? agent.lastReasoning.replace(/^\[fallback\]\s*/i, "").slice(0, 220)
            : "waiting for decision..."}
        </div>
      </div>
    </div>
  );
}

// ── Patch Card ───────────────────────────────────────────────────────────────

function PatchCard({ patch, isNew }: { patch: PatchEvent; isNew: boolean }) {
  const pct = patch.oldValue != null
    ? Math.round(((patch.newValue - patch.oldValue) / patch.oldValue) * 100)
    : null;
  return (
    <div className={`rounded border p-2 flex flex-col gap-0.5 transition-all ${isNew ? "border-yellow-400 bg-yellow-400/10" : "border-forge-border bg-forge-panel/50"}`}>
      <div className="flex items-center gap-1">
        <span className="text-yellow-400 text-[10px] font-bold">⚡ PATCH</span>
        {pct != null && (
          <span className={`text-[10px] font-bold ml-auto ${pct < 0 ? "text-red-400" : "text-green-400"}`}>
            {pct > 0 ? "+" : ""}{pct}%
          </span>
        )}
      </div>
      <div className="text-[10px] text-forge-text font-mono">{patch.key}</div>
      {patch.oldValue != null && (
        <div className="text-[10px] text-forge-dim">
          {patch.oldValue} → <span className="text-forge-text">{patch.newValue}</span>
        </div>
      )}
      <div className="text-[9px] text-forge-dim italic leading-tight mt-0.5">
        "{patch.reason?.slice(0, 80)}"
      </div>
    </div>
  );
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ id, score, maxScore, status }: { id: AgentId; score: number; maxScore: number; status?: string }) {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  const eliminated = status === "eliminated";
  return (
    <div className={`flex items-center gap-1 ${eliminated ? "opacity-40" : ""}`}>
      <span className={`text-[10px] w-20 truncate ${AGENT_TEXT_COLORS[id]}`}>{id}</span>
      <div className="flex-1 h-1.5 bg-forge-border rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${ratio * 100}%`, backgroundColor: AGENT_COLORS[id] }} />
      </div>
      <span className="text-[10px] text-forge-dim w-6 text-right">{score}</span>
    </div>
  );
}

// ── GameView (main component) ─────────────────────────────────────────────────

export default function GameView() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<DungeonScene | null>(null);

  const [gamePayload, setGamePayload] = useState<DashboardPayload | null>(null);
  const [patches, setPatches] = useState<PatchEvent[]>([]);
  const [newPatchId, setNewPatchId] = useState<string | null>(null);

  // Derived display values
  const timerDisplay = (() => {
    const t = gamePayload?.dungeonTimer;
    if (typeof t !== "number") return "—";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  })();

  // Phaser init
  useEffect(() => {
    if (!canvasRef.current || gameRef.current) return;
    const scene = new DungeonScene();
    sceneRef.current = scene;
    scene.onPayload = setGamePayload;
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: canvasRef.current,
      width: canvasRef.current.clientWidth || 900,
      height: canvasRef.current.clientHeight || 600,
      scene,
      backgroundColor: "#111111",
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    return () => { gameRef.current?.destroy(true); gameRef.current = null; };
  }, []);

  // WebSocket — game state
  useEffect(() => {
    let ws: WebSocket | null = null;
    let retryTimer: number;

    function connect() {
      ws = new WebSocket(`ws://${location.host}/ws/game`);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          // Discrete PATCH_EVENT broadcast from broadcastPatch()
          if (msg.type === "PATCH_EVENT" && msg.patch) {
            const p = msg.patch as PatchEvent;
            const patch: PatchEvent = { ...p, timestamp: p.timestamp ?? new Date().toISOString() };
            setPatches(prev => {
              if (prev.some(x => x.timestamp === patch.timestamp)) return prev;
              return [patch, ...prev].slice(0, 10);
            });
            setNewPatchId(patch.timestamp);
            setTimeout(() => setNewPatchId(null), 2500);
            return;
          }

          // Full DashboardPayload snapshot (regular broadcast)
          const payload = msg as DashboardPayload;
          sceneRef.current?.applyPayload(payload);
          // Merge recentPatches from WS snapshot into the patch feed
          if (payload.recentPatches?.length) {
            setPatches(prev => {
              const existingKeys = new Set(prev.map(p => p.timestamp));
              const newOnes = payload.recentPatches
                .filter(p => p.timestamp && !existingKeys.has(p.timestamp!))
                .map(p => ({
                  key: p.key,
                  oldValue: p.oldValue,
                  newValue: p.newValue,
                  reason: p.reason,
                  timestamp: p.timestamp ?? new Date().toISOString(),
                }));
              if (!newOnes.length) return prev;
              return [...newOnes, ...prev].slice(0, 10);
            });
          }
        } catch { /* ignore malformed */ }
      };
      ws.onclose = () => { retryTimer = window.setTimeout(connect, 2000); };
      ws.onerror = () => ws?.close();
    }
    connect();
    return () => { clearTimeout(retryTimer); ws?.close(); };
  }, []);

  // SSE — patch events from game-events.jsonl
  useEffect(() => {
    const es = new EventSource("/api/harness-events");
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "PATCH_APPLIED") {
          const patch: PatchEvent = {
            key: event.data?.key ?? event.key ?? "unknown",
            oldValue: event.data?.oldValue ?? event.oldValue,
            newValue: event.data?.newValue ?? event.newValue,
            reason: event.data?.reason ?? event.reason ?? "",
            timestamp: event.timestamp ?? new Date().toISOString(),
          };
          setPatches(prev => [patch, ...prev].slice(0, 10));
          setNewPatchId(patch.timestamp);
          setTimeout(() => setNewPatchId(null), 2500);
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, []);

  const agents = gamePayload?.agents;
  const phase = gamePayload?.phase ?? "DUNGEON";
  const isEnded = phase === "ENDED";
  // Show finalScores in ENDED phase, otherwise show live dungeonScore
  const scores = AGENT_IDS.map(id => {
    if (isEnded) return gamePayload?.finalScores?.[id] ?? 0;
    return agents?.[id]?.dungeonScore ?? 0;
  });
  const maxScore = Math.max(...scores, 1);

  return (
    <div className="flex h-[calc(100vh-41px)] gap-2 p-2">
      {/* LEFT: Phaser game map */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between mb-1 px-1">
          <span className="text-xs text-forge-accent font-bold uppercase">{phase}</span>
          <span className="text-xs text-forge-dim">{timerDisplay}</span>
        </div>
        <div
          ref={canvasRef}
          className="flex-1 bg-forge-panel border border-forge-border rounded overflow-hidden"
        />
      </div>

      {/* CENTER: Agent thought panels */}
      <div className="w-72 flex flex-col gap-1.5 overflow-hidden">
        {AGENT_IDS.map((id) => (
          <AgentPanel key={id} id={id} agent={agents?.[id]} />
        ))}
      </div>

      {/* RIGHT: Hand of God panel */}
      <div className="w-60 bg-forge-panel border border-forge-border rounded p-2 flex flex-col gap-2 overflow-hidden">
        <div className="text-xs font-bold uppercase text-forge-accent">⚡ Hand of God</div>

        {/* Scorecard */}
        <div className="flex flex-col gap-1">
          <div className="text-[10px] text-forge-dim uppercase tracking-wide">
            {isEnded ? "Final Score" : "Score"}
          </div>
          {AGENT_IDS.map((id, i) => (
            <ScoreBar key={id} id={id} score={scores[i]} maxScore={maxScore} status={agents?.[id]?.status} />
          ))}
        </div>

        {/* Patch feed */}
        <div className="flex flex-col gap-1 flex-1 min-h-0 overflow-hidden">
          <div className="text-[10px] text-forge-dim uppercase tracking-wide">Patches Applied</div>
          <div className="flex-1 overflow-y-auto flex flex-col gap-1">
            {patches.length === 0 ? (
              <div className="text-forge-dim text-[10px]">watching game state...</div>
            ) : (
              patches.map((p, i) => (
                <PatchCard key={p.timestamp + i} patch={p} isNew={p.timestamp === newPatchId} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
