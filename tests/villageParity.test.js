// Villages in the game: realized chunk by chunk, delivered to the mob system, oriented, saved, and without holes.
//
// What is built is checked against the wiki in tests/villageWiki.test.js; this file checks the game integration.
import test from 'node:test';
import assert from 'node:assert/strict';

import { generateVillage, realizeVillage, villageElement, VILLAGE_BIOMES } from '../src/worldgen/generators/village.js';
import { BlockBox } from '../src/worldgen/geometry.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

const IDS = Object.keys(VILLAGE_BIOMES);
const contextFor = (biome) => ({ biomeAt: () => biome, surfaceY: () => 40 });

test('mobs are spawned once per village even when it is realized chunk by chunk', () => {
  for (const id of IDS) {
    const start = generateVillage({ seed: 21, chunkX: 4, chunkZ: -6, structureId: id, context: contextFor(VILLAGE_BIOMES[id].biome) });
    const whole = realizeVillage(start, () => true, BLOCKS);
    const perChunk = [];
    for (let cx = Math.floor(start.box.minX / 16) - 1; cx <= Math.floor(start.box.maxX / 16) + 1; cx++) {
      for (let cz = Math.floor(start.box.minZ / 16) - 1; cz <= Math.floor(start.box.maxZ / 16) + 1; cz++) {
        const clip = BlockBox.columnOfChunk(cx, cz, -64, 320);
        realizeVillage(start, () => true, BLOCKS, { clip, spawnMob: (type, x, y, z) => perChunk.push(type + '@' + x + ',' + y + ',' + z) });
      }
    }
    assert.equal(perChunk.length, whole.spawns.length, id + ': every mob spawned exactly once across the chunks');
    assert.equal(new Set(perChunk).size, perChunk.length, id + ': no mob is spawned twice');
  }
});

function gameStub(spawned, adopted) {
  return {
    mobs: { spawnMob: (type, x, y, z, options) => { spawned.push({ type, x, y, z, options }); return { type }; } },
    doorManager: { adoptDoor: (pos, facing) => adopted.doors.push({ pos, facing }) },
    bedManager: { registerBed: (foot, head, dir) => adopted.beds.push({ foot, head, dir }) },
    chestManager: { getChest: () => null, adoptChest: (pos, facing, items) => adopted.chests.push({ pos, facing, items }) }
  };
}

