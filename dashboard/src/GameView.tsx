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

const TILE_SIZE = 32;

// Animation frame counts per character
const AGENT_RUN_FRAMES: Record<string, number> = {
  aggressive: 6, cautious: 6, hoarder: 6, speedrunner: 5,
};
const ENEMY_RUN_FRAMES: Record<string, number> = {
  grunt: 4, brute: 4, sentinel: 4, hex_caster: 1, shade: 3,
};

const TWEEN_MS = 380; // must be < round_interval_ms (600ms replay / 1000ms normal)

// ── Phaser Scene ─────────────────────────────────────────────────────────────

class DungeonScene extends Phaser.Scene {
  private tileSprites: Map<string, Phaser.GameObjects.Image> = new Map();

  private agentSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private agentHpBars: Map<string, { bg: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle }> = new Map();
  private agentPrevPos: Map<string, { x: number; y: number }> = new Map();

  private enemySprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private enemyFallback: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private enemyHpBars: Map<string, { bg: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle }> = new Map();
  private enemyPrevPos: Map<string, { x: number; y: number }> = new Map();

  private bossSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private bossHpBars: Map<string, { bg: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle }> = new Map();

  private initialized = false;
  private sceneReady = false;
  private pendingPayload: DashboardPayload | null = null;
  public onPayload?: (payload: DashboardPayload) => void;

  constructor() {
    super({ key: "DungeonScene" });
  }

  preload() {
    this.load.on("loaderror", (file: { key: string; src: string }) => {
      console.warn(`[Phaser] texture load failed: ${file.key}`);
    });

    // Tile textures
    const tileTypes = [
      "floor", "wall", "wall_top", "wall_side", "wall_corner", "door",
      "boss_entrance", "arena_floor", "chest", "chest_open",
      "floor_cracked", "floor_mossy", "wall_torch",
    ];
    tileTypes.forEach(t => this.load.image(t, `/assets/tiles/${t}.png`));

    // Agent sprites — idle + run frames
    for (const id of AGENT_IDS) {
      this.load.image(`${id}_idle`, `/assets/agents/${id}/idle.png`);
      const n = AGENT_RUN_FRAMES[id] ?? 6;
      for (let i = 0; i < n; i++) {
        this.load.image(`${id}_run_${i}`, `/assets/agents/${id}/run_${i}.png`);
      }
    }

    // Enemy sprites — idle + run frames
    for (const [tier, n] of Object.entries(ENEMY_RUN_FRAMES)) {
      this.load.image(`${tier}_idle`, `/assets/enemies/${tier}/idle.png`);
      for (let i = 0; i < n; i++) {
        this.load.image(`${tier}_run_${i}`, `/assets/enemies/${tier}/run_${i}.png`);
      }
    }

    // Boss
    this.load.image("boss",        "/assets/boss/boss.png");
    this.load.image("boss_phase2", "/assets/boss/boss_phase2.png");
  }

  create() {
    this.cameras.main.setBackgroundColor("#0a0a0f");

    // Agent walk animations
    for (const id of AGENT_IDS) {
      const n = AGENT_RUN_FRAMES[id] ?? 6;
      this.anims.create({
        key: `${id}_walk`,
        frames: Array.from({ length: n }, (_, i) => ({ key: `${id}_run_${i}` })),
        frameRate: 8,
        repeat: -1,
      });
    }

    // Enemy walk animations (skip hex_caster — single frame)
    for (const [tier, n] of Object.entries(ENEMY_RUN_FRAMES)) {
      if (n < 2) continue;
      this.anims.create({
        key: `${tier}_walk`,
        frames: Array.from({ length: n }, (_, i) => ({ key: `${tier}_run_${i}` })),
        frameRate: 6,
        repeat: -1,
      });
    }

    this.sceneReady = true;
    if (this.pendingPayload) {
      this.applyPayload(this.pendingPayload);
      this.pendingPayload = null;
    }
  }

