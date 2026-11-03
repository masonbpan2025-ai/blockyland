// Stained glass shows its colour: each of the 16 blocks and their panes is drawn with a texture in its dye's colour,
// see-through in the middle, rather than the plain glass every one of them used to share.
//
// Wiki (Stained Glass): stained glass is "a dyed variant of glass", translucent, in the 16 dye colours; the colours
// are the dyes' (Dye § Color values), which src/colourPalette.js holds -- red #b02e26, blue #3c44a0 and so on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { DYE_COLOURS } from '../src/colourPalette.js';
import { decodePng } from '../scripts/generate-stained-glass-textures.mjs';

const texture = (name) => new URL(`../public/assets/blocks/${name}`, import.meta.url);

test('each stained glass block and pane is drawn with its own colour\'s texture, which the game ships', () => {
  for (const colour of Object.keys(DYE_COLOURS)) {
    const file = `${colour}_stained_glass.png`;
    for (const suffix of ['STAINED_GLASS', 'STAINED_GLASS_PANE']) {
      const def = BLOCK_DEFS[BLOCKS[`${colour.toUpperCase()}_${suffix}`]];
      assert.equal(def?.textures?.all, file, `${colour} ${suffix}`);
    }
    assert.ok(existsSync(texture(file)), `${file} exists`);
  }
  // Plain glass stays clear.
  assert.equal(BLOCK_DEFS[BLOCKS.GLASS].textures.all, 'glass.png');
});

test('the texture is the dye\'s colour, and see-through in the middle', () => {
  for (const [colour, hex] of Object.entries(DYE_COLOURS)) {
    const [width, height, rgba] = decodePng(readFileSync(texture(`${colour}_stained_glass.png`)));
    const dye = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    // The middle of the pane: no frame, no glint in plain glass there, so it is the coloured wash.
    const i = ((height >> 1) * width + (width >> 1)) * 4;
    assert.deepEqual([...rgba.subarray(i, i + 3)], dye, `${colour}: the dye's colour`);
    assert.ok(rgba[i + 3] > 0.2 * 255 && rgba[i + 3] < 0.8 * 255, `${colour}: see-through (alpha ${rgba[i + 3]})`);
  }
});
