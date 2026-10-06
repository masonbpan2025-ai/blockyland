"""Compose the potted-plant block textures from the flower pot and the plant sprites.

Why this exists. The asset mirror ships `flower_pot.png` and every plant it can hold, but NO
`potted_*` block texture at any orientation suffix -- vanilla does not ship one, because a potted plant
is a MODEL that draws the pot and then the plant inside it. So the art has to be composed, the same way
the candle cakes were, and this script is committed so the result is reproducible.

Composition is a two-pass alpha overlay: the pot first, then the plant on top. The plant sprite sits
higher in its 16x16 tile than the pot rim, so a straight overlay puts the foliage above the rim the way
the vanilla model does. The pot is drawn UNDER the plant so foliage that overlaps the rim occludes it.

Usage: python scripts/compose-potted-plants.py
"""
from PIL import Image

import os
import sys

BLOCKS = os.path.join("public", "assets", "blocks")

# potted block name -> the sprite stem it holds. The stem resolves to <stem>.png, with the two azalea
# bushes resolving to their own multi-face names handled below.
POTTED = {
    "potted_acacia_sapling": "acacia_sapling",
    "potted_allium": "allium",
    "potted_azure_bluet": "azure_bluet",
    "potted_bamboo": "bamboo_stage0",
    "potted_birch_sapling": "birch_sapling",
    "potted_blue_orchid": "blue_orchid",
    "potted_brown_mushroom": "brown_mushroom",
    "potted_cactus": "cactus_side",
    "potted_cherry_sapling": "cherry_sapling",
    "potted_closed_eyeblossom": "closed_eyeblossom",
    "potted_cornflower": "cornflower",
    "potted_crimson_fungus": "crimson_fungus",
    "potted_crimson_roots": "crimson_roots",
    "potted_dandelion": "dandelion",
    "potted_dark_oak_sapling": "dark_oak_sapling",
    "potted_dead_bush": "dead_bush",
    "potted_fern": "fern",
    "potted_jungle_sapling": "jungle_sapling",
    "potted_lily_of_the_valley": "lily_of_the_valley",
    "potted_mangrove_propagule": "mangrove_propagule",
    "potted_oak_sapling": "oak_sapling",
    "potted_open_eyeblossom": "open_eyeblossom",
    "potted_orange_tulip": "orange_tulip",
    "potted_oxeye_daisy": "oxeye_daisy",
    "potted_pale_oak_sapling": "pale_oak_sapling",
    "potted_pink_tulip": "pink_tulip",
    "potted_poppy": "poppy",
    "potted_red_mushroom": "red_mushroom",
    "potted_red_tulip": "red_tulip",
    "potted_spruce_sapling": "spruce_sapling",
    "potted_torchflower": "torchflower",
    "potted_warped_fungus": "warped_fungus",
    "potted_warped_roots": "warped_roots",
    "potted_white_tulip": "white_tulip",
    "potted_wither_rose": "wither_rose",
    # The two azalea bushes are multi-face: the block uses the bush's own top and side sprites.
    "potted_azalea_bush": "azalea_side",
    "potted_flowering_azalea_bush": "flowering_azalea_side",
}


def compose(pot, plant_name, out_name):
    base = Image.open(os.path.join(BLOCKS, pot)).convert("RGBA")
    plant = Image.open(os.path.join(BLOCKS, plant_name + ".png")).convert("RGBA")
    base.alpha_composite(plant)
    base.save(os.path.join(BLOCKS, out_name), "PNG")


def main():
    if not os.path.exists(os.path.join(BLOCKS, "flower_pot.png")):
        print("flower_pot.png is missing; run the asset downloader first", file=sys.stderr)
        return 1

    made = 0
    missing = []
    for potted, plant in sorted(POTTED.items()):
        if not os.path.exists(os.path.join(BLOCKS, plant + ".png")):
            missing.append(f"{potted} needs {plant}.png")
            continue
        compose("flower_pot.png", plant, potted + ".png")
        made += 1

    print(f"composed {made} potted-plant textures")
    if missing:
        print("skipped, plant sprite absent:", file=sys.stderr)
        for m in missing:
            print("  " + m, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
