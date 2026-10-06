"""Compose the candle-cake top textures from the cake and candle textures.

Why this exists. The asset mirror ships a `cake_top`/`cake_side`/`cake_bottom` set and one texture per
candle colour, but NO combined `*_candle_cake` texture at all -- the bare name 404s and no orientation
suffix helps. Vanilla does not ship one either: the block is a model that puts the candle on the cake, so
the art genuinely does not exist as a single tile. Composing it here is the only way to make these blocks
without drawing new art by hand, and it is honest to do it in a committed script rather than by pasting
bytes nobody can reproduce.

The composition is a centred overlay: the candle sprite is pasted onto the cake top with its alpha
respected. That is an approximation of the vanilla model, which renders the candle as a 3D box on the
cake, but it reads correctly from above, which is the face a player sees on a placed cake.

Usage: python scripts/compose-candle-cakes.py
"""
from PIL import Image

import os

BLOCKS = os.path.join("public", "assets", "blocks")

COLORS = [
    "white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
    "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black",
]


def compose(candle_name, out_name):
    cake = Image.open(os.path.join(BLOCKS, "cake_top.png")).convert("RGBA")
    candle = Image.open(os.path.join(BLOCKS, candle_name + ".png")).convert("RGBA")

    # The candle sprite is a full 16x16 tile whose artwork sits low and centred, so a straight overlay
    # puts it where the vanilla model puts it on a cake.
    cake.alpha_composite(candle)

    # Keep the result a 16x16 RGBA PNG; the atlas loader wants a tile of the same size as the rest.
    cake.save(os.path.join(BLOCKS, out_name), "PNG")
    return cake.size


def main():
    made = []
    # The plain candle cake, and one per dye colour.
    made.append(("candle_cake.png", compose("candle", "candle_cake.png")))
    for color in COLORS:
        out = f"{color}_candle_cake.png"
        made.append((out, compose(f"{color}_candle", out)))

    for name, size in made:
        print(f"  {name:<34} {size[0]}x{size[1]}")
    print(f"composed {len(made)} candle-cake textures")


if __name__ == "__main__":
    main()
