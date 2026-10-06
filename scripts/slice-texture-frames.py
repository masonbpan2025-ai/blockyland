"""Slice the first frame out of an animated block texture strip.

Why this exists. Some block textures upstream are VERTICAL ANIMATION STRIPS rather than tiles: soul fire
is 16x512, which is 32 frames of 16x16 stacked. This engine has no texture animation and no strip
slicing, so registering such a block without slicing would stretch all 32 frames across a single quad --
which is why `soul_fire` was left out for several rounds as "art exists but is unusable".

The fix is to take frame 0, which is what the block looks like at rest, and write it as an ordinary tile.
Frame 0 is a deliberate choice over any other frame: it is the state a still render should show, and it
matches what the standing `fire` block does in this project (which sidesteps the problem differently, by
shipping an SVG).

The strip itself is kept alongside as `<name>_strip.png`, so the full animation stays available if a
texture animator is ever added, and so the slice is obviously derived from something rather than
mysteriously 16x16.

Usage: python scripts/slice-texture-frames.py
"""
from PIL import Image

import os
import sys

BLOCKS = os.path.join("public", "assets", "blocks")

# texture stem -> (frame width, frame height). Both are 16 for every tile in this game.
STRIPS = {
    "soul_fire_0": (16, 16),
}


def main():
    made = 0
    for name, (fw, fh) in sorted(STRIPS.items()):
        path = os.path.join(BLOCKS, name + ".png")
        if not os.path.exists(path):
            print(f"  {name}: absent, skipping", file=sys.stderr)
            continue

        strip = Image.open(path).convert("RGBA")
        # A strip is taller than one frame. If it is already a single tile there is nothing to slice.
        frames = strip.height // fh
        if frames <= 1:
            print(f"  {name}: already a single {strip.width}x{strip.height} tile")
            continue

        # Keep the strip before overwriting the path it lives at.
        strip_path = os.path.join(BLOCKS, name + "_strip.png")
        if not os.path.exists(strip_path):
            strip.save(strip_path, "PNG")

        frame = strip.crop((0, 0, fw, fh))
        frame.save(path, "PNG")
        made += 1
        print(f"  {name}: sliced frame 0 of {frames} -> {fw}x{fh} (strip kept as {name}_strip.png)")

    print(f"sliced {made} strip(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
