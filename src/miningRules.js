// Mining rules: can this tool harvest this block, and how long does it take?
//
// Previously the mining path only divided hardness by the held item's speed, with no concept
// of tool class or tier. That let a wooden shovel dig obsidian, which is wrong in both
// directions: the wrong tool should be unable to harvest at all, and the right tool should be
// materially faster than a bare hand.
//
// The numbers come from src/blockHarvestData.js (generated from minecraft-data) and follow
// the model the real game uses:
//
//   speedMultiplier = toolSpeed            when the tool is the block's proper tool (whether or not it needs one)
//                   = the shears' / sword's per-block speed, where they have one
//                   = 1                    otherwise
//   damagePerTick   = speedMultiplier / hardness / (canHarvest ? 30 : 100)
//   breakTime       = ceil(1 / damagePerTick) ticks, or instant once damagePerTick passes 1
//
// A block that requires a tool and is not matched by the held one is not harvestable at all:
// it breaks eventually but drops nothing.
import { BLOCK_HARVEST, TOOL_TIER_ORDER, harvestDataFor } from './blockHarvestData.js';
import { BLOCK_DEFS } from './blocks.js';

export { TOOL_TIER_ORDER };

/** Tool classes that can sensibly be swung at a block, weakest first. */
export const TOOL_CLASSES = ['pickaxe', 'axe', 'shovel', 'hoe', 'shears', 'sword'];

/**
 * Split an item id like "diamond_pickaxe" into its class and tier.
 *
 * @returns {{tool: string, tier: string|null}|null} null when the item is not a tool
 */
export function describeTool(itemId) {
  if (typeof itemId !== 'string' || !itemId) return null;
  const id = itemId.trim().toLowerCase();
  if (id === 'shears') return { tool: 'shears', tier: null };
  for (const tool of TOOL_CLASSES) {
    if (id.endsWith('_' + tool)) {
      const tier = id.slice(0, -(tool.length + 1));
      return { tool, tier: TOOL_TIER_ORDER.includes(tier) ? tier : null };
    }
  }
  return null;
}

/**
 * Tools that are not mining tools.
 *
 * `describeTool` reads a tool's class from its name and returns null for anything else, which is right: a bow
 * does not mine, and neither does a bucket. The Inspector's `tool-facts` check asked *every* item this game
 * types as `tool` or `weapon` for a mining description, so eighteen of them looked like gaps -- a bucket, a
 * clock, a compass, a name tag -- when the honest answer is that they are not mining tools at all.
 *
 * Named rather than patterned, and `tests/toolFacts.test.js` requires every typed tool to be either described
 * by `describeTool` or listed here, so a new tool cannot be silently unclassified.
 */
export const NON_MINING_TOOLS = new Set([
  'bow', 'crossbow', 'trident',
  'shield', 'fishing_rod', 'flint_and_steel', 'brush',
  'carrot_on_a_stick', 'warped_fungus_on_a_stick',
  'bucket', 'water_bucket', 'lava_bucket',
  // The mob buckets. This game types a bucket as a tool -- it is something you hold -- and a bucket mines
  // nothing. Added by the fish-bucket batch, which two of these guards caught the same round it landed.
  'cod_bucket', 'salmon_bucket', 'pufferfish_bucket', 'tropical_fish_bucket', 'axolotl_bucket', 'tadpole_bucket',
  // And the bundles, seventeen of them: a pouch is held, not swung.
  'bundle', 'white_bundle', 'orange_bundle', 'magenta_bundle', 'light_blue_bundle', 'yellow_bundle', 'lime_bundle', 'pink_bundle',
  'gray_bundle', 'light_gray_bundle', 'cyan_bundle', 'purple_bundle', 'blue_bundle', 'brown_bundle',
  'green_bundle', 'red_bundle', 'black_bundle',
  'compass', 'clock', 'lead', 'name_tag', 'saddle',
  'powder_snow_bucket', 'spyglass', 'recovery_compass', 'debug_stick',
  // Spears thrust, they do not mine.
  'golden_spear',
  'wooden_spear', 'stone_spear', 'copper_spear', 'iron_spear', 'diamond_spear', 'netherite_spear',
  'sulfur_cube_bucket',
]);