  update() {
    // HP bars track their sprites through tweens
    const agBarW = TILE_SIZE - 4;
    const agBarOffY = TILE_SIZE / 2 + 5;
    for (const [id, sprite] of this.agentSprites) {
      const bar = this.agentHpBars.get(id);
      if (!bar || !sprite.active) continue;
      const ratio: number = bar.fill.getData("hp") ?? 1;
      const color: number = bar.fill.getData("color") ?? 0x22c55e;
      bar.bg.setPosition(sprite.x, sprite.y - agBarOffY);
      bar.fill
        .setFillStyle(color)
        .setSize(ratio * agBarW, 3)
        .setPosition(sprite.x - agBarW / 2 + (ratio * agBarW) / 2, sprite.y - agBarOffY);
    }

    const enBarW = TILE_SIZE - 8;
    const enBarOffY = TILE_SIZE / 2 + 4;
    for (const [id, sprite] of this.enemySprites) {
      const bar = this.enemyHpBars.get(id);
      if (!bar || !sprite.active || !sprite.visible) continue;
      const ratio: number = bar.fill.getData("hp") ?? 1;
      bar.bg.setPosition(sprite.x, sprite.y - enBarOffY);
      bar.fill
        .setSize(ratio * enBarW, 2)
        .setPosition(sprite.x - enBarW / 2 + (ratio * enBarW) / 2, sprite.y - enBarOffY);
    }

    // Enemy fallback graphics (rare — when texture missing)
    for (const [id, g] of this.enemyFallback) {
      if (!g.visible) continue;
      const sprite = this.enemySprites.get(id);
      if (sprite && sprite.visible) {
        g.setPosition(sprite.x, sprite.y);
      }
    }
  }

