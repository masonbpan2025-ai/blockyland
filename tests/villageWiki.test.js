// Village parity with the wiki, checked against the wiki's own text.
//
// The spec is docs/structure-audit/wiki/Village*/wiki.txt (fetched from minecraft.wiki), turned into
// src/villageWikiData.js by scripts/generate-village-wiki-data.mjs. These tests read that data -- not the catalogue's
// copy of it -- so a building that drifts from its description, or a block a type's infobox does not list, fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VILLAGE_WIKI } from '../src/villageWikiData.js';
import { parseVillageWiki, render } from '../scripts/generate-village-wiki-data.mjs';
import { CATALOGUE, houseEntries, isWeaponsmith } from '../src/worldgen/generators/villageCatalogue.js';
import { STYLES, VILLAGE_TYPES } from '../src/worldgen/generators/villageStyles.js';
import {
  generateVillage, realizeVillage, buildVillagePart, villageElement, createVillagePools, poolShare, abandonBlock,
  ABANDONED_CHANCE, VILLAGE_MAX_DISTANCE, VILLAGE_MAX_DEPTH
} from '../src/worldgen/generators/village.js';
import { lootTableFor, hasBlueprint } from '../src/worldgen/generators/villageBuild.js';
import { VILLAGE_BLUEPRINTS } from '../src/worldgen/generators/villageBlueprintData.js';
import { normaliseVillageBlock } from '../src/structureAuditCards.js';
import { STRUCTURES, STRUCTURE_SETS } from '../src/worldgen/registry.js';
import { BLOCKS } from '../src/blocks.js';

const ID = { plains: 'village_plains', desert: 'village_desert', savanna: 'village_savanna', snowy: 'village_snowy', taiga: 'village_taiga' };
const context = (type) => ({ biomeAt: () => STYLES[type].biome, surfaceY: () => 40 });

/** Block names (wiki spelling) and entity types an element writes, and its bed count. */
function contents(type, name) {
  const part = buildVillagePart(type, name);
  const blocks = new Map();
  for (const block of part.blocks) {
    const n = normaliseVillageBlock(part.palette[block.state].Name.replace('minecraft:', ''));
    blocks.set(n, (blocks.get(n) ?? 0) + 1);
  }
  const entities = part.entities.map((e) => e.nbt.type);
  const beds = part.blocks.filter((b) => /_bed$/.test(part.palette[b.state].Name)).length;
  return { blocks, entities, beds, part };
}

// ---------------------------------------------------------------------------------------------------------------
// The data file is the wiki's, unedited.

