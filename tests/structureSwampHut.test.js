// Swamp hut tests, written from the wiki (https://minecraft.wiki/w/Swamp_Hut) rather than from the generator.
//
// The first generator was a seven-block cube on four corner legs with no furnishings, spruce-log legs, no porch
// and a witch and cat nobody could see spawn. Each test below states one thing the wiki says and fails if the
// hut does not do it. The same facts are checked live, in both modes, by the Inspector's Audit panel
// (`src/structureAuditCards.js`, facts H1..H20); `tests/structureAudit.test.js` runs that card.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateSwampHut, realizeSwampHut, buildSwampHut,
  HUT_WIDTH, HUT_HEIGHT, HUT_DEPTH, HUT_FLOOR_Y, HUT_LEGS, HUT_ENTITIES, HUT_STILT_HEIGHT
} from '../src/worldgen/generators/swampHut.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';
import { World } from '../src/world.js';
import { resolveSpawnList } from '../src/spawning/biomeSpawnResolver.js';

const swamp = { biomeAt: () => 'swamp', surfaceY: () => 64 };
/** Terrain that is not flat, so a hut's pillars have to find different ground. */
const slope = { biomeAt: () => 'swamp', surfaceY: (x, z) => 40 + ((x * 3 + z * 5) % 5) };

function realize(start, options = {}) {
  const writes = [];
  const spawns = [];
  const report = realizeSwampHut(start, (x, y, z, id, meta) => { writes.push({ x, y, z, id, meta }); return true; }, BLOCKS, {
    spawnMob: (type, x, y, z, o) => { spawns.push({ type, x, y, z, o }); return true; }, ...options
  });
  return { writes, spawns, report };
}
const named = (writes, name) => writes.filter((w) => w.meta.state.name === name);

test('registered, swamp only (not mangrove), hardcoded, and with NO terrain shaping', () => {
  assert.ok(generatorCoverage().implemented.includes('swamp_hut'));
  assert.ok(GENERATORS.swampHut.realize);
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...swamp });
  assert.deepEqual(engine.registry.swamp_hut.biomes, ['swamp'], 'the wiki: mangrove swamps do not generate huts');
  assert.equal(engine.registry.swamp_hut.family, 'hardcoded');
  // The wiki describes pillars reaching the ground, not terrain shaping: a beard would bury the stilts.
  assert.equal(engine.registry.swamp_hut.terrainAdaptation, 'none');
});

test('the piece box is the wiki\'s 7 x 7 x 9 spawn volume, in every orientation', () => {
  assert.deepEqual([HUT_WIDTH, HUT_HEIGHT, HUT_DEPTH], [7, 7, 9]);
  const seen = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const start = generateSwampHut({ seed, chunkX: seed, chunkZ: -seed, context: swamp });
    const box = start.pieces[0].box;
    const d = [box.maxX - box.minX + 1, box.maxY - box.minY + 1, box.maxZ - box.minZ + 1];
    assert.equal(d[1], 7);
    assert.ok((d[0] === 7 && d[2] === 9) || (d[0] === 9 && d[2] === 7), `box ${d}`);
    seen.add(`${d[0]}x${d[2]}`);
  }
  assert.equal(seen.size, 2, 'both orientations occur: the hut is rotated at random');
});

test('materials: spruce planks, oak-log pillars, spruce stairs and planks for the roof', () => {
  const start = generateSwampHut({ seed: 5, chunkX: 3, chunkZ: 3, context: swamp });
  const { writes, report } = realize(start);
  assert.deepEqual(report.missingBlocks, []);
  const names = new Set(writes.map((w) => w.meta.state.name));
  for (const wanted of ['minecraft:spruce_planks', 'minecraft:oak_log', 'minecraft:spruce_stairs']) assert.ok(names.has(wanted), wanted);
  // Nothing from another wood: no spruce log pillars (the old bug), no oak planks, no birch.
  for (const name of names) {
    if (/_planks$|_log$|_stairs$/.test(name)) assert.match(name, /^minecraft:(spruce_planks|oak_log|spruce_stairs)$/, name);
  }
});