test('a generated world gets a village of each type with villagers, a golem, its beds, doors, crops and bell', async () => {
  const { World } = await import('../src/world.js');
  const { locateNearestStructure } = await import('../src/worldStructures.js');
  for (const id of IDS) {
    const biome = VILLAGE_BIOMES[id].biome;
    const world = new World(2024, biome);
    const spawned = [];
    const adopted = { doors: [], beds: [], chests: [] };
    world.game = gameStub(spawned, adopted);
    world.rebuildStructures({ enabledIds: [id] });
    const found = locateNearestStructure(world, id, 0, 0, { maxRadiusChunks: 200 });
    const [minX, , minZ, maxX, , maxZ] = found.box;
    for (let cx = Math.floor(minX / 16) - 1; cx <= Math.floor(maxX / 16) + 1; cx++) {
      for (let cz = Math.floor(minZ / 16) - 1; cz <= Math.floor(maxZ / 16) + 1; cz++) world.getOrCreateChunk(cx, cz);
    }
    const villagers = spawned.filter((mob) => mob.type === 'villager' || mob.type === 'zombie_villager').length;
    assert.ok(villagers >= 1, `${id}: villagers in the game, found ${villagers}`);
    assert.equal(world.structures.pendingSpawns.length, 0, 'nothing is left waiting for the mob system');
    // Every bed colour registers with the bed manager (it used to be red beds only), one per villager.
    assert.equal(adopted.beds.length, villagers, `${id}: one registered bed per villager`);
    for (const bed of adopted.beds) assert.equal(Math.abs(bed.head[0] - bed.foot[0]) + Math.abs(bed.head[2] - bed.foot[2]), 1, 'a bed is two adjacent blocks');
    const seen = new Map();
    for (let x = minX - 8; x <= maxX + 8; x++) for (let z = minZ - 8; z <= maxZ + 8; z++) for (let y = 1; y < 64; y++) {
      const block = world.getVoxel(x, y, z);
      if (block !== BLOCKS.AIR) seen.set(block, (seen.get(block) || 0) + 1);
    }
    const has = (predicate) => [...seen.keys()].some((block) => predicate(BLOCK_DEFS[block] ?? {}, block));
    assert.ok(seen.get(BLOCKS.BELL) > 0, `${id}: a bell`);
    assert.ok(has((def) => def.bed), `${id}: beds`);
    // Farms and their water when the village drew a farm (a village need not have one).
    const start = world.structures.engine.locate(id, 0, 0, { maxRadiusChunks: 200 }).start;
    if (start.meta.partMix.some((p) => villageElement(id.replace('village_', ''), p)?.kind === 'farm')) {
      assert.ok(seen.get(BLOCKS.FARMLAND_MOIST) > 0, `${id}: farmland`);
      assert.ok(seen.get(BLOCKS.WATER) > 0, `${id}: water`);
    }
    assert.ok(id === 'village_desert' ? seen.get(BLOCKS.SMOOTH_SANDSTONE) > 0 : seen.get(BLOCKS.DIRT_PATH) > 0, `${id}: its paths`);
    const abandoned = spawned.some((mob) => mob.type === 'zombie_villager');
    if (!abandoned) {
      assert.equal(spawned.filter((mob) => mob.type === 'iron_golem').length, 1, `${id}: one iron golem`);
      assert.ok(adopted.doors.length >= 1, `${id}: doors registered`);
    }
  }
});

test('spawns wait for the mob system and are delivered when it arrives', async () => {
  const { World } = await import('../src/world.js');
  const { locateNearestStructure } = await import('../src/worldStructures.js');
  const world = new World(2024, 'plains');
  world.rebuildStructures();
  const found = locateNearestStructure(world, 'village_plains', 0, 0, { maxRadiusChunks: 200 });
  for (let cx = Math.floor(found.box[0] / 16) - 1; cx <= Math.floor(found.box[3] / 16) + 1; cx++) {
    for (let cz = Math.floor(found.box[2] / 16) - 1; cz <= Math.floor(found.box[5] / 16) + 1; cz++) world.getOrCreateChunk(cx, cz);
  }
  const waiting = world.structures.pendingSpawns.length;
  assert.ok(waiting > 0, 'mobs wait while there is no mob system');
  const spawned = [];
  world.game = gameStub(spawned, { doors: [], beds: [], chests: [] });
  world.structures.flushSpawns();
  assert.ok(spawned.length > 0 && spawned.length <= waiting, 'the waiting mobs are delivered once the mob system exists');
  assert.equal(world.structures.pendingSpawns.length, 0);
});