test('src/villageWikiData.js is exactly what the generator makes from the saved wiki pages', () => {
  const fresh = render(parseVillageWiki(
    readFileSync('docs/structure-audit/wiki/Village/wiki.txt', 'utf8'),
    readFileSync('docs/structure-audit/wiki/Village_Structure/wiki.txt', 'utf8')
  ));
  assert.equal(readFileSync('src/villageWikiData.js', 'utf8').replace(/\r\n/g, '\n'), fresh, 'run node scripts/generate-village-wiki-data.mjs');
  for (const type of VILLAGE_TYPES) {
    assert.ok(VILLAGE_WIKI.infobox[type].blocks.length > 50, `${type} infobox parsed`);
    assert.ok(VILLAGE_WIKI.templates[type].length > 30, `${type} templates parsed`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Placement: the five types, their biomes (Java), the shared set and its spacing.

test('the five village types generate in the biomes the wiki lists for Java Edition, and nowhere else', () => {
  // Wiki table: Plains -> plains, meadow (sunflower plains is Bedrock only); Savanna -> savanna; Desert -> desert;
  // Taiga -> taiga (snowy taiga and the hills are Bedrock only); Snowy -> snowy plains.
  assert.deepEqual(STRUCTURES.village_plains.biomes.sort(), ['meadow', 'plains']);
  assert.deepEqual(STRUCTURES.village_savanna.biomes, ['savanna']);
  assert.deepEqual(STRUCTURES.village_desert.biomes, ['desert']);
  assert.deepEqual(STRUCTURES.village_taiga.biomes, ['taiga']);
  assert.deepEqual(STRUCTURES.village_snowy.biomes, ['snowy_plains']);
  const set = STRUCTURE_SETS.find((s) => s.name === 'villages');
  assert.deepEqual(set.structures.map(([id]) => id).sort(), Object.values(ID).sort(), 'one structure set for all five');
  assert.equal(set.spacing, 34); assert.equal(set.separation, 8); assert.equal(set.salt, 10387312);
  assert.equal(VILLAGE_MAX_DEPTH, 6); assert.equal(VILLAGE_MAX_DISTANCE, 80);
});

test('in a real world, every village sits in its own type\'s biome at the meeting point, one per 34-chunk region', async () => {
  const { World } = await import('../src/world.js');
  const seen = {};
  for (const seed of [20250401, 7, 99]) {
    const world = new World(seed, 'all');
    world.rebuildStructures({ enabledIds: Object.values(ID) });
    const engine = world.structures.engine;
    const regions = new Set();
    const R = 102; // 3 x 3 regions each way
    for (let cx = -R; cx <= R; cx++) for (let cz = -R; cz <= R; cz++) {
      if (!engine.candidatesForChunk(cx, cz).includes('villages')) continue;
      const plan = engine.planChunk(cx, cz);
      if (!plan || !plan.structureId.startsWith('village')) continue;
      const { centre } = plan.start.meta;
      const biome = world.getBiome(centre.x, centre.z);
      assert.ok(STRUCTURES[plan.structureId].biomes.includes(biome), `seed ${seed}: ${plan.structureId} at chunk ${cx},${cz} has its meeting point in ${biome}`);
      const region = `${Math.floor(cx / 34)},${Math.floor(cz / 34)}`;
      assert.equal(regions.has(region), false, `two villages in region ${region}`);
      regions.add(region);
      seen[plan.structureId] = (seen[plan.structureId] ?? 0) + 1;
    }
  }
  // Across three worlds, plains, snowy and taiga at least appear; desert and savanna depend on the biome map.
  for (const id of ['village_plains', 'village_snowy', 'village_taiga']) assert.ok(seen[id] > 0, `${id} appears: ${JSON.stringify(seen)}`);
});

test('pillager outposts keep 10 chunks away from villages (the outposts\' exclusion zone)', async () => {
  const set = STRUCTURE_SETS.find((s) => s.name === 'pillager_outposts');
  assert.deepEqual(set.exclusionZone, { otherSet: 'villages', chunkCount: 10 });
  const { World } = await import('../src/world.js');
  const world = new World(20250401, 'all');
  world.rebuildStructures({ enabledIds: [...Object.values(ID), 'pillager_outpost'] });
  const engine = world.structures.engine;
  const villages = []; const outposts = [];
  for (let cx = -90; cx <= 90; cx++) for (let cz = -90; cz <= 90; cz++) {
    const sets = engine.candidatesForChunk(cx, cz);
    if (!sets.length) continue;
    const plan = engine.planChunk(cx, cz);
    if (!plan) continue;
    if (plan.structureId.startsWith('village')) villages.push([cx, cz]);
    if (plan.structureId === 'pillager_outpost') outposts.push([cx, cz]);
  }
  for (const [ox, oz] of outposts) {
    for (const [vx, vz] of villages) {
      assert.ok(Math.max(Math.abs(ox - vx), Math.abs(oz - vz)) > 10, `outpost ${ox},${oz} is within 10 chunks of village ${vx},${vz}`);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Every wiki structure, built from its description.

test('every structure the wiki lists for a village type is in that type\'s catalogue', () => {
  for (const type of VILLAGE_TYPES) {
    const names = new Set([...CATALOGUE[type].meetings, ...CATALOGUE[type].buildings, ...CATALOGUE[type].decorations, ...(CATALOGUE[type].lamps ?? [CATALOGUE[type].lamp])].map((e) => e.name));
    // camel_spawn is an entity marker (the camel is spawned at the meeting point); terminators are street ends.
    const missing = VILLAGE_WIKI.templates[type].filter((t) => !names.has(t.name) && t.name !== 'camel_spawn' && !/terminator/.test(t.name));
    assert.deepEqual(missing.map((t) => t.name), [], `${type}: wiki structures missing from the catalogue`);
  }
});

/** Words in a description and what they require the built element to contain. */
const KEYWORDS = [
  [/lectern/, ['lectern']], [/bookshel/, ['bookshelf']], [/blast furnace/, ['blast_furnace']], [/smoker/, ['smoker']],
  [/cartography table/, ['cartography_table']], [/fletching table/, ['fletching_table']], [/grindstone/, ['grindstone']],
  [/smithing table/, ['smithing_table']], [/stonecutter/, ['stonecutter']], [/loom/, ['loom']], [/brewing stand/, ['brewing_stand']],
  [/composter/, ['composter']], [/barrel/, ['barrel']], [/filled cauldron/, ['water_cauldron']], [/\bchest\b/, ['chest']],
  [/\bbell/, ['bell']], [/potted cact/, ['potted_cactus']], [/potted dead bush/, ['potted_dead_bush']],
  [/potted dandelion/, ['potted_dandelion']], [/potted poppy/, ['potted_poppy']], [/potted spruce sapling/, ['potted_spruce_sapling']],
  [/lantern/, ['lantern']], [/campfire/, ['campfire']], [/hay bale/, ['hay_block']], [/granite/, ['granite']], [/diorite/, ['diorite']],
  [/white terracotta/, ['white_terracotta']], [/orange terracotta/, ['orange_terracotta']], [/yellow terracotta/, ['yellow_terracotta']],
  [/red .*terracotta|red terracotta/, ['red_terracotta']], [/glazed terracotta/, [/_glazed_terracotta$/]], [/brown banner/, ['brown_wall_banner']],
  [/snow blocks/, ['snow_block']], [/packed ice/, ['packed_ice']], [/blue ice/, ['blue_ice']], [/pumpkin/, ['pumpkin']],
  [/sea pickle/, ['sea_pickle']], [/ladder/, ['ladder']], [/crafting table/, ['crafting_table']], [/(?<!blast )\bfurnaces?\b/, ['furnace']],
  [/carpet/, [/_carpet$/]], [/(?<!black )\bwool\b/, [/_wool$/]], [/stained glass/, [/_stained_glass_pane$/]], [/stripped logs/, [/^stripped_.*_log$/]],
  [/stripped spruce wood/, ['stripped_spruce_wood']], [/jungle trapdoors/, ['jungle_trapdoor']], [/spruce trapdoors/, ['spruce_trapdoor']],
  [/oak trapdoors/, ['oak_trapdoor']], [/stone buttons/, ['stone_button']], [/spruce stairs/, ['spruce_stairs']],
  [/smooth sandstone stairs/, ['smooth_sandstone_stairs']], [/spruce logs/, ['spruce_log']], [/brick/, ['bricks']], [/\bclay\b/, ['clay']],
  [/cut sandstone/, ['cut_sandstone']], [/spruce fences/, ['spruce_fence']], [/acacia fences/, ['acacia_fence']],
  [/cobblestone wall/, ['cobblestone_wall']], [/cobblestone(?! wall)/, ['cobblestone']], [/oak tree/, ['oak_log', 'oak_leaves']],
  [/torch/, [/^(wall_)?torch$/]], [/pond|watering hole|water trough|irrigation canal|water source/, ['water']], [/crop farm/, ['farmland']]
];

test('every building matches its wiki description: beds and villagers, workstation, and the blocks it names', () => {
  const problems = [];
  for (const type of VILLAGE_TYPES) {
    for (const template of VILLAGE_WIKI.templates[type]) {
      if (template.name === 'camel_spawn' || /terminator/.test(template.name)) continue;
      const { blocks, entities, beds } = contents(type, template.name);
      const d = template.description.toLowerCase();
      for (const [pattern, wants] of KEYWORDS) {
        if (!pattern.test(d)) continue;
        if (/empty water trough/.test(d) && wants[0] === 'water') continue; // "an empty water trough"
        // A trough "made of waterlogged stairs" or "of open trapdoors": the water is in the waterlogged block, which
        // the blueprints cannot draw and this world cannot store, so the trough material stands for it.
        if (wants[0] === 'water' && /trough made of/.test(d) && [...blocks.keys()].some((b) => /_stairs$|_trapdoor$/.test(b))) continue;
        for (const want of wants) {
          const ok = typeof want === 'string' ? blocks.has(want) : [...blocks.keys()].some((name) => want.test(name));
          if (!ok) problems.push(`${template.name}: "${pattern.source}" in its description but no ${want}`);
        }
      }
      // Beds: "A villager generates" = 1, "Two villagers" = 2, "Four villagers" = 4; job buildings have none.
      const villagers = /four villagers/.test(d) ? 4 : /two villagers/.test(d) ? 2 : /a villager generates/.test(d) ? 1 : 0;
      if (beds !== villagers) problems.push(`${template.name}: ${villagers} villager(s) in its description, ${beds} bed(s) built`);
      if (entities.filter((e) => e === 'villager').length !== beds) problems.push(`${template.name}: villagers do not match beds`);
      if (/two sheep/.test(d) && entities.filter((e) => e === 'sheep').length !== 2) problems.push(`${template.name}: two sheep`);
      if (/armor stand/.test(d) && entities.filter((e) => e === 'armor_stand').length !== 2) problems.push(`${template.name}: two armor stands`);
    }
  }
  assert.deepEqual(problems, []);
});

test('the taiga armorer\'s two armor stands wear an iron helmet and an iron chestplate', () => {
  const { part } = contents('taiga', 'taiga_armorer_2');
  const stands = part.entities.filter((e) => e.nbt.type === 'armor_stand').map((e) => e.nbt.equipment[0]).sort();
  assert.deepEqual(stands, ['iron_chestplate', 'iron_helmet']);
});

test('chests follow the wiki\'s Village/Loot page: which job buildings have one, and with which table', () => {
  const chest = (type, name) => contents(type, name).blocks.has('chest');
  // "Only one of the armorer house variants in snowy villages contain chests."
  assert.equal(chest('snowy', 'snowy_armorer_house_1') && !chest('snowy', 'snowy_armorer_house_2') && !chest('plains', 'plains_armorer_house_1'), true);
  // "All cartographer houses except those in desert villages contain chests."
  for (const [t, n] of [['plains', 'plains_cartographer_1'], ['savanna', 'savanna_cartographer_1'], ['snowy', 'snowy_cartographer_house_1'], ['taiga', 'taiga_cartographer_house_1']]) assert.ok(chest(t, n), n);
  assert.equal(chest('desert', 'desert_cartographer_house_1'), false);
  // "Only fisher cottages in plains villages contain chests."; "Only fletcher houses in taiga villages".
  assert.ok(chest('plains', 'plains_fisher_cottage_1') && !chest('taiga', 'taiga_fisher_cottage_1') && !chest('desert', 'desert_fisher_1'));
  assert.ok(chest('taiga', 'taiga_fletcher_house_1') && !chest('plains', 'plains_fletcher_house_1'));
  // "Only temples in desert villages contain chests."; "Only toolsmiths in desert and taiga villages".
  assert.ok(chest('desert', 'desert_temple_1') && !chest('plains', 'plains_temple_3') && !chest('taiga', 'taiga_temple_1'));
  assert.ok(chest('desert', 'desert_tool_smith_1') && chest('taiga', 'taiga_tool_smith_1') && !chest('plains', 'plains_tool_smith_1'));
  // "All weaponsmiths contain chests."; "All tanneries except those in desert villages".
  // "All weaponsmiths contain chests" -- except that the wiki's own blueprint of savanna_weaponsmith_1 has none, and the
  // blueprint is followed block for block. The two wiki pages disagree; this pins the disagreement.
  for (const type of VILLAGE_TYPES) for (const b of CATALOGUE[type].buildings.filter(isWeaponsmith)) assert.equal(chest(type, b.name), !['savanna_weaponsmith_1', 'taiga_weaponsmith_2'].includes(b.name), b.name);
  for (const type of ['plains', 'savanna', 'snowy', 'taiga']) assert.ok(chest(type, `${type}_tannery_1`), type);
  assert.equal(chest('desert', 'desert_tannery_1'), false);
  // The table: a job building's own, a house's the type's house table.
  assert.equal(lootTableFor('taiga', 'taiga_weaponsmith_1'), 'minecraft:chests/village/village_weaponsmith');
  assert.equal(lootTableFor('plains', 'plains_small_house_7'), 'minecraft:chests/village/village_plains_house');
});

// ---------------------------------------------------------------------------------------------------------------
// Each type's own blocks.

/** Every block the wiki's blueprints of a type draw (normalised to the infobox's names). */
function blueprintBlocks(type) {
  const out = new Set();
  for (const [name, bp] of Object.entries(VILLAGE_BLUEPRINTS)) {
    if (!name.startsWith(type + '_')) continue;
    for (const p of bp.palette) out.add(normaliseVillageBlock(p.Name.replace('minecraft:', '')));
  }
  return out;
}

test('the blueprints and the infobox lists agree, apart from these blocks the infobox leaves out', () => {
  // Both are the wiki. The blueprints are the exact drawings, so where they use a block the type's infobox list does
  // not mention, the blueprint is followed and the gap is pinned here (a change on the wiki shows up as a failure).
  const missingFromInfobox = {};
  for (const type of VILLAGE_TYPES) {
    const listed = new Set(VILLAGE_WIKI.infobox[type].blocks);
    missingFromInfobox[type] = [...blueprintBlocks(type)].filter((b) => !listed.has(b) && !/_head$/.test(b)).sort();
  }
  assert.deepEqual(missingFromInfobox, {
    desert: ['dirt', 'sandstone_stairs', 'smooth_stone'],
    plains: ['ladder'],
    savanna: ['wheat'],
    snowy: ['stonecutter'],
    taiga: ['smooth_stone', 'spruce_slab']
  });
});

test('every vanilla village building is built from the wiki\'s blueprint, block for block', () => {
  const procedural = [];
  for (const type of VILLAGE_TYPES) {
    for (const t of VILLAGE_WIKI.templates[type]) {
      if (t.name === 'camel_spawn' || /terminator/.test(t.name)) continue;
      if (!hasBlueprint(t.name)) procedural.push(t.name);
    }
  }
  // The one wiki structure whose blueprint page is missing on the wiki.
  assert.deepEqual(procedural, ['plains_shepherds_house_1']);
  // Spot check: plains_small_house_1 is the wiki's drawing -- 43 cobblestone, 16 stripped oak logs, 3 glass panes,
  // one white bed, one oak door (the materials table on its blueprint page).
  const { part } = contents('plains', 'plains_small_house_1');
  const raw = {};
  for (const b of part.blocks) { const n = part.palette[b.state].Name.replace('minecraft:', ''); raw[n] = (raw[n] ?? 0) + 1; }
  assert.deepEqual([raw.cobblestone, raw.stripped_oak_log, raw.oak_planks, raw.oak_stairs, raw.glass_pane, raw.white_bed, raw.oak_door, raw.wall_torch],
    [43, 16, 34, 50, 3, 1, 1, 3]);
});

function allElementNames(type) {
  const cat = CATALOGUE[type];
  return ['street', 'terminus', ...cat.meetings.map((m) => m.name), ...houseEntries(type).map((e) => e.name), ...(cat.lamps ?? [cat.lamp]).map((l) => l.name)];
}

test('every block a village type builds with is in that type\'s infobox list (or named in its own descriptions)', () => {
  for (const type of VILLAGE_TYPES) {
    const allowed = new Set([...VILLAGE_WIKI.infobox[type].blocks, ...blueprintBlocks(type)]);
    if (type === 'snowy') allowed.add('stonecutter'); // snowy_masons_house_1/2: "containing a stonecutter"
    const extra = new Map();
    for (const name of allElementNames(type)) {
      for (const p of buildVillagePart(type, name).palette) {
        const block = normaliseVillageBlock(p.Name.replace('minecraft:', ''));
        if (block === 'air' || block === 'jigsaw') continue;
        if (!allowed.has(block)) extra.set(block, name);
        const abandoned = abandonBlock(p.Name, STYLES[type], 3, 4, 5);
        if (abandoned && !allowed.has(normaliseVillageBlock(abandoned.replace('minecraft:', '')))) extra.set(abandoned, name + ' (abandoned)');
      }
    }
    assert.deepEqual([...extra].map(([b, n]) => `${b} in ${n}`), [], `${type} uses blocks its wiki list does not have`);
  }
});

test('each type\'s buildings use nearly all of its infobox list (no type is a reskin of another)', () => {
  for (const type of VILLAGE_TYPES) {
    const used = new Set(['cobweb']);
    if (STYLES[type].abandonedMossy) used.add('mossy_cobblestone');
    if (STYLES[type].window === 'glass_pane') used.add('brown_stained_glass_pane');
    for (const name of allElementNames(type)) for (const p of buildVillagePart(type, name).palette) used.add(normaliseVillageBlock(p.Name.replace('minecraft:', '')));
    const unused = VILLAGE_WIKI.infobox[type].blocks.filter((b) => !used.has(b));
    assert.ok(unused.length <= 4, `${type} never uses: ${unused.join(', ')}`);
  }
});

test('materials that tell the types apart, straight from the lists', () => {
  const uses = (type, block) => allElementNames(type).some((name) => contents(type, name).blocks.has(block));
  // The desert has no wood but jungle doors/fences/trapdoors/buttons, and no glass.
  assert.ok(uses('desert', 'jungle_door') && !uses('desert', 'oak_planks') && !uses('desert', 'acacia_planks') && !uses('desert', 'glass_pane'));
  // Plains (Java) has no crafting table; snowy has neither a crafting table nor hay; savanna has no furnace; nobody has an anvil.
  assert.ok(!uses('plains', 'crafting_table') && !uses('snowy', 'crafting_table') && !uses('snowy', 'hay_block') && !uses('savanna', 'furnace'));
  for (const type of VILLAGE_TYPES) assert.equal(uses(type, 'anvil'), false, type);
  // Signature blocks: snowy lanterns and ice; taiga campfires and log roofs; savanna terracotta and banners.
  assert.ok(uses('snowy', 'lantern') && uses('snowy', 'packed_ice') && uses('snowy', 'blue_ice') && !uses('snowy', 'ice'));
  assert.ok(uses('taiga', 'campfire') && uses('taiga', 'spruce_log'));
  assert.ok(uses('savanna', 'orange_terracotta') && uses('savanna', 'brown_wall_banner'));
});

test('crops per type: plains wheat/carrots/potatoes/beetroot, desert wheat/beetroot/melon stems, savanna melons, snowy wheat/carrots/potatoes, taiga wheat/potatoes/pumpkins', () => {
  const want = {
    plains: ['beetroots', 'carrots', 'potatoes', 'wheat'], desert: ['beetroots', 'melon_stem', 'wheat'], savanna: ['melon', 'melon_stem', 'wheat'],
    snowy: ['carrots', 'potatoes', 'wheat'], taiga: ['potatoes', 'pumpkin', 'pumpkin_stem', 'wheat']
  };
  const cropNames = /^(wheat|carrots|potatoes|beetroots|melon|melon_stem|pumpkin|pumpkin_stem)$/;
  for (const type of VILLAGE_TYPES) {
    const crops = new Set();
    for (const entry of [...CATALOGUE[type].buildings.filter((b) => b.kind === 'farm'), ...CATALOGUE[type].decorations]) {
      for (const block of contents(type, entry.name).blocks.keys()) if (cropNames.test(block)) crops.add(block);
    }
    assert.deepEqual([...crops].sort(), want[type], type);
  }
});

test('beds are each type\'s colours, and every colour the infobox lists appears', () => {
  const want = { plains: ['white', 'yellow'], desert: ['cyan', 'green', 'lime'], savanna: ['orange', 'red'], snowy: ['blue', 'red', 'white'], taiga: ['blue', 'purple'] };
  for (const type of VILLAGE_TYPES) {
    const colours = new Set();
    for (const name of allElementNames(type)) for (const block of contents(type, name).blocks.keys()) if (/_bed$/.test(block)) colours.add(block.replace('_bed', ''));
    assert.deepEqual([...colours].sort(), want[type], type);
  }
});

test('lamp posts are each type\'s design', () => {
  const lamp = (type, name = CATALOGUE[type].lamp.name) => contents(type, name).blocks;
  const plains = lamp('plains');
  assert.ok(plains.get('oak_fence') >= 3 && plains.has('stripped_oak_wood') && plains.get('wall_torch') >= 3, 'plains: torches round a tall fence post under stripped oak wood');
  const desert = lamp('desert');
  assert.ok(desert.get('cut_sandstone') === 2 && desert.get('terracotta') === 1 && desert.has('torch'), 'desert: two cut sandstone, terracotta, torch');
  assert.ok(lamp('savanna').has('acacia_fence') && lamp('savanna').has('torch'), 'savanna: torch atop a fence post');
  assert.ok(lamp('taiga').has('cobblestone_wall') && lamp('taiga').has('torch'), 'taiga: torch atop a cobblestone wall');
  for (const [name, n] of [['snowy_lamp_post_01', 2], ['snowy_lamp_post_02', 1], ['snowy_lamp_post_03', 4]]) {
    assert.equal(lamp('snowy', name).get('lantern'), n, `${name}: ${n} lantern(s)`);
  }
});

test('every meeting point has a bell; an iron golem stands at each, and a camel only in the desert', () => {
  for (const type of VILLAGE_TYPES) {
    for (const meeting of CATALOGUE[type].meetings) {
      const { blocks, entities } = contents(type, meeting.name);
      assert.ok(blocks.get('bell') >= 1, meeting.name);
      assert.equal(entities.filter((e) => e === 'iron_golem').length, 1, meeting.name);
      assert.equal(entities.filter((e) => e === 'camel').length, type === 'desert' ? 1 : 0, meeting.name);
    }
  }
});

test('paths are dirt paths and grass (gravel too in the taiga); smooth sandstone in the desert', () => {
  for (const type of VILLAGE_TYPES) {
    const street = contents(type, 'street').blocks;
    if (type === 'desert') { assert.deepEqual([...street.keys()].filter((b) => b !== 'air' && b !== 'jigsaw'), ['smooth_sandstone']); continue; }
    assert.ok(street.get('dirt_path') > 15 && street.has('grass_block'), `${type}: ${[...street.keys()]}`);
  }
  assert.ok(contents('taiga', 'street').blocks.has('gravel'));
});

// ---------------------------------------------------------------------------------------------------------------
// Probabilities.

test('2% of villages are abandoned: the town-centre pool weights, and a sample of generated villages', () => {
  assert.equal(ABANDONED_CHANCE, 0.02);
  for (const type of VILLAGE_TYPES) {
    const pool = createVillagePools(type).resolve('village/town_centres');
    const total = pool.elements.reduce((s, e) => s + e.weight, 0);
    const abandoned = pool.elements.filter((e) => e.name.startsWith('zombie/')).reduce((s, e) => s + e.weight, 0);
    assert.ok(Math.abs(abandoned / total - 0.02) < 1e-12, type);
  }
  let count = 0;
  const n = 500;
  for (let seed = 1; seed <= n; seed++) {
    if (generateVillage({ seed, chunkX: 3, chunkZ: 9, structureId: 'village_plains', context: context('plains') }).meta.abandoned) count++;
  }
  assert.ok(count >= 2 && count <= 25, `${count} of ${n} abandoned (expected about 10)`);
});

test('a weaponsmith is more likely in a taiga village than in any other (the wiki\'s example of per-type odds)', () => {
  const taiga = poolShare('taiga', isWeaponsmith);
  for (const type of ['plains', 'desert', 'savanna', 'snowy']) assert.ok(taiga > poolShare(type, isWeaponsmith), `${type}: ${poolShare(type, isWeaponsmith)} vs taiga ${taiga}`);
});

// ---------------------------------------------------------------------------------------------------------------
// The abandoned village, realized.

test('an abandoned village: zombie villagers, no doors, torches, golem or camel; mossy cobblestone, cobwebs, brown glass; cats and livestock stay', () => {
  for (const type of ['plains', 'desert', 'taiga']) {
    let start = null;
    for (let seed = 1; seed < 2000 && !start; seed++) {
      const s = generateVillage({ seed, chunkX: 3, chunkZ: 9, structureId: ID[type], context: context(type) });
      if (s.meta.abandoned) start = s;
    }
    assert.ok(start, `found an abandoned ${type} village`);
    const names = new Map();
    const written = (x, y, z, id, meta) => { const n = meta.state.name.replace('minecraft:', ''); names.set(n, (names.get(n) ?? 0) + 1); return true; };
    const report = realizeVillage(start, written, BLOCKS);
    assert.ok(report.abandoned);
    assert.equal(report.villagers, 0);
    assert.equal(report.zombieVillagers, start.meta.beds, 'a zombie villager per bed');
    assert.equal(report.ironGolems, 0);
    assert.equal(report.spawns.filter((s) => s.type === 'camel').length, 0);
    assert.equal(report.cats, Math.min(5, Math.floor(start.meta.beds / 4)), 'cats still spawn');
    for (const [name] of names) {
      assert.equal(/_door(_top)?$/.test(name), false, `${type}: a door survived (${name})`);
      assert.equal(/^(wall_)?torch$/.test(name), false, `${type}: a torch survived`);
      assert.notEqual(name, 'glass_pane', `${type}: clean glass survived`);
    }
    assert.ok(names.get('cobweb') > 0, `${type}: cobwebs`);
    if (STYLES[type].abandonedMossy) assert.ok(names.get('mossy_cobblestone') > names.get('cobblestone') ?? 0, `${type}: most cobblestone is mossy`);
    if (STYLES[type].window === 'glass_pane') assert.ok(names.get('brown_stained_glass_pane') > 0, `${type}: brown glass`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Whole villages, per type.

test('a whole village of each type: one villager per bed, cats per bed, a bell, and only that type\'s buildings', () => {
  for (const type of VILLAGE_TYPES) {
    for (const seed of [1, 2, 3]) {
      const start = generateVillage({ seed, chunkX: 4, chunkZ: -2, structureId: ID[type], context: context(type) });
      const report = realizeVillage(start, () => true, BLOCKS);
      assert.deepEqual(report.missingBlocks, [], `${type}: every block resolves to a game block`);
      assert.ok(start.pieces.length >= 10, `${type} seed ${seed}: ${start.pieces.length} pieces`);
      const people = report.villagers + report.zombieVillagers;
      assert.equal(people, start.meta.beds, `${type}: one villager per bed`);
      assert.equal(report.cats, Math.min(5, Math.floor(start.meta.beds / 4)));
      for (const part of start.meta.partMix) assert.ok(villageElement(type, part), `${type}: ${part} is a ${type} element`);
      assert.ok(CATALOGUE[type].meetings.some((m) => start.meta.meetingPoint.endsWith(m.name)), `${type}: meeting point ${start.meta.meetingPoint}`);
    }
  }
});
