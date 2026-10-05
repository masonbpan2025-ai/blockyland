// Expand this game's block and item registries toward vanilla, driven by minecraft-data.
//
// Why a generator rather than hand-editing src/blocks.js. The gap is not a handful of blocks; it is
// whole FAMILIES that vanilla defines combinatorially -- 16 wool colours x 11 derived blocks, 12 wood
// types x 6 shapes. Hand-writing those is both enormous and error-prone, and the values (hardness,
// resistance, stack size) already exist upstream. Generating from the same 1.21.4 data the rest of the
// tables come from keeps one source of truth, and makes the additions reviewable as a short diff.
//
// What it deliberately does NOT do: invent blocks whose vanilla shape the mesher cannot draw. Only
// solid cubes are emitted. Slabs, stairs, beds and panes need real geometry in the mesher, and
// emitting them as cubes would be worse than not having them, because a full-cube slab is visibly
// wrong and silently breaks e.g. placing two into a double slab.
//
// Run: node scripts/generate-content-expansion.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { have, gameNames } from './parity-coverage.mjs';

const CACHE = '.cache/mc-data';
if (!existsSync(`${CACHE}/blocks.json`)) {
  console.error('vanilla cache missing; run scripts/generate-mc-data.mjs first');
  process.exit(1);
}

const vanillaBlocks = JSON.parse(readFileSync(`${CACHE}/blocks.json`, 'utf8'));
const vanillaItems = JSON.parse(readFileSync(`${CACHE}/items.json`, 'utf8'));
const vanillaByName = new Map(vanillaBlocks.map(b => [b.name, b]));
const itemByName = new Map(vanillaItems.map(i => [i.name, i]));

// Material -> the sound group this game already uses for that material, and a texture strategy.

// Texture files the game ships, so a generated definition can point at a real asset instead of at a
// plausible-looking name that would 404 into a grey fallback.
//
// Declared here, above every family, because the family texture functions run during generation and
// a const declared later would be in its temporal dead zone at that point. That is not hypothetical:
// it is what made every slab resolve to a planks texture, the helper try/catch having turned the
// ReferenceError into an empty Set.
const BLOCK_TEXTURES = (() => {
  try {
    return new Set(readdirSync('public/assets/blocks'));
  } catch {
    return new Set();
  }
})();
function textureExists(name) {
  return BLOCK_TEXTURES.has(name);
}

const MATERIAL_SOUND = {
  wool: 'grass', cloth: 'grass', wood: 'wood', stone: 'stone', 'rock': 'stone', dirt: 'dirt',
  grass: 'grass', sand: 'sand', glass: 'glass', metal: 'stone', plant: 'grass', leaves: 'grass',
  'default': 'stone',
};

/**
 * Which families to generate. Each entry says how to detect membership upstream and how to derive
 * the game-side name. Only cube-shaped, non-tile-entity blocks are included -- see the file header
 * for why.
 */
/** A block name as a constant: oak_slab becomes OAK_SLAB. */
const constName = (n) => n.toUpperCase();

