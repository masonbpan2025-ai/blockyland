// Bed geometry across the 16 vanilla colours.
//
// bed.js had the geometry already, but hard-coded to red: the wool block and the blanket tint were
// both literals. Adding the other fifteen colours therefore needed a colour parameter, and the things
// worth checking are that the parameter actually changes the mesh, that red is unchanged by the
// refactor, and that every colour maps to its own wool block rather than sharing one texture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBedGeometry } from '../src/bed.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { DYE_COLOURS } from '../src/colourPalette.js';
import * as THREE from 'three';

const textures = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 0.25, v1: 0.25 }) };

/** The distinct vertex colours in a geometry, which is where the blanket tint shows up. */
function tints(geo) {
  const c = geo.attributes.color;
  const seen = new Set();
  for (let i = 0; i < c.count; i++) seen.add(c.getX(i).toFixed(3) + ',' + c.getY(i).toFixed(3) + ',' + c.getZ(i).toFixed(3));
  return [...seen].sort();
}

test('every vanilla bed colour is present, as a foot and a head', () => {
  const colours = Object.keys(DYE_COLOURS);
  assert.equal(colours.length, 16, 'the palette should have 16 dye colours');
  for (const colour of colours) {
    const foot = BLOCKS[colour.toUpperCase() + '_BED'];
    const head = BLOCKS[colour.toUpperCase() + '_BED_HEAD'];
    assert.ok(foot !== undefined, colour + '_bed should exist');
    assert.ok(head !== undefined, colour + '_bed_head should exist');
    assert.equal(BLOCK_DEFS[foot].bedColour, colour, colour + ' foot should carry its colour');
    assert.equal(BLOCK_DEFS[head].bedColour, colour, colour + ' head should carry its colour');
    assert.equal(BLOCK_DEFS[head].isHead, true, colour + ' head should be marked as a head');
  }
});

test('the colour parameter changes the mesh', () => {
  // The point of the refactor. If the parameter were ignored, every bed would render red and the
  // failure would be invisible in a coverage number.
  const red = createBedGeometry(false, 3, textures, 'red');
  const blue = createBedGeometry(false, 3, textures, 'blue');
  const redTints = tints(red);
  const blueTints = tints(blue);
  assert.notDeepEqual(redTints, blueTints, 'a blue bed should not be tinted like a red one');
  red.dispose(); blue.dispose();

  // And the tint must be the palette's value for that colour, not an approximation.
  //
  // Compared through THREE.Color rather than by scaling the hex myself: three.js converts an sRGB hex
  // into linear working space, so the geometry stores 0.008 for cyan's 0.086. A naive sRGB fraction
  // can never match, which is how the first version of this assertion failed while the code was
  // correct.
  const cyan = createBedGeometry(false, 3, textures, 'cyan');
  const expected = new THREE.Color(DYE_COLOURS.cyan);
  const found = tints(cyan).some(v => v.startsWith(expected.r.toFixed(3)));
  assert.ok(found, 'the cyan bed should carry the palette cyan in linear space, looked for '
    + expected.r.toFixed(3) + ' in ' + tints(cyan).join(' '));
  cyan.dispose();
});

test('omitting the colour keeps the previous red behaviour', () => {
  // The refactor must not change what existing red beds look like.
  const withColour = createBedGeometry(false, 3, textures, 'red');
  const without = createBedGeometry(false, 3, textures);
  assert.deepEqual(tints(without), tints(withColour),
    'a bed with no colour should be tinted exactly as red, which is what it was before');
  withColour.dispose(); without.dispose();
});

test('the head and foot differ, and both are flat boxes', () => {
  // A bed occupies three pixels of height in vanilla. A head drawn as a full cube would look like a
  // wool block, which is the failure the non-cube dispatch exists to prevent.
  for (const isHead of [false, true]) {
    const geo = createBedGeometry(isHead, 3, textures, 'white');
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    assert.ok(b.max.y <= 0.6, (isHead ? 'head' : 'foot') + ' should be a low box, got height ' + b.max.y);
    assert.ok(b.max.y > 0.4, (isHead ? 'head' : 'foot') + ' should still be bed-height, got ' + b.max.y);
    geo.dispose();
  }
  const foot = createBedGeometry(false, 3, textures, 'white');
  const head = createBedGeometry(true, 3, textures, 'white');
  assert.notEqual(foot.attributes.position.count, head.attributes.position.count,
    'the head and foot should be different meshes');
  foot.dispose(); head.dispose();
});

test('a bed geometry carries every attribute the shaders expect', () => {
  const geo = createBedGeometry(false, 3, textures, 'lime');
  for (const attr of ['position', 'normal', 'uv', 'color', 'emission', 'flame']) {
    assert.ok(geo.attributes[attr], 'missing attribute: ' + attr);
  }
  geo.dispose();
});

void DYE_COLOURS;