/** Is `tier` at least `required` on the tool ladder? */
export function tierMeets(tier, required) {
  if (!required) return true;
  const have = TOOL_TIER_ORDER.indexOf(tier);
  const need = TOOL_TIER_ORDER.indexOf(required);
  if (need < 0) return true;
  return have >= need;
}

/**
 * Work out what the given tool can do to the given block.
 *
 * @param {number} blockId
 * @param {object|null} tool a BLOCKS.ITEMS entry, or null for a bare hand
 * @param {string|null} toolId the item id, needed to read the tool class from its name
 * @returns {{known: boolean, canHarvest: boolean, toolCorrect: boolean,
 *            speedMultiplier: number, hardness: number, drops: string[]|null,
 *            requiredTool: string|null, requiredTier: string|null}}
 */
export function miningEffect(blockId, tool = null, toolId = null) {
  const data = harvestDataFor(blockId);
  const held = describeTool(toolId);

  // Unknown blocks fall back to the old "anything can break it" behaviour, so the game keeps
  // working for blocks the data table does not cover.
  if (!data) {
    return {
      known: false,
      canHarvest: true,
      toolCorrect: false,
      speedMultiplier: 1,
      hardness: tool?.hardness ?? 1,
      drops: null,
      requiredTool: null,
      requiredTier: null,
    };
  }

  const requiredTool = data.requiresTool ? (data.tool || null) : null;
  const requiredTier = data.tier || null;

  // A tool is "correct" -- the block's *proper* tool -- when its class matches the block's tool, whether or not
  // the block needs one to drop: an axe speeds up planks, a shovel dirt (wiki, Breaking: "The proper tool now
  // increases the breaking speed of a block even if it is not the correct grade"). This used to require the
  // block to *need* the tool, so axes, shovels and hoes mined nothing faster than a fist; found by the wiki
  // parity audit's B-BREAK-TIME case.
  const special = specialToolSpeed(data.name, held?.tool ?? null);
  const toolCorrect = Boolean(held && ((data.tool && held.tool === data.tool) || special !== null));

  let canHarvest = true;
  if (data.requiresTool) {
    // Requires the right class, and the tier must be sufficient when one is specified. Shears also collect what
    // they cut (a cobweb asks for a sword, and gives its string to one, but shears take the web itself).
    canHarvest = (Boolean(held && requiredTool && held.tool === requiredTool) && tierMeets(held?.tier ?? null, requiredTier))
      || (held?.tool === 'shears' && SHEARS_SPEED[data.name] !== undefined);
  }

  // Only a correct tool gets its speed; anything else digs at hand speed. Shears and swords have no tier speed of
  // their own: theirs is per block (SHEARS_SPEED, SWORD_SPEED).
  let speedMultiplier = 1;
  if (special !== null) speedMultiplier = special;
  else if (toolCorrect && typeof tool?.speed === 'number') speedMultiplier = tool.speed;

  return {
    known: true,
    canHarvest,
    toolCorrect,
    speedMultiplier,
    hardness: data.hardness,
    drops: canHarvest ? (data.drops ?? null) : null,
    requiredTool,
    requiredTier,
  };
}

/**
 * Seconds to break a block with the given tool, matching the real game's model.
 *
 * @param {number} blockId
 * @param {object|null} tool
 * @param {string|null} toolId
 * @param {number} [efficiencyLevel] Efficiency enchantment level, adds level^2+1 to speed
 * @param {number} [effectMultiplier] from `statusEffects.miningSpeedMultiplier`: Haste and Mining Fatigue
 * @returns {number} seconds
 */
