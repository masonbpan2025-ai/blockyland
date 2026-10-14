"""Generate textures and icons for the post-1.21.4 missing blocks and items.
Ensures every asset is a valid 16x16 PNG with standard headers and authentic pixel art.
"""
import os
import math
from PIL import Image

BLOCKS_DIR = os.path.join("public", "assets", "blocks")
ITEMS_DIR = os.path.join("public", "assets", "items")
os.makedirs(BLOCKS_DIR, exist_ok=True)
os.makedirs(ITEMS_DIR, exist_ok=True)

WOOL_COLORS = {
    'black': (25, 25, 25),
    'blue': (53, 57, 157),
    'brown': (114, 71, 40),
    'cyan': (21, 137, 145),
    'gray': (71, 79, 82),
    'green': (84, 109, 27),
    'light_blue': (99, 135, 210),
    'light_gray': (142, 142, 134),
    'lime': (112, 185, 25),
    'magenta': (169, 48, 159),
    'orange': (240, 118, 19),
    'pink': (237, 141, 172),
    'purple': (121, 42, 172),
    'red': (160, 39, 34),
    'white': (234, 236, 237),
    'yellow': (248, 197, 39),
}

def load_or_create(path, default_color):
    if os.path.exists(path):
        return Image.open(path).convert('RGBA').resize((16, 16))
    img = Image.new('RGBA', (16, 16), default_color)
    return img

def tint_image(base_img, target_rgb, lum_weight=0.7):
    out = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    tr, tg, tb = target_rgb
    for y in range(16):
        for x in range(16):
            r, g, b, a = base_img.getpixel((x, y))
            if a == 0:
                out.putpixel((x, y), (0, 0, 0, 0))
                continue
            lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255.0
            # Blend luminance with target color
            nr = int(min(255, tr * lum * (1 + lum_weight) * 0.5 + tr * 0.5))
            ng = int(min(255, tg * lum * (1 + lum_weight) * 0.5 + tg * 0.5))
            nb = int(min(255, tb * lum * (1 + lum_weight) * 0.5 + tb * 0.5))
            out.putpixel((x, y), (nr, ng, nb, a))
    return out