const FAMILIES = [
  {
    // All 16 wool colours as plain cubes. The game has 6; vanilla's other 10 are named by default.
    id: 'wool',
    match: (n) => /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_wool$/.test(n),
    // Vanilla wool is one texture tinted per colour, so a generated texture name is correct here.
    texture: (n) => `${n}.png`,
    sound: 'grass',
  },
  {
    // Every plank type as a cube. The game has 9 of 12.
    id: 'planks',
    match: (n) => /^[a-z_]+_planks$/.test(n),
    texture: (n) => `${n}.png`,
    sound: 'wood',
  },
  {
    // Plain colour families that are solid cubes in vanilla.
    id: 'colour_cubes',
    match: (n) => /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_(concrete|concrete_powder|terracotta)$/.test(n),
    texture: (n) => `${n}.png`,
    sound: 'stone',
  },
  {
    // Bark blocks and the remaining stone variants: all plain full cubes.
    //
    // `_wood` is a log stripped of its bark on all six sides and `_hyphae` is its nether equivalent.
    // Both are ordinary cubes, and the exclusion list would otherwise catch `_stem` on the hyphae.
    id: 'wood_and_stone_variants',
    match: (n) => /^([a-z_]+_wood|[a-z_]+_hyphae|polished_tuff|tuff_bricks|chiseled_tuff|chiseled_tuff_bricks|deepslate_bricks|cracked_deepslate_bricks|deepslate_tiles|cracked_deepslate_tiles|chiseled_deepslate|polished_deepslate|red_nether_bricks|polished_blackstone_bricks|cracked_polished_blackstone_bricks|chiseled_polished_blackstone|bamboo_mosaic|polished_basalt|smooth_quartz_block|cut_sandstone|chiseled_sandstone|cut_red_sandstone|chiseled_red_sandstone)$/.test(n),
    texture: (n) => {
      if (textureExists(n + ".png")) return n + ".png";
      // A bark block reuses its log texture, and a hyphae its stem.
      const base = n.replace(/_wood$/, "_log").replace(/_hyphae$/, "_stem");
      if (textureExists(base + ".png")) return base + ".png";
      return n + ".png";
    },
    sound: 'wood',
    extra: { cube: true },
  },
  {
    // The tail of plain-cube blockers. Individually each unblocks one or two recipes, but together
    // they are the bulk of what is left that needs no new geometry.
    id: 'tail_cubes',
    match: (n) => /^((white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_stained_glass|lapis_block|bone_block|purpur_pillar|heavy_core|copper_grate|exposed_copper_grate|weathered_copper_grate|oxidized_copper_grate|waxed_copper_grate|waxed_exposed_copper_grate|waxed_weathered_copper_grate|waxed_oxidized_copper_grate|pale_moss_block|bamboo_block|stripped_bamboo_block|carved_pumpkin|jack_o_lantern|sugar_cane|vine|torchflower|lilac|peony|rose_bush|pink_petals|pitcher_plant|breeze_rod)$/.test(n),
    texture: (n) => {
      if (textureExists(n + ".png")) return n + ".png";
      // A stained glass reuses its own texture if present, but its colour is what identifies it, so
      // fall back to the plain glass tile rather than to a name that will not exist.
      if (/_stained_glass$/.test(n) && textureExists("glass.png")) return "glass.png";
      if (textureExists(n + ".svg")) return n + ".svg";
      return n + ".png";
    },
    sound: 'stone',
    extra: { cube: true },
  },
  {
    // Candles: a narrow column, and sixteen colours of it. The largest remaining single blocker.
    id: 'candles',
    match: (n) => /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)?_?candle$/.test(n),
    texture: (n) => {
      if (textureExists(n + ".png")) return n + ".png";
      // The colour is what identifies a candle, so fall back to a plain candle tile rather than to
      // a name that will not exist.
      if (textureExists("candle.png")) return "candle.png";
      return n + ".png";
    },
    sound: 'wool',
    extra: { candle: true },
  },
  {
    // Chains: a thin post. One recipe, but it is a shape this project did not have.
    id: 'chains',
    match: (n) => /^chain$/.test(n),
    texture: (n) => (textureExists(n + ".png") ? n + ".png" : n + ".svg"),
    sound: 'stone',
    extra: { chain: true },
  },
  {
    // The last plain-cube blockers. Each unblocks exactly one recipe, so this is the tail of the
    // tail -- but they are data rather than geometry, so they are cheap.
    id: 'misc_cubes',
    match: (n) => /^(chiseled_nether_bricks|quartz_bricks|melon|tinted_glass|lodestone|target|crafter|lantern|calibrated_sculk_sensor)$/.test(n),
    texture: (n) => {
      if (textureExists(n + ".png")) return n + ".png";
      if (textureExists(n + "_top.png")) return n + "_top.png";
      if (textureExists(n + ".svg")) return n + ".svg";
      return n + ".png";
    },
    sound: 'stone',
    extra: { cube: true },
  },
  {
    // Walls: a chunky post with full-height rails. One shape, 25 recipes, which is the best
    // remaining payoff. `_wall` is in the name-based cube exclusion, bypassed by the marker.
    id: 'walls',
    match: (n) => /_wall$/.test(n),
    texture: (n) => {
      const base = n.replace(/_wall$/, "");
      if (textureExists(base + ".png")) return base + ".png";
      if (textureExists(n + ".png")) return n + ".png";
      if (textureExists(base + ".svg")) return base + ".svg";
      return base + ".png";
    },
    sound: 'stone',
    extra: { wall: true },
  },
  {
    // Fences: a post with two rails, so a shape rather than a cube. `_fence` is still in the
    // name-based cube exclusion, which the shape marker bypasses.
    id: 'fences',
    match: (n) => /(_fence|nether_brick_fence)$/.test(n),
    texture: (n) => {
      const base = n.replace(/_fence$/, "");
      if (textureExists(base + "_planks.png")) return base + "_planks.png";
      if (textureExists(base + ".png")) return base + ".png";
      return base + ".png";
    },
    sound: 'wood',
    extra: { fence: true },
  },
  {
    // Stairs: two boxes, a base half and a step against the back. Declared with a shape marker so
    // the name-based cube exclusion is skipped, which matters because `_stairs` is in that list.
    id: 'stairs',
    match: (n) => /_stairs$/.test(n),
    texture: (n) => {
      const base = n.replace(/_stairs$/, "");
      if (textureExists(base + "_planks.png")) return base + "_planks.png";
      if (textureExists(base + ".png")) return base + ".png";
      return base + ".png";
    },
    sound: 'wood',
    extra: { stair: true },
  },
  {
    // Slabs: half-height boxes. Emitted now that src/slab.js can draw them; before that they were
    // deliberately excluded because a slab drawn as a full cube is visibly wrong.
    id: 'slabs',
    match: (n) => /_slab$/.test(n),
    // A slab uses its BASE block's texture. Wooden slabs resolve to planks; stone ones to the stone
    // itself. Both are looked up from the vanilla block the slab is made of, with a planks fallback
    // for wood types whose base block is named differently.
    texture: (n) => {
      const base = n.replace(/_slab$/, '');
      // Prefer the planks texture, which is what a wooden slab uses, and fall back to the base
      // block's own texture, which is what a stone slab uses. Both are checked against the assets the
      // game actually ships, so a name that would 404 is never chosen.
      //
      // An earlier version returned the planks form unconditionally when neither candidate existed,
      // which is why stone_slab pointed at stone_planks.png -- a name that was never plausible.
      const planks = `${base}_planks.png`;
      if (textureExists(planks)) return planks;
      return `${base}.png`;
    },
    sound: 'wood',
    // Marked in the generated definition so the geometry dispatcher and the mesher route it correctly.
    extra: { slab: true },
  },
  {
    // Stripped logs and copper blocks: plain full cubes, present only because no family matched
    // them. Stripped logs are 12 wood types; copper adds its base, raw and waxed variants.
    //
    // Declared with a shape marker so the NOT_A_CUBE exclusion is skipped, which matters here:
    // `_stem` would otherwise catch stripped_crimson_stem and stripped_warped_stem.
    id: 'stripped_and_copper',
    match: (n) => /^(stripped_[a-z_]+|copper_block|raw_copper_block|raw_iron_block|raw_gold_block|waxed_copper_block|waxed_exposed_copper|waxed_weathered_copper|waxed_oxidized_copper|exposed_copper|weathered_copper|oxidized_copper|copper_bulb|exposed_copper_bulb|weathered_copper_bulb|oxidized_copper_bulb|waxed_copper_bulb|waxed_exposed_copper_bulb|waxed_weathered_copper_bulb|waxed_oxidized_copper_bulb|chiseled_copper|exposed_chiseled_copper|weathered_chiseled_copper|oxidized_chiseled_copper|waxed_chiseled_copper|waxed_exposed_chiseled_copper|waxed_weathered_chiseled_copper|waxed_oxidized_chiseled_copper|cut_copper|exposed_cut_copper|weathered_cut_copper|oxidized_cut_copper|waxed_cut_copper|waxed_exposed_cut_copper|waxed_weathered_cut_copper|waxed_oxidized_cut_copper|amethyst_block|raw_copper)$/.test(n),
    texture: (n) => {
      // A stripped log reuses its own texture where the game ships one, and the unstripped log
      // otherwise, so it is visibly wood rather than a grey fallback.
      if (textureExists(n + ".png")) return n + ".png";
      const base = n.replace(/^stripped_/, "").replace(/_stem$/, "_log");
      if (textureExists(base + ".png")) return base + ".png";
      if (textureExists(n + ".svg")) return n + ".svg";
      return base + ".png";
    },
    // Metal blocks sound like metal; wood like wood.
    sound: 'stone',
    extra: { cube: true },
  },
  {
    // Cross-shaped plants. The mesher already draws a cross for any block with plant: true, so
    // these need no geometry -- only the data, and a matching item for the ones used in recipes.
    id: 'plants',
    match: (n) => /^(brown_mushroom|red_mushroom|dandelion|poppy|blue_orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|red_tulip|orange_tulip|white_tulip|pink_tulip|sweet_berry_bush|nether_sprouts|crimson_roots|warped_roots|glow_lichen)$/.test(n),
    texture: (n) => {
      if (textureExists(n + ".png")) return n + ".png";
      return n + ".svg";
    },
    sound: "grass",
    // A plant is walked through rather than stood on, and must not cull its neighbours faces.
    // `plant` is what makes the mesher build a cross instead of a cube.
    extra: { plant: true, solid: false, transparent: true },
  },
  {
    // Beds. Vanilla has 16 colours and this game models a bed as two blocks -- foot and head --
    // so each colour needs both. bed.js already had the geometry, hard-coded to red, so this is a
    // data addition plus a colour parameter rather than new geometry.
    id: 'beds',
    match: (n) => /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_bed$/.test(n),
    texture: (n) => {
      // One texture per colour where the game ships it, otherwise the red bed texture; the
      // blanket tint is applied per-vertex either way.
      if (textureExists(n + '.png')) return n + '.png';
      return 'red_bed.png';
    },
    sound: 'wood',
    // A bed is a flat box, so it needs the non-cube path. bedColourFrom marks that the colour is
    // derived from the name, so one builder can serve every colour.
    extra: { bed: true, bedColourFrom: true },
  },
  {
    // Glass panes: a thin sheet through the middle of the block. Not a cube, so marked and routed.
    id: 'panes',
    match: (n) => /_pane$/.test(n),
    // A pane reuses its glass texture. Plain glass_pane maps to glass.png; a stained pane maps to its
    // own stained texture where one exists, which textureExists checks.
    texture: (n) => {
      const base = n.replace(/_pane$/, '');
      if (textureExists(base + '.png')) return base + '.png';
      return 'glass.png';
    },
    sound: 'glass',
    extra: { pane: true },
    transparent: true,
  },
  {
    // Carpets: one pixel tall, covering the block. Marked so they are not drawn as cubes.
    id: 'carpets',
    match: (n) => /_carpet$/.test(n),
    texture: (n) => {
      const base = n.replace(/_carpet$/, '');
      if (textureExists(base + '.png')) return base + '.png';
      return n + '.png';
    },
    sound: 'grass',
    extra: { carpet: true },
  },
  {
    // Utility blocks vanilla treats as full cubes. Ranked by recipes unblocked: campfire alone blocks
    // 44. Campfire and soul_campfire emit light, which the generator carries through from the data.
    id: 'utility_cubes',
    match: (n) => /^(campfire|soul_campfire|chiseled_bookshelf|jukebox|beehive|bee_nest|barrel|smoker|blast_furnace|grindstone|stonecutter|loom|composter|lectern|cartography_table|smithing_table|fletching_table|bell|decorated_pot)$/.test(n),
    texture: (n) => (n === 'campfire' || n === 'soul_campfire' ? `${n}_log.png` : `${n}_top.png`),
    sound: 'wood',
  },
  {
    // Base stone variants that are plain cubes.
    id: 'stone_cubes',
    match: (n) => /^(diorite|andesite|granite|polished_diorite|polished_andesite|polished_granite|calcite|tuff|dripstone_block|deepslate|polished_deepslate|smooth_stone|stone_bricks|mossy_stone_bricks|cracked_stone_bricks|chiseled_stone_bricks|bricks|prismarine|prismarine_bricks|dark_prismarine|netherrack|soul_sand|soul_soil|basalt|smooth_basalt|blackstone|polished_blackstone|gilded_blackstone|end_stone|end_stone_bricks|purpur_block|packed_mud|mud_bricks|quartz_block|smooth_quartz|chiseled_quartz_block|quartz_pillar|hay_block|dried_kelp_block|sponge|wet_sponge|honeycomb_block|ochre_froglight|verdant_froglight|pearlescent_froglight|sculk|moss_block|rooted_dirt|coarse_dirt|podzol|mycelium|red_sand|smooth_sandstone|chiseled_sandstone|cut_sandstone|red_sandstone|smooth_red_sandstone|chiseled_red_sandstone|cut_red_sandstone|smooth_stone_slab)$/.test(n),
    texture: (n) => `${n}.png`,
    sound: 'stone',
  },
];

