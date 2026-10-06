import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { TextureManager } from '../src/textures.js';
import { ChunkMesher } from '../src/mesher.js';
import { World, Chunk } from '../src/world.js';

/**
 * A synthetic atlas covering every texture any block definition names, laid out the way
 * TextureManager lays them out. These tests are about the LOOKUP, so the coordinates only need
 * to be distinguishable from one another and from the missing-texture tile.
 */
function buildAtlas() {
  const map = {};
  let i = 0;
  for (const id in BLOCK_DEFS) {
    const def = BLOCK_DEFS[id];
    if (!def.textures) continue;
    for (const key in def.textures) {
      const name = def.textures[key];
      if (name in map) continue;
      const col = i % 32;
      const row = Math.floor(i / 32);
      map[name] = { col, row, u0: col / 32, u1: (col + 1) / 32, v1: 1 - row / 32, v0: 1 - (row + 1) / 32 };
      i++;
    }
  }
  return map;
}

const ATLAS = buildAtlas();

/** A namespace using the real lookup and the real mesher, with no canvas required. */
function manager(overrides = {}) {
  return Object.assign(Object.create(TextureManager.prototype), {
    tileCoords: ATLAS,
    atlasGridSize: 32,
    tileSize: 16,
    atlasTexture: null,
    ctx: null,
    nextCol: 0,
    nextRow: 20,
    ...overrides,
  });
}

/** The mesher emits one quad per unoccluded direction; a lone block in air emits all six. */
function meshFaceUVs(blockId, textures) {
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  world.setVoxel(2, 2, 2, blockId);
  const uv = new ChunkMesher(textures).meshChunk(chunk, world).opaqueGeo.attributes.uv.array;
  const faces = [];
  for (let i = 0; i < uv.length / 8; i++) faces.push({ u0: uv[i * 8], v0: uv[i * 8 + 1] });
  return faces;
}

const tileOf = name => ({ u0: ATLAS[name].u0, v0: ATLAS[name].v0 });

test('grass and other multi-texture blocks get their own tile per face, not unpainted atlas space', () => {
  const textures = manager();

  const grass = meshFaceUVs(BLOCKS.GRASS, textures);
  assert.equal(grass.length, 6, 'a lone grass block shows all six faces');
  assert.deepEqual(grass[0], tileOf('grass_block_top.png'), 'top face is the grass top');
  assert.deepEqual(grass[1], tileOf('dirt.png'), 'bottom face is dirt');
  for (const side of grass.slice(2)) {
    assert.deepEqual(side, tileOf('grass_block_side.png'), 'side faces use the grass side');
  }

  const log = meshFaceUVs(BLOCKS.OAK_LOG, textures);
  assert.deepEqual(log[0], tileOf('oak_log_top.png'), 'log top');
  assert.deepEqual(log[1], tileOf('oak_log_top.png'), 'log bottom');
  assert.deepEqual(log[2], tileOf('oak_log.png'), 'log side');

  for (const face of meshFaceUVs(BLOCKS.STONE, textures)) {
    assert.deepEqual(face, tileOf('stone.png'), 'single-texture blocks are unchanged');
  }
});

test('every face of every block resolves to a tile that block actually names', () => {
  const textures = manager();
  const missing = [];
  for (const [id, def] of Object.entries(BLOCK_DEFS)) {
    if (!def.textures) continue;
    const allowed = new Set(Object.values(def.textures));
    for (const face of ['top', 'bottom', 'north', 'south', 'east', 'west']) {
      const uv = textures.getFaceUVs(Number(id), face);
      const matched = [...allowed].some(name => ATLAS[name].u0 === uv.u0 && ATLAS[name].v0 === uv.v0);
      if (!matched) missing.push(`${def.name || id}:${face}`);
    }
  }
  // Before the face-name fix this list held every face of the 40-odd blocks with no `all`
  // texture: they all came back as the same fallback tile, which is unpainted atlas space.
  assert.deepEqual(missing, []);
});

test('a face the definition never mentions borrows a sibling texture instead of the checkerboard', () => {
  const textures = manager({ tileCoords: { ...ATLAS, 'furnace_top.png': undefined } });
  assert.deepEqual(textures.getFaceUVs(BLOCKS.FURNACE, 'top'), ATLAS['furnace_side.png'], 'borrows another texture of the same block');
  assert.deepEqual(textures.getFaceUVs(BLOCKS.FURNACE, 'north'), ATLAS['furnace_front.png'], 'the front face still wins where it exists');
});

test('an unresolvable texture reports itself once and returns the visible missing tile', () => {
  const warnings = [];
  const original = console.warn;
  console.warn = message => warnings.push(message);
  try {
    const textures = manager({ tileCoords: {} });
    const uv = textures.getFaceUVs(BLOCKS.STONE, 'top');
    assert.ok(uv.u0 >= 0 && uv.u1 <= 1 && uv.v0 >= 0 && uv.v1 <= 1, 'the tile lies inside the atlas');
    assert.notDeepEqual({ u0: uv.u0, v0: uv.v0 }, { u0: 0, v0: 0 }, 'never coordinates that point into unpainted atlas space');
    assert.equal(warnings.length, 1, 'the miss is reported');
    assert.match(warnings[0], /stone\.png/);
    textures.getFaceUVs(BLOCKS.STONE, 'bottom');
    assert.equal(warnings.length, 1, 'repeated misses for one texture do not spam the console');
  } finally {
    console.warn = original;
  }
});
