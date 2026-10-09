// The ten world-generation presets offered in the Create New World menu.
//
// Each one is asserted to be a REAL pack that LOADS and CHANGES something, because a preset that silently
// applied nothing would look identical to one that works until you walked the world. The comparison is
// against the engine's own baseline, taken before any pack is applied -- and it compares the actual SPECIES
// and TERRAIN VALUES rather than counts, because two different mob lists can have the same length.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENERATION_PRESETS, DEFAULT_GENERATION_PRESET, LAND_BIOMES, SPAWN_SETS, STRUCTURE_SETS,
  getGenerationPreset, generationPresetList, buildPresetPack, presetReport,
} from '../src/dataPackPresets.js';
import { createDataPack, mergePacks } from '../src/dataPack.js';
import {
  applyDataPack, revertDataPack, resetTagRegistry, packSuppressesStructures, PACK_STRUCTURE_SETS,
} from '../src/dataPackRuntime.js';
import { BIOMES, getBiomeDef } from '../src/biomes.js';
import { biomeSpawnsFor } from '../src/spawning/biomeSpawnResolver.js';
import { MobCategory } from '../src/spawning/mobCategories.js';
import { enabledStructureIds, generatableStructureIds, WORLD_STRUCTURE_IDS } from '../src/worldStructures.js';
import { World } from '../src/world.js';
import { BLOCKS } from '../src/blocks.js';

/** Apply a preset and register its revert, so a failure cannot leak terrain into the next test. */
function applyPreset(t, id) {
  const built = buildPresetPack(id);
  const pack = createDataPack({ name: built.name, files: built.files });
  const applied = applyDataPack(mergePacks([pack]), { name: built.name });
  t.after(() => { revertDataPack(applied); resetTagRegistry(); });
  return { built, pack, applied };
}

/** Everything a preset could plausibly change, for an exact before/after comparison. */
function snapshot(biome = 'plains') {
  const plains = BIOMES[biome];
  return {
    baseHeight: plains.baseHeight,
    heightScale: plains.heightScale,
    seaLevel: plains.seaLevel,
    surfaceBlock: plains.surfaceBlock,
    subsurfaceBlock: plains.subsurfaceBlock,
    treeType: plains.treeType,
    treeDensity: plains.treeDensity,
    floraDensity: plains.floraDensity,
    fogColor: plains.fogColor,
    spawnSettings: JSON.stringify(plains.spawnSettings),
    aquatic: JSON.stringify(biomeSpawnsFor(biome, MobCategory.WATER_AMBIENT)),
    monsters: biomeSpawnsFor(biome, MobCategory.MONSTER).map(e => `${e.type}:${e.weight}`).join(','),
    creatures: biomeSpawnsFor(biome, MobCategory.CREATURE).map(e => `${e.type}:${e.weight}`).join(','),
    monsterCount: biomeSpawnsFor(biome, MobCategory.MONSTER).length,
    creatureCount: biomeSpawnsFor(biome, MobCategory.CREATURE).length,
    // DENSITY, not species count. A pack can narrow the cast while raising the rate -- Beast Wilds
    // does exactly that -- so the count is the wrong measure of "more monsters".
    monsterWeight: totalWeight(MobCategory.MONSTER),
    creatureWeight: totalWeight(MobCategory.CREATURE),
    structures: [...enabledStructureIds()].join(','),
    structureCount: enabledStructureIds().length,
  };
}

/** The summed spawn weight of a category in plains: how MUCH it spawns, not how many kinds. */
function totalWeight(category) {
  return biomeSpawnsFor('plains', category).reduce((n, e) => n + (e.weight ?? 0), 0);
}

/** Which fields differ between two snapshots. */
function differences(a, b) {
  return Object.keys(a).filter(k => a[k] !== b[k]);
}

// --- the list itself ------------------------------------------------------------------------------------

