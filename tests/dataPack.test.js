// The data pack loader, validated against real misode.github.io output.
//
// The fixtures in `tests/fixtures/misode/` are genuine vanilla JSON pulled from misode/mcmeta tag
// `1.21.4-data` -- the same source and shape the generators at misode.github.io emit. Adapters tested only
// against hand-written samples prove the adapters match the samples.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  PACK_TYPES, PREFERRED_PACK_FORMAT, normaliseId, splitId, parsePackPath, isPackMeta,
  validateEntry, createDataPack, readPackMeta, mergePacks, packCoverage,
} from '../src/dataPack.js';
import {
  resolveGameId, adaptRecipe, adaptCraftingRecipe, adaptCookingRecipe, adaptLootTable, adaptTag,
  adaptBiome, adaptDimensionType, adaptPlacedFeature, adaptStructure, createTagExpander, spawnerMobList,
} from '../src/dataPackAdapters.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import { getBiomeDef } from '../src/biomes.js';

const FIXTURE_DIR = new URL('./fixtures/misode/', import.meta.url);
const fixture = (rel) => JSON.parse(readFileSync(new URL(rel, FIXTURE_DIR), 'utf8'));

// --- paths -------------------------------------------------------------------------------------------

test('every type is recognised from where the file sits', () => {
  const cases = [
    ['data/vanilla/worldgen/biome/plains.json', 'biome', 'vanilla:plains'],
    ['data/vanilla/dimension_type/overworld.json', 'dimension_type', 'vanilla:overworld'],
    ['data/vanilla/recipe/oak_planks.json', 'recipe', 'vanilla:oak_planks'],
    ['data/vanilla/loot_table/blocks/oak_log.json', 'loot_table', 'vanilla:blocks/oak_log'],
    ['data/vanilla/tags/item/logs.json', 'item_tag', 'vanilla:logs'],
    ['data/vanilla/tags/block/mineable/pickaxe.json', 'block_tag', 'vanilla:mineable/pickaxe'],
    ['data/vanilla/worldgen/placed_feature/trees_plains.json', 'placed_feature', 'vanilla:trees_plains'],
    ['data/vanilla/worldgen/structure/village_plains.json', 'structure', 'vanilla:village_plains'],
  ];
  for (const [path, type, id] of cases) {
    const parsed = parsePackPath(path);
    assert.ok(parsed, path + ' should parse');
    assert.equal(parsed.type, type, path);
    assert.equal(parsed.id, id, path);
  }
});

test('nested directories keep their path in the id', () => {
  // `loot_tables/entities/pig.json` is the classic vanilla layout, and chest tables nest two deep. Matching
  // the whole directory instead of the longest prefix silently ignored every one of them.
  assert.equal(parsePackPath('data/v/loot_tables/entities/pig.json').id, 'v:entities/pig');
  assert.equal(parsePackPath('data/v/loot_tables/chests/village/house.json').id,
    'v:chests/village/house');
  assert.equal(parsePackPath('data/v/worldgen/template_pool/village/plains/houses.json').id,
    'v:village/plains/houses');
  // And the tag directory is still the type, not part of the id.
  assert.equal(parsePackPath('data/v/tags/block/mineable/pickaxe.json').id, 'v:mineable/pickaxe');
});

test('the 1.21 directory rename is accepted in both spellings', () => {
  // `recipes` became `recipe` and `loot_tables` became `loot_table`. The generators let you pick a target
  // version, so both are on disk everywhere.
  assert.equal(parsePackPath('data/v/recipes/x.json').type, 'recipe');
  assert.equal(parsePackPath('data/v/recipe/x.json').type, 'recipe');
  assert.equal(parsePackPath('data/v/loot_tables/x.json').type, 'loot_table');
  assert.equal(parsePackPath('data/v/loot_table/x.json').type, 'loot_table');
});

test('a file the loader does not handle is ignored, not an error', () => {
  // A data pack always carries things a given reader does not implement.
  for (const path of ['pack.mcmeta', 'data/v/advancement/a.json', 'data/v/enchantment/e.json',
    'data/v/README.md', 'assets/v/lang/en_us.json', 'data/onlythree/x.json', '', null, undefined, 42]) {
    assert.equal(parsePackPath(path), null, JSON.stringify(path) + ' should be ignored');
  }
  assert.equal(isPackMeta('pack.mcmeta'), true);
  assert.equal(isPackMeta('data/v/pack.mcmeta'), true);
  assert.equal(isPackMeta('data/v/recipe/x.json'), false);
});

