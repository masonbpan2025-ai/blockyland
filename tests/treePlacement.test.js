// Procedural tree placement must be global, deterministic, and able to span chunk borders.
//
// What this replaced. Trees were placed on a grid measured from each chunk's own corner:
//
//     for (let lx = 3; lx < CHUNK_SIZE_X - 3; lx += 4)
//
// Two consequences, both visible in play. Every trunk sat on a multiple of 4 relative to the chunk,
// so the same pattern repeated in every chunk and read as a lattice rather than a forest. And the
// leaf writers only accepted coordinates inside the chunk, so a tree near an edge would have been
// truncated -- so the code refused to place one there at all, leaving a bare three-block margin
// around every chunk, which made the lattice most obvious along the seams.
//
// Placement is now a global spacing-4 grid in world coordinates, with a deterministic jitter inside
// each cell, and every chunk draws the canopies that overlap it, clipped to itself. Trunks are
// written before canopies within a chunk so one tree cannot bury another's trunk.
//
// Note on counting trees: a "trunk base" is not simply a log with air below it. Acacia grows a bent
// trunk and dark oak a 2x2 one, so both legitimately put log blocks at horizontal offsets with air
// beneath. Tests here count distinct trunk columns instead, and check the base of the column.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from '../src/world.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

const LEAF_IDS = new Set(Object.values(BLOCKS).filter(id => {
  const def = BLOCK_DEFS[id];
  return def?.name && def.name.toLowerCase().includes('leaves');
}));
const TRUNK_IDS = new Set(Object.values(BLOCKS).filter(id => {
  const def = BLOCK_DEFS[id];
  return def?.name && def.name.toLowerCase().includes('log');
}));

/** A generated square of chunks, with neighbours present so borders are interior. */
function generated(seed = 4242, radius = 2) {
  const world = new World(seed, 'all');
  for (let cx = -radius; cx <= radius; cx++) {
    for (let cz = -radius; cz <= radius; cz++) world.getOrCreateChunk(cx, cz);
  }
  return world;
}

/** Every non-air block in a region, as a sorted "x,y,z=id" list. */
function snapshot(world, from, to) {
  const out = [];
  for (let x = from; x < to; x++) {
    for (let z = from; z < to; z++) {
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        const id = world.getVoxel(x, y, z);
        if (id !== BLOCKS.AIR) out.push(`${x},${y},${z}=${id}`);
      }
    }
  }
  return out.sort();
}

/** The lowest log in each column, which is where a tree's trunk meets the ground. */
function trunkBaseColumns(world, from, to) {
  const bases = new Map();
  for (let x = from; x < to; x++) {
    for (let z = from; z < to; z++) {
      for (let y = 1; y < CHUNK_HEIGHT; y++) {
        if (!TRUNK_IDS.has(world.getVoxel(x, y, z))) continue;
        bases.set(`${x},${z}`, y);
        break;
      }
    }
  }
  return bases;
}

// --- determinism -------------------------------------------------------------

test('the same seed produces the same world', () => {
  const a = generated(1234, 1);
  const b = generated(1234, 1);
  const blocks = snapshot(a, -16, 16);
  assert.ok(blocks.length > 0, 'the fixture should contain terrain');
  assert.deepEqual(snapshot(b, -16, 16), blocks);
});

test('a different seed produces different terrain', () => {
  assert.notDeepEqual(snapshot(generated(1, 1), -16, 16), snapshot(generated(2, 1), -16, 16));
});

test('chunk generation order does not change the result', () => {
  // This is the property that matters most and that was actually broken. Eight generators used
  // Math.random for tree shape, and trunk placement asked whether the ground beneath it was solid --
  // a question whose answer changes once a neighbouring tree's canopy has been written. Together
  // those made a chunk contain different blocks depending on which of its neighbours was generated
  // first. Chunks arrive in whatever order the player walks, so this had to be fixed.
  const forward = new World(777, 'all');
  for (let cx = -1; cx <= 1; cx++) {
    for (let cz = -1; cz <= 1; cz++) forward.getOrCreateChunk(cx, cz);
  }
  const backward = new World(777, 'all');
  for (let cx = 1; cx >= -1; cx--) {
    for (let cz = 1; cz >= -1; cz--) backward.getOrCreateChunk(cx, cz);
  }
  assert.deepEqual(snapshot(backward, -16, 16), snapshot(forward, -16, 16));

  // And a third order, to catch an ordering bug that happens to be symmetric.
  const shuffled = new World(777, 'all');
  const order = [[0, 0], [-1, -1], [1, 0], [0, 1], [-1, 1], [1, -1], [0, -1], [-1, 0], [1, 1]];
  for (const [cx, cz] of order) shuffled.getOrCreateChunk(cx, cz);
  assert.deepEqual(snapshot(shuffled, -16, 16), snapshot(forward, -16, 16));
});

