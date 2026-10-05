"""Compose the ender chest and trapped chest textures from the chest's.

Why this exists. The mirror ships no `ender_chest_*` or `trapped_chest_*` texture at any suffix or in any
version -- checked, and probed exhaustively -- and this project's own `chest_*.png` files are hand-made
rather than downloaded, so there is nothing upstream to fetch. But both variants ARE the chest with a
difference, and the difference is something a script can express:

  - an ENDER CHEST is the chest in the End's palette: near-black with a violet cast.
  - a TRAPPED CHEST is the chest with a LATCH on its front, which vanilla draws as a small mechanism plate
    below the lock.

So both are derived here rather than drawn, the sixth instance of this technique in the goal.

TWO THINGS THIS GETS WRONG IF WRITTEN CARELESSLY, both of which bit the first draft:

  - the latch must NOT be reused as the lock. An earlier version tinted the lock art with the same
    function it used for the wood, so the ender chest's lock came out LILAC and the trapped chest's came
    out nearly white -- both wrong for a dark iron fitting. The lock is built by DARKENING the existing
    lock art instead, so it stays a dark fitting in every variant.
  - `tint=identity` must still run for the trapped chest's faces, because the trapped chest is a
    different colour from the plain chest, not the same one with a latch.

Usage: python scripts/compose-chest-variants.py
"""
from PIL import Image

import os
import sys

BLOCKS = os.path.join("public", "assets", "blocks")

FACES = ["top", "side", "front"]


def tint_ender(px):
    """Map the chest's brown wood palette onto the End's near-black violet."""
    r, g, b, a = px
    if a == 0:
        return px
    # Desaturate, darken hard, then push a violet cast. The multipliers are tuned so the plank seams
    # survive as slightly lighter violet rather than flattening to one colour.
    lum = (r * 0.30) + (g * 0.59) + (b * 0.11)
    return (int(min(255, lum * 0.30 + 26)), int(min(255, lum * 0.18 + 12)),
            int(min(255, lum * 0.38 + 40)), a)


def tint_trapped(px):
    """Map the chest onto the paler, greyer wood a trapped chest uses."""
    r, g, b, a = px
    if a == 0:
        return px
    lum = (r * 0.30) + (g * 0.59) + (b * 0.11)
    return (int(min(255, lum * 0.72 + 62)), int(min(255, lum * 0.66 + 54)),
            int(min(255, lum * 0.58 + 44)), a)


def darken_fitting(px):
    """The lock and latch: a dark iron fitting, in every variant.

    Applied to the existing lock art rather than tinted with the wood, so an ender chest does not end up
    with a lilac lock and a trapped chest does not end up with a white one.
    """
    r, g, b, a = px
    if a == 0:
        return px
    lum = (r * 0.30) + (g * 0.59) + (b * 0.11)
    v = int(lum * 0.45)
    return (v, v, min(255, v + 4), a)


def write_tinted(src_name, out_name, tint):
    src = os.path.join(BLOCKS, src_name)
    if not os.path.exists(src):
        return False
    image = Image.open(src).convert("RGBA")
    image.putdata([tint(p) for p in image.getdata()])
    image.save(os.path.join(BLOCKS, out_name), "PNG")
    return True


def write_trapped_front():
    """The chest front with a LATCH below the lock.

    The first draft resized the 6x6 lock art to half size and pasted it at the midpoint, which produced an
    8x8 grey plate covering most of the lower front -- far too large and far too light to read as a fitting.
    A latch is a small mechanism: this builds a 6x2 strip from the lock's darkest rows and draws the metal
    edge over it, then places it directly under the lock where vanilla puts the mechanism.
    """
    front = os.path.join(BLOCKS, "chest_front.png")
    if not os.path.exists(front):
        return False

    image = Image.open(front).convert("RGBA")
    image.putdata([tint_trapped(p) for p in image.getdata()])

    # A 6x2 dark strip below the lock, with a lighter top row so it reads as a plate with an edge.
    latch = Image.new("RGBA", (6, 2), (0, 0, 0, 0))
    latch.putdata([
        (86, 86, 92, 255), (96, 96, 102, 255), (96, 96, 102, 255),
        (96, 96, 102, 255), (96, 96, 102, 255), (86, 86, 92, 255),
        (58, 58, 62, 255), (64, 64, 68, 255), (64, 64, 68, 255),
        (64, 64, 68, 255), (64, 64, 68, 255), (58, 58, 62, 255),
    ])
    image.alpha_composite(latch, (5, 7))

    image.save(os.path.join(BLOCKS, "trapped_chest_front.png"), "PNG")
    return True


def main():
    if not os.path.exists(os.path.join(BLOCKS, "chest_front.png")):
        print("chest_front.png is missing; the chest textures are not downloaded from the mirror",
              file=sys.stderr)
        return 1

    made = 0
    for face in FACES:
        src = "chest_top.png" if face == "top" else f"chest_{face}.png"
        if write_tinted(src, f"ender_chest_{face}.png", tint_ender):
            made += 1
        if face != "front" and write_tinted(src, f"trapped_chest_{face}.png", tint_trapped):
            made += 1
    if write_trapped_front():
        made += 1

    # Locks, built from the dark fitting rather than the wood tint.
    for stem in ("ender_chest", "trapped_chest"):
        if write_tinted("chest_lock.png", f"{stem}_lock.png", darken_fitting):
            made += 1

    # THE ITEM ICONS, for the same reason the block textures are here: the mirror ships no `ender_chest`
    # or `trapped_chest` item sprite either, and `public/assets` is not committed, so an icon written by
    # hand once would disappear on a clean checkout and leave the block obtainable-but-invisible. The
    # chest's own icon is the reference size, and the variant's front face is what an item icon shows.
    icons = os.path.join("public", "assets", "items")
    reference = os.path.join(icons, "chest.png")
    if os.path.exists(reference) and os.path.isdir(icons):
        size = Image.open(reference).size
        for stem in ("ender_chest", "trapped_chest"):
            front = os.path.join(BLOCKS, f"{stem}_front.png")
            if not os.path.exists(front):
                continue
            Image.open(front).convert("RGBA").resize(size, Image.Resampling.NEAREST).save(
                os.path.join(icons, f"{stem}.png"), "PNG")
            made += 1
    else:
        print("  chest.png item icon absent; the variant icons were not written", file=sys.stderr)

    print(f"composed {made} chest-variant textures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
