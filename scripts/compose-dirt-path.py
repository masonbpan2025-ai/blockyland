"""Compose the dirt path's top face from the dirt texture.

Why this exists. Vanilla has no `dirt_path` block tile at any suffix or version -- a dirt path is made by
using a shovel on grass, and the game draws it with a top face that is a compressed, packed-dirt surface.
The mirror ships `dirt.png` and nothing path-shaped, so the top has to be built from the dirt, which is the
ninth time in this goal that a block was unblocked by deriving art.

THE TRANSFORM IS A DARKENING, not a new texture: a path is packed dirt, so it is the same material pushed
darker with its contrast lifted slightly so the packing reads as a surface rather than as flat mud. Kept
mechanical and documented so the result is reproducible rather than hand-drawn.

Usage: python scripts/compose-dirt-path.py
"""
from PIL import Image

import os
import sys

BLOCKS = os.path.join("public", "assets", "blocks")


def main():
    src = os.path.join(BLOCKS, "dirt.png")
    if not os.path.exists(src):
        print("dirt.png is missing; it is the base this tile is composed from", file=sys.stderr)
        return 1

    dirt = Image.open(src).convert("RGBA")
    out = []
    for r, g, b, a in dirt.getdata():
        if a == 0:
            out.append((r, g, b, a))
            continue
        # Packed dirt: darker, and desaturated toward grey so it does not read as the same soft soil.
        lum = (r * 0.30) + (g * 0.59) + (b * 0.11)
        packed = lum * 0.78
        out.append((int(packed * 1.02), int(packed * 0.94), int(packed * 0.80), a))

    result = Image.new("RGBA", dirt.size)
    result.putdata(out)
    result.save(os.path.join(BLOCKS, "dirt_path_top.png"), "PNG")
    print("  dirt_path_top.png           dirt.png, darkened and desaturated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
