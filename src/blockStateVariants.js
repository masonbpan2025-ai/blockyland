// Block states this game keeps as their own block ids, the way it already keeps an open trapdoor (OAK_TRAPDOOR_OPEN)
// and a lit furnace (LIT_FURNACE): what a chunk stores is the block, so a saved world keeps the state with no extra
// save data, and the mesher, collision and light read it from the block's definition.
//
// * Fence gates, open (`<GATE>_OPEN`). The Fence Gate page: "a switchable barrier that can be opened and closed by
//   hand, by a wind charge or by redstone power"; "An open fence gate is completely non-solid". Closed, it is a
//   barrier a block and a half high (player.js checkCollision).
// * Candles and candle cakes, lit (`<CANDLE>_LIT`). The Candle page: "Candles are not lit when they are placed, and
//   must be lit using flint and steel, fire charge, or any flaming projectile"; "A single candle emits a light level
//   of 3"; "Lit candles can be extinguished using water ..., wind charges, or by the player interacting with the
//   candle". A lit candle cake gives light 3 too (its one candle).
//
// The ids are fixed here, not given out at load time: a block id is what a saved chunk holds, so it must never move
// when other blocks are added. They sit far above every generated range (blocks.js, futureContent.js), and the guard
// below fails loudly on a clash.

/** Every state variant and its id. Append new ones at the end with new ids; never renumber. */
export const STATE_VARIANT_IDS = Object.freeze({
  ACACIA_FENCE_GATE_OPEN: 4000,
  BAMBOO_FENCE_GATE_OPEN: 4001,
  BIRCH_FENCE_GATE_OPEN: 4002,
  CHERRY_FENCE_GATE_OPEN: 4003,
  CRIMSON_FENCE_GATE_OPEN: 4004,
  DARK_OAK_FENCE_GATE_OPEN: 4005,
  JUNGLE_FENCE_GATE_OPEN: 4006,
  MANGROVE_FENCE_GATE_OPEN: 4007,
  OAK_FENCE_GATE_OPEN: 4008,
  PALE_OAK_FENCE_GATE_OPEN: 4009,
  POPLAR_FENCE_GATE_OPEN: 4010,
  SPRUCE_FENCE_GATE_OPEN: 4011,
  WARPED_FENCE_GATE_OPEN: 4012,
  CANDLE_LIT: 4013,
  WHITE_CANDLE_LIT: 4014,
  ORANGE_CANDLE_LIT: 4015,
  MAGENTA_CANDLE_LIT: 4016,
  LIGHT_BLUE_CANDLE_LIT: 4017,
  YELLOW_CANDLE_LIT: 4018,
  LIME_CANDLE_LIT: 4019,
  PINK_CANDLE_LIT: 4020,
  GRAY_CANDLE_LIT: 4021,
  LIGHT_GRAY_CANDLE_LIT: 4022,
  CYAN_CANDLE_LIT: 4023,
  PURPLE_CANDLE_LIT: 4024,
  BLUE_CANDLE_LIT: 4025,
  BROWN_CANDLE_LIT: 4026,
  GREEN_CANDLE_LIT: 4027,
  RED_CANDLE_LIT: 4028,
  BLACK_CANDLE_LIT: 4029,
  CANDLE_CAKE_LIT: 4030,
  WHITE_CANDLE_CAKE_LIT: 4031,
  ORANGE_CANDLE_CAKE_LIT: 4032,
  MAGENTA_CANDLE_CAKE_LIT: 4033,
  LIGHT_BLUE_CANDLE_CAKE_LIT: 4034,
  YELLOW_CANDLE_CAKE_LIT: 4035,
  LIME_CANDLE_CAKE_LIT: 4036,
  PINK_CANDLE_CAKE_LIT: 4037,
  GRAY_CANDLE_CAKE_LIT: 4038,
  LIGHT_GRAY_CANDLE_CAKE_LIT: 4039,
  CYAN_CANDLE_CAKE_LIT: 4040,
  PURPLE_CANDLE_CAKE_LIT: 4041,
  BLUE_CANDLE_CAKE_LIT: 4042,
  BROWN_CANDLE_CAKE_LIT: 4043,
  GREEN_CANDLE_CAKE_LIT: 4044,
  RED_CANDLE_CAKE_LIT: 4045,
  BLACK_CANDLE_CAKE_LIT: 4046,
});

/** Candle page: one candle gives light 3 (the game places one candle to a block). */
export const LIT_CANDLE_LIGHT = 3;

/**
 * Register the variants: each gets its base block's definition with the state set, links both ways (`openId` /
 * `closedId`, `litId` / `unlitId`), drops its base block, and is `internal` (not in the creative catalogue: you get it
 * by using the block, as in Java). Returns the keys added.
 */
export function addStateVariants(blocks, blockDefs) {
  const added = [];
  for (const [key, id] of Object.entries(STATE_VARIANT_IDS)) {
    const baseKey = key.replace(/_(OPEN|LIT)$/, '');
    const baseId = blocks[baseKey];
    const base = blockDefs[baseId];
    if (baseId === undefined || !base) continue; // a variant of a block this build lacks
    if (blocks[key] !== undefined && blocks[key] !== id) throw new Error(`state variant ${key}: the key is already block ${blocks[key]}`);
    if (blockDefs[id] && blocks[key] !== id) throw new Error(`state variant ${key}: id ${id} is already ${blockDefs[id].name}`);
    // It drops what its base block drops: the block itself, or its `dropItem` (a candle cake gives its candle).
    const def = { ...base, internal: true };
    if (!base.dropItem) def.drop = base.drop ?? baseId;
    if (key.endsWith('_OPEN')) {
      Object.assign(def, { name: `${base.name} Open`, open: true, solid: false, closedId: baseId });
      base.openId = id;
    } else {
      // "Lit " in front: the harvest table reads a lit_ name as its base block's (blockHarvestData.js).
      Object.assign(def, { name: `Lit ${base.name}`, lit: true, light: LIT_CANDLE_LIGHT, unlitId: baseId });
      base.litId = id;
    }
    blocks[key] = id;
    blockDefs[id] = def;
    added.push(key);
  }
  return added;
}
