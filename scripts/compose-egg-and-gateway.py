"""Compose the sniffer egg and the end gateway from art the mirror does ship.

Two more blocks in the "needs new art" column that do not, in fact, need new art. This is the SEVENTH
instance of the technique in this goal.

WHERE THE ART CAME FROM, since neither had a texture under any name:

  - the SNIFFER EGG's colours are the sniffer's own. `entity/sniffer/sniffer.png` ships, and its dominant
    colours are dark reddish-browns -- (80,8,8) alone is 4044 of its 13942 opaque pixels -- which is exactly
    the egg vanilla draws. So the egg is the TURTLE EGG's shape (a cream 16x16 egg, which ships) recoloured
    onto the sniffer's palette. The shape is borrowed because an egg is an egg; the palette is the sniffer's
    because that is what makes it the sniffer's egg.

  - the END GATEWAY is the END PORTAL's look. Vanilla draws it as the same starfield, darker and violet.
    `nether_portal.png` is what this project uses for the end portal -- already a violet starfield -- so the
    gateway is that darkened, with a few brighter sparks scattered in.

Usage: python scripts/compose-egg-and-gateway.py
"""
from PIL import Image

import os
import sys

BLOCKS = os.path.join("public", "assets", "blocks")
ENTITY = os.path.join("public", "assets", "entity")

# The sniffer egg's palette, READ OUT OF THE SNIFFER'S SHEET rather than invented. These are its four most
# common colours, darkest first, which is what an egg's shell mottling should be built from.
SNIFFER_DARK = (80, 8, 8)
SNIFFER_MID = (113, 19, 19)
SNIFFER_LIGHT = (147, 49, 29)
SNIFFER_PALE = (176, 92, 60)


def extract_palette(sheet_path):
    """Return the sheet's most common RED-BROWN opaque colours, darkest first.

    THE GREEN MUST BE FILTERED OUT, and this was the first draft's mistake. The sniffer's sheet is mostly
    dark red-brown -- (80,8,8) alone is 4044 of its 13942 opaque pixels -- but its fourth and fifth most
    common colours are GREENS (44,115,77) and (29,93,60), because the sniffer's mossy highlights are part of
    its skin. Taking the twelve most common colours unfiltered therefore put green in the egg's palette and
    produced something that looked like a melon.

    Vanilla's sniffer egg is mottled RED-BROWN, so the palette is restricted to colours where red clearly
    dominates. Reading it from the sheet rather than hard-coding still means the egg follows the mirror's
    art, and it documents where the colours came from.
    """
    from collections import Counter

    image = Image.open(sheet_path).convert("RGBA")
    counts = Counter(p for p in image.getdata() if p[3] > 0)
    # Red-dominant only: this is the egg's family of colours, not the whole animal.
    reddish = [c[:3] for c, _ in counts.most_common(40) if c[0] > c[1] * 1.6 and c[0] > c[2] * 1.6]
    return sorted(reddish, key=lambda c: sum(c))


def compose_sniffer_egg():
    src = os.path.join(BLOCKS, "turtle_egg.png")
    sheet = os.path.join(ENTITY, "sniffer", "sniffer.png")
    if not os.path.exists(src):
        print("turtle_egg.png is missing; it is the shape this egg borrows", file=sys.stderr)
        return 0
    if not os.path.exists(sheet):
        print("the sniffer sheet is missing; it is where this egg's colours come from", file=sys.stderr)
        return 0

    palette = extract_palette(sheet) or [SNIFFER_DARK, SNIFFER_MID, SNIFFER_LIGHT, SNIFFER_PALE]

    egg = Image.open(src).convert("RGBA")
    out = []
    for px in egg.getdata():
        r, g, b, a = px
        if a == 0:
            out.append(px)
            continue
        # Map the turtle egg's cream luminance onto the sniffer's palette, so the shell's shading and its
        # mottling survive the recolour instead of flattening to one flat brown.
        lum = (r * 0.30) + (g * 0.59) + (b * 0.11)
        idx = min(len(palette) - 1, int((lum / 255.0) * len(palette)))
        nr, ng, nb = palette[idx]
        out.append((nr, ng, nb, a))

    egg.putdata(out)
    egg.save(os.path.join(BLOCKS, "sniffer_egg.png"), "PNG")
    print(f"  sniffer_egg.png            from turtle_egg.png + sniffer palette ({len(palette)} colours)")
    return 1


def compose_end_gateway():
    src = os.path.join(BLOCKS, "nether_portal.png")
    if not os.path.exists(src):
        print("nether_portal.png is missing; it is what this project uses for the end portal", file=sys.stderr)
        return 0

    image = Image.open(src).convert("RGBA")
    out = []
    for i, (r, g, b, a) in enumerate(image.getdata()):
        if a == 0:
            out.append((r, g, b, a))
            continue
        x, y = i % image.width, i // image.width
        # Darken toward the gateway's deeper violet.
        nr = int(r * 0.55)
        ng = int(g * 0.40)
        nb = int(min(255, b * 0.72))
        # Scatter a few bright sparks on a fixed lattice so the result is reproducible rather than random.
        if (x * 7 + y * 11) % 23 == 0:
            nr, ng, nb = 236, 214, 255
        out.append((nr, ng, nb, a))

    image.putdata(out)
    image.save(os.path.join(BLOCKS, "end_gateway.png"), "PNG")
    print("  end_gateway.png            from nether_portal.png, darkened and sparked")
    return 1


def main():
    made = compose_sniffer_egg() + compose_end_gateway()
    print(f"composed {made} textures")
    return 0 if made else 1


if __name__ == "__main__":
    sys.exit(main())