  applyPayload(payload: DashboardPayload) {
    if (!this.sceneReady) { this.pendingPayload = payload; return; }

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
        const key = `${x},${y}`;
        const px = x * TILE_SIZE + TILE_SIZE / 2;
        const py = y * TILE_SIZE + TILE_SIZE / 2;
        const texKey = tile.type === "wall" ? "wall" : tile.type;
        const existing = this.tileSprites.get(key);
        if (existing) {
          existing.setTexture(texKey);
        } else {
          const img = this.add.image(px, py, texKey).setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(0);
          this.tileSprites.set(key, img);
        }
      }
    }
  }

  private updateAgents(agents: Record<AgentId, AgentState>, _phase: string) {
    for (const id of AGENT_IDS) {
      const agent = agents[id];
      if (!agent) continue;

      const newGridX = agent.position.x;
      const newGridY = agent.position.y;
      const newPx = newGridX * TILE_SIZE + TILE_SIZE / 2;
      const newPy = newGridY * TILE_SIZE + TILE_SIZE / 2;

      if (!this.agentSprites.has(id)) {
        const sprite = this.add.sprite(newPx, newPy, `${id}_idle`);
        sprite.setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(10);
        this.agentSprites.set(id, sprite);
        this.agentPrevPos.set(id, { x: newGridX, y: newGridY });

        // Create HP bar
        const bg   = this.add.rectangle(newPx, newPy, TILE_SIZE - 4, 3, 0x222222).setDepth(11);
        const fill = this.add.rectangle(newPx, newPy, TILE_SIZE - 4, 3, 0x22c55e).setDepth(12);
        fill.setData("hp", 1).setData("color", 0x22c55e);
        this.agentHpBars.set(id, { bg, fill });
      }

      const sprite = this.agentSprites.get(id)!;
      sprite.setAlpha(agent.status === "eliminated" ? 0.3 : 1.0);

      const prev = this.agentPrevPos.get(id)!;
      const moved = prev.x !== newGridX || prev.y !== newGridY;

      if (moved && agent.status !== "eliminated") {
        const dx = newGridX - prev.x;
        if (dx !== 0) sprite.setFlipX(dx > 0);
        sprite.anims.play(`${id}_walk`, true);
        this.tweens.killTweensOf(sprite);
        this.tweens.add({
          targets: sprite,
          x: newPx,
          y: newPy,
          duration: TWEEN_MS,
          ease: "Linear",
          onComplete: () => {
            sprite.anims.stop();
            sprite.setTexture(`${id}_idle`);
          },
        });
      } else if (!this.tweens.isTweening(sprite)) {
        sprite.setPosition(newPx, newPy);
      }

      this.agentPrevPos.set(id, { x: newGridX, y: newGridY });

      // Update HP bar data (update() will reposition)
      const { fill } = this.agentHpBars.get(id)!;
      const ratio = agent.combat.maxHp > 0 ? agent.combat.hp / agent.combat.maxHp : 0;
      const color = ratio > 0.5 ? 0x22c55e : ratio > 0.25 ? 0xfacc15 : 0xef4444;
      fill.setData("hp", ratio).setData("color", color);
    }
  }

  private updateEnemies(enemies: EnemyState[]) {
    const FALLBACK_COLORS: Record<string, number> = {
      grunt: 0x888899, brute: 0xcc4400, sentinel: 0x4488cc,
      hex_caster: 0x9933cc, shade: 0x44aa55,
    };

    const seen = new Set<string>();
    for (const e of enemies) {
      if (!e.isAlive) {
        const s = this.enemySprites.get(e.id);
        if (s) s.setVisible(false);
        this.enemyFallback.get(e.id)?.setVisible(false);
        const bar = this.enemyHpBars.get(e.id);
        if (bar) { bar.bg.setVisible(false); bar.fill.setVisible(false); }
        continue;
      }
      seen.add(e.id);

      const newGridX = e.position.x;
      const newGridY = e.position.y;
      const newPx = newGridX * TILE_SIZE + TILE_SIZE / 2;
      const newPy = newGridY * TILE_SIZE + TILE_SIZE / 2;
      const idleKey = `${e.tier}_idle`;
      const texLoaded = this.textures.exists(idleKey);

      if (!this.enemySprites.has(e.id)) {
        const texKey = texLoaded ? idleKey : "__MISSING";
        const sprite = this.add.sprite(newPx, newPy, texKey);
        sprite.setDisplaySize(TILE_SIZE - 6, TILE_SIZE - 6).setDepth(8);
        if (!texLoaded) {
          // Fallback colored rect while texture loads
          const g = this.add.graphics().setDepth(8);
          const col = FALLBACK_COLORS[e.tier] ?? 0xff0000;
          const sz = TILE_SIZE - 8;
          g.fillStyle(col, 0.9).fillRect(-sz / 2, -sz / 2, sz, sz);
          g.lineStyle(1, 0xffffff, 0.3).strokeRect(-sz / 2, -sz / 2, sz, sz);
          this.enemyFallback.set(e.id, g);
        }
        this.enemySprites.set(e.id, sprite);
        this.enemyPrevPos.set(e.id, { x: newGridX, y: newGridY });

        // HP bar
        const bg   = this.add.rectangle(newPx, newPy, TILE_SIZE - 8, 2, 0x222222).setDepth(9);
        const fill = this.add.rectangle(newPx, newPy, TILE_SIZE - 8, 2, 0xef4444).setDepth(9);
        fill.setData("hp", 1);
        this.enemyHpBars.set(e.id, { bg, fill });
      }

      const sprite = this.enemySprites.get(e.id)!;
      sprite.setVisible(true);
      this.enemyFallback.get(e.id)?.setVisible(!texLoaded);

      // Swap to loaded texture if it wasn't ready at creation
      if (texLoaded && sprite.texture.key !== idleKey && !sprite.anims.isPlaying) {
        sprite.setTexture(idleKey);
      }

      const prev = this.enemyPrevPos.get(e.id)!;
      const moved = prev.x !== newGridX || prev.y !== newGridY;

      if (moved) {
        const dx = newGridX - prev.x;
        if (dx !== 0) sprite.setFlipX(dx > 0);
        const walkKey = `${e.tier}_walk`;
        if (this.anims.exists(walkKey)) sprite.anims.play(walkKey, true);
        this.tweens.killTweensOf(sprite);
        this.tweens.add({
          targets: sprite,
          x: newPx,
          y: newPy,
          duration: TWEEN_MS,
          ease: "Linear",
          onComplete: () => {
            sprite.anims.stop();
            if (texLoaded) sprite.setTexture(idleKey);
          },
        });
      } else if (!this.tweens.isTweening(sprite)) {
        sprite.setPosition(newPx, newPy);
      }

      this.enemyPrevPos.set(e.id, { x: newGridX, y: newGridY });

      // Update HP bar data
      const { bg, fill } = this.enemyHpBars.get(e.id)!;
      const ratio = e.maxHp > 0 ? e.hp / e.maxHp : 0;
      fill.setData("hp", ratio);
      bg.setVisible(true);
      fill.setVisible(true);
    }

    // Hide sprites for enemies no longer present
    for (const [id, sprite] of this.enemySprites) {
      if (!seen.has(id)) {
        sprite.setVisible(false);
        this.enemyFallback.get(id)?.setVisible(false);
        const bar = this.enemyHpBars.get(id);
        if (bar) { bar.bg.setVisible(false); bar.fill.setVisible(false); }
      }
    }
  }

  private updateBosses(bossInstances: Partial<Record<AgentId, {
    position: { x: number; y: number }; hp: number; maxHp: number; phase: number; isAlive: boolean;
  }>>) {
    const seen = new Set<string>();
    for (const [agentId, boss] of Object.entries(bossInstances)) {
      if (!boss?.isAlive) { this.bossSprites.get(agentId)?.setVisible(false); continue; }
      seen.add(agentId);

      const px = boss.position.x * TILE_SIZE + TILE_SIZE / 2;
      const py = boss.position.y * TILE_SIZE + TILE_SIZE / 2;
      const texKey = boss.phase === 2 ? "boss_phase2" : "boss";

      if (!this.bossSprites.has(agentId)) {
        const sprite = this.add.image(px, py, texKey).setDisplaySize(TILE_SIZE * 2, TILE_SIZE * 2).setDepth(15);
        this.bossSprites.set(agentId, sprite);
        const barW = TILE_SIZE * 2;
        const barY = py - TILE_SIZE - 8;
        const bg   = this.add.rectangle(px, barY, barW, 4, 0x222222).setDepth(16);
        const fill = this.add.rectangle(px - barW / 2, barY, barW, 4, 0xdc2626).setDepth(17);
        fill.setOrigin(0, 0.5);
        fill.setData("hp", 1);
        this.bossHpBars.set(agentId, { bg, fill });
      }

      const sprite = this.bossSprites.get(agentId)!;
      sprite.setPosition(px, py).setTexture(texKey).setVisible(true);

      const { bg, fill } = this.bossHpBars.get(agentId)!;
      const ratio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
      const barW = TILE_SIZE * 2;
      const barY = py - TILE_SIZE - 8;
      bg.setPosition(px, barY);
      fill.setPosition(px - barW / 2, barY).setSize(ratio * barW, 4).setData("hp", ratio);
    }

    for (const [agentId, sprite] of this.bossSprites) {
      if (!seen.has(agentId)) sprite.setVisible(false);
    }
  }
}

