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
    # THE CREEPER WAS WRONGLY EXCLUDED FOR SEVERAL ROUNDS, on a claim in this file that its sheet "is not
    # in the standard layout" and that what sits at the head coordinates is "body noise rather than a face".
    # THAT CLAIM WAS FALSE. The standard front rectangle at (8,8)-(16,16) is unmistakably the creeper's face
    # -- two eyes and a mouth, rendered and checked. The original judgement came from sampling the 8x8 region
    # at (8,8) and finding 50 distinct colours, which was read as noise; a creeper is CAMOUFLAGED and its
    # face genuinely uses many greens, so the colour count was never evidence of anything.
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

# THE ENDER DRAGON IS NOT A STANDARD SKIN and cannot use the rectangles above. Its sheet is 256x256 and is
# one continuous texture stretched over a model, with no 8x8 face layout anywhere. What it DOES have is a
# face: locating the eye pixels by colour puts the two eyes at x=130..212, y=44..48 with a magenta mouth
# below, and the head box around them spans x=124..200, y=36..72.
#
# So the dragon is a special case with its own square crop, taken as the largest mostly-opaque square that
# contains the face. It is an approximation of a model-drawn head, and it reads as a dragon -- dark scales
# with glowing eyes and a mouth.
#
# (An earlier version of this comment ended "...rather than as body noise, which is the bar the creeper
# failed to clear." The creeper did clear that bar; the comparison was wrong and the creeper is now in HEADS
# above. Left here as a note rather than silently deleted, because the false claim was load-bearing for a
# while and cost several rounds.)
SPECIAL = {
    "dragon_head": ("enderdragon/dragon.png", (120, 36, 152, 68)),
}

TILE = 16


def extract(skin_path, out_stem, box=None):
    skin = Image.open(skin_path).convert("RGBA")
    made = []
    if box is not None:
        # One square crop, used for all three faces. A model-drawn head has no per-face layout to slice.
        tile = skin.crop(box).resize((TILE, TILE), Image.Resampling.NEAREST)
        for face in FACES:
            tile.save(os.path.join(BLOCKS, f"{out_stem}_{face}.png"), "PNG")
            made.append(face)
        return made

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

    # The special cases, which have their own crop rather than the standard face rectangles.
    for stem, (rel, box) in sorted(SPECIAL.items()):
        skin_path = os.path.join(SKINS, rel)
        if not os.path.exists(skin_path):
            print(f"  {stem}: skin {rel} absent, skipping", file=sys.stderr)
            continue
        faces = extract(skin_path, stem, box)
        total += len(faces)
        print(f"  {stem:<18} {','.join(faces)}  <- {rel} box={box}")

    print(f"extracted {total} head-face tiles")
    return 0


if __name__ == "__main__":
    sys.exit(main())