export function breakTimeSeconds(blockId, tool = null, toolId = null, efficiencyLevel = 0, effectMultiplier = 1) {
  const effect = miningEffect(blockId, tool, toolId);
  if (!effect.known) {
    // Not in the harvest table. Blocks the game marks unbreakable (bedrock and friends carry
    // an absurd hardness) must never finish, and anything else falls back to its own
    // definition rather than becoming instantly breakable.
    const def = BLOCK_DEFS?.[blockId];
    if (def && (def.hardness >= 99999 || def.hardness < 0)) return Infinity;
    return def?.hardness ? Math.max(0, def.hardness) : 0;
  }
  // Unbreakable blocks (bedrock and friends) are marked with an absurd hardness.
  if (effect.hardness >= 99999) return Infinity;
  // And vanilla marks its own unbreakable blocks with a *negative* hardness -- bedrock, both portals, the
  // command, structure and jigsaw blocks carry -1 in the pinned data. The table has rows for those now, where
  // it had none and this function fell back to the block definition; without this they read as hardness -1
  // and became instant to break.
  if (effect.hardness < 0) return Infinity;
  if (effect.hardness <= 0) return 0;

  let speed = effect.speedMultiplier;
  if (effect.toolCorrect && efficiencyLevel > 0) speed += efficiencyLevel * efficiencyLevel + 1;
  // Haste and Mining Fatigue scale the mining speed, so they shorten or stretch the time. Applied to the
  // speed rather than to the result, because Efficiency adds to the speed as well and the two have to
  // combine the way Java combines them.
  if (effectMultiplier !== 1) speed *= effectMultiplier;
  if (!(speed > 0)) return Infinity;

  const divisor = effect.canHarvest ? 30 : 100;
  const damagePerTick = speed / effect.hardness / divisor;
  if (damagePerTick <= 0) return Infinity;
  // Breaking is counted in whole game ticks (wiki, Breaking: "ceil(blockHardness x 30 / toolEfficiency)" ticks),
  // and a block whose damage per tick passes 1 breaks at once. Without the ceiling a wooden pickaxe took 1.125 s
  // on stone, which the game cannot do: the wiki's 1.15 s is 23 ticks.
  if (damagePerTick > 1) return 0;
  return Math.ceil(1 / damagePerTick - 1e-9) / 20;
}

/**
 * Per-block speeds of the two tools that have no tier speed, from their wiki pages. Shears: the Shears page's
 * breaking table (cobweb 20 s -> 0.4 s, leaves instant, vines and glow lichen 0.3 s -> 0.15 s, wool 1.2 s ->
 * 0.25 s), which is 15, 15, 2 and 5 times a hand. Swords: "Swords break cobwebs much faster than bare hands and
 * they break bamboo instantly"; the other blocks in the Sword page's table are mined 1.5 times as fast.
 */
const WOOLS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan',
  'purple', 'blue', 'brown', 'green', 'red', 'black'].map((c) => `${c}_wool`);
const LEAF_ROWS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak', 'azalea', 'flowering_azalea']
  .map((w) => `${w}_leaves`);
export const SHEARS_SPEED = Object.fromEntries([
  ['cobweb', 15], ...LEAF_ROWS.map((n) => [n, 15]), ...WOOLS.map((n) => [n, 5]), ['vine', 2], ['glow_lichen', 2],
  // The plants shears collect break at once anyway; listed so shears count as their proper tool.
  ...['short_grass', 'fern', 'tall_grass', 'large_fern', 'dead_bush', 'hanging_roots', 'nether_sprouts', 'seagrass',
    'tall_seagrass', 'small_dripleaf', 'pale_hanging_moss', 'twisting_vines', 'twisting_vines_plant', 'weeping_vines',
    'weeping_vines_plant'].map((n) => [n, 1]),
]);
export const SWORD_SPEED = {
  cobweb: 15, bamboo: Infinity, bamboo_sapling: Infinity,
  big_dripleaf: 1.5, chorus_flower: 1.5, chorus_plant: 1.5, cocoa: 1.5, jack_o_lantern: 1.5, melon: 1.5, pumpkin: 1.5,
};

/** The shears' or sword's speed on this block (by its harvest row name), or null when neither applies. */
function specialToolSpeed(rowName, heldTool) {
  if (heldTool === 'shears') return SHEARS_SPEED[rowName] ?? null;
  if (heldTool === 'sword') return SWORD_SPEED[rowName] ?? null;
  return null;
}

/**
 * True when breaking this block should yield nothing because the wrong tool was used.
 *
 * @param {number} blockId
 * @param {object|null} tool
 * @param {string|null} toolId
 */
export function harvestsNothing(blockId, tool = null, toolId = null) {
  const effect = miningEffect(blockId, tool, toolId);
  if (!effect.known) return false;
  return !effect.canHarvest;
}

/** A short human-readable reason a block cannot be harvested, for the agent and the HUD. */
export function harvestRequirementText(blockId) {
  const data = harvestDataFor(blockId);
  if (!data || !data.requiresTool) return null;
  const tier = data.tier ? data.tier + ' ' : '';
  return `a ${tier}${data.tool || 'tool'}`;
}

export { BLOCK_HARVEST, harvestDataFor };
