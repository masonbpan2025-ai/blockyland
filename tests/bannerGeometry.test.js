// Banner geometry and colour tests.
//
// A banner is the first shape in this project whose COLOUR is data rather than texture, which is the
// interesting part: sixteen blocks share one cloth tile and differ only by a tint applied to the
// `color` attribute. buildBox gained a tint for it.
//
// Two bugs are pinned here. The colour derivation's regex matched only the standing form while the
// family regex matched both forms, so all sixteen WALL banners fell through to white -- they rendered,
// they were just the wrong colour. And that bug then survived a full regeneration, because the
// generator carries previous definitions forward verbatim and therefore cannot fix a fault in them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { createBannerGeometry, createPressurePlateGeometry } from '../src/slab.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { DYE_COLOURS } from '../src/colourPalette.js';
import * as THREE from 'three';

const textures = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 0.25, v1: 0.25 }) };
const def = () => BLOCK_DEFS[BLOCKS.WHITE_BANNER];

/** The distinct red values in the geometry's `color` attribute, which is where a tint shows up. */
function redValues(geo) {
  const c = geo.attributes.color;
  const seen = new Set();
  for (let i = 0; i < c.count; i++) seen.add(c.getX(i).toFixed(3));
  return [...seen].sort();
}

test('a banner is a pole with a cloth panel', () => {
  const d = def();
  assert.ok(d, 'the white banner should exist');
  assert.equal(d.banner, true, 'and must be marked so the mesher routes it');

  const geo = createBannerGeometry(d, textures, 'white');
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  assert.equal(b.min.y, 0, 'the pole reaches the floor');
  assert.equal(b.max.y, 1, 'and the top');
  assert.ok(b.max.x - b.min.x < 1, 'the cloth is narrower than the block');
  // Pole plus cloth.
  assert.equal(geo.attributes.position.count, 48, 'a banner is two boxes');
  geo.dispose();
});

test('the cloth takes the dye colour and the pole does not', () => {
  // Two distinct red values in the mesh: the wood pole is constant, the cloth varies by colour. If the
  // tint were applied to the whole geometry the pole would change colour too.
  const wood = new THREE.Color(0x8b653e).r.toFixed(3);
  for (const colour of Object.keys(DYE_COLOURS)) {
    const geo = createBannerGeometry(def(), textures, colour);
    const reds = redValues(geo);
    assert.ok(reds.includes(wood), colour + ' banner should keep its wood pole, reds were ' + reds.join(', '));
    assert.equal(reds.length, 2, colour + ' banner should have exactly two tints, got ' + reds.join(', '));
    geo.dispose();
  }
});

test('every dye colour produces a different cloth', () => {
  // The FULL RGB triple is compared, not one channel.
  //
  // orange is #f9801d and white is #f9fffe: the same red, different green and blue. An earlier version
  // of this test compared only red and reported them as indistinguishable, which was a false alarm
  // about the palette rather than a fault in the code.
  const clothTints = (colour) => {
    const geo = createBannerGeometry(def(), textures, colour);
    const wood = new THREE.Color(0x8b653e).r.toFixed(3);
    const c = geo.attributes.color;
    const tints = new Set();
    for (let i = 0; i < c.count; i++) {
      // Skip the pole, which is always wood-coloured.
      if (c.getX(i).toFixed(3) === wood) continue;
      tints.add(c.getX(i).toFixed(3) + ',' + c.getY(i).toFixed(3) + ',' + c.getZ(i).toFixed(3));
    }
    geo.dispose();
    return [...tints];
  };

  const seen = new Map();
  for (const colour of Object.keys(DYE_COLOURS)) {
    const tints = clothTints(colour);
    assert.equal(tints.length, 1, colour + ' should have exactly one cloth tint, got ' + tints.join(' | '));
    const key = tints[0];
    assert.equal(seen.has(key), false,
      colour + ' and ' + seen.get(key) + ' share the cloth tint ' + key + ', so they are indistinguishable');
    seen.set(key, colour);
  }
  assert.equal(seen.size, 16, 'expected sixteen distinct cloth tints, got ' + seen.size);
});

test('every banner has a colour, including the wall form', () => {
  // The regression: the family regex matched `*_wall_banner` but the colour regex did not, so sixteen
  // wall banners rendered white.
  const banners = Object.entries(BLOCKS).filter(([k]) => /_BANNER$/.test(k) && typeof BLOCKS[k] === 'number');
  assert.ok(banners.length >= 32, 'expected standing and wall banners, found ' + banners.length);
  for (const [key, id] of banners) {
    const colour = BLOCK_DEFS[id]?.bannerColour;
    assert.ok(colour, key + ' has no bannerColour, so it would render white');
    assert.ok(DYE_COLOURS[colour], key + ' has an unknown colour ' + colour);
  }
  // Both forms of each colour must carry the same colour.
  for (const colour of Object.keys(DYE_COLOURS)) {
    const standing = BLOCKS[colour.toUpperCase() + '_BANNER'];
    const wall = BLOCKS[colour.toUpperCase() + '_WALL_BANNER'];
    if (standing === undefined || wall === undefined) continue;
    assert.equal(BLOCK_DEFS[wall].bannerColour, BLOCK_DEFS[standing].bannerColour,
      colour + ' standing and wall banners should agree on their colour');
  }
});

test('the mesher draws a banner as a shape, not a cube', () => {
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  const mesher = new ChunkMesher(textures);
  world.setVoxel(4, 4, 4, BLOCKS.CYAN_BANNER);
  const g = mesher.meshChunk(chunk, world);
  assert.ok(g.lightGeo, 'a banner produces its own geometry');
  assert.equal(g.lightGeo.attributes.position.count, 48,
    'the mesher drew ' + g.lightGeo.attributes.position.count + ' vertices, expected 48');
  for (const v of Object.values(g)) v?.dispose?.();
});

test('the tint did not leak into other shapes', () => {
  // buildBox gained a tint for banners, and every other shape passes no tint. A default that was not
  // white would silently recolour all of them.
  for (const [label, geo] of [
    ['pressure plate', createPressurePlateGeometry(def(), textures)],
  ]) {
    const c = geo.attributes.color;
    for (let i = 0; i < c.count; i++) {
      assert.equal(c.getX(i), 1, label + ' should be untinted white, vertex ' + i + ' is ' + c.getX(i));
      assert.equal(c.getY(i), 1, label + ' should be untinted white');
      assert.equal(c.getZ(i), 1, label + ' should be untinted white');
    }
    geo.dispose();
  }
});

test('every banner has a matching item so it can be placed', () => {
  const banners = Object.entries(BLOCKS).filter(([k]) => /_BANNER$/.test(k) && typeof BLOCKS[k] === 'number');
  const missing = banners.filter(([k]) => ITEMS[k.toLowerCase()] === undefined).map(([k]) => k.toLowerCase());
  assert.deepEqual(missing, [], 'these banners cannot be picked up: ' + missing.join(', '));
});