test('interior height is two blocks: floor, two open blocks, roof', () => {
  const start = generateSwampHut({ seed: 5, chunkX: 3, chunkZ: 3, context: swamp });
  const { writes } = realize(start);
  const floorY = start.meta.floorY;
  const roof = writes.filter((w) => w.y === floorY + 3 && /spruce_(planks|stairs)/.test(w.meta.state.name));
  assert.ok(roof.length >= 30, 'a roof layer three above the floor');
  const walls = writes.filter((w) => (w.y === floorY + 1 || w.y === floorY + 2) && w.meta.state.name === 'minecraft:spruce_planks');
  assert.ok(walls.length > 0);
  assert.equal(writes.filter((w) => w.y > floorY + 3 && w.meta.state.name !== 'minecraft:spruce_stairs').length, 0, 'nothing above the roof');
});

test('there is no door: the entrance is an open doorway', () => {
  const start = generateSwampHut({ seed: 8, chunkX: 1, chunkZ: 1, context: swamp });
  const { writes } = realize(start);
  assert.equal(writes.filter((w) => /_door/.test(w.meta.state.name)).length, 0);
  // The doorway: two air blocks cut through the front wall at the middle.
  const doorway = writes.filter((w) => w.meta.state.name === 'minecraft:air' && w.y > start.meta.floorY && w.y <= start.meta.floorY + 2);
  assert.ok(doorway.length >= 2);
});

test('furnishings: a crafting table, an EMPTY cauldron and a flower pot with a red mushroom; no chest', () => {
  const start = generateSwampHut({ seed: 5, chunkX: 3, chunkZ: 3, context: swamp });
  const { writes } = realize(start);
  assert.equal(named(writes, 'minecraft:crafting_table').length, 1);
  assert.equal(named(writes, 'minecraft:cauldron').length, 1, 'one cauldron, and it is the empty one');
  assert.equal(writes.filter((w) => /water_cauldron|lava_cauldron|powder_snow_cauldron/.test(w.meta.state.name)).length, 0, 'always empty in Java');
  assert.equal(named(writes, 'minecraft:potted_red_mushroom').length, 1);
  assert.equal(writes.filter((w) => /chest|barrel/.test(w.meta.state.name) || w.meta.lootTable).length, 0, 'no chest and no loot');
  // The table and the cauldron stand on the floor; the pot sits on the sill of a window, one block higher.
  for (const name of ['minecraft:crafting_table', 'minecraft:cauldron']) {
    assert.equal(named(writes, name)[0].y, start.meta.floorY + 1, `${name} stands on the floor`);
  }
  assert.equal(named(writes, 'minecraft:potted_red_mushroom')[0].y, start.meta.floorY + 2, 'the pot is on the window sill');
});

test('the wiki image details: four oak fences (porch corners, wall tops), window openings, one open front block', () => {
  const start = generateSwampHut({ seed: 5, chunkX: 3, chunkZ: 3, context: swamp });
  const { writes } = realize(start);
  const fences = named(writes, 'minecraft:oak_fence');
  assert.equal(fences.length, 4);
  // Two fences are on the porch row (the same distance from the front), at floor + 1; two sit on wall tops at floor + 2.
  assert.equal(fences.filter((f) => f.y === start.meta.floorY + 1).length, 2);
  assert.equal(fences.filter((f) => f.y === start.meta.floorY + 2).length, 2);
  // 26 wall blocks per level pair, minus 3 windows, 2 fence posts and the pot = 20 planks in the walls.
  const wall = writes.filter((w) => w.meta.state.name === 'minecraft:spruce_planks'
    && (w.y === start.meta.floorY + 1 || w.y === start.meta.floorY + 2));
  assert.equal(wall.length, 20);
});

test('the porch is raised and has no stairs up to it; the floor stands on stilts above the ground', () => {
  const start = generateSwampHut({ seed: 5, chunkX: 3, chunkZ: 3, context: swamp });
  assert.ok(start.meta.floorY - start.meta.ground >= HUT_STILT_HEIGHT, 'several blocks above the ground');
  const { writes } = realize(start);
  const stairsLow = writes.filter((w) => /_stairs$/.test(w.meta.state.name) && w.y < start.meta.floorY + 3);
  assert.equal(stairsLow.length, 0, 'the only stairs are in the roof');
});

