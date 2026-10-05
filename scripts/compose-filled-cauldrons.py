"""Compose the three filled cauldron top textures from the cauldron and fluid tiles.

Why this exists. The mirror ships `cauldron_top`/`cauldron_side`/`cauldron_bottom` and the fluid tiles, but
NO `water_cauldron`/`lava_cauldron`/`powder_snow_cauldron` texture at any suffix -- vanilla draws a filled
cauldron as a MODEL that puts the fluid inside the pot, exactly as it does for candle cakes and potted
plants. So the combined art has to be composed, and this script is committed so it is reproducible.

The fluid tiles are ALSO animation strips (`water_still` is 16x512, `lava_still` is 16x320), so this
reuses `slice_frame` to take frame 0 first. Powder snow is an ordinary tile.

Composition is an alpha overlay of the fluid onto the cauldron rim. That is an approximation: vanilla
insets the fluid inside the pot's mouth, while a flat overlay fills the whole top face. It reads
correctly from above, which is the face a player looks at.

Usage: python scripts/compose-filled-cauldrons.py
"""
from PIL import Image

import os
import sys

BLOCKS = os.path.join("public", "assets", "blocks")

# output name -> fluid tile to overlay. The fluid is sliced to one frame first if it is a strip.
FILLS = {
    "water_cauldron_top": "water_still",
    "lava_cauldron_top": "lava_still",
    "powder_snow_cauldron_top": "powder_snow",
}


def slice_frame(name, frame_w=16, frame_h=16):
    """Return one frame of a texture, slicing a vertical animation strip if that is what it is."""
    path = os.path.join(BLOCKS, name + ".png")
    if not os.path.exists(path):
        return None, "absent"
    image = Image.open(path).convert("RGBA")
    frames = image.height // frame_h
    if frames <= 1:
        return image, "single tile"
    return image.crop((0, 0, frame_w, frame_h)), f"frame 0 of {frames}"


def main():
    pot_path = os.path.join(BLOCKS, "cauldron_top.png")
    if not os.path.exists(pot_path):
        print("cauldron_top.png is missing; run the asset downloader first", file=sys.stderr)
        return 1

    made = 0
    for out_name, fluid in sorted(FILLS.items()):
        fluid_tile, how = slice_frame(fluid)
        if fluid_tile is None:
            print(f"  {out_name}: {fluid} {how}, skipping", file=sys.stderr)
            continue

        pot = Image.open(pot_path).convert("RGBA")
        pot.alpha_composite(fluid_tile)
        pot.save(os.path.join(BLOCKS, out_name + ".png"), "PNG")
        made += 1
        print(f"  {out_name:<28} {how}")

    print(f"composed {made} filled-cauldron textures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