// Materials that are definitely NOT plain full cubes, even inside a matched family.
const NOT_A_CUBE = /(_stairs|_wall|_fence|_fence_gate|_door|_trapdoor|_sign|_button|_pressure_plate|_bed|_banner|_candle|_shulker_box|_boat|_minecart|_rail|_repeater|_comparator|_piston|_observer|_hopper|_dispenser|_dropper|_brewing_stand|_cauldron|_anvil|_enchanting_table|_note_block|_chest|_furnace|_conduit|_beacon|_spawner|_head|_skull|_frame|_stand|_ladder|_torch|_lantern|_chain|_rod|_vine|_sapling|_flower|_bush|_grass|_fern|_seeds|_crop|_stem|_wart|_mushroom|_fungus|_roots|_sprouts|_coral|_fan|_egg|_turtle_egg|_cake|_candle_cake|_pumpkin_pie|_sculk_sensor|_sculk_shrieker|_calibrated_sculk_sensor|_amethyst_cluster|_bud|_stalactite|_stalagmite|_dripstone|_pointed_dripstone|_glow_lichen|_hanging_roots|_big_dripleaf|_small_dripleaf|_azalea|_mangrove_propagule|_frogspawn|_sea_pickle|_sniffer_egg|_decorated_pot|_chiseled_bookshelf|_crafter|_trial_spawner|_vault|_heavy_core|_creaking_heart|_pale_moss|_pale_hanging_moss|_resin|_fire|_water|_lava|_portal|_bubble_column|_structure_void|_barrier|_light|air|_moving_piston|_piston_head|_tripwire|_cocoa|_nether_portal|_end_portal|_end_gateway|_frosted_ice|_ice|_snow|_powder_snow|_lily_pad|_conduit)$/;

