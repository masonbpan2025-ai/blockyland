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
    // Banners: a pole with a cloth panel, and sixteen dye colours. One shape, 16 recipes.
    //
    // The family regex also matches `*_wall_banner`, which vanilla lists separately. Both forms share
    // the shape, so both are emitted; the colour derivation below handles the `wall_` infix.
    id: 'banners',
    match: (n) => /_banner$/.test(n),
    texture: (n) => {
      // The colour is a tint rather than a texture, so every banner can share one cloth tile.
      if (textureExists('white_banner.png')) return 'white_banner.png';
      if (textureExists(n + '.png')) return n + '.png';
      return 'white_banner.png';
    },
    sound: 'wool',
    extra: { banner: true, bannerColourFrom: true },
  },
  {
    // Hanging signs: a bar with a board suspended below it. Declared BEFORE signs, because the
    // signs regex would also match these names.
    id: 'hanging_signs',
    match: (n) => /_hanging_sign$/.test(n),
    texture: (n) => {
      const base = n.replace(/_hanging_sign$/, "");
      if (textureExists(base + "_planks.png")) return base + "_planks.png";
      if (textureExists(base + ".png")) return base + ".png";
      return "oak_planks.png";
    },
    sound: 'wood',
    extra: { hangingSign: true },
  },
  {
    // Rods: thin full-height posts. Two blocks, two recipes.
    id: 'rods',
    match: (n) => /^(end_rod|lightning_rod)$/.test(n),
    texture: (n) => {
      if (textureExists(n + ".png")) return n + ".png";
      if (textureExists(n + ".svg")) return n + ".svg";
      return "iron_bars.png";
    },
    sound: 'stone',
    extra: { rod: true },
  },
  {
    // Detector and activator rails: a one-pixel plate. The rails themselves are not simulated.
    id: 'special_rails',
    match: (n) => /^(detector_rail|activator_rail)$/.test(n),
    texture: (n) => {
      if (textureExists(n + ".png")) return n + ".png";
      if (textureExists("rail.png")) return "rail.png";
      return "iron_bars.png";
    },
    sound: 'stone',
    extra: { rail: true },
  },
  {
    // A flower pot: a small box.
    id: 'flower_pots',
    match: (n) => /^flower_pot$/.test(n),
    texture: (n) => (textureExists(n + ".png") ? n + ".png" : "iron_bars.png"),
    sound: 'stone',
    extra: { flowerPot: true },
  },
  {
    // Iron bars: a thin sheet through the middle, the same shape as a pane. Vanilla draws a grid;
    // the pane silhouette is the honest approximation and is documented on the builder.
    id: 'bars',
    match: (n) => /^iron_bars$/.test(n),
    texture: (n) => (textureExists(n + ".png") ? n + ".png" : "iron_bars.svg"),
    sound: 'stone',
    extra: { pane: true },
  },
  {
    // The last plain-cube blocker.
    id: 'muddy_cubes',
    match: (n) => /^(muddy_mangrove_roots|soul_lantern)$/.test(n),
    texture: (n) => {
      if (textureExists(n + ".png")) return n + ".png";
      if (textureExists(n + ".svg")) return n + ".svg";
      return "mangrove_roots.png";
    },
    sound: 'grass',
    extra: { cube: true },
  },
  {
    // Standing signs: a post with a board. 12 recipes, and the largest remaining group.
    //
    // The negative lookahead-equivalent in the match matters: without it this family would also
    // claim every hanging sign and give it a standing sign shape.
    id: 'signs',
    match: (n) => /_sign$/.test(n) && !/_hanging_sign$/.test(n) && !/_wall_sign$/.test(n),
    texture: (n) => {
      const base = n.replace(/_sign$/, "");
      if (textureExists(base + "_planks.png")) return base + "_planks.png";
      if (textureExists(base + ".png")) return base + ".png";
      return "oak_planks.png";
    },
    sound: 'wood',
    extra: { sign: true },
  },
  {
    // Pressure plates: a thin plate on the floor, 13 recipes.
    id: 'pressure_plates',
    match: (n) => /_pressure_plate$/.test(n),
    texture: (n) => {
      const base = n.replace(/_pressure_plate$/, "");
      if (textureExists(base + "_planks.png")) return base + "_planks.png";
      if (textureExists(base + ".png")) return base + ".png";
      if (textureExists(n + ".png")) return n + ".png";
      return base + ".png";
    },
    sound: 'wood',
    extra: { pressurePlate: true },
  },
  {
    // Buttons: a small box, 13 recipes.
    id: 'buttons',
    match: (n) => /_button$/.test(n),
    texture: (n) => {
      const base = n.replace(/_button$/, "");
      if (textureExists(base + "_planks.png")) return base + "_planks.png";
      if (textureExists(base + ".png")) return base + ".png";
      if (textureExists(n + ".png")) return n + ".png";
      return base + ".png";
    },
    sound: 'wood',
    extra: { button: true },
  },
  {
    // Fence gates: four corner posts with slatted panels, 12 recipes.
    id: 'fence_gates',
    match: (n) => /_fence_gate$/.test(n),
    texture: (n) => {
      const base = n.replace(/_fence_gate$/, "");
      if (textureExists(base + "_planks.png")) return base + "_planks.png";
      if (textureExists(base + ".png")) return base + ".png";
      return base + ".png";
    },
    sound: 'wood',
    extra: { fenceGate: true },
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

// --- doors are four blocks per wood, trapdoors two ---------------------------
//
// A door in this game is four ids (closed, open, top, top-open) and a trapdoor is two. The geometry and
// the door manager already exist -- door.js resolves a door's four ids from its definition name, which
// is what lets one code path serve every wood -- so this is data plus texture resolution.
//
// Doors are NOT a family. `_door` and `_trapdoor` are in the name-based cube exclusion, so the family
// loop already skips them, and the expansion below emits the whole structure with explicit ids the way
// the bed-head expansion does.
{
  // Only oak and iron door textures ship with this game, so a door for any other wood uses that wood's
  // plank texture. It reads as that wood rather than as a grey fallback.
  const doorTexture = (name, part) => {
    const base = name.replace(/_(door|trapdoor)$/, '');
    if (part === 'bottom' && textureExists(base + '_door_bottom.png')) return base + '_door_bottom.png';
    if (part === 'top' && textureExists(base + '_door_top.png')) return base + '_door_top.png';
    if (part === 'trapdoor' && textureExists(base + '_trapdoor.png')) return base + '_trapdoor.png';
    if (textureExists(base + '_planks.png')) return base + '_planks.png';
    if (textureExists(base + '_block.png')) return base + '_block.png';
    if (textureExists(base + '.png')) return base + '.png';
    return part === 'trapdoor' ? 'oak_trapdoor.png' : 'oak_door_bottom.png';
  };

  const doorBlocks = [];
  for (const vb of vanillaBlocks) {
    const n = vb.name;
    if (!/_(door|trapdoor)$/.test(n)) continue;
    if (n === 'iron_door' || n === 'iron_trapdoor') continue;   // hand-written already
    if (have(n)) continue;
    const hardness = typeof vb.hardness === 'number' ? vb.hardness : 3;
    if (/_trapdoor$/.test(n)) {
      const base = {
        family: 'trapdoors', hardness, sound: 'wood', transparent: true, isIron: false,
        texture: doorTexture(n, 'trapdoor'),
      };
      // Closed first, then open, so the open variant's id is the closed one's plus one.
      doorBlocks.push({ ...base, name: n, solid: true, open: false },
        { ...base, name: n + '_open', solid: false, open: true });
    } else {
      const bottom = doorTexture(n, 'bottom');
      const top = doorTexture(n, 'top');
      const base = {
        family: 'doors', hardness, sound: 'wood', transparent: true, isIron: false,
        texture: bottom, textureBottom: bottom, textureTop: top,
      };
      doorBlocks.push(
        { ...base, name: n, solid: true, isTop: false, open: false },
        { ...base, name: n + '_open', solid: false, isTop: false, open: true },
        { ...base, name: n + '_top', solid: true, isTop: true, open: false },
        { ...base, name: n + '_top_open', solid: false, isTop: true, open: true });
    }
  }
  // Ids are assigned here rather than in the main loop, so each group's variants stay adjacent and the
  // open id can be expressed as "the next one".
  for (const d of doorBlocks) d.id = nextId++;
  for (let i = 0; i < doorBlocks.length; i++) {
    const d = doorBlocks[i];
    // Only the CLOSED BOTTOM form carries an openId, matching the hand-written oak and iron doors. The
    // open variant is always emitted immediately after it.
    if (d.isTop || d.open) continue;
    d.openId = doorBlocks[i + 1].id;
  }
  toAdd.push(...doorBlocks);
  if (doorBlocks.length) {
    console.log('  (doors: ' + doorBlocks.filter(d => d.family === 'doors').length + ' blocks + '
      + doorBlocks.filter(d => d.family === 'trapdoors').length + ' trapdoor blocks)');
  }
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
  // A door is four blocks and a trapdoor two, so the definition carries the state flags that door.js
  // reads rather than a shape marker.
  if (a.family === 'doors' || a.family === 'trapdoors') {
    parts.push(a.family === 'doors' ? 'door: true' : 'trapdoor: true');
    parts.push(`isIron: ${Boolean(a.isIron)}`);
    parts.push(`isTop: ${Boolean(a.isTop)}`);
    if (a.solid === false) parts.push('solid: false');
    if (a.openId !== undefined) parts.push(`openId: ${a.openId}`);
    // The open and top halves are placed by the door itself, so they must not become creative items
    // or tooltips in their own right.
    if (a.isTop || a.open) parts.push('internal: true');
    if (a.textureBottom || a.textureTop) {
      const b = a.textureBottom || a.texture;
      const tp = a.textureTop || a.texture;
      parts.push(`textures: { bottom: '${b}', top: '${tp}', all: '${b}' }`);
    } else {
      parts.push(`textures: { all: '${a.texture}' }`);
    }
  }
  // separate lookup table. Only beds carry this.
  if (a.extra?.bedColourFrom) {
    const m = /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_bed/.exec(a.name);
    if (m) parts.push(`bedColour: '${m[1]}'`);
  }
  // A banner carries its dye colour the same way a bed does, so one builder serves all sixteen.
  //
  // The optional wall_ group matters. The family regex `_banner$` also matches `*_wall_banner`, and
  // without this group every wall banner fell through to the white default: the blocks rendered and
  // were simply the wrong colour, which nothing failed on.
  if (a.extra?.bannerColourFrom) {
    const m = /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_(?:wall_)?banner$/.exec(a.name);
    if (m) parts.push(`bannerColour: '${m[1]}'`);
  }
  if (a.resistance !== null && a.resistance !== a.hardness) parts.push(`resistance: ${a.resistance}`);
  if (a.emitLight) parts.push(`light: ${a.emitLight}`);
  if (a.transparent) parts.push('transparent: true');
  // Doors and trapdoors wrote their own textures above, including the separate bottom and top tiles.
  if (a.family !== 'doors' && a.family !== 'trapdoors') {
    parts.push(`textures: { all: '${a.texture}' }`);
  }
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
