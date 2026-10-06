// A declared UV rectangle must actually contain art.
//
// This guards a real, silent failure: the turtle's shell was mapped to a 16x4x18 block at (64,0) on its sheet, and
// that rectangle is 0% opaque -- entirely empty sheet. Transparent samples are culled by `alphaTest`, so the shell
// rendered in its FALLBACK COLOUR. It looked plausible in a screenshot and no existing test noticed, because "the
// mob renders" was never the same claim as "the texture is bound".
//
// The same trap catches a missing bitmap, which also falls through to the colour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodePng } from '../scripts/mob-visual/png.mjs';
import { quadRects } from '../src/mobVisuals/entityBox.js';

const ASSETS = 'public/assets';

/** The mean opacity of a rectangle, 0 when the rectangle is empty sheet. */
function opacityOf(image, rect) {
  let opaque = 0;
  let total = 0;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      total++;
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      if (image.rgba[(y * image.width + x) * 4 + 3] >= 128) opaque++;
    }
  }
  return total ? opaque / total : 0;
}

/** Every face of a declared box, so a part is only accepted if its dimmest face has art. */
function worstFace(image, u, v, tw, th, td) {
  const faces = quadRects(u, v, tw, th, td).map((r) => opacityOf(image, r));
  return Math.min(...faces);
}

test('the turtle shell samples real art, not empty sheet', () => {
  const image = decodePng(readFileSync(`${ASSETS}/entity/turtle/big_sea_turtle.png`));

  // The re-fitted block. If this ever measures ~0 again, the shell is silently rendering as its fallback colour.
  const worst = worstFace(image, 11, 30, 16, 4, 18);
  assert.ok(worst > 0.4, `turtle shell block should carry art on every face, worst face was ${(worst * 100).toFixed(0)}%`);

  // And the block that was WRONG, pinned so the fault cannot be reintroduced by a "helpful" tidy-up.
  const former = worstFace(image, 64, 0, 16, 4, 18);
  assert.ok(former < 0.2, `the old (64,0) block is empty sheet; if it now has art the sheet changed layout (${(former * 100).toFixed(0)}%)`);
});

test('a fully transparent rectangle is detectably different from a textured one', () => {
  const image = decodePng(readFileSync(`${ASSETS}/entity/turtle/big_sea_turtle.png`));
  // The two rectangles must NOT measure alike, or this test cannot tell a bound texture from a fallback colour.
  assert.notEqual(
    Math.round(worstFace(image, 11, 30, 16, 4, 18) * 100),
    Math.round(worstFace(image, 64, 0, 16, 4, 18) * 100),
    'a textured block and an empty block must be distinguishable'
  );
});