// --- work out what to add ---------------------------------------------------
// Anything a previous run emitted is carried through verbatim, so re-running is a no-op rather
// than a rewrite. Dropping these is what wiped the file the first time this ran twice.
const previousEntries = [];
const alreadyEmitted = new Set();
if (existsSync('src/extraContent.js')) {
  const prev = readFileSync('src/extraContent.js', 'utf8');
  const idBlock = prev.match(/export const EXTRA_BLOCK_IDS = \{([\s\S]*?)\};/);
  const defBlock = prev.match(/export const EXTRA_BLOCK_DEFS = \{([\s\S]*?)\};/);
  const nameBlock = prev.match(/export const EXTRA_BLOCK_NAMES = \{([\s\S]*?)\};/);
  const defs = new Map();
  if (defBlock) {
    for (const mm of defBlock[1].matchAll(/^\s+(\d+): \{([\s\S]*?)\},$/gm)) defs.set(mm[1], mm[2].trim());
  }
  if (idBlock) {
    for (const mm of idBlock[1].matchAll(/^\s+([A-Z0-9_]+): (\d+),$/gm)) {
      alreadyEmitted.add(mm[1]);
      previousEntries.push({ constName: mm[1], id: Number(mm[2]), def: defs.get(mm[2]) ?? null });
    }
  }
  void nameBlock;
}