test('orientation survives a save: it is serialized and applied again on load', async () => {
  const { World } = await import('../src/world.js');
  const { locateNearestStructure } = await import('../src/worldStructures.js');
  const managers = () => {
    const seen = { doors: [], beds: [], chests: [] };
    return { seen, game: {
      mobs: { spawnMob: () => ({}) },
      doorManager: { adoptDoor: (pos, facing) => seen.doors.push([...pos, facing]) },
      bedManager: { registerBed: (foot, head, dir) => seen.beds.push([...foot, dir]) },
      chestManager: { getChest: () => null, adoptChest: (pos, facing, items) => seen.chests.push([...pos, facing, items.length]) }
    } };
  };
  const world = new World(2024, 'plains');
  const first = managers();
  world.game = first.game;
  world.rebuildStructures();
  const found = locateNearestStructure(world, 'village_plains', 0, 0, { maxRadiusChunks: 200 });
  for (let cx = Math.floor(found.box[0] / 16) - 1; cx <= Math.floor(found.box[3] / 16) + 1; cx++) {
    for (let cz = Math.floor(found.box[2] / 16) - 1; cz <= Math.floor(found.box[5] / 16) + 1; cz++) world.getOrCreateChunk(cx, cz);
  }
  const saved = JSON.parse(JSON.stringify(world.serializeOrientations()));
  assert.ok(saved.length > 0, 'something was written down');
  const second = managers();
  world.game = second.game;
  world.structureOrientations = new Map();
  world.restoreOrientations(saved);
  assert.deepEqual(second.seen.doors.sort(), first.seen.doors.sort(), 'doors keep their facing');
  assert.deepEqual(second.seen.beds.sort(), first.seen.beds.sort(), 'beds keep their direction');
  assert.equal(second.seen.chests.length, first.seen.chests.length);
  assert.ok(second.seen.chests.every((chest) => chest[4] === 0), 'saved chests are not given fresh loot: their saved contents stand');
  const stair = [...world.structureOrientations.values()].find((o) => o.dir !== undefined && /stairs$/.test(o.name));
  world.setVoxel(stair.x, stair.y, stair.z, BLOCKS.AIR);
  assert.equal(world.structureOrientations.has(`${stair.x},${stair.y},${stair.z}`), false, 'breaking a block forgets its orientation');
});

// A player standing in a village saw stone underground through a street tile: the connector (jigsaw) tiles where two
// pieces join had no replacement block, so they became AIR instead of path. Streets must be fully paved, and nothing
// may write AIR into the ground layer of a street or a meeting point (a meeting point drawn from the wiki's blueprint
// leaves some ground unwritten, which keeps the terrain there -- that is not a hole).
test('streets and meeting points have no holes: streets are paved, and no air is written into their ground', () => {
  for (const id of IDS) {
    const type = id.replace('village_', '');
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const start = generateVillage({ seed, chunkX: 5, chunkZ: 7, structureId: id, context: contextFor(VILLAGE_BIOMES[id].biome) });
      const floor = new Set();
      const air = new Set();
      realizeVillage(start, (x, y, z, blockId) => { (blockId === BLOCKS.AIR ? air : floor).add(`${x},${y},${z}`); return true; }, BLOCKS);
      for (const piece of start.pieces) {
        const role = villageElement(type, piece.meta.element).role;
        if (role !== 'street' && role !== 'meeting') continue;
        const box = piece.box;
        const groundY = role === 'street' ? box.minY : box.minY + (piece.meta.groundY ?? 0);
        for (let x = box.minX; x <= box.maxX; x++) for (let z = box.minZ; z <= box.maxZ; z++) {
          const key = `${x},${groundY},${z}`;
          assert.equal(air.has(key), false, `${id} seed ${seed}: air written into the ${piece.meta.element} ground at ${key}`);
          if (role === 'street') assert.ok(floor.has(key), `${id} seed ${seed}: hole in the street at ${key}`);
        }
      }
    }
  }
});

test('a path laid over water becomes the village\'s planks', async () => {
  const { createWorldStructures } = await import('../src/worldStructures.js');
  assert.ok(createWorldStructures);
  const start = generateVillage({ seed: 5, chunkX: 1, chunkZ: 1, structureId: 'village_plains', context: contextFor('plains') });
  const metas = [];
  realizeVillage(start, (x, y, z, id, meta) => { if (meta.ifWater !== undefined) metas.push(meta.ifWater); return true; }, BLOCKS);
  assert.ok(metas.length > 0 && metas.every((id) => id === BLOCKS.OAK_PLANKS), 'plains dirt paths carry oak planks for water');
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync('src/worldStructures.js', 'utf8'), /meta\.ifWater !== undefined && chunk\.getVoxel\(lx, y, lz\) === blockIds\.WATER/);
});