test('the catalog includes world-wide and biome-focused presets with descriptive names', (t) => {
  assert.ok(GENERATION_PRESETS.length >= 16, 'ten original packs and six biome-focused packs');
  const ids = GENERATION_PRESETS.map(p => p.id);
  assert.equal(new Set(ids).size, GENERATION_PRESETS.length, 'every id is unique');
  const names = GENERATION_PRESETS.map(p => p.name);
  assert.equal(new Set(names).size, GENERATION_PRESETS.length, 'and every name is unique');
  for (const preset of GENERATION_PRESETS) {
    assert.match(preset.id, /^[a-z][a-z0-9_]*$/, preset.id + ' is a usable id');
    assert.ok(preset.name.length >= 3, preset.id + ' has a name');
    assert.ok(preset.emoji, preset.id + ' has an icon');
    // The name has to be representative, so a property line is required and has to say something.
    assert.ok(preset.property && preset.property.length > 10, preset.id + ' states its property');
    assert.ok(preset.blurb && preset.blurb.length > 20, preset.id + ' describes itself');
  }
});

test('the names are distinct enough to choose between', (t) => {
  // A menu of ten near-synonyms is not a choice. Comparing the property lines catches that.
  const properties = GENERATION_PRESETS.map(p => p.property.toLowerCase());
  assert.equal(new Set(properties).size, GENERATION_PRESETS.length, 'no two presets claim the same thing');
});

test('the default preset is the first one, so the menu and the code agree', (t) => {
  assert.equal(DEFAULT_GENERATION_PRESET, GENERATION_PRESETS[0].id);
  assert.equal(getGenerationPreset(DEFAULT_GENERATION_PRESET).name, GENERATION_PRESETS[0].name);
  assert.equal(getGenerationPreset('nope'), null);
  assert.equal(getGenerationPreset(null), null);
});

test('the menu list carries what a dropdown needs', (t) => {
  const list = generationPresetList();
  assert.equal(list.length, GENERATION_PRESETS.length);
  for (const entry of list) {
    assert.ok(entry.id && entry.name && entry.emoji && entry.property && entry.blurb);
    assert.equal(typeof entry.structureCount, 'number');
  }
});

// --- every preset is a real, loadable pack -------------------------------------------------------------

test('every preset builds a pack the loader accepts with nothing skipped', (t) => {
  for (const preset of GENERATION_PRESETS) {
    const built = buildPresetPack(preset.id);
    assert.ok(built, preset.id + ' builds');
    const pack = createDataPack({ name: built.name, files: built.files });
    assert.equal(pack.skipped.length, 0,
      preset.id + ' skipped: ' + JSON.stringify(pack.skipped.slice(0, 3)));
    assert.ok(pack.entries.length > 0, preset.id + ' has entries');
  }
  assert.equal(buildPresetPack('does_not_exist'), null, 'an unknown id is null, not a throw');
});

test('every structure a preset names is one the engine can actually build', (t) => {
  // A name with no generator would plan nothing while the world reported it as enabled.
  const buildable = new Set(generatableStructureIds());
  for (const preset of GENERATION_PRESETS) {
    for (const id of preset.structures ?? []) {
      assert.ok(buildable.has(id), `${preset.id} names ${id}, which the engine cannot generate`);
    }
  }
  assert.deepEqual(presetReport().flatMap(r => r.unbuildable), [], 'and the report agrees');
});

// --- every preset CHANGES something --------------------------------------------------------------------

test('every preset changes at least two things about the world', (t) => {
  // The point of the whole feature. One change would be a switch, not a world pack.
  for (const preset of GENERATION_PRESETS) {
    const baseline = snapshot(preset.biomes[0]);
    const built = buildPresetPack(preset.id);
    const applied = applyDataPack(mergePacks([createDataPack({ name: built.name, files: built.files })]),
      { name: built.name });
    const after = snapshot(preset.biomes[0]);
    revertDataPack(applied);
    resetTagRegistry();
    const changed = differences(baseline, after);
    assert.ok(changed.length >= 2,
      `${preset.id} changed ${changed.length} field(s): ${JSON.stringify(changed)}`);
  }
});

