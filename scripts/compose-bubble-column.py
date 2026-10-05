"""Compose the bubble column texture from water and the bubble particle.

Why this exists. Vanilla has NO `bubble_column` texture at any suffix or version -- checked -- because a
bubble column IS water with bubbles rising through it, and the game draws the water tile and spawns
particles. There is nothing to fetch, so the tile has to be composed, which is the eighth time in this goal
that a block was unblocked by deriving art.

The two ingredients both ship: `water_still.png`, which is what WATER uses here, and `particle/bubble.png`,
which is the bubble sprite the game already draws in water.

TWO THINGS THE FIRST DRAFT GOT WRONG:

  - `water_still.png` is an ANIMATION STRIP (16x512), not a tile, so it has to be sliced first. Slicing is
    `slice-texture-frames.py`'s job and this script reuses the same idea rather than stretching 512 rows
    into 16.
  - one scaled-up bubble reads as a single floating ring and hides the water; FOUR bubbles at the sprite's
    native 8x8 size read as a column, which is what the block is. The bubbled variant is the one used.

Usage: python scripts/compose-bubble-column.py
"""
from PIL import Image

import os
import sys

BLOCKS = os.path.join("public", "assets", "blocks")
PARTICLE = os.path.join("public", "assets", "particle")


def water_tile():
    """Frame 0 of the water tile, which is an animation strip upstream."""
    path = os.path.join(BLOCKS, "water_still.png")
    if not os.path.exists(path):
        return None
    image = Image.open(path).convert("RGBA")
    frames = image.height // 16
    return image.crop((0, 0, 16, 16)) if frames > 1 else image


def main():
    water = water_tile()
    if water is None:
        print("water_still.png is missing; it is the base this tile is composed onto", file=sys.stderr)
        return 1

    bubble_path = os.path.join(PARTICLE, "bubble.png")
    if not os.path.exists(bubble_path):
        print("particle/bubble.png is missing; it is where the bubbles come from", file=sys.stderr)
        return 1

    bubble = Image.open(bubble_path).convert("RGBA")
    if bubble.size != (8, 8):
        bubble = bubble.resize((8, 8), Image.Resampling.NEAREST)

    # FOUR bubbles in the tile, at native size, so it reads as a column rather than one floating ring.
    out = water.copy()
    for ox, oy in ((0, 0), (8, 0), (0, 8), (8, 8)):
        out.alpha_composite(bubble, (ox, oy))

    out.save(os.path.join(BLOCKS, "bubble_column.png"), "PNG")
    print("  bubble_column.png          water_still frame 0 + four bubble sprites")
    return 0


if __name__ == "__main__":
    sys.exit(main())
