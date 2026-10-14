#!/usr/bin/env python3
"""
Generate the Faithful 64x texture pack for Minecraft in Browser.
Faithful 64x enhances default 16x vanilla textures into 64x64 HD textures,
preserving 100% of the vanilla palette, spatial layout, and design while
adding authentic sub-pixel wood grain, stone noise, grass blades, bark striations,
cobblestone mortar bevels, and crisp transparency.
"""

import os
import math
import random
from PIL import Image, ImageFilter

SRC_DIR = os.path.join("public", "assets", "blocks")
DEST_DIR = os.path.join("public", "assets", "packs", "faithful_64x")
os.makedirs(DEST_DIR, exist_ok=True)

# Pseudo-random noise generator with fixed seed for determinism
def make_noise(seed, x, y):
    n = (x * 374761393 + y * 668265263 + seed * 1013904223) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0

def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(v)))

def enhance_texture(filename):
    src_path = os.path.join(SRC_DIR, filename)
    if not os.path.exists(src_path):
        return None

    src = Image.open(src_path).convert('RGBA')
    w, h = src.size
    # Ensure square frame if animation strip
    frame_h = min(w, h)
    if w != 16 or frame_h != 16:
        src = src.crop((0, 0, frame_h, frame_h)).resize((16, 16), Image.Resampling.NEAREST)

    # 1. Base upsampling: 4x bicubic for smooth gradients + 4x nearest for sharp edges
    bicubic = src.resize((64, 64), Image.Resampling.BICUBIC)
    nearest = src.resize((64, 64), Image.Resampling.NEAREST)

    out = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    n_lower = filename.lower()

    # Classify material
    is_birch_log = 'birch_log' in n_lower and 'top' not in n_lower
    is_log_side = ('_log.png' in n_lower or '_wood.png' in n_lower) and 'top' not in n_lower and not is_birch_log
    is_log_top = '_log_top' in n_lower or '_wood_top' in n_lower
    is_planks = '_planks' in n_lower
    is_grass_top = 'grass_block_top' in n_lower
    is_grass_side = 'grass_block_side' in n_lower and 'overlay' not in n_lower
    is_dirt = 'dirt' in n_lower and 'path' not in n_lower and 'grass' not in n_lower
    is_leaves = 'leaves' in n_lower
    is_cobblestone = 'cobblestone' in n_lower
    is_stone_bricks = 'stone_bricks' in n_lower
    is_stone = ('stone.png' in n_lower or 'deepslate' in n_lower or 'andesite' in n_lower or 'diorite' in n_lower or 'granite' in n_lower) and not is_cobblestone and not is_stone_bricks
    is_ore = '_ore' in n_lower
    is_glass = 'glass' in n_lower and 'tinted' not in n_lower
    is_sand = 'sand' in n_lower
    is_door_or_trapdoor = 'door' in n_lower

    seed = sum(ord(c) for c in filename)

    for y in range(64):
        src_y = y // 4
        sub_y = y % 4
        for x in range(64):
            src_x = x // 4
            sub_x = x % 4

            # Base pixel colors
            nr_r, nr_g, nr_b, nr_a = nearest.getpixel((x, y))
            bi_r, bi_g, bi_b, bi_a = bicubic.getpixel((x, y))

            if nr_a == 0 and not is_glass:
                out.putpixel((x, y), (0, 0, 0, 0))
                continue

            # Standard blend: 65% nearest (preserves vanilla block look) + 35% bicubic (soft transitions)
            base_r = nr_r * 0.65 + bi_r * 0.35
            base_g = nr_g * 0.65 + bi_g * 0.35
            base_b = nr_b * 0.65 + bi_b * 0.35
            base_a = nr_a

            r, g, b, a = base_r, base_g, base_b, base_a

            # --- 1. BIRCH LOG (Authentic horizontal paper-bark striations & dark lenticels) ---
            if is_birch_log:
                lum = (nr_r * 0.299 + nr_g * 0.587 + nr_b * 0.114)
                if lum < 80:
                    # Dark lenticel / mark
                    depth = make_noise(seed, x, y) * 16 - 8
                    r = clamp(nr_r * 0.8 + depth)
                    g = clamp(nr_g * 0.8 + depth)
                    b = clamp(nr_b * 0.8 + depth + 4)
                else:
                    # White bark with fine horizontal paper striations
                    h_band = math.sin(y * 1.8 + make_noise(seed, x // 8, y) * 2.5) * 6
                    h_fiber = (make_noise(seed + 1, x, y // 2) - 0.5) * 8
                    # Edge transition to dark lenticel
                    edge_shadow = 0
                    if x > 0 and (nearest.getpixel((x - 1, y))[0] < 80): edge_shadow -= 14
                    if x < 63 and (nearest.getpixel((x + 1, y))[0] < 80): edge_shadow -= 14
                    if y > 0 and (nearest.getpixel((x, y - 1))[0] < 80): edge_shadow -= 14
                    if y < 63 and (nearest.getpixel((x, y + 1))[0] < 80): edge_shadow -= 14

                    r = clamp(base_r + h_band + h_fiber + edge_shadow)
                    g = clamp(base_g + h_band * 0.95 + h_fiber * 0.95 + edge_shadow)
                    b = clamp(base_b + h_band * 0.9 + h_fiber * 0.9 + edge_shadow - 2)

            # --- 2. OAK & OTHER PLANKS (4 distinct boards, wood grain, bevel grooves) ---
            elif is_planks:
                board_idx = y // 16
                local_y = y % 16
                grain = math.sin(x * 0.25 + make_noise(seed, x // 2, board_idx) * 3.0) * 5
                sub_grain = (make_noise(seed + 2, x, y) - 0.5) * 6

                # Board bevel seam at local_y == 15 and 0
                seam_mod = 0
                if local_y == 15: seam_mod = -22 # Bottom shadow groove
                elif local_y == 14: seam_mod = -10
                elif local_y == 0: seam_mod = 12  # Top bevel highlight

                # Vertical plank seam (standard vanilla offsets: col 32 on board 0, col 48 on 1, col 16 on 2, col 40 on 3)
                v_split = [32, 48, 16, 40][board_idx]
                if abs(x - v_split) == 0: seam_mod -= 24
                elif abs(x - v_split) == 1: seam_mod -= 10

                # Subtle nail heads near plank ends
                nail = 0
                if abs(x - (v_split + 3)) <= 1 and local_y in (3, 12): nail = -20
                if abs(x - (v_split - 4)) <= 1 and local_y in (3, 12): nail = -20

                r = clamp(base_r + grain + sub_grain + seam_mod + nail)
                g = clamp(base_g + grain * 0.9 + sub_grain * 0.9 + seam_mod + nail)
                b = clamp(base_b + grain * 0.75 + sub_grain * 0.75 + seam_mod + nail)

            # --- 3. GRASS BLOCK TOP (Organic micro-blades & dense turf) ---
            elif is_grass_top:
                blade = math.sin(x * 1.5 + y * 0.8 + make_noise(seed, x, y) * 2) * 7
                micro = (make_noise(seed + 3, x, y) - 0.5) * 10
                r = clamp(base_r + blade * 0.7 + micro * 0.8)
                g = clamp(base_g + blade * 1.1 + micro * 1.2)
                b = clamp(base_b + blade * 0.5 + micro * 0.6)

            # --- 4. GRASS BLOCK SIDE (Hanging grass fringe over crumbly loam) ---
            elif is_grass_side:
                # Top hanging grass layer (top 12-16px)
                fringe_depth = 12 + int(math.sin(x * 0.5 + make_noise(seed, x, 0) * 4) * 4)
                if y < fringe_depth:
                    blade = (make_noise(seed + 4, x, y) - 0.5) * 12
                    r = clamp(base_r + blade * 0.6)
                    g = clamp(base_g + blade * 1.2)
                    b = clamp(base_b + blade * 0.5)
                else:
                    # Soil base: crumbly pebbles & loam
                    pebble = 0
                    p_noise = make_noise(seed + 5, x, y)
                    if p_noise > 0.85: pebble = 16
                    elif p_noise < 0.15: pebble = -14
                    micro = (make_noise(seed + 6, x, y) - 0.5) * 8
                    r = clamp(base_r + pebble + micro)
                    g = clamp(base_g + pebble * 0.9 + micro)
                    b = clamp(base_b + pebble * 0.8 + micro)

            # --- 5. DIRT & FARMLAND ---
            elif is_dirt:
                p_noise = make_noise(seed + 7, x, y)
                pebble = 0
                if p_noise > 0.86: pebble = 18
                elif p_noise < 0.14: pebble = -16
                micro = (make_noise(seed + 8, x, y) - 0.5) * 10
                r = clamp(base_r + pebble + micro)
                g = clamp(base_g + pebble * 0.9 + micro)
                b = clamp(base_b + pebble * 0.8 + micro)

            # --- 6. LEAVES (Lush clusters with clean cutouts & venation) ---
            elif is_leaves:
                if nr_a > 100:
                    leaf_pat = math.sin(x * 1.2 + y * 1.2) * 8
                    micro = (make_noise(seed + 9, x, y) - 0.5) * 14
                    r = clamp(base_r + leaf_pat * 0.8 + micro)
                    g = clamp(base_g + leaf_pat * 1.2 + micro * 1.2)
                    b = clamp(base_b + leaf_pat * 0.6 + micro * 0.8)
                    a = 255
                else:
                    a = 0

            # --- 7. COBBLESTONE & STONE BRICKS (Bevelled rock facets & dark mortar) ---
            elif is_cobblestone or is_stone_bricks:
                # Detect mortar crevices in 16x source
                is_edge = False
                for dx in (-1, 1):
                    for dy in (-1, 1):
                        px, py = min(63, max(0, x + dx * 2)), min(63, max(0, y + dy * 2))
                        diff = abs(nearest.getpixel((px, py))[0] - nr_r)
                        if diff > 15: is_edge = True
                crevice = -18 if is_edge else 0
                grain = (make_noise(seed + 10, x, y) - 0.5) * 12
                r = clamp(base_r + crevice + grain)
                g = clamp(base_g + crevice + grain)
                b = clamp(base_b + crevice + grain)

            # --- 8. STONE & DEEPSLATE ---
            elif is_stone:
                strata = math.sin(y * 0.4 + x * 0.2 + make_noise(seed, x // 4, y // 4) * 3) * 4
                grain = (make_noise(seed + 11, x, y) - 0.5) * 10
                r = clamp(base_r + strata + grain)
                g = clamp(base_g + strata + grain)
                b = clamp(base_b + strata + grain)

            # --- 9. LOGS (Vertical bark furrows) ---
            elif is_log_side:
                furrow = math.sin(x * 1.4 + make_noise(seed, x, y // 4) * 3) * 8
                grain = (make_noise(seed + 12, x, y) - 0.5) * 6
                r = clamp(base_r + furrow + grain)
                g = clamp(base_g + furrow * 0.9 + grain)
                b = clamp(base_b + furrow * 0.8 + grain)

            # --- 10. LOG TOP (Concentric annual rings) ---
            elif is_log_top:
                cx, cy = 31.5, 31.5
                dist = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
                ring = math.sin(dist * 0.9 + make_noise(seed, x // 2, y // 2) * 2) * 8
                grain = (make_noise(seed + 13, x, y) - 0.5) * 6
                r = clamp(base_r + ring + grain)
                g = clamp(base_g + ring * 0.9 + grain)
                b = clamp(base_b + ring * 0.8 + grain)

            # --- 11. GLASS (Sleek 2px bevel frame + diagonal sheen) ---
            elif is_glass:
                is_border = (x < 2 or x >= 62 or y < 2 or y >= 62)
                # Diagonal glare streaks
                diag1 = abs(x - y + 10) <= 1 and (12 <= x <= 30)
                diag2 = abs(x - y + 18) <= 1 and (22 <= x <= 34)
                if is_border:
                    r, g, b, a = 230, 240, 255, 200
                elif diag1 or diag2:
                    r, g, b, a = 255, 255, 255, 140
                else:
                    r, g, b, a = 255, 255, 255, 18

            # --- 12. GENERIC TEXTURE ---
            else:
                grain = (make_noise(seed + 14, x, y) - 0.5) * 8
                r = clamp(base_r + grain)
                g = clamp(base_g + grain)
                b = clamp(base_b + grain)

            out.putpixel((x, y), (r, g, b, a))

    dest_path = os.path.join(DEST_DIR, filename)
    out.save(dest_path, "PNG")
    return dest_path

def main():
    print("Generating Faithful 64x textures from vanilla 16x assets...")
    count = 0
    for f in os.listdir(SRC_DIR):
        if not f.endswith('.png'): continue
        res = enhance_texture(f)
        if res: count += 1

    print(f"Successfully generated {count} Faithful 64x textures in {DEST_DIR}!")

if __name__ == "__main__":
    main()
