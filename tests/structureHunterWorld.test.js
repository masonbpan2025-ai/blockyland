// Structure Hunter, end to end. The preset's tests proved the PACK carried a density setting; none proved a
// generated WORLD used it. In the real flow the setup screen reseeds the world BEFORE the packs are applied,
// so the structure engine was built with no pack and fell back to three structures at vanilla spacing --
// `/locate` showed exactly village_plains, igloo and desert_pyramid, 400 to 1400 blocks away.
//
// These tests follow that order of events on a real `World`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { World } from '../src/world.js';
import { countStructures, locateNearestStructure, WORLD_STRUCTURE_IDS } from '../src/worldStructures.js';
import { buildPresetPack } from '../src/dataPackPresets.js';
import { createDataPack, mergePacks } from '../src/dataPack.js';
import { applyDataPack, revertDataPack } from '../src/dataPackRuntime.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** The real order: world made (reseeded), THEN the preset's pack applied, THEN the world is generated. */
function hunterWorld(seed, biome = 'all') {
  const world = new World(seed, biome);
  const before = [...world.structures.enabledIds];
  const built = buildPresetPack('structure_hunter');
  const applied = applyDataPack(mergePacks([createDataPack({ name: built.name, files: built.files })]), { name: built.name });
  world.rebuildStructures(); // what generateNewWorld does after applyDataPacks
  return { world, before, applied };
}

test('the engine built before the pack applies sees only the default three, which is the bug', (t) => {
  const { world, before, applied } = hunterWorld(2024);
  t.after(() => revertDataPack(applied));
  assert.deepEqual(before, WORLD_STRUCTURE_IDS, 'a reseed alone cannot see the preset');
  assert.ok(world.structures.enabledIds.length > 10, 'after the rebuild the whole Structure Hunter list is enabled');
});

for (const seed of [1, 2024, 31337, 987654]) {
  test(`Structure Hunter, seed ${seed}: many structures, and villages about every 140 blocks`, (t) => {
    const { world, applied } = hunterWorld(seed);
    t.after(() => revertDataPack(applied));
    const { total, byType } = countStructures(world, 0, 0, { radiusChunks: 64 });
    const villages = Object.entries(byType).filter(([id]) => id.startsWith('village_')).reduce((n, [, c]) => n + c, 0);

    // 2064 blocks square. Vanilla finds a few dozen at most in that area; this pack finds well over a thousand.
    assert.ok(total >= 1000, `expected many structures, found ${total}`);
    assert.ok(Object.keys(byType).length >= 5, `expected variety, found ${Object.keys(byType).join(', ')}`);
    assert.ok(villages >= 120, `expected plenty of villages, found ${villages}`);
  });

  test(`Structure Hunter, seed ${seed}: /locate finds a village close to spawn`, (t) => {
    const { world, applied } = hunterWorld(seed);
    t.after(() => revertDataPack(applied));
    let nearest = Infinity;
    for (const id of world.structures.enabledIds.filter(i => i.startsWith('village_'))) {
      try { nearest = Math.min(nearest, locateNearestStructure(world, id, 0, 0, { maxRadiusChunks: 64 }).distance); } catch { /* none of this kind */ }
    }
    assert.ok(nearest <= 300, `the nearest village was ${nearest} blocks away`);
  });
}

test('a world with no preset is untouched: the default three at vanilla spacing', () => {
  const world = new World(2024, 'all');
  assert.deepEqual(world.structures.enabledIds, WORLD_STRUCTURE_IDS);
  const { total } = countStructures(world, 0, 0, { radiusChunks: 64 });
  assert.ok(total < 60, `vanilla density is sparse, found ${total}`);
});

test('countStructures totals the per-type counts', () => {
  const { world, applied } = hunterWorld(7);
  try {
    const { total, byType } = countStructures(world, 100, -50, { radiusChunks: 16 });
    assert.equal(total, Object.values(byType).reduce((a, b) => a + b, 0));
  } finally { revertDataPack(applied); }
});

test('the game rebuilds the structure engine after applying packs, and /locate ends with a total', () => {
  const main = read('src/main.js');
  const generate = main.slice(main.indexOf('async generateNewWorld()'));
  assert.ok(generate.indexOf('this.world.rebuildStructures') > generate.indexOf('await this.applyDataPacks()'),
    'rebuildStructures must come after applyDataPacks');
  assert.ok(generate.indexOf('this.world.rebuildStructures') < generate.indexOf('this.worldGenerated = true'));
  const locate = main.slice(main.indexOf('runLocateCommand(parts) {'), main.indexOf('runShowMobsCommand() {'));
  assert.match(locate, /countStructures\(this\.world/);
  assert.match(locate, /'Total: ' \+ counted\.total \+ ' structures/);
});