test('no two presets change the world in the same way', (t) => {
  // Ten presets that all do the same thing would be one preset and nine decoys.
  const signatures = new Map();
  for (const preset of GENERATION_PRESETS) {
    const baseline = snapshot(preset.biomes[0]);
    const built = buildPresetPack(preset.id);
    const applied = applyDataPack(mergePacks([createDataPack({ name: built.name, files: built.files })]),
      { name: built.name });
    const after = snapshot(preset.biomes[0]);
    revertDataPack(applied);
    resetTagRegistry();
    const signature = differences(baseline, after).map(k => `${k}=${after[k]}`).sort().join('|');
    assert.ok(!signatures.has(signature),
      `${preset.id} makes the same change as ${signatures.get(signature)}`);
    signatures.set(signature, preset.id);
  }
});

test('applying a preset and reverting it leaves the world exactly as it was', (t) => {
  const before = snapshot();
  const built = buildPresetPack('scorched_badlands');
  const applied = applyDataPack(mergePacks([createDataPack({ name: built.name, files: built.files })]),
    { name: built.name });
  assert.notDeepEqual(snapshot(), before, 'it definitely changed something');
  revertDataPack(applied);
  resetTagRegistry();
  assert.deepEqual(snapshot(), before, 'and put every field back');
});

// --- the preset the request named ----------------------------------------------------------------------

test('Lush Havens generates more friendly mobs than the baseline, and more structures', (t) => {
  // "One of them should be a data pack that generates a lot of friendly mobs and structure."
  const before = snapshot();
  applyPreset(t, 'lush_havens');
  const after = snapshot();

  assert.ok(after.creatureCount > before.creatureCount,
    `creatures went ${before.creatureCount} -> ${after.creatureCount}`);
  assert.ok(after.structureCount > before.structureCount,
    `structures went ${before.structureCount} -> ${after.structureCount}`);
  // "Friendly" is the point, so the new animals must actually be passive species, not more monsters.
  const creatures = biomeSpawnsFor('plains', MobCategory.CREATURE).map(e => e.type);
  for (const animal of ['cow', 'sheep', 'pig', 'chicken']) {
    assert.ok(creatures.includes(animal), `a lush world has ${animal}`);
  }
  // And the nights are calmer than vanilla, which is what makes it a haven rather than a farm.
  assert.ok(after.monsterWeight < before.monsterWeight,
    `monster density went ${before.monsterWeight} -> ${after.monsterWeight}`);
});

test('Lush Havens really does put those mobs in the world, not just in a table', (t) => {
  // The table is what the spawner reads, so the world's own resolution is the check that matters.
  applyPreset(t, 'lush_havens');
  const world = new World();
  const biome = world.getBiome(0, 0);
  const creatures = biomeSpawnsFor(biome, MobCategory.CREATURE);
  assert.ok(creatures.length > 0, `the spawn biome (${biome}) has passive creatures`);
  assert.ok(BIOMES[biome].spawnSettings.generation.creature.probability >= 0.8,
    'density is a population probability, not the sum of relative species weights');
});

test('the structure-rich presets really do change what the planner places', (t) => {
  // Through the real planner, not the enabled list: `WORLD_STRUCTURE_IDS` is three ids and a populated
  // preset enables seventeen, so something different must be planned over a wide enough grid.
  const grid = (world, radius = 25) => {
    const found = new Map();
    for (let cx = -radius; cx <= radius; cx++) {
      for (let cz = -radius; cz <= radius; cz++) {
        const start = world.structures.planAt(cx, cz);
        if (start) found.set(start.structureId, (found.get(start.structureId) || 0) + 1);
      }
    }
    return found;
  };
  const before = grid(new World());
  applyPreset(t, 'lush_havens');
  const after = grid(new World());

  // Every structure planned now comes from the preset's set.
  const allowed = new Set(STRUCTURE_SETS.populated);
  for (const id of after.keys()) {
    assert.ok(allowed.has(id), `${id} is not in the preset's structure set`);
  }
  // And the two worlds do not plan the identical thing -- the presets differ.
  const sameSet = before.size === after.size && [...before.keys()].every(k => after.has(k));
  assert.ok(!sameSet, `the planner produced the same structures: before=${JSON.stringify([...before])} `
    + `after=${JSON.stringify([...after])}`);
});