// ── Agent Panel ───────────────────────────────────────────────────────────────

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
      <div className="flex items-center gap-2">
        <img
          src={`/assets/ui/portraits/${id}_portrait.png`}
          alt={id}
          className="w-10 h-10 rounded object-cover border border-forge-border shrink-0"
          style={{ imageRendering: "pixelated" }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-bold uppercase ${AGENT_TEXT_COLORS[id]}`}>{id}</div>
          <div className="text-[10px] text-forge-dim">
            {eliminated ? "ELIMINATED" : agent ? `${agent.combat.hp}/${agent.combat.maxHp} HP` : "—"}
          </div>
        </div>
        {kills && <div className="text-[10px] text-forge-dim shrink-0">{totalKills}⚔</div>}
      </div>

      <div className="h-1.5 bg-forge-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${hpColor}`} style={{ width: `${hpRatio * 100}%` }} />
      </div>

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
          <div className="text-[9px] text-forge-dim bg-forge-border/20 rounded px-1 py-0.5">+{backpackCount} bag</div>
        )}
        {estus > 0 && (
          <div className="text-[9px] text-yellow-400/70 bg-forge-border/20 rounded px-1 py-0.5">{estus}🧪</div>
        )}
      </div>

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

// ── Patch Card ────────────────────────────────────────────────────────────────

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
        <div className="text-[10px] text-forge-dim">{patch.oldValue} → <span className="text-forge-text">{patch.newValue}</span></div>
      )}
      <div className="text-[9px] text-forge-dim italic leading-tight mt-0.5">
        "{patch.reason?.slice(0, 80)}"
      </div>
    </div>
  );
}

// ── Score Bar ─────────────────────────────────────────────────────────────────

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