const usedIds = new Set(Object.values(BLOCKS).filter(v => typeof v === 'number'));
let nextId = Math.max(...usedIds) + 1;

const toAdd = [];
const seen = new Set();
for (const family of FAMILIES) {
  for (const vb of vanillaBlocks) {
    const n = vb.name;
    if (!family.match(n)) continue;
    // Families that declare a shape marker have a geometry builder, so the name-based cube
    // exclusion must not apply to them. This used to be a silent trap: a family whose suffix
    // was still listed below matched nothing at all, which looks identical to a family with no
    // work to do. Slabs, panes, carpets and beds each failed that way once.
    if (!family.extra && NOT_A_CUBE.test(n)) continue;
    if (have(n)) continue;      // already exists in the game
    if (alreadyEmitted.has(constName(n))) continue;  // emitted by a previous run
    if (seen.has(n)) continue;
    seen.add(n);
    // Skip anything vanilla marks as not a full cube (has a non-full bounding box).
    const bb = vb.boundingBox;
    if (bb && bb !== 'block' && bb !== 'empty') continue;
    toAdd.push({
      name: n,
      family: family.id,
      extra: family.extra || null,
      texture: family.texture(n),
      sound: family.sound ?? MATERIAL_SOUND[vb.material] ?? 'stone',
      hardness: typeof vb.hardness === 'number' ? vb.hardness : 1,
      resistance: typeof vb.resistance === 'number' ? vb.resistance : null,
      emitLight: vb.emitLight || 0,
      transparent: !!vb.transparent,
      vanilla: vb,
    });
  }
}
toAdd.sort((a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name));
for (const a of toAdd) a.id = nextId++;