// --- individual properties, so a preset cannot drift from its name ------------------------------------

test('Amplified Peaks is taller than Wild Highlands, which is taller than the baseline', (t) => {
  // The names promise an ordering. A typo in one number would silently swap them.
  const baseline = snapshot();
  applyPreset(t, 'wild_highlands');
  const highlands = snapshot();

  applyPreset(t, 'amplified_peaks');
  const amplified = snapshot();

  assert.ok(highlands.baseHeight > baseline.baseHeight, 'highlands raise the base');
  assert.ok(amplified.baseHeight >= highlands.baseHeight, 'peaks are at least as tall as highlands');
  assert.ok(amplified.heightScale > highlands.heightScale, 'and far more varied');
  assert.ok(amplified.heightScale > baseline.heightScale);
});

test('Verdant Overgrowth is denser than Amber Autumn, which is denser than the baseline', (t) => {
  const baseline = snapshot();
  applyPreset(t, 'amber_autumn');
  const autumn = snapshot();
  applyPreset(t, 'verdant_overgrowth');
  const verdant = snapshot();

  assert.ok(autumn.treeDensity > baseline.treeDensity, 'autumn adds trees');
  assert.ok(verdant.treeDensity > autumn.treeDensity, 'overgrowth adds more');
  assert.ok(verdant.floraDensity > baseline.floraDensity, 'and undergrowth');
});

test('Frozen Frontier puts snow on the surface and spawns the cold animals', (t) => {
  const baseline = snapshot();
  applyPreset(t, 'frozen_frontier');
  assert.equal(BIOMES.plains.surfaceBlock, BLOCKS.SNOW, 'snow');
  const creatures = biomeSpawnsFor('plains', MobCategory.CREATURE).map(e => e.type);
  // The species that make it a frozen world. `cow` is deliberately still in the cold set -- it is a farm
  // animal a player will want -- so this asserts what IS there rather than excluding what must not be.
  for (const cold of ['polar_bear', 'fox', 'wolf']) {
    assert.ok(creatures.includes(cold), `a frozen world has ${cold}: ` + JSON.stringify(creatures));
  }
  // And the table really is a different one, not the temperate default.
  assert.notEqual(creatures.join(','), baseline.creatures.split(',').map(s => s.split(':')[0]).join(','),
    'the creature table changed');
});

test('Scorched Badlands puts red sand on the surface', (t) => {
  // Asserted in its OWN test: applying two presets to one context means the second overwrites the
  // first's tables, so the frozen assertions above saw red sand and failed.
  applyPreset(t, 'scorched_badlands');
  assert.equal(BIOMES.plains.surfaceBlock, BLOCKS.RED_SAND, 'red sand');
  assert.equal(BIOMES.plains.subsurfaceBlock, BLOCKS.TERRACOTTA, 'over terracotta');
});

test('Sunken Shores raises the sea above the baseline', (t) => {
  const baseline = snapshot();
  applyPreset(t, 'sunken_shores');
  assert.ok(BIOMES.plains.seaLevel > (baseline.seaLevel ?? 0),
    `sea level ${baseline.seaLevel} -> ${BIOMES.plains.seaLevel}`);
});

test('Dungeon Rush enables buried structures and quietens the night', (t) => {
  const baseline = snapshot();
  applyPreset(t, 'dungeon_rush');
  const after = snapshot();
  assert.ok(after.structureCount > baseline.structureCount, 'more to explore');
  assert.ok(after.monsterWeight < baseline.monsterWeight,
    `monster density ${baseline.monsterWeight} -> ${after.monsterWeight}`);
  const enabled = enabledStructureIds();
  assert.ok(enabled.includes('trial_chambers') || enabled.includes('ancient_city'),
    'the underground finds are on: ' + JSON.stringify(enabled));
});