test('pillars reach down to the ground under each of them, over flat ground and over a slope', () => {
  for (const [label, context] of [['flat', swamp], ['slope', slope]]) {
    for (let seed = 1; seed <= 6; seed++) {
      const start = generateSwampHut({ seed, chunkX: 4 * seed, chunkZ: seed, context });
      const { writes } = realize(start);
      const columns = new Map();
      for (const w of writes) {
        if (w.meta.state.name !== 'minecraft:oak_log') continue;
        const key = `${w.x},${w.z}`;
        columns.set(key, Math.min(columns.get(key) ?? Infinity, w.y));
      }
      assert.equal(columns.size, HUT_LEGS.length, `${label}: one pillar per leg`);
      for (const [key, minY] of columns) {
        const [x, z] = key.split(',').map(Number);
        assert.ok(minY <= context.surfaceY(x, z) + 1, `${label} seed ${seed}: the pillar at ${key} stops at ${minY}, above the ground ${context.surfaceY(x, z)}`);
      }
    }
  }
  // A canyon: ground far below one corner. The pillar there is long ("pillars reaching the canyon bottom").
  const canyon = { biomeAt: () => 'swamp', surfaceY: (x, z) => (x % 16 < 3 ? 20 : 40) };
  const start = generateSwampHut({ seed: 2, chunkX: 6, chunkZ: 6, context: canyon });
  assert.ok(Math.max(...start.meta.legDepths) >= 10, 'a deep pillar over the low ground');
});

test('one witch and one black cat, both persistent, placed inside the hut above the floor', () => {
  assert.equal(HUT_ENTITIES.length, 2);
  const start = generateSwampHut({ seed: 5, chunkX: 3, chunkZ: 3, context: swamp });
  const { spawns, report } = realize(start);
  assert.deepEqual(report.spawned.sort(), ['cat', 'witch']);
  const box = start.pieces[0].box;
  for (const spawn of spawns) {
    assert.equal(spawn.o.persistent, true, `${spawn.type} must not despawn`);
    assert.ok(box.contains(Math.floor(spawn.x), Math.floor(spawn.y), Math.floor(spawn.z)), `${spawn.type} is inside the hut`);
    assert.ok(spawn.y >= start.meta.floorY + 1, `${spawn.type} stands on the floor, not in it`);
  }
  assert.equal(spawns.find((s) => s.type === 'cat').o.variant, 'all_black');
  const template = new StructureTemplate(buildSwampHut({}), 'hut');
  for (const entity of template.entities) assert.equal(entity.nbt.PersistenceRequired, 1);
  // Without a spawn callback nothing is invented.
  assert.deepEqual(realizeSwampHut(start, () => true, BLOCKS).spawned, []);
});

test('realized chunk by chunk, each mob is spawned exactly once', async () => {
  const { BlockBox } = await import('../src/worldgen/geometry.js');
  const start = generateSwampHut({ seed: 5, chunkX: 3, chunkZ: 3, context: swamp });
  const box = start.pieces[0].box;
  const all = [];
  for (let cx = Math.floor(box.minX / 16) - 1; cx <= Math.floor(box.maxX / 16) + 1; cx++) {
    for (let cz = Math.floor(box.minZ / 16) - 1; cz <= Math.floor(box.maxZ / 16) + 1; cz++) {
      realizeSwampHut(start, () => true, BLOCKS, {
        clip: BlockBox.columnOfChunk(cx, cz, -64, 320), spawnMob: (type) => { all.push(type); return true; }
      });
    }
  }
  assert.deepEqual(all.sort(), ['cat', 'witch']);
});

test('generation is deterministic and the hut is in the north-west corner of its chunk', () => {
  const a = generateSwampHut({ seed: 77, chunkX: -2, chunkZ: 4, context: slope });
  const b = generateSwampHut({ seed: 77, chunkX: -2, chunkZ: 4, context: slope });
  assert.deepEqual(a.box.toArray(), b.box.toArray());
  assert.deepEqual(a.meta, b.meta);
  const collect = (start) => realize(start).writes.map((w) => `${w.x},${w.y},${w.z},${w.id}`);
  assert.deepEqual(collect(a), collect(b));
  assert.ok(a.pieces[0].meta.origin.x === -2 * 16 && a.pieces[0].meta.origin.z === 4 * 16, 'anchored at the chunk corner');
  assert.equal(HUT_FLOOR_Y, 1);
});