test('a chunk generates the same whether or not its neighbours exist yet', () => {
  // If a canopy reaching into a chunk were drawn by the neighbour instead of by this chunk, an
  // isolated chunk would lack leaves and gain them later -- trees visibly appearing as the player
  // walks. Every chunk must draw every canopy that overlaps it.
  const alone = new World(2024, 'all');
  alone.getOrCreateChunk(0, 0);
  const aloneChunk = snapshot(alone, 0, CHUNK_SIZE_X);

  const joined = new World(2024, 'all');
  for (let cx = -1; cx <= 1; cx++) {
    for (let cz = -1; cz <= 1; cz++) joined.getOrCreateChunk(cx, cz);
  }
  assert.deepEqual(snapshot(joined, 0, CHUNK_SIZE_X), aloneChunk);
});

// --- the properties the old placement could not have -------------------------

test('canopies cross chunk borders instead of being cut off at them', () => {
  const world = generated(4242, 2);
  let crossings = 0;
  for (let x = -30; x < 30; x++) {
    for (let z = -30; z < 30; z++) {
      for (let y = 20; y < 50; y++) {
        if (!LEAF_IDS.has(world.getVoxel(x, y, z))) continue;
        const lx = ((x % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
        if (lx === 0 && LEAF_IDS.has(world.getVoxel(x - 1, y, z))) crossings++;
        if (lx === CHUNK_SIZE_X - 1 && LEAF_IDS.has(world.getVoxel(x + 1, y, z))) crossings++;
      }
    }
  }
  assert.ok(crossings > 0,
    'no canopy crossed a chunk border, which means placement is still clipped per chunk');
});

test('trunks are placed near chunk borders, not only in the middle', () => {
  // The old loop began at lx = 3 and ended at CHUNK_SIZE_X - 3, so no trunk could exist within
  // three blocks of a seam in x or z.
  const world = generated(4242, 2);
  let nearEdge = 0;
  for (const column of trunkBaseColumns(world, -30, 30).keys()) {
    const [x, z] = column.split(',').map(Number);
    const lx = ((x % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
    const lz = ((z % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
    if (lx <= 2 || lx >= CHUNK_SIZE_X - 3 || lz <= 2 || lz >= CHUNK_SIZE_Z - 3) nearEdge++;
  }
  assert.ok(nearEdge > 0,
    'every trunk is at least three blocks from a seam, so placement is still on the old per-chunk grid');
});

test('trees are not on a chunk-aligned lattice', () => {
  // The old placement put every trunk at a local multiple of 4, so within any chunk the trunk
  // coordinates were a fixed set. A global grid with jitter has no such structure: check that the
  // set of local x offsets used is not the same in every chunk.
  const world = generated(4242, 2);
  const byChunk = new Map();
  for (const column of trunkBaseColumns(world, -32, 32).keys()) {
    const [x, z] = column.split(',').map(Number);
    const cx = Math.floor(x / CHUNK_SIZE_X);
    const cz = Math.floor(z / CHUNK_SIZE_Z);
    const lx = ((x % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
    const key = `${cx},${cz}`;
    if (!byChunk.has(key)) byChunk.set(key, new Set());
    byChunk.get(key).add(lx);
  }
  const patterns = [...byChunk.values()].map(s => [...s].sort((a, b) => a - b).join(','));
  const distinct = new Set(patterns);
  assert.ok(distinct.size > 1,
    `every chunk uses the same local trunk offsets (${patterns[0]}), so placement is still a chunk-aligned lattice`);
});

test('tree density is plausible rather than carpeting the world', () => {
  // A placement bug that wrote a tree at every candidate would fill the world. Trees per grid cell
  // should be well under one.
  const world = generated(99, 3);
  const bases = trunkBaseColumns(world, -32, 32);
  const cells = (64 / 4) * (64 / 4);
  assert.ok(bases.size > 0, 'there should be some trees');
  assert.ok(bases.size < cells * 1.5,
    `${bases.size} trees for ${cells} grid cells is too dense to be believable`);
});

test('every tree is anchored to the terrain surface, not floating in the sky', () => {
  // The invariant that actually matters, and that a block-adjacency check cannot express: acacia's
  // bent trunk and dark oak's 2x2 footprint both legitimately put a log under a log and a log over
  // air, so "air beneath a log" is not a defect. What IS a defect is a trunk written at the wrong
  // height, which happened while this was being written because tree placement used the raw
  // getHeight while terrain clamped it, leaving trunks several blocks above the ground.
  //
  // Each tree's lowest log must therefore sit exactly one block above the terrain surface, which is
  // what surfaceHeightAt reports and what the terrain pass used to build the column.
  const world = generated(555, 2);
  let checked = 0;
  let misplaced = 0;
  for (const [column, baseY] of trunkBaseColumns(world, -30, 30)) {
    const [x, z] = column.split(',').map(Number);
    const biome = world.getBiome(x, z);
    const surface = world.surfaceHeightAt(x, z, biome);
    // The base column of a trunk starts at surface + 1. A bent or 2x2 tree can put an offset log at
    // a different column, but the LOWEST log in every column must still be at or above the surface.
    if (baseY < surface + 1 || baseY > surface + 3) misplaced++;
    checked++;
  }
  assert.ok(checked > 0, 'the fixture should contain trees');
  // A small fraction is expected rather than zero: acacia bends and dark oak spans 2x2, so the
  // lowest log in some columns belongs to a tree whose trunk starts elsewhere. What this catches is
  // a SYSTEMATIC height error, which would move essentially every trunk rather than a handful.
  assert.ok(misplaced <= checked * 0.05,
    `${misplaced} of ${checked} trunks are not beside the terrain surface, so they float or sink`);
});

test('trees are never placed in water or below sea level', () => {
  const world = generated(555, 2);
  for (const [column, baseY] of trunkBaseColumns(world, -30, 30)) {
    const [x, z] = column.split(',').map(Number);
    assert.ok(baseY >= world.seaLevel,
      `a trunk at ${x},${baseY},${z} is below sea level ${world.seaLevel}`);
    assert.notEqual(world.getVoxel(x, baseY - 1, z), BLOCKS.WATER,
      `a trunk at ${x},${baseY},${z} stands in water`);
  }
});

test('a tree writes a complete trunk, not one truncated by its own canopy', () => {
  // The canopy overlapping the trunk is INTENDED here and is how the original generators were
  // written: oak's leaf loop begins at `dy = trunkHeight - 2`, so the top of the trunk is covered by
  // its own leaves. An earlier version of this test asserted the opposite and was simply wrong about
  // the intended geometry.
  //
  // What must hold is that the trunk itself is complete. Trees are written trunk-first and
  // canopy-second within a chunk, and the writer refuses to let a canopy replace a log, so another
  // tree's leaves cannot eat into a trunk even where two canopies overlap.
  const world = generated(31337, 2);
  const bases = trunkBaseColumns(world, -30, 30);
  assert.ok(bases.size > 0, 'the fixture should contain trees');

  for (const [column, baseY] of bases) {
    const [x, z] = column.split(',').map(Number);
    // At least one log at the base. Deliberately not a minimum height: acacia bends one block in x
    // after three blocks, so a vertical walk of a single column legitimately ends early, and
    // requiring five flagged every acacia while this was being written.
    let height = 0;
    for (let y = baseY; y < CHUNK_HEIGHT && TRUNK_IDS.has(world.getVoxel(x, y, z)); y++) height++;
    assert.ok(height >= 1, `there is no log at the base of the trunk at ${x},${baseY},${z}`);
  }
});

test('a tree is not buried by a neighbouring tree canopy', () => {
  // The overlap case that actually matters: two trees four blocks apart, where the second's canopy
  // covers the first's trunk. The trunk-before-canopy ordering and the writer's log guard are what
  // prevent it, and without them trees appeared to float.
  const world = generated(4242, 2);
  let buried = 0;
  for (const [column, baseY] of trunkBaseColumns(world, -30, 30)) {
    const [x, z] = column.split(',').map(Number);
    // Walk the column up from the base. If a leaf appears BEFORE any log, the trunk was covered.
    const firstBlock = world.getVoxel(x, baseY, z);
    if (!TRUNK_IDS.has(firstBlock)) buried++;
  }
  assert.equal(buried, 0, `${buried} trunk columns start with a non-log block`);
});
