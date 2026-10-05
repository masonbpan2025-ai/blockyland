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
//   speedMultiplier = toolSpeed            when the tool is correct for the block
//                   = 1                    otherwise
//   damagePerTick   = speedMultiplier / hardness / (canHarvest ? 30 : 100)
//   breakTime       = 1 / damagePerTick    seconds
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
  'compass', 'clock', 'lead', 'name_tag', 'saddle',
  // This project's own weapon: a spear thrusts, it does not mine.
  'golden_spear',
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

  // A tool is "correct" when its class matches what the block asks for. Blocks that need no
  // particular tool are harvested at bare-hand speed by anything.
  const toolCorrect = Boolean(held && requiredTool && held.tool === requiredTool);

  let canHarvest = true;
  if (data.requiresTool) {
    // Requires the right class, and the tier must be sufficient when one is specified.
    canHarvest = toolCorrect && tierMeets(held?.tier ?? null, requiredTier);
  }

  // Only a correct tool gets its speed; anything else digs at hand speed.
  let speedMultiplier = 1;
  if (toolCorrect && typeof tool?.speed === 'number') speedMultiplier = tool.speed;

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
    if (def && def.hardness >= 99999) return Infinity;
    return def?.hardness ? Math.max(0, def.hardness) : 0;
  }
  // Unbreakable blocks (bedrock and friends) are marked with an absurd hardness.
  if (effect.hardness >= 99999) return Infinity;
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
  return 1 / (damagePerTick * 20);
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