// ---- the game: structure spawn box, persistence, Peaceful ---------------------------------------------------

function hutWorld(seed, difficulty = 'normal') {
  const world = new World(seed, 'swamp');
  const mobs = [];
  world.game = {
    difficulty,
    mobs: { spawnMob: (type, x, y, z, options) => { const mob = { type }; mobs.push({ type, x, y, z, options, mob }); return mob; } },
    doorManager: { adoptDoor: () => {} }, bedManager: { registerBed: () => {} },
    chestManager: { getChest: () => null, adoptChest: () => {} }
  };
  world.rebuildStructures({ enabledIds: ['swamp_hut'] });
  const found = world.structures.engine.locate('swamp_hut', 0, 0, { maxRadiusChunks: 1024 });
  const box = found.start.box;
  for (let cx = Math.floor(box.minX / 16) - 1; cx <= Math.floor(box.maxX / 16) + 1; cx++) {
    for (let cz = Math.floor(box.minZ / 16) - 1; cz <= Math.floor(box.maxZ / 16) + 1; cz++) world.getOrCreateChunk(cx, cz);
  }
  return { world, mobs, found, box };
}

test('in a real world the hut generates, and its mobs reach the game once and persist', () => {
  const { world, mobs, box } = hutWorld(2024);
  assert.equal(mobs.filter((m) => m.type === 'witch').length, 1);
  assert.equal(mobs.filter((m) => m.type === 'cat').length, 1);
  assert.equal(mobs.find((m) => m.type === 'cat').options.variant, 'all_black');
  assert.ok(mobs.every((m) => m.mob.persistenceRequired === true), 'flagged so the despawn pass leaves them alone');
  assert.equal(world.structures.pendingSpawns.length, 0);
  // The blocks are in the voxel world.
  let planks = 0;
  for (let x = box.minX; x <= box.maxX; x++) for (let z = box.minZ; z <= box.maxZ; z++) for (let y = 1; y < 64; y++) if (world.getVoxel(x, y, z) === BLOCKS.SPRUCE_PLANKS) planks++;
  assert.ok(planks >= 60, `spruce planks in the world: ${planks}`);
});

test('the witch does not spawn on Peaceful; the cat still does', () => {
  const { mobs } = hutWorld(2024, 'peaceful');
  assert.equal(mobs.filter((m) => m.type === 'witch').length, 0);
  assert.equal(mobs.filter((m) => m.type === 'cat').length, 1);
});

test('the hut\'s box is a spawn zone: witches inside it, the swamp\'s list outside it', () => {
  const { world, box } = hutWorld(2024);
  const at = (x, y, z) => world.structures.structureIdAt(x, y, z);
  const cx = Math.floor((box.minX + box.maxX) / 2);
  const cz = Math.floor((box.minZ + box.maxZ) / 2);
  assert.equal(at(cx, box.minY + 2, cz), 'swamp_hut');
  assert.equal(at(box.minX, box.minY, box.minZ), 'swamp_hut', 'one level below the floor is inside');
  assert.equal(at(box.maxX, box.maxY, box.maxZ), 'swamp_hut', 'two above the roof is inside');
  assert.equal(at(box.maxX + 1, box.minY + 2, cz), null);
  assert.equal(at(cx, box.maxY + 1, cz), null);
  const inside = resolveSpawnList({ biomeId: 'swamp', category: 'monster', x: cx, y: box.minY + 2, z: cz, structureAt: at });
  assert.equal(inside.source, 'structure');
  assert.deepEqual(inside.entries.map((e) => e.type), ['witch']);
  const outside = resolveSpawnList({ biomeId: 'swamp', category: 'monster', x: box.maxX + 4, y: box.minY + 2, z: cz, structureAt: at });
  assert.notEqual(outside.source, 'structure');
});

test('the roof stairs are registered facing up the slope on all four sides', () => {
  const { world } = hutWorld(2024);
  const stairs = [...world.structureOrientations.values()].filter((o) => /_stairs$/.test(o.name));
  assert.ok(stairs.length >= 20);
  assert.equal(new Set(stairs.map((o) => o.facing)).size, 4, 'east, west, south and north overhangs');
});