// ── GameView ──────────────────────────────────────────────────────────────────

export default function GameView() {
  const canvasRef  = useRef<HTMLDivElement>(null);
  const gameRef    = useRef<Phaser.Game | null>(null);
  const sceneRef   = useRef<DungeonScene | null>(null);

  const [gamePayload, setGamePayload] = useState<DashboardPayload | null>(null);
  const [patches, setPatches] = useState<PatchEvent[]>([]);
  const [newPatchId, setNewPatchId] = useState<string | null>(null);

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
      width:  canvasRef.current.clientWidth  || 900,
      height: canvasRef.current.clientHeight || 600,
      scene,
      backgroundColor: "#0a0a0f",
      pixelArt: true,          // nearest-neighbour scaling — keeps Spelunky sprites crisp
      antialias: false,
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
          if (msg.type === "PATCH_EVENT" && msg.patch) {
            const p = msg.patch as PatchEvent;
            const patch: PatchEvent = { ...p, timestamp: p.timestamp ?? new Date().toISOString() };
            setPatches(prev => prev.some(x => x.timestamp === patch.timestamp) ? prev : [patch, ...prev].slice(0, 10));
            setNewPatchId(patch.timestamp);
            setTimeout(() => setNewPatchId(null), 2500);
            return;
          }
          const payload = msg as DashboardPayload;
          sceneRef.current?.applyPayload(payload);
          if (payload.recentPatches?.length) {
            setPatches(prev => {
              const existing = new Set(prev.map(p => p.timestamp));
              const newOnes = payload.recentPatches
                .filter(p => p.timestamp && !existing.has(p.timestamp!))
                .map(p => ({ key: p.key, oldValue: p.oldValue, newValue: p.newValue, reason: p.reason, timestamp: p.timestamp! }));
              return newOnes.length ? [...newOnes, ...prev].slice(0, 10) : prev;
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

  // SSE — patch events
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

  const agents   = gamePayload?.agents;
  const phase    = gamePayload?.phase ?? "DUNGEON";
  const isEnded  = phase === "ENDED";
  const scores   = AGENT_IDS.map(id =>
    isEnded ? gamePayload?.finalScores?.[id] ?? 0 : agents?.[id]?.dungeonScore ?? 0
  );
  const maxScore = Math.max(...scores, 1);

  return (
    <div className="flex h-[calc(100vh-41px)] gap-2 p-2">
      {/* LEFT: Phaser map */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between mb-1 px-1">
          <span className="text-xs text-forge-accent font-bold uppercase">{phase}</span>
          <span className="text-xs text-forge-dim">{timerDisplay}</span>
        </div>
        <div ref={canvasRef} className="flex-1 bg-forge-panel border border-forge-border rounded overflow-hidden" />
      </div>

      {/* CENTER: Agent panels */}
      <div className="w-72 flex flex-col gap-1.5 overflow-hidden">
        {AGENT_IDS.map(id => <AgentPanel key={id} id={id} agent={agents?.[id]} />)}
      </div>

      {/* RIGHT: Hand of God */}
      <div className="w-60 bg-forge-panel border border-forge-border rounded p-2 flex flex-col gap-2 overflow-hidden">
        <div className="text-xs font-bold uppercase text-forge-accent">⚡ Hand of God</div>
        <div className="flex flex-col gap-1">
          <div className="text-[10px] text-forge-dim uppercase tracking-wide">
            {isEnded ? "Final Score" : "Score"}
          </div>
          {AGENT_IDS.map((id, i) => (
            <ScoreBar key={id} id={id} score={scores[i]} maxScore={maxScore} status={agents?.[id]?.status} />
          ))}
        </div>
        <div className="flex flex-col gap-1 flex-1 min-h-0 overflow-hidden">
          <div className="text-[10px] text-forge-dim uppercase tracking-wide">Patches Applied</div>
          <div className="flex-1 overflow-y-auto flex flex-col gap-1">
            {patches.length === 0
              ? <div className="text-forge-dim text-[10px]">watching game state...</div>
              : patches.map((p, i) => <PatchCard key={p.timestamp + i} patch={p} isNew={p.timestamp === newPatchId} />)
            }
          </div>
        </div>
      </div>
    </div>
  );
}
