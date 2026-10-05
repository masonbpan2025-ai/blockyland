"""Extract the six head faces of a mob head from its entity skin sheet.

Why this exists. The five mob heads have no block texture upstream at any suffix, which is why they sat in
the "needs new art" column for many rounds. But their art DOES exist: every mob has a `entity/...` skin
sheet, and a Minecraft head is drawn from that sheet's head region. So the block art can be EXTRACTED
rather than drawn, which is the fourth variation on the technique this goal keeps reaching for (compose
candle cakes, compose potted plants, slice animation strips, and now extract from a skin).

The skin layout is the standard Minecraft one. For a 64x32 or 64x64 skin, the head occupies the top-left
32x16 region and its faces are laid out as:

        (8,0) top    (16,0) bottom
        (0,8) right  (8,8) front  (16,8) left  (24,8) back

Each face is 8x8. They are written as three 16x16-block tiles per head, matching how the rest of this
project's block textures are named and consumed:

    <head>_top.png     the 8x8 top face, upscaled to 16x16
    <head>_front.png   the 8x8 front face, upscaled  -- used for all four sides
    <head>_bottom.png  the 8x8 bottom face

WHY THE FRONT FACE IS REUSED FOR THE SIDES: a vanilla head block shows the mob's face on the front and its
profile on the sides. Doing that properly needs per-face block textures, which this game's cube path
supports (see `scaffolding`, which names top/side/bottom) but which would still look wrong from two of the
four sides unless the side texture were mirrored per face. A head that shows its FACE on all four sides is
the simpler approximation, and it is recorded here rather than left to be noticed.

Usage: python scripts/extract-mob-head-textures.py
"""
from PIL import Image

import os
import sys

BLOCKS = os.path.join("public", "assets", "blocks")
SKINS = os.path.join("public", "assets", "entity")

# block-stem -> skin file (relative to public/assets/entity)
HEADS = {
    "skeleton_skull": "skeleton/skeleton.png",
    # The wither skeleton was missed by the first pass of this batch, because the standing block already
    # existed under a NON-STANDARD key (`WITHER_SKELETON_SKULL_BLOCK`) pointing at `coal_block.png`, so the
    # gap report counted the name as resolved and nothing flagged it. Only its wall form was missing, which
    # is what surfaced the problem. Its sheet is in the same standard layout as the plain skeleton's.
    "wither_skeleton_skull": "skeleton/wither_skeleton.png",
    "zombie_head": "zombie/zombie.png",
    "creeper_head": "creeper/creeper.png",
    "player_head": "player/wide/steve.png",
    "piglin_head": "piglin/piglin.png",
}

# Face rectangles in the head region, per the standard skin layout.
FACES = {
    "top": (8, 0, 8, 8),
    "bottom": (16, 0, 8, 8),
    "front": (8, 8, 8, 8),
}

TILE = 16


def extract(skin_path, out_stem):
    skin = Image.open(skin_path).convert("RGBA")
    made = []
    for face, (x, y, w, h) in FACES.items():
        tile = skin.crop((x, y, x + w, y + h))
        # The block atlas wants 16x16 tiles, and a head face is 8x8, so scale it up. NEAREST keeps the
        # pixels crisp rather than blurring them, which is what the rest of this project's art expects.
        tile = tile.resize((TILE, TILE), Image.Resampling.NEAREST)
        out = os.path.join(BLOCKS, f"{out_stem}_{face}.png")
        tile.save(out, "PNG")
        made.append(face)
    return made


def main():
    if not os.path.isdir(SKINS):
        print(f"{SKINS} is missing; entity sheets are not part of the block asset download", file=sys.stderr)
        return 1

    total = 0
    for stem, rel in sorted(HEADS.items()):
        skin_path = os.path.join(SKINS, rel)
        if not os.path.exists(skin_path):
            print(f"  {stem}: skin {rel} absent, skipping", file=sys.stderr)
            continue
        faces = extract(skin_path, stem)
        total += len(faces)
        print(f"  {stem:<18} {','.join(faces)}  <- {rel}")

    print(f"extracted {total} head-face tiles")
    return 0


if __name__ == "__main__":
    sys.exit(main())
