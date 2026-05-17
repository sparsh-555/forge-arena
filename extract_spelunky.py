#!/usr/bin/env python3
"""
Extract Spelunky Classic HD assets → forge-arena public/assets/.
Run from repo root: python3 extract_spelunky.py

Assets © 2008-2009 Derek Yu / Mossmouth (Spelunky User License v1.1b).
Usage: learning, entertainment, Spelunky community sharing.
"""
import os
import re
import json
from PIL import Image, ImageDraw

SPELUNKY_DIR = "/tmp/spelunky-hd/sprites"
ASSETS_BASE = os.path.join(os.path.dirname(__file__), "game-server", "public", "assets")


def load_yy(sprite_name: str) -> dict:
    path = os.path.join(SPELUNKY_DIR, sprite_name, f"{sprite_name}.yy")
    raw = open(path).read()
    raw = re.sub(r",(\s*[}\]])", r"\1", raw)
    return json.loads(raw)


def get_frame_paths(sprite_name: str) -> list[str]:
    yy = load_yy(sprite_name)
    paths = []
    for frame in yy.get("frames", []):
        p = os.path.join(SPELUNKY_DIR, sprite_name, f"{frame['name']}.png")
        if os.path.exists(p):
            paths.append(p)
    return paths


def extract_frames(sprite_name: str, out_dir: str, names: list[str], scale: int = 2) -> int:
    os.makedirs(out_dir, exist_ok=True)
    paths = get_frame_paths(sprite_name)
    if not paths:
        print(f"  WARN: no frames for {sprite_name}")
        return 0
    for i, name in enumerate(names):
        src = paths[i] if i < len(paths) else paths[-1]
        img = Image.open(src).convert("RGBA")
        if scale != 1:
            img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
        img.save(os.path.join(out_dir, name))
    return len(paths)


def make_portrait(idle_sprite: str, out_path: str, border_rgb: tuple, char_scale: int = 14) -> None:
    paths = get_frame_paths(idle_sprite)
    if not paths:
        print(f"  WARN: no frames for {idle_sprite}")
        return
    src = Image.open(paths[0]).convert("RGBA")
    char_w = src.width * char_scale
    char_h = src.height * char_scale
    char_img = src.resize((char_w, char_h), Image.NEAREST)

    canvas = 256
    portrait = Image.new("RGBA", (canvas, canvas), (18, 18, 28, 255))
    x = (canvas - char_w) // 2
    y = (canvas - char_h) // 2
    portrait.paste(char_img, (x, y), char_img)

    draw = ImageDraw.Draw(portrait)
    r, g, b = border_rgb
    for bw in range(7):
        alpha = min(255, 180 + bw * 11)
        draw.rectangle([bw, bw, canvas - 1 - bw, canvas - 1 - bw], outline=(r, g, b, alpha))

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    portrait.save(out_path)


def copy_tile(sprite_name: str, out_name: str, scale: int = 2, fixed_size: tuple | None = None) -> None:
    out_dir = os.path.join(ASSETS_BASE, "tiles")
    os.makedirs(out_dir, exist_ok=True)
    paths = get_frame_paths(sprite_name)
    if not paths:
        print(f"  WARN: no frames for {sprite_name}")
        return
    img = Image.open(paths[0]).convert("RGBA")
    if fixed_size:
        img = img.resize(fixed_size, Image.NEAREST)
    elif scale != 1:
        img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    img.save(os.path.join(out_dir, out_name))


def main() -> None:
    print("=== Agents ===")
    agent_cfgs = {
        "aggressive":  {"idle": "sTunnelLeft",    "run": "sTunnelRunL",       "run_n": 6, "color": (210, 60,  60)},
        "cautious":    {"idle": "sVampireLeft",   "run": "sVampireRunL",      "run_n": 6, "color": (70,  110, 230)},
        "hoarder":     {"idle": "sShopLeft",      "run": "sShopRunLeft",      "run_n": 6, "color": (210, 170, 40)},
        "speedrunner": {"idle": "sSkeletonLeft",  "run": "sSkeletonWalkLeft", "run_n": 5, "color": (60,  210, 90)},
    }
    for agent_id, cfg in agent_cfgs.items():
        out_dir = os.path.join(ASSETS_BASE, "agents", agent_id)
        extract_frames(cfg["idle"], out_dir, ["idle.png"])
        extract_frames(cfg["run"],  out_dir, [f"run_{i}.png" for i in range(cfg["run_n"])])
        portrait_path = os.path.join(ASSETS_BASE, "ui", "portraits", f"{agent_id}_portrait.png")
        make_portrait(cfg["idle"], portrait_path, cfg["color"])
        print(f"  {agent_id}: idle + {cfg['run_n']} run frames + portrait")

    print("\n=== Enemies ===")
    enemy_cfgs = {
        "grunt":      {"idle": "sCavemanLeft",  "run": "sCavemanRunLeft",  "run_n": 4},
        "brute":      {"idle": "sYetiLeft",     "run": "sYetiRunLeft",     "run_n": 4},
        "sentinel":   {"idle": "sMagmaManLeft", "run": "sMagmaManWalkL",   "run_n": 4},
        "hex_caster": {"idle": "sAlienFront",   "run": "sAlienFront",      "run_n": 1},
        "shade":      {"idle": "sBatLeft",      "run": "sBatLeft",         "run_n": 3},
    }
    for tier, cfg in enemy_cfgs.items():
        out_dir = os.path.join(ASSETS_BASE, "enemies", tier)
        extract_frames(cfg["idle"], out_dir, ["idle.png"])
        extract_frames(cfg["run"],  out_dir, [f"run_{i}.png" for i in range(cfg["run_n"])])
        print(f"  {tier}: idle + {cfg['run_n']} run frames")

    print("\n=== Tiles ===")
    tile_map = [
        ("sCaveBG",         "floor.png",        2),
        ("sBlock",          "wall.png",          2),
        ("sCaveLeft",       "door.png",          2),
        ("sCaveBGEntrance", "boss_entrance.png", 2),
        ("sChest",          "chest.png",         2),
        ("sChestOpen",      "chest_open.png",    2),
        ("sCaveBG1",        "arena_floor.png",   2),
        ("sCaveTop",        "wall_top.png",      2),
        ("sCaveBottom",     "wall_side.png",     2),
        ("sCaveRight",      "wall_corner.png",   2),
        ("sCaveBG2",        "floor_cracked.png", 2),
        ("sCaveBG2",        "floor_mossy.png",   2),
        ("sCaveUp",         "wall_torch.png",    2),
    ]
    for sprite_name, out_name, scale in tile_map:
        try:
            copy_tile(sprite_name, out_name, scale=scale)
            print(f"  {sprite_name} → {out_name}")
        except Exception as e:
            print(f"  WARN {sprite_name}: {e}")

    print("\n=== Boss (Olmec) ===")
    boss_dir = os.path.join(ASSETS_BASE, "boss")
    os.makedirs(boss_dir, exist_ok=True)
    olmec_paths = get_frame_paths("sOlmec")
    if olmec_paths:
        img = Image.open(olmec_paths[0]).convert("RGBA")
        img.save(os.path.join(boss_dir, "boss.png"))
        img.save(os.path.join(boss_dir, "boss_phase2.png"))
        print(f"  sOlmec ({img.size}) → boss.png, boss_phase2.png")

    print("\nDone.")


if __name__ == "__main__":
    main()