def generate_assets():
    # 1. Poplar wood textures
    birch_planks = load_or_create(os.path.join(BLOCKS_DIR, "birch_planks.png"), (215, 190, 140, 255))
    birch_log = load_or_create(os.path.join(BLOCKS_DIR, "birch_log.png"), (220, 220, 210, 255))
    birch_log_top = load_or_create(os.path.join(BLOCKS_DIR, "birch_log_top.png"), (200, 180, 130, 255))
    birch_door = load_or_create(os.path.join(ITEMS_DIR, "birch_door.png"), (200, 180, 130, 255))
    birch_trapdoor = load_or_create(os.path.join(BLOCKS_DIR, "birch_trapdoor.png"), (200, 180, 130, 255))
    birch_sapling = load_or_create(os.path.join(BLOCKS_DIR, "birch_sapling.png"), (120, 180, 50, 255))
    oak_leaves = load_or_create(os.path.join(BLOCKS_DIR, "oak_leaves.png"), (80, 140, 40, 255))
    
    poplar_wood_rgb = (235, 185, 95)
    poplar_stripped_rgb = (245, 205, 120)
    
    poplar_planks = tint_image(birch_planks, poplar_wood_rgb)
    poplar_planks.save(os.path.join(BLOCKS_DIR, "poplar_planks.png"))
    
    poplar_log = tint_image(birch_log, (240, 225, 180))
    poplar_log.save(os.path.join(BLOCKS_DIR, "poplar_log.png"))
    
    poplar_log_top = tint_image(birch_log_top, poplar_wood_rgb)
    poplar_log_top.save(os.path.join(BLOCKS_DIR, "poplar_log_top.png"))
    
    poplar_stripped_log = tint_image(birch_planks, poplar_stripped_rgb)
    poplar_stripped_log.save(os.path.join(BLOCKS_DIR, "stripped_poplar_log.png"))
    poplar_stripped_log.save(os.path.join(BLOCKS_DIR, "stripped_poplar_log_top.png"))
    
    poplar_door = tint_image(birch_door, poplar_wood_rgb)
    poplar_door.save(os.path.join(BLOCKS_DIR, "poplar_door_top.png"))
    poplar_door.save(os.path.join(BLOCKS_DIR, "poplar_door_bottom.png"))
    poplar_door.save(os.path.join(ITEMS_DIR, "poplar_door.png"))
    
    poplar_trapdoor = tint_image(birch_trapdoor, poplar_wood_rgb)
    poplar_trapdoor.save(os.path.join(BLOCKS_DIR, "poplar_trapdoor.png"))
    
    poplar_sapling = tint_image(birch_sapling, (230, 175, 45))
    poplar_sapling.save(os.path.join(BLOCKS_DIR, "poplar_sapling.png"))
    poplar_sapling.save(os.path.join(ITEMS_DIR, "poplar_sapling.png"))
    poplar_sapling.save(os.path.join(BLOCKS_DIR, "potted_poplar_sapling.png"))
    
    # Poplar leaves
    tint_image(oak_leaves, (240, 120, 20)).save(os.path.join(BLOCKS_DIR, "orange_poplar_leaves.png"))
    tint_image(oak_leaves, (215, 45, 30)).save(os.path.join(BLOCKS_DIR, "red_poplar_leaves.png"))
    tint_image(oak_leaves, (245, 200, 30)).save(os.path.join(BLOCKS_DIR, "yellow_poplar_leaves.png"))

    # 2. Cinnabar set
    stone = load_or_create(os.path.join(BLOCKS_DIR, "stone.png"), (125, 125, 125, 255))
    stone_bricks = load_or_create(os.path.join(BLOCKS_DIR, "stone_bricks.png"), (125, 125, 125, 255))
    chiseled = load_or_create(os.path.join(BLOCKS_DIR, "chiseled_stone_bricks.png"), (125, 125, 125, 255))
    
    cinnabar_rgb = (185, 35, 30)
    cinnabar_polished_rgb = (210, 45, 40)
    
    tint_image(stone, cinnabar_rgb).save(os.path.join(BLOCKS_DIR, "cinnabar.png"))
    tint_image(stone, cinnabar_polished_rgb).save(os.path.join(BLOCKS_DIR, "polished_cinnabar.png"))
    tint_image(stone_bricks, cinnabar_rgb).save(os.path.join(BLOCKS_DIR, "cinnabar_bricks.png"))
    tint_image(chiseled, cinnabar_rgb).save(os.path.join(BLOCKS_DIR, "chiseled_cinnabar.png"))

    # 3. Sulfur set
    sulfur_rgb = (245, 215, 35)
    sulfur_bright_rgb = (255, 235, 60)
    
    tint_image(stone, sulfur_rgb).save(os.path.join(BLOCKS_DIR, "sulfur.png"))
    tint_image(stone, sulfur_bright_rgb).save(os.path.join(BLOCKS_DIR, "polished_sulfur.png"))
    tint_image(stone_bricks, sulfur_rgb).save(os.path.join(BLOCKS_DIR, "sulfur_bricks.png"))
    tint_image(chiseled, sulfur_rgb).save(os.path.join(BLOCKS_DIR, "chiseled_sulfur.png"))
    tint_image(chiseled, (255, 180, 20)).save(os.path.join(BLOCKS_DIR, "potent_sulfur.png"))
    
    # Sulfur spike
    spike_img = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for y in range(16):
        w = max(1, int(4 * (1 - y / 16.0)))
        for x in range(8 - w, 8 + w):
            shade = int(210 + 40 * (y / 16.0))
            spike_img.putpixel((x, y), (shade, shade - 20, 20, 255))
    spike_img.save(os.path.join(BLOCKS_DIR, "sulfur_spike.png"))

    # 4. Copper blocks
    iron_bars = load_or_create(os.path.join(BLOCKS_DIR, "iron_bars.png"), (160, 160, 160, 255))
    chain = load_or_create(os.path.join(BLOCKS_DIR, "chain.png"), (60, 60, 60, 255))
    lantern = load_or_create(os.path.join(BLOCKS_DIR, "lantern.png"), (70, 70, 70, 255))
    chest = load_or_create(os.path.join(BLOCKS_DIR, "chest_side.png"), (150, 100, 50, 255))
    chest_front = load_or_create(os.path.join(BLOCKS_DIR, "chest_front.png"), (150, 100, 50, 255))
    chest_top = load_or_create(os.path.join(BLOCKS_DIR, "chest_top.png"), (150, 100, 50, 255))
    torch = load_or_create(os.path.join(BLOCKS_DIR, "torch.png"), (150, 100, 50, 255))
    
    copper_stages = {
        '': (195, 110, 75),
        'exposed_': (160, 125, 95),
        'weathered_': (95, 155, 120),
        'oxidized_': (70, 180, 150),
    }
    
    for prefix, rgb in copper_stages.items():
        # bars
        tint_image(iron_bars, rgb).save(os.path.join(BLOCKS_DIR, f"{prefix}copper_bars.png"))
        # chain
        tint_image(chain, rgb).save(os.path.join(BLOCKS_DIR, f"{prefix}copper_chain.png"))
        # lantern
        tint_image(lantern, rgb).save(os.path.join(BLOCKS_DIR, f"{prefix}copper_lantern.png"))
        # golem statue
        tint_image(stone, rgb).save(os.path.join(BLOCKS_DIR, f"{prefix}copper_golem_statue.png"))
        # lightning rod
        tint_image(iron_bars, rgb).save(os.path.join(BLOCKS_DIR, f"{prefix}lightning_rod.png"))
        # chest faces
        tint_image(chest, rgb).save(os.path.join(BLOCKS_DIR, f"{prefix}copper_chest_side.png"))
        tint_image(chest_front, rgb).save(os.path.join(BLOCKS_DIR, f"{prefix}copper_chest_front.png"))
        tint_image(chest_top, rgb).save(os.path.join(BLOCKS_DIR, f"{prefix}copper_chest_top.png"))
        tint_image(chest_top, rgb).save(os.path.join(BLOCKS_DIR, f"{prefix}copper_chest_bottom.png"))
        tint_image(chest, rgb).save(os.path.join(BLOCKS_DIR, f"{prefix}copper_chest.png"))
    
    tint_image(torch, (195, 110, 75)).save(os.path.join(BLOCKS_DIR, "copper_torch.png"))
    tint_image(torch, (195, 110, 75)).save(os.path.join(BLOCKS_DIR, "copper_wall_torch.png"))

    # 5. Flowers & Plants
    dandelion = load_or_create(os.path.join(BLOCKS_DIR, "dandelion.png"), (240, 200, 30, 255))
    tint_image(dandelion, (255, 215, 0)).save(os.path.join(BLOCKS_DIR, "golden_dandelion.png"))
    tint_image(dandelion, (255, 215, 0)).save(os.path.join(BLOCKS_DIR, "potted_golden_dandelion.png"))
    tint_image(dandelion, (255, 215, 0)).save(os.path.join(ITEMS_DIR, "golden_dandelion.png"))
    
    tint_image(oak_leaves, (70, 130, 40)).save(os.path.join(BLOCKS_DIR, "bush.png"))
    tint_image(dandelion, (230, 70, 150)).save(os.path.join(BLOCKS_DIR, "cactus_flower.png"))
    tint_image(oak_leaves, (160, 110, 40)).save(os.path.join(BLOCKS_DIR, "leaf_litter.png"))
    tint_image(dandelion, (120, 200, 240)).save(os.path.join(BLOCKS_DIR, "wildflowers.png"))
    tint_image(dandelion, (170, 150, 70)).save(os.path.join(BLOCKS_DIR, "short_dry_grass.png"))
    tint_image(dandelion, (160, 140, 60)).save(os.path.join(BLOCKS_DIR, "tall_dry_grass.png"))
    tint_image(oak_leaves, (180, 50, 40)).save(os.path.join(BLOCKS_DIR, "red_shrub.png"))
    tint_image(stone, (140, 100, 70)).save(os.path.join(BLOCKS_DIR, "shelf_mushroom.png"))

    # Misc blocks
    tint_image(stone, (220, 190, 80)).save(os.path.join(BLOCKS_DIR, "straw_bed.png"))
    tint_image(stone, (180, 180, 180)).save(os.path.join(BLOCKS_DIR, "test_block.png"))
    tint_image(stone, (160, 160, 160)).save(os.path.join(BLOCKS_DIR, "test_instance_block.png"))

    # 6. ITEMS
    # Cushions (16 colors)
    for cname, rgb in WOOL_COLORS.items():
        cush = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
        for y in range(3, 13):
            for x in range(3, 13):
                # rounded cushion look
                border = (x in (3, 12) or y in (3, 12))
                r = int(rgb[0] * (0.8 if border else 1.0))
                g = int(rgb[1] * (0.8 if border else 1.0))
                b = int(rgb[2] * (0.8 if border else 1.0))
                cush.putpixel((x, y), (r, g, b, 255))
        # center button
        cush.putpixel((7, 7), (255, 255, 255, 220))
        cush.putpixel((8, 8), (255, 255, 255, 220))
        cush.save(os.path.join(ITEMS_DIR, f"{cname}_cushion.png"))

    # Harnesses (16 colors)
    lead = load_or_create(os.path.join(ITEMS_DIR, "lead.png"), (160, 120, 70, 255))
    for cname, rgb in WOOL_COLORS.items():
        harn = tint_image(lead, rgb)
        harn.save(os.path.join(ITEMS_DIR, f"{cname}_harness.png"))

    # Maps (16 exploration maps)
    map_base = load_or_create(os.path.join(ITEMS_DIR, "map.png"), (220, 200, 160, 255))
    maps = [
        ('abandoned_camp_map', (140, 90, 40)),
        ('buried_ancient_city_map', (20, 80, 90)),
        ('buried_mineshaft_map', (90, 60, 30)),
        ('buried_treasure_map', (200, 40, 40)),
        ('buried_trial_chambers_map', (180, 100, 40)),
        ('desert_pyramid_map', (210, 180, 90)),
        ('desert_village_map', (220, 160, 60)),
        ('jungle_pyramid_map', (50, 130, 50)),
        ('ocean_monument_map', (60, 170, 160)),
        ('plains_village_map', (80, 160, 50)),
        ('savanna_village_map', (170, 140, 50)),
        ('snowy_village_map', (200, 230, 255)),
        ('swamp_hut_map', (70, 90, 40)),
        ('taiga_village_map', (60, 110, 70)),
        ('warm_ocean_ruins_map', (50, 180, 200)),
        ('woodland_mansion_map', (100, 65, 30)),
    ]
    for mname, mcolor in maps:
        m = map_base.copy()
        # Add colored icon marker in center of map
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                if abs(dx) + abs(dy) <= 2:
                    m.putpixel((8 + dx, 8 + dy), (*mcolor, 255))
        m.save(os.path.join(ITEMS_DIR, f"{mname}.png"))

    # Copper equipment
    copper_rgb = (195, 110, 75)
    tools = ['sword', 'pickaxe', 'axe', 'shovel', 'hoe', 'helmet', 'chestplate', 'leggings', 'boots', 'horse_armor']
    for t in tools:
        base = load_or_create(os.path.join(ITEMS_DIR, f"iron_{t}.png"), (180, 180, 180, 255))
        tint_image(base, copper_rgb).save(os.path.join(ITEMS_DIR, f"copper_{t}.png"))
    
    gold_nugget = load_or_create(os.path.join(ITEMS_DIR, "gold_nugget.png"), (240, 200, 30, 255))
    tint_image(gold_nugget, copper_rgb).save(os.path.join(ITEMS_DIR, "copper_nugget.png"))

    # Spears
    trident = load_or_create(os.path.join(ITEMS_DIR, "trident.png"), (60, 160, 150, 255))
    spear_tiers = {
        'wooden': (160, 110, 60),
        'stone': (140, 140, 140),
        'copper': copper_rgb,
        'iron': (220, 220, 220),
        'diamond': (80, 230, 220),
        'netherite': (65, 55, 60),
    }
    for stier, srgb in spear_tiers.items():
        tint_image(trident, srgb).save(os.path.join(ITEMS_DIR, f"{stier}_spear.png"))

    # Nautilus armor
    nautilus_tiers = {
        'copper': copper_rgb,
        'iron': (220, 220, 220),
        'golden': (245, 205, 45),
        'diamond': (80, 230, 220),
        'netherite': (65, 55, 60),
    }
    chestplate = load_or_create(os.path.join(ITEMS_DIR, "iron_chestplate.png"), (180, 180, 180, 255))
    for ntier, nrgb in nautilus_tiers.items():
        tint_image(chestplate, nrgb).save(os.path.join(ITEMS_DIR, f"{ntier}_nautilus_armor.png"))

    # Eggs
    egg_base = load_or_create(os.path.join(ITEMS_DIR, "egg.png"), (230, 220, 200, 255))
    tint_image(egg_base, (115, 200, 215)).save(os.path.join(ITEMS_DIR, "blue_egg.png"))
    tint_image(egg_base, (170, 110, 70)).save(os.path.join(ITEMS_DIR, "brown_egg.png"))

    # Spawn Eggs
    spawn_egg_base = load_or_create(os.path.join(ITEMS_DIR, "spawn_egg.png"), (180, 180, 180, 255))
    spawn_eggs = {
        'nautilus_spawn_egg': (60, 180, 180),
        'zombie_nautilus_spawn_egg': (60, 120, 90),
        'frostbite_spawn_egg': (140, 220, 245),
        'sulfur_cube_spawn_egg': sulfur_rgb,
    }
    for sname, srgb in spawn_eggs.items():
        tint_image(spawn_egg_base, srgb).save(os.path.join(ITEMS_DIR, f"{sname}.png"))

    # Misc items
    snowball = load_or_create(os.path.join(ITEMS_DIR, "snowball.png"), (220, 240, 255, 255))
    tint_image(snowball, (120, 210, 255)).save(os.path.join(ITEMS_DIR, "ice_ball.png"))
    
    disc = load_or_create(os.path.join(ITEMS_DIR, "music_disc_cat.png"), (80, 80, 80, 255))
    tint_image(disc, (70, 230, 150)).save(os.path.join(ITEMS_DIR, "music_disc_bounce.png"))
    tint_image(disc, (240, 90, 30)).save(os.path.join(ITEMS_DIR, "music_disc_lava_chicken.png"))
    tint_image(disc, (70, 150, 240)).save(os.path.join(ITEMS_DIR, "music_disc_tears.png"))
    
    iron_horse = load_or_create(os.path.join(ITEMS_DIR, "iron_horse_armor.png"), (180, 180, 180, 255))
    tint_image(iron_horse, (65, 55, 60)).save(os.path.join(ITEMS_DIR, "netherite_horse_armor.png"))
    
    boat = load_or_create(os.path.join(ITEMS_DIR, "oak_boat.png"), (160, 110, 60, 255))
    chest_boat = load_or_create(os.path.join(ITEMS_DIR, "oak_chest_boat.png"), (160, 110, 60, 255))
    tint_image(boat, poplar_wood_rgb).save(os.path.join(ITEMS_DIR, "poplar_boat.png"))
    tint_image(chest_boat, poplar_wood_rgb).save(os.path.join(ITEMS_DIR, "poplar_chest_boat.png"))
    
    bucket = load_or_create(os.path.join(ITEMS_DIR, "water_bucket.png"), (180, 180, 180, 255))
    tint_image(bucket, sulfur_rgb).save(os.path.join(ITEMS_DIR, "sulfur_cube_bucket.png"))

    print("All parity textures and icons generated successfully!")

if __name__ == "__main__":
    generate_assets()