// --- beds are two blocks per colour -----------------------------------------
//
// The main loop emits one block per vanilla name. This game models a bed as a foot and a head,
// so a matching head is appended for every bed foot with the same textures and a head marker.
{
  const bedFeet = toAdd.filter(a => a.family === 'beds' && !a.extra?.isHead);
  for (const bed of bedFeet.slice()) {
    toAdd.push({
      name: bed.name + '_head',
      family: 'beds',
      texture: bed.texture,
      sound: bed.sound,
      hardness: bed.hardness,
      resistance: bed.resistance,
      emitLight: 0,
      transparent: false,
      extra: { bed: true, isHead: true, bedColourFrom: true },
      id: nextId++,
    });
  }
  if (bedFeet.length) console.log('  (beds: ' + bedFeet.length + ' feet + ' + bedFeet.length + ' heads)');
}




// Refuse to emit an id the chunk store cannot hold.
//
// This is the bug that shipped silently the first time. Chunk.voxels was a Uint8Array, so ids above
// 255 wrapped: setting block 270 stored 14, and the chunk read back Sand. Nothing threw anywhere.
// The array is Uint16Array now, raising the ceiling to 65535, but the ceiling still exists and the
// next person to add a few thousand blocks deserves an error rather than a missing block.
const MAX_BLOCK_ID = 65535;
const highest = Math.max(...usedIds, ...toAdd.map(a => a.id));
if (highest > MAX_BLOCK_ID) {
  throw new Error('block id ' + highest + ' exceeds the ' + MAX_BLOCK_ID
    + ' the voxel store can hold; widen Chunk.voxels or renumber the registry');
}
void itemByName;