test('a Windows-style path from a zip listing still parses', () => {
  assert.equal(parsePackPath('data\\v\\recipe\\x.json').type, 'recipe');
});

// --- ids ---------------------------------------------------------------------------------------------

test('ids normalise, and an unusable one is rejected rather than mangled', () => {
  assert.equal(normaliseId('minecraft:oak_planks'), 'minecraft:oak_planks');
  assert.equal(normaliseId('oak_planks'), 'minecraft:oak_planks', 'a bare name takes the default namespace');
  assert.equal(normaliseId('Minecraft:Oak_Planks'), 'minecraft:oak_planks');
  assert.equal(normaliseId('#minecraft:logs'), 'minecraft:logs', 'a tag marker is not part of the id');
  assert.equal(normaliseId('mypack:chests/village/house'), 'mypack:chests/village/house',
    'a nested path is a valid id');
  // Rejected: a silently mangled id becomes a file that never loads.
  for (const bad of ['', '   ', 'bad id!', 'ns:', ':path', null, undefined, 42, {}]) {
    assert.equal(normaliseId(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(splitId('mypack:a/b'), { namespace: 'mypack', path: 'a/b' });
  assert.equal(splitId('bad id!'), null);
});

// --- packs -------------------------------------------------------------------------------------------

test('a pack reports what it skipped instead of throwing it away', () => {
  // A pack assembled in a browser tab will have something wrong in it, and losing two hundred good files to
  // one bad recipe is worse than loading what works and naming what did not.
  const pack = createDataPack({ name: 'Test', files: {
    'pack.mcmeta': JSON.stringify({ pack: { pack_format: 48 } }),
    'data/t/recipe/good.json': JSON.stringify({ type: 'minecraft:crafting_shaped', result: { id: 'minecraft:stick', count: 4 } }),
    'data/t/recipe/broken.json': '{ not json',
    'data/t/recipe/nofields.json': JSON.stringify({}),
    'data/t/README.md': 'nope',
  } });
  assert.equal(pack.entries.length, 1, 'the good file loads');
  assert.equal(pack.entries[0].id, 't:good');
  // `pack.mcmeta` is metadata, not a refusal.
  assert.equal(pack.skipped.some(s => s.path.includes('pack.mcmeta')), false);
  const reasons = pack.skipped.map(s => s.reason).join(' | ');
  assert.match(reasons, /invalid JSON/);
  assert.match(reasons, /missing "type"/);
  assert.match(reasons, /not a data pack path/);
});

test('a pack with nothing usable is still a pack', () => {
  const pack = createDataPack({ files: {} });
  assert.equal(pack.entries.length, 0);
  assert.equal(pack.name, 'Data Pack', 'it takes a default name');
  assert.equal(pack.format, PREFERRED_PACK_FORMAT);
  assert.equal(pack.formatMismatch, false);
});

test('a format mismatch is recorded, never a refusal', () => {
  // Refusing it would make the loader useless for the version picker in the generators.
  const old = createDataPack({ name: 'Old', format: 34, files: {} });
  assert.equal(old.formatMismatch, true);
  assert.equal(old.entries.length, 0);
});

test('pack.mcmeta is read where it declares the format', () => {
  assert.deepEqual(readPackMeta({ 'pack.mcmeta': JSON.stringify({ pack: { pack_format: 48, description: 'x' } }) }),
    { format: 48, description: 'x' });
  // Absent, or malformed, is null rather than a default -- "declared 48" and "said nothing" differ.
  assert.equal(readPackMeta({ 'data/a/recipe/x.json': '{}' }), null);
  assert.equal(readPackMeta({ 'pack.mcmeta': '{ broken' }), null);
  assert.equal(readPackMeta({ 'pack.mcmeta': JSON.stringify({ notpack: 1 }) }), null);
});

test('later packs override earlier ones by id, and nothing merges field by field', () => {
  const base = createDataPack({ name: 'Base', files: {
    'data/t/recipe/stick.json': JSON.stringify({ type: 'minecraft:crafting_shaped', result: { id: 'minecraft:stick', count: 4 } }),
    'data/t/recipe/other.json': JSON.stringify({ type: 'minecraft:crafting_shaped', result: { id: 'minecraft:stick', count: 1 } }),
  } });
  const over = createDataPack({ name: 'Over', files: {
    'data/t/recipe/stick.json': JSON.stringify({ type: 'minecraft:crafting_shaped', result: { id: 'minecraft:stick', count: 8 } }),
  } });
  const merged = mergePacks([base, over]);
  assert.equal(merged.byType.recipe.size, 2, 'the untouched recipe survives');
  assert.equal(merged.byType.recipe.get('t:stick').json.result.count, 8, 'the override wins outright');
  assert.equal(merged.byType.recipe.get('t:stick').pack, 'Over');
  assert.deepEqual(merged.overrides, [{ type: 'recipe', id: 't:stick', from: 'Base', to: 'Over' }]);
  assert.deepEqual(packCoverage(merged).recipe, 2);
});

test('merging tolerates junk in the stack', () => {
  const merged = mergePacks([null, {}, createDataPack({ files: {} })]);
  assert.equal(merged.errors.length, 2);
  assert.equal(merged.byType.recipe.size, 0);
  assert.deepEqual(packCoverage(mergePacks([])).biome, 0);
});

// --- resolving vanilla names to game ids ---------------------------------------------------------------

test('a vanilla id resolves to a block id or an item id, as the game stores them', () => {
  // Blocks are upper-snake registry keys with a NUMERIC id; items are lower-snake strings. That difference is
  // the whole difficulty of every adapter.
  const planks = resolveGameId('minecraft:oak_planks');
  assert.equal(planks.isBlock, true);
  assert.equal(planks.id, BLOCKS.OAK_PLANKS);
  assert.equal(typeof planks.id, 'number');

  const stick = resolveGameId('minecraft:stick');
  assert.equal(stick.isBlock, false);
  assert.equal(stick.id, 'stick');
  assert.equal(typeof stick.id, 'string');

  // A bare name works, and the namespace is optional.
  assert.deepEqual(resolveGameId('oak_planks'), planks);
  // Something the game does not have resolves to null rather than to a wrong id.
  assert.equal(resolveGameId('minecraft:not_a_real_block'), null);
  assert.equal(resolveGameId(''), null);
  assert.equal(resolveGameId(null), null);
});

test('an alias table entry resolves a name the registry spells differently', () => {
  // The resolver handles names whose registry key is not the upper-snake of the vanilla name.
  const grass = resolveGameId('minecraft:grass_block');
  assert.ok(grass, 'grass_block resolves');
  assert.equal(grass.isBlock, true);
  assert.equal(grass.id, BLOCKS.GRASS);
});

// --- recipes, against real vanilla JSON ---------------------------------------------------------------

test('vanilla oak_planks adapts, tag and all', () => {
  // The real file is shapeless with a TAG ingredient: `"ingredients": ["#minecraft:oak_logs"]`. The first
  // version looked only for a `tag` property, so the string form fell through and the recipe vanished.
  const json = fixture('recipe/oak_planks.json');
  assert.deepEqual(json.ingredients, ['#minecraft:oak_logs'], 'the fixture really does use the string form');

  const pack = createDataPack({ files: {
    'data/minecraft/tags/item/oak_logs.json': fixture('tags/item/oak_logs.json'),
    'data/minecraft/recipe/oak_planks.json': json,
  } });
  const expandTag = createTagExpander(mergePacks([pack]));
  const out = adaptRecipe(json, { expandTag });

  assert.ok(out, 'it adapts now');
  assert.equal(out.grid, '3x3', 'shapeless entries live in the 3x3 list');
  assert.ok(out.recipes.length >= 1, 'it produced at least one variant');
  assert.equal(out.recipes[0].shapeless, true);
  assert.equal(out.recipes[0].result.id, BLOCKS.OAK_PLANKS);
  assert.equal(out.recipes[0].result.count, 4, 'four planks, as vanilla');
  // The member is a LOG, which is what a tag variant means.
  assert.equal(out.recipes[0].ingredients[0], BLOCKS.OAK_LOG);
  assert.deepEqual(out.tags, ['minecraft:oak_logs'], 'the tag it used is named');
});

test('a shaped recipe keeps its shape, including the holes', () => {
  // The real shield file keys its pattern on `#minecraft:wooden_tool_materials`, NOT on `#minecraft:planks`.
  // Supplying the wrong tag left the recipe with no variants, which is how this test failed first.
  const json = fixture('recipe/shield.json');
  assert.deepEqual(json.key.W, '#minecraft:wooden_tool_materials', 'the fixture really does use that tag');
  const pack = createDataPack({ files: {
    'data/minecraft/tags/item/wooden_tool_materials.json':
      JSON.stringify({ values: ['minecraft:oak_planks', 'minecraft:stick'] }),
    'data/minecraft/recipe/shield.json': json,
  } });
  const expandTag = createTagExpander(mergePacks([pack]));
  const out = adaptRecipe(json, { expandTag });
  assert.ok(out);
  assert.equal(out.grid, '3x3');
  assert.ok(out.recipes.length >= 1, 'the tag resolved, so there are variants');
  assert.equal(out.recipes[0].result.id, 'shield');
  const pattern = out.recipes[0].pattern;
  assert.ok(Array.isArray(pattern), 'a shaped recipe has a pattern');
  // Every row is the pattern's full width, and an empty cell is null -- an empty slot the matcher can place
  // is a different recipe from one with a hole in it.
  assert.equal(pattern.length, 3);
  const width = pattern[0].length;
  assert.ok(pattern.every(row => row.length === width));
  // The third row is " W ", so it starts and ends empty.
  assert.equal(pattern[2][0], null, 'the leading space is an empty cell, not a missing one');
  assert.equal(pattern[2][2], null);
  assert.notEqual(pattern[2][1], null, 'and the middle one is the tag member');
});

test('a recipe whose tag is not in the pack yields no variants and names the tag', () => {
  // Not a crash and not a guess: the caller can say which tag is missing.
  const json = fixture('recipe/stick.json');
  const pack = createDataPack({ files: { 'data/minecraft/recipe/stick.json': json } });
  const out = adaptRecipe(json, { expandTag: createTagExpander(mergePacks([pack])) });
  assert.ok(out, 'the shape is recognised');
  assert.equal(out.recipes.length, 0, 'but nothing can be built from a tag that is absent');
  assert.ok(out.tags.length > 0, 'and the tag is named');
});

test('a broad tag cannot flood the recipe list', () => {
  // A tag of four hundred members would otherwise become four hundred near-identical entries.
  //
  // The members have to be REAL items: a tag of invented names resolves to nothing, which produces no
  // variants at all and makes the cap untestable. That is how this failed first.
  const realItems = Object.keys(ITEMS).filter(id => ITEMS[id] && ITEMS[id].isBlock !== true);
  assert.ok(realItems.length > 64, 'the game has enough items to build a broad tag');
  const json = { type: 'minecraft:crafting_shapeless', ingredients: ['#minecraft:big'], result: { id: 'minecraft:stick', count: 1 } };
  const expandTag = () => realItems.slice(0, 500).map(id => `minecraft:${id}`);
  const out = adaptRecipe(json, { expandTag });
  assert.equal(out.recipes.length, 64, 'capped');
  assert.equal(out.capped, true, 'and the cap is reported rather than silent');
});

test('the smelting recipe carries its xp and time, which the game table cannot hold', () => {
  const json = fixture('recipe/iron_ingot_from_smelting_raw_iron.json');
  const out = adaptRecipe(json);
  assert.ok(out);
  assert.equal(out.input, 'raw_iron');
  assert.equal(out.result.id, 'iron_ingot');
  assert.ok(out.xp > 0, 'the xp comes through rather than being dropped');
  assert.ok(out.seconds > 0, 'and so does the cook time');
});

test('recipe types the game has no station for are named, not silently unknown', () => {
  assert.deepEqual(adaptRecipe({ type: 'minecraft:stonecutting', ingredient: { item: 'minecraft:stone' }, result: { id: 'minecraft:stone_slab', count: 2 } }),
    { unsupported: 'stonecutting' });
  assert.deepEqual(adaptRecipe({ type: 'minecraft:smithing_transform' }), { unsupported: 'smithing_transform' });
  // And something entirely unknown is null rather than a wrong guess.
  assert.equal(adaptRecipe({ type: 'minecraft:not_a_type' }), null);
  assert.equal(adaptRecipe(null), null);
});

test('a malformed recipe is rejected rather than half-adapted', () => {
  assert.equal(adaptCraftingRecipe({ type: 'minecraft:crafting_shaped' }), null, 'no result');
  assert.equal(adaptCraftingRecipe({ type: 'minecraft:crafting_shaped', result: { id: 'minecraft:stick' } }), null,
    'no pattern and no ingredients');
  assert.equal(adaptCookingRecipe({}), null);
  assert.equal(adaptRecipe({ type: 'minecraft:crafting_shaped', pattern: [''], result: { id: 'minecraft:stick' } }), null,
    'a zero-width pattern');
});

// --- loot tables -------------------------------------------------------------------------------------

test('a silk-touch branch is not mistaken for the guaranteed drop', () => {
  // Diamond ore's first alternative is `diamond_ore` GATED ON SILK TOUCH and its second is `diamond`. Taking
  // the first child unconditionally reports that diamond ore drops diamond ore, which is only true with a
  // silk-touch pickaxe. The first UNCONDITIONAL branch is the right answer.
  const out = adaptLootTable(fixture('loot_table/diamond_ore.json'));
  assert.ok(out);
  assert.equal(out.guaranteed.length, 1, 'one guaranteed drop');
  assert.equal(out.guaranteed[0].id, 'diamond', 'which is diamond, not the ore block');
  // The ore block itself is reachable only under a condition, so it is not in the guaranteed list.
  assert.ok(!out.guaranteed.some(d => d.id === BLOCKS.DIAMOND_ORE));
});

test('a real block loot table becomes a guaranteed drop', () => {
  const out = adaptLootTable(fixture('loot_table/oak_log.json'));
  assert.ok(out);
  assert.equal(out.guaranteed.length, 1);
  assert.equal(out.guaranteed[0].id, BLOCKS.OAK_LOG, 'an oak log drops an oak log');
  assert.equal(out.guaranteed[0].isBlock, true);
  assert.equal(out.guaranteed[0].min, 1);
  assert.equal(out.guaranteed[0].max, 1);
  assert.deepEqual(out.unresolved, [], 'and nothing failed to resolve');
});

test('a real multi-drop table keeps every drop', () => {
  // Oak leaves drop a sapling, sticks and an apple with separate rolls.
  const out = adaptLootTable(fixture('loot_table/oak_leaves.json'));
  assert.ok(out);
  const all = [...out.guaranteed, ...out.pooled, ...out.conditional];
  assert.ok(all.length >= 3, 'oak leaves have several drops, got ' + all.length);
  const ids = all.map(d => d.id);
  assert.ok(ids.includes('stick') || ids.includes('apple') || ids.includes(BLOCKS.OAK_SAPLING),
    'and they are the real ones: ' + JSON.stringify(ids));
});

test('a silk-touch style table resolves without dropping anything on the floor', () => {
  const out = adaptLootTable(fixture('loot_table/diamond_ore.json'));
  assert.ok(out);
  const all = [...out.guaranteed, ...out.pooled, ...out.conditional];
  assert.ok(all.length >= 1, 'diamond ore yields something');
  assert.ok(all.some(d => d.id === 'diamond'), 'and diamond is among it: ' + JSON.stringify(all.map(d => d.id)));
});

test('an alternatives entry with no unconditional branch is recorded as conditional', () => {
  // The unconditional branch wins; when every branch is gated, the first is taken and flagged.
  const unconditional = adaptLootTable({ pools: [{ rolls: 1, entries: [
    { type: 'minecraft:alternatives', children: [
      { type: 'minecraft:item', name: 'minecraft:diamond_ore', conditions: [{ condition: 'minecraft:match_tool' }] },
      { type: 'minecraft:item', name: 'minecraft:diamond' },
    ] },
  ] }] });
  assert.equal(unconditional.guaranteed.length, 1);
  assert.equal(unconditional.guaranteed[0].id, 'diamond', 'the unconditional branch wins');

  const allGated = adaptLootTable({ pools: [{ rolls: 1, entries: [
    { type: 'minecraft:alternatives', children: [
      { type: 'minecraft:item', name: 'minecraft:diamond', conditions: [{ condition: 'minecraft:match_tool' }] },
      { type: 'minecraft:item', name: 'minecraft:stick', conditions: [{ condition: 'minecraft:match_tool' }] },
    ] },
  ] }] });
  assert.equal(allGated.guaranteed.length, 0, 'nothing is guaranteed');
  assert.equal(allGated.conditional.length, 1);
  assert.equal(allGated.conditional[0].id, 'diamond', 'the first gated branch is taken and flagged');
});

test('an unresolved item is reported rather than dropped silently', () => {
  const out = adaptLootTable({ pools: [{ rolls: 1, entries: [
    { type: 'minecraft:item', name: 'minecraft:not_a_real_item' },
    { type: 'minecraft:item', name: 'minecraft:stick' },
  ] }] });
  assert.deepEqual(out.unresolved, ['minecraft:not_a_real_item']);
  assert.ok([...out.guaranteed, ...out.pooled].some(d => d.id === 'stick'), 'the good one still lands');
});

test('a count range and a chance condition survive the trip', () => {
  const out = adaptLootTable({ pools: [
    { rolls: 1, conditions: [{ condition: 'minecraft:random_chance', chance: 0.05 }],
      entries: [{ type: 'minecraft:item', name: 'minecraft:apple', functions: [{ function: 'minecraft:set_count', count: { min: 1, max: 3 } }] }] },
  ] });
  assert.equal(out.conditional.length, 1);
  assert.equal(out.conditional[0].chance, 0.05);
  assert.equal(out.conditional[0].min, 1);
  assert.equal(out.conditional[0].max, 3);
});

test('a malformed loot table is rejected', () => {
  assert.equal(adaptLootTable({}), null, 'no pools');
  assert.equal(adaptLootTable(null), null);
  assert.equal(adaptLootTable({ pools: 'nope' }), null);
  // A pool with no rolls drops nothing and contributes nothing.
  assert.deepEqual(adaptLootTable({ pools: [{ rolls: 0, entries: [{ type: 'minecraft:item', name: 'minecraft:stick' }] }] }),
    { guaranteed: [], pooled: [], conditional: [], unresolved: [] });
});

// --- tags --------------------------------------------------------------------------------------------

test('a real tag keeps its references and its required members apart', () => {
  const out = adaptTag(fixture('tags/item/oak_logs.json'));
  assert.ok(out.values.length >= 4);
  assert.ok(out.values.includes('minecraft:oak_log'));
  assert.deepEqual(out.references, [], 'oak_logs names items, not other tags');

  // The parent tag names only other tags.
  const logs = adaptTag(fixture('tags/item/logs.json'));
  assert.ok(logs.references.length > 0, 'logs is built from references');
  assert.ok(logs.references.every(r => r.startsWith('#')), 'and they keep their marker');
});

test('a big real tag loads whole', () => {
  const out = adaptTag(fixture('tags/block/mineable_pickaxe.json'));
  assert.ok(out.values.length > 300, 'mineable/pickaxe is a large tag, got ' + out.values.length);
  assert.ok(out.values.includes('minecraft:stone'));
});

test('a tag that references tags expands through the whole chain', () => {
  // `logs` -> `logs_that_burn` -> `oak_logs` -> the items. Vanilla nests, so the expander has to walk.
  const pack = createDataPack({ files: {
    'data/minecraft/tags/item/logs.json': fixture('tags/item/logs.json'),
    'data/minecraft/tags/item/oak_logs.json': fixture('tags/item/oak_logs.json'),
    'data/minecraft/tags/item/logs_that_burn.json': JSON.stringify({ values: ['#minecraft:oak_logs'] }),
    'data/minecraft/tags/item/crimson_stems.json': JSON.stringify({ values: ['minecraft:crimson_stem'] }),
    'data/minecraft/tags/item/warped_stems.json': JSON.stringify({ values: ['minecraft:warped_stem'] }),
  } });
  const expand = createTagExpander(mergePacks([pack]));
  const members = expand('minecraft:logs');
  assert.ok(members.includes('minecraft:oak_log'), 'a grandchild member is reached');
  assert.ok(members.includes('minecraft:crimson_stem'), 'and a sibling branch too');
  assert.equal(new Set(members).size, members.length, 'with no duplicates');
  assert.deepEqual(expand('minecraft:does_not_exist'), []);
});

test('a tag cycle terminates instead of hanging', () => {
  // A malformed pack can contain one, and a tag graph is user input.
  const pack = createDataPack({ files: {
    'data/minecraft/tags/item/a.json': JSON.stringify({ values: ['#minecraft:b'] }),
    'data/minecraft/tags/item/b.json': JSON.stringify({ values: ['#minecraft:a'] }),
  } });
  const expand = createTagExpander(mergePacks([pack]));
  assert.doesNotThrow(() => expand('minecraft:a'));
  assert.deepEqual(expand('minecraft:a'), []);
});

// --- biomes and dimension types, against real vanilla JSON ---------------------------------------------

test('a real biome maps its colours, climate and spawners', () => {
  const json = fixture('biome/plains.json');
  const out = adaptBiome(json, getBiomeDef('plains'));
  // Vanilla writes colours as decimal ints, which is the form THREE.Color takes directly.
  assert.equal(out.skyColor, json.effects.sky_color);
  assert.equal(out.fogColor, json.effects.fog_color);
  assert.equal(out.temperature, json.temperature);
  assert.equal(out.hasPrecipitation, true);
  assert.ok(Array.isArray(out.mobs) && out.mobs.length > 0, 'the spawners become a mob list');
  assert.ok(out.mobs.includes('sheep') || out.mobs.includes('cow') || out.mobs.includes('pig'),
    'with real animals in it: ' + JSON.stringify(out.mobs.slice(0, 6)));
  // The terrain fields are NOT in the file, so they come from the fallback and it is recorded where from.
  assert.equal(out.surfaceBlock, getBiomeDef('plains').surfaceBlock, 'terrain is inherited');
  assert.equal(out.fromDataPack, true);
});

test('a biome with no fallback still maps what the file carries', () => {
  const out = adaptBiome(fixture('biome/the_end.json'), null);
  assert.ok(out);
  assert.equal(out.fromDataPack, true);
  assert.equal(out.surfaceBlock, undefined, 'nothing is invented for a field the file lacks');
});

test('every real biome fixture adapts without throwing', () => {
  const dir = new URL('biome/', FIXTURE_DIR);
  const names = readdirSync(dir).filter(f => f.endsWith('.json'));
  assert.ok(names.length >= 3, 'there are biome fixtures');
  for (const name of names) {
    const id = name.replace('.json', '');
    const out = adaptBiome(JSON.parse(readFileSync(new URL(name, dir), 'utf8')), getBiomeDef(id));
    assert.ok(out, name + ' should adapt');
    assert.equal(typeof out.skyColor, 'number', name + ' should carry a sky colour');
  }
});

test('spawnerMobList de-duplicates across categories', () => {
  assert.deepEqual(spawnerMobList({ monster: [{ type: 'minecraft:zombie' }], creature: [{ type: 'minecraft:zombie' }, { type: 'minecraft:pig' }] }),
    ['pig', 'zombie']);
  assert.equal(spawnerMobList(null), null, 'nothing at all');
  assert.equal(spawnerMobList('nope'), null, 'not an object');
  // An object with no usable categories is an EMPTY list, not null: the file carried spawners, they just
  // named nothing. `null` means "the file had no spawners block", which is a different thing to inherit on.
  assert.deepEqual(spawnerMobList({}), []);
  assert.deepEqual(spawnerMobList({ monster: [{ nope: 1 }] }), []);
});

test('the three real dimension types map to the game\'s dimension flags', () => {
  const overworld = adaptDimensionType(fixture('dimension_type/overworld.json'));
  assert.equal(overworld.effects, 'overworld');
  assert.equal(overworld.isNether, false);
  assert.equal(overworld.isEnd, false);
  assert.equal(overworld.hasSkylight, true);
  assert.equal(overworld.bedWorks, true, 'a bed works in the overworld');

  const nether = adaptDimensionType(fixture('dimension_type/the_nether.json'));
  assert.equal(nether.isNether, true);
  assert.equal(nether.hasCeiling, true);
  assert.equal(nether.bedWorks, false, 'a bed explodes in the Nether');

  const end = adaptDimensionType(fixture('dimension_type/the_end.json'));
  assert.equal(end.isEnd, true);
  assert.equal(end.bedWorks, false, 'and in the End');
});

test('a malformed dimension type is rejected', () => {
  assert.equal(adaptDimensionType(null), null);
  assert.equal(adaptDimensionType('nope'), null);
  // A file with nothing in it still yields the Java defaults rather than undefined everywhere.
  const bare = adaptDimensionType({});
  assert.equal(bare.hasSkylight, true);
  assert.equal(bare.coordinateScale, 1);
  assert.equal(bare.minY, 0);
});

// --- features and structures -------------------------------------------------------------------------

test('a real placed feature keeps its chain', () => {
  const out = adaptPlacedFeature(fixture('placed_feature/trees_plains.json'));
  assert.ok(out);
  assert.equal(out.feature, 'minecraft:trees_plains');
  assert.ok(Array.isArray(out.placement) && out.placement.length > 0, 'the placement modifiers survive');
  assert.equal(out.fromDataPack, true);
});

test('a real structure keeps everything the engine cannot yet use', () => {
  const out = adaptStructure(fixture('structure/village_plains.json'));
  assert.ok(out);
  assert.equal(out.type, 'jigsaw');
  assert.ok(out.startPool, 'the start pool is named');
  assert.ok(out.raw, 'and the raw file is preserved rather than discarded');
  assert.equal(adaptStructure({}), null, 'a structure with no type is rejected');
  assert.equal(adaptPlacedFeature({}), null, 'and a feature with no feature');
});

// --- the whole way through ---------------------------------------------------------------------------

test('a real vanilla data pack loads end to end through the loader and the adapters', () => {
  // Every fixture at once, as a pack, which is the closest thing to what the game will actually receive.
  //
  // The fixture folders are named for people, not for pack paths -- `biome/` has to become
  // `worldgen/biome/`, and `tags/item/` is a two-level type directory. Mapping them here is what the first
  // version of this test got wrong: it prefixed the folder name directly, so `data/minecraft/biome/...` was
  // not a pack path at all and the pack loaded nothing.
  const FIXTURE_DIRS = {
    'biome/': 'worldgen/biome/',
    'dimension_type/': 'dimension_type/',
    'recipe/': 'recipe/',
    'loot_table/': 'loot_table/',
    'placed_feature/': 'worldgen/placed_feature/',
    'structure/': 'worldgen/structure/',
    'tags/item/': 'tags/item/',
    'tags/block/': 'tags/block/',
  };
  const files = {};
  for (const [from, to] of Object.entries(FIXTURE_DIRS)) {
    const dir = new URL(from, FIXTURE_DIR);
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      files[`data/minecraft/${to}${name}`] = JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
    }
  }
  assert.ok(Object.keys(files).length > 10, 'the fixtures were found');

  const pack = createDataPack({ name: 'Misode fixtures', files });
  assert.equal(pack.skipped.length, 0, 'nothing is skipped: ' + JSON.stringify(pack.skipped.map(s => s.path)));
  const resolved = mergePacks([pack]);
  const coverage = packCoverage(resolved);
  assert.ok(coverage.biome >= 3, 'biomes: ' + JSON.stringify(coverage));
  assert.ok(coverage.recipe >= 3, 'recipes: ' + JSON.stringify(coverage));
  assert.ok(coverage.loot_table >= 3, 'loot tables: ' + JSON.stringify(coverage));
  assert.ok(coverage.dimension_type >= 3, 'dimension types: ' + JSON.stringify(coverage));
  assert.ok(coverage.item_tag >= 2, 'item tags: ' + JSON.stringify(coverage));
  assert.ok(coverage.block_tag >= 1, 'block tags: ' + JSON.stringify(coverage));
  assert.ok(coverage.placed_feature >= 1, 'placed features: ' + JSON.stringify(coverage));
  assert.ok(coverage.structure >= 1, 'structures: ' + JSON.stringify(coverage));
  assert.equal(resolved.errors.length, 0);

  // And the adapters consume the result rather than only the loader accepting it.
  const expandTag = createTagExpander(resolved, 'item_tag');
  const planks = adaptRecipe(resolved.byType.recipe.get('minecraft:oak_planks').json, { expandTag });
  assert.ok(planks.recipes.length >= 1, 'the real oak_planks recipe adapts from the pack');
  const log = adaptLootTable(resolved.byType.loot_table.get('minecraft:oak_log').json);
  assert.equal(log.guaranteed[0].id, BLOCKS.OAK_LOG);
  const plains = adaptBiome(resolved.byType.biome.get('minecraft:plains').json, getBiomeDef('plains'));
  assert.equal(plains.skyColor, 7907327);
  const nether = adaptDimensionType(resolved.byType.dimension_type.get('minecraft:the_nether').json);
  assert.equal(nether.isNether, true);
});

test('every fixture file on disk is one the loader recognises', () => {
  // A guard so a fixture added under a folder the loader does not map is caught here rather than by a test
  // that silently sees nothing.
  const folders = readdirSync(FIXTURE_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory()).map(e => e.name).sort();
  const mapped = new Set(Object.values(PACK_TYPES).flatMap(spec => spec.dirs.map(d => d.split('/').pop())));
  for (const folder of folders) {
    assert.ok(mapped.has(folder) || folder === 'tags' || folder === 'dimension_type',
      `fixture folder "${folder}" should map to a pack type`);
  }
  assert.ok(folders.length > 0);
});