test('Beast Wilds is the hostile one and genuinely has no structures', (t) => {
  // The claim in its name. An empty list alone cannot express this -- it is indistinguishable from saying
  // nothing, and the engine falls back to its baked three -- so the preset loads an empty structure set.
  const baseline = snapshot();
  applyPreset(t, 'beast_wilds');
  const after = snapshot();
  assert.ok(after.monsterWeight > baseline.monsterWeight,
    `monster density ${baseline.monsterWeight} -> ${after.monsterWeight}`);
  assert.ok(after.creatureWeight < baseline.creatureWeight,
    `animal density ${baseline.creatureWeight} -> ${after.creatureWeight}`);
  assert.deepEqual(enabledStructureIds(), [], 'and no structures at all');
  assert.ok(PACK_STRUCTURE_SETS.size > 0, 'expressed through a loaded structure set');
  assert.equal(packSuppressesStructures(), true);
});

test('a pack that merely says nothing about structures still gets the baked three', (t) => {
  // The suppression above must not become the default, or every world would lose its villages.
  const built = buildPresetPack('amber_autumn');
  const pack = createDataPack({ name: built.name, files: built.files });
  const applied = applyDataPack(mergePacks([pack]), { name: built.name });
  t.after(() => { revertDataPack(applied); resetTagRegistry(); });
  assert.deepEqual(enabledStructureIds(), [...WORLD_STRUCTURE_IDS], 'silence means the default');
  assert.equal(packSuppressesStructures(), false);
});

// --- the spawn sets the presets are built from ---------------------------------------------------------

test('every spawn set a preset names exists and is vanilla-shaped', (t) => {
  for (const preset of GENERATION_PRESETS) {
    for (const setName of preset.spawners ?? []) {
      const set = SPAWN_SETS[setName];
      assert.ok(set, `${preset.id} names the spawn set ${setName}, which does not exist`);
      for (const [category, list] of Object.entries(set)) {
        assert.ok(Array.isArray(list) && list.length > 0, `${setName}.${category} is a non-empty list`);
        for (const entry of list) {
          assert.match(entry.type, /^minecraft:[a-z_]+$/, `${setName}.${category}: ${entry.type}`);
          assert.ok(entry.weight > 0, `${entry.type} needs a weight`);
          assert.ok(entry.minCount >= 1 && entry.maxCount >= entry.minCount,
            `${entry.type} needs a sane count range`);
        }
      }
    }
  }
});

test('no preset names a spawn set that does not exist, so no preset is silently mobless', (t) => {
  // A typo would produce a preset that changes terrain and nothing else, which is hard to notice.
  for (const preset of GENERATION_PRESETS) {
    const ignored = (preset.spawners ?? []).filter(n => !SPAWN_SETS[n]);
    assert.deepEqual(ignored, [], `${preset.id} names unknown spawn sets`);
  }
});

test('the terrain extension only reaches biomes the preset names', (t) => {
  const before = getBiomeDef('ocean').baseHeight;
  applyPreset(t, 'amplified_peaks');
  assert.notEqual(getBiomeDef('plains').baseHeight, 25, 'the land changed');
  assert.equal(BIOMES.ocean.baseHeight, before, 'and the ocean did not, because oceans are excluded');
});

test('the presets cover the land biomes and leave the special ones alone', (t) => {
  assert.ok(LAND_BIOMES.length >= 35, `a decent sample of the overworld, got ${LAND_BIOMES.length}`);
  for (const excluded of ['ocean', 'deep_ocean', 'river', 'deep_dark', 'ice_caves', 'the_void']) {
    assert.ok(!LAND_BIOMES.includes(excluded), excluded + ' is not a land biome');
  }
});