// --- emit -------------------------------------------------------------------
const lines = [];
lines.push('// GENERATED FILE - do not edit by hand.');
lines.push('//');
lines.push('// Block and item content added to reach parity with vanilla Minecraft.');
lines.push('//');
lines.push('// Produced by scripts/generate-content-expansion.mjs from PrismarineJS/minecraft-data');
lines.push('// (https://github.com/PrismarineJS/minecraft-data), the same pc/1.21.4 data the other');
lines.push('// generated tables use. Regenerate with:');
lines.push('//   node scripts/generate-content-expansion.mjs');
lines.push('//');
lines.push('// Only solid full cubes are listed. Slabs, stairs, beds and panes are deliberately absent:');
lines.push('// they need real geometry in the mesher, and drawing them as cubes would look wrong and');
lines.push('// break placement rules. See scripts/generate-content-expansion.mjs for the full reasoning.');
lines.push('');
lines.push('/** Additional block ids, appended after the hand-written range. */');
lines.push('export const EXTRA_BLOCK_IDS = {');
for (const e of previousEntries) lines.push(`  ${e.constName}: ${e.id},`);
for (const a of toAdd) lines.push(`  ${constName(a.name)}: ${a.id},`);
lines.push('};');
lines.push('');
lines.push('/** Definitions for the extra blocks, keyed by id like BLOCK_DEFS. */');
lines.push('export const EXTRA_BLOCK_DEFS = {');
// Carry forward previously generated definitions untouched.
for (const e of previousEntries) if (e.def) lines.push(`  ${e.id}: { ${e.def} },`);
for (const a of toAdd) {
  const parts = [
    `name: '${a.name.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}'`,
    `hardness: ${a.hardness}`,
    `sound: '${a.sound}'`,
  ];
  // Shape markers, e.g. slab: true, so the renderer knows this is not a full cube.
  for (const [k, v] of Object.entries(a.extra || {})) parts.push(`${k}: ${v}`);
  // separate lookup table. Only beds carry this.
  if (a.extra?.bedColourFrom) {
    const m = /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_bed/.exec(a.name);
    if (m) parts.push(`bedColour: '${m[1]}'`);
  }
  if (a.resistance !== null && a.resistance !== a.hardness) parts.push(`resistance: ${a.resistance}`);
  if (a.emitLight) parts.push(`light: ${a.emitLight}`);
  if (a.transparent) parts.push('transparent: true');
  parts.push(`textures: { all: '${a.texture}' }`);
  lines.push(`  ${a.id}: { ${parts.join(', ')} },`);
}
lines.push('};');
lines.push('');
lines.push('/** How many extra blocks this file defines, for tests and reporting. */');
lines.push(`export const EXTRA_BLOCK_COUNT = ${previousEntries.length + toAdd.length};`);
lines.push('');
lines.push('/** Names added, by family, so the backlog can report what changed. */');
lines.push('export const EXTRA_BLOCK_NAMES = {');
const byFamily = new Map();
for (const a of toAdd) {
  if (!byFamily.has(a.family)) byFamily.set(a.family, []);
  byFamily.get(a.family).push(a.name);
}
for (const [fam, names] of byFamily) {
  lines.push(`  ${fam}: [`);
  for (const n of names) lines.push(`    '${n}',`);
  lines.push('  ],');
}
lines.push('};');
lines.push('');

writeFileSync('src/extraContent.js', lines.join('\n'), 'utf8');

console.log('wrote src/extraContent.js');
console.log('extra blocks: ' + (previousEntries.length + toAdd.length)
  + (toAdd.length ? ' (+' + toAdd.length + ' new)' : ' (no change)'));
for (const [fam, names] of byFamily) console.log('  ' + fam.padEnd(16) + names.length);
void BLOCK_DEFS; void ITEMS; void gameNames;
