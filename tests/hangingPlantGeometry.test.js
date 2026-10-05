// Ceiling-anchored plants.
//
// The cross-quad model is floor-anchored: its texture's top edge sits at the TOP of the block, which is
// right for a flower growing up and wrong for roots hanging down. Hanging roots would render upside
// down without a flip, so the mesher reads `hang: true` off the definition and swaps the V coordinates
// while leaving the cell itself unchanged.
//
// These tests pin the flip, and pin that the floor plants are NOT flipped -- a shared code path that
// quietly flipped everything would be worse than not having the feature.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

// Distinct u and v so a flipped quad is distinguishable from an upright one rather than symmetric.
const texStub = {
  getFaceUVs: () => ({ u0: 0.1, v0: 0.2, u1: 0.9, v1: 0.8 }),
};

/** Mesh one block at (2, 40, 2) and return the transparent geometry's uv pairs. */
function uvFor(blockId) {
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  world.setVoxel(2, 40, 2, blockId);
  const mesher = new ChunkMesher(texStub);
  const geom = mesher.meshChunk(chunk, world).transparentGeo;
  assert.ok(geom, 'the plant should land in the transparent geometry');
  const uv = geom.attributes.uv;
  const out = [];
  for (let i = 0; i < uv.count; i++) out.push([uv.getX(i), uv.getY(i)]);
  return out;
}

// The geometry stores UVs as float32, so 0.2 reads back as 0.20000000298. Compare with a tolerance:
// an exact comparison fails on the representation rather than on the behaviour.
const near = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: expected ~${expected}, got ${actual}`);

test('the hanging plant is registered and marked as hanging', () => {
  const def = BLOCK_DEFS[BLOCKS.HANGING_ROOTS];
  assert.ok(def, 'hanging roots must be registered');
  assert.equal(def.hang, true, 'hanging roots must carry the hang marker');
  assert.equal(def.plant, true, 'and still be a cross-quad plant');
  assert.equal(def.solid, false, 'and not block movement');
});

test('a hanging plant draws its texture flipped, top edge at the ceiling', () => {
  const hanging = uvFor(BLOCKS.HANGING_ROOTS);
  const upright = uvFor(BLOCKS.POPPY);
  assert.equal(hanging.length, upright.length, 'both plants are the same two quads');

  // The first quad's first vertex: upright starts at v0 (the texture's top, drawn at the block's top),
  // hanging starts at v1 so the artwork hangs the other way up.
  near(upright[0][1], 0.2, 'an upright plant starts at v0');
  near(hanging[0][1], 0.8, 'a hanging plant starts at v1');

  // And the quad is genuinely reversed rather than merely shifted: the two must disagree.
  assert.notDeepEqual(hanging, upright, 'the flip must actually change the UVs');
});

test('floor plants are not flipped by the hanging code path', () => {
  // A shared code path that flipped everything would be worse than no feature, so this checks the
  // unmarked plants directly: each of these is an ordinary floor cross-quad.
  for (const key of ['POPPY', 'DANDELION', 'SHORT_GRASS', 'FERN', 'SPORE_BLOSSOM', 'TALL_GRASS']) {
    const uv = uvFor(BLOCKS[key]);
    near(uv[0][1], 0.2, `${key} must draw upright`);
  }
});

test('the hanging marker is present on exactly the blocks that need it', () => {
  // Guards against the flag being copy-pasted onto a floor plant, which would silently turn it upside
  // down and still pass every other test in this file.
  const hanging = Object.entries(BLOCK_DEFS)
    .filter(([, def]) => def?.hang)
    .map(([, def]) => def.name);
  assert.deepEqual(hanging, ['Hanging Roots'],
    `only hanging roots should be ceiling-anchored, found: ${hanging.join(', ')}`);
});
