// The fishing model: wait times, loot tables and the rules around them.
//
// References: https://minecraft.wiki/w/Fishing
//
// Everything here is a pure function of a `random()` in [0, 1) and plain data, so the whole of the wiki's
// behaviour is asserted without a bobber, a world or a browser.
//
// Three things about this file are deliberate:
//
//  1. The category split is expressed as vanilla's QUALITY mechanism (a weight and a quality per category,
//     with `weight + quality * luck`), not as the four hardcoded percentage columns. Both reproduce the
//     wiki's table, but the quality form is what vanilla does, and the test proves it lands on the wiki's
//     numbers to two decimals rather than asserting the numbers back to itself.
//
//  2. The wait-time modifiers are ADDITIVE per tick, which is the only reading that produces all three of the
//     wiki's figures. Exposed and dry is 1 tick per tick; not exposed is 1-0.5 = 0.5 (doubled, as described);
//     raining is 1+0.25 = 1.25 (20% faster); and not exposed AND raining is 1-0.5+0.25 = 0.75, which is
//     1/0.75 = 1.333, the 33.3% the wiki says is "different from the 60% increase you would expect if the two
//     effects worked independently". That sentence is only true of an additive model.
//
//  3. `isOpenWater` takes a sampling function rather than a world, so the 5x4x5 rule is tested directly.

/** Wiki: a random wait between 5 and 30 seconds, and 20 ticks to the second. */
export const FISHING_WAIT = Object.freeze({ minTicks: 100, maxTicks: 600 });

/** Wiki: "Each level of the Lure enchantment subtracts 5 seconds from both the minimum and maximum". */
export const LURE_TICKS_PER_LEVEL = 100;

/** Wiki: "An experience orb worth 1-6 experience points spawns at the position of the player." */
export const FISHING_XP = Object.freeze({ min: 1, max: 6 });

/** Wiki: "If the player wanders more than 32 blocks away from the bobber ... the bobber ... disappear[s]". */
export const LINE_BREAK_DISTANCE = 32;

/** Wiki: after the particles reach the bobber it dips, and Java gives "one to two seconds" to reel. */
export const BITE_WINDOW_SECONDS = Object.freeze({ min: 1, max: 2 });

/** Wiki: "After 1 to 4 seconds, the particles reach the bobber". */
export const BITE_APPROACH_SECONDS = Object.freeze({ min: 1, max: 4 });

/**
 * Wiki: open water is "the 5x4x5 vicinity around the bobber resting on the water surface (2 blocks away
 * horizontally, 2 blocks of air or water above the water surface, and 2 blocks deep)".
 *
 * 5 wide by 5 deep by 4 tall is the 100 blocks that makes up the 5x4x5 volume, so the four vertical layers
 * are read as two of air above the surface and two of water at and below it.
 */
export const OPEN_WATER = Object.freeze({ radius: 2, airLayers: 2, waterLayers: 2 });

/** Wiki: what a reel-in costs, by what was on the hook. "Reeling in while the bobber is in the air or in the
 * water with nothing caught on it costs no durability." */
export const REEL_DURABILITY = Object.freeze({
  caught: 1,
  nothing: 0,
  stuckInBlock: 2,
  droppedItem: 3,
  entity: 5,
});

/** Wiki: treasure rods and bows have "0-25% durability remaining". */
export const TREASURE_DURABILITY_REMAINING = 0.25;

/** Wiki: junk rods and boots are "0-90% damaged (i.e., have 10-100% durability remaining)". */
export const JUNK_DAMAGE_MAX = 0.90;

/** Wiki: treasure gear is "enchanted at a random level between 22 and 30". */
export const TREASURE_ENCHANT_LEVEL = Object.freeze({ min: 22, max: 30 });

/** Wiki: these "can not be obtained this way" from fishing. */
export const TREASURE_EXCLUDED_ENCHANTMENTS = Object.freeze(['swift_sneak', 'soul_speed', 'wind_burst']);

/**
 * The three categories, with vanilla's weight and quality.
 *
 * `weight + quality * luck` per category, then normalised. With luck 0 that is 85/10/5; at luck 1 it is
 * 84/8/7, at 2 it is 83/6/9 and at 3 it is 82/4/11 -- which normalise to the wiki's 84.85/8.08/7.07,
 * 84.69/6.12/9.18 and 84.54/4.12/11.34.
 */
export const FISHING_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'fish', weight: 85, quality: -1 }),
  Object.freeze({ id: 'junk', weight: 10, quality: -2 }),
  Object.freeze({ id: 'treasure', weight: 5, quality: 2 }),
]);

/** Wiki fish weights: cod 60%, salmon 25%, pufferfish 13%, tropical fish 2%. */
export const FISH_LOOT = Object.freeze({
  cod: 60, salmon: 25, pufferfish: 13, tropical_fish: 2,
});

/**
 * Wiki junk weights (Java, all biomes except jungle).
 *
 * Lily pad 17; bone, bowl, leather, leather boots, rotten flesh, tripwire hook and water bottle 10 each;
 * stick and string 5; fishing rod 2; and ink sac at weight 1 in a stack of TEN.
 */
export const JUNK_LOOT = Object.freeze({
  lily_pad: 17,
  bone: 10, bowl: 10, leather: 10, leather_boots: 10,
  rotten_flesh: 10, tripwire_hook: 10, water_bottle: 10,
  stick: 5, string: 5,
  fishing_rod: 2,
  ink_sac: 1,
});

/** Wiki: ink sacs are the one junk entry that is not a single item. */
export const JUNK_COUNTS = Object.freeze({ ink_sac: 10 });

/**
 * Wiki jungle junk: the same table with bamboo added at 10, which reweights every entry to /110.
 *
 * The wiki prints these as fractions of 110, so the weights are kept as the same integers and the total is
 * asserted to be 110 in the tests rather than restated here.
 */
export const JUNGLE_JUNK_LOOT = Object.freeze({
  lily_pad: 17,
  bamboo: 10,
  bone: 10, bowl: 10, leather: 10, leather_boots: 10,
  rotten_flesh: 10, tripwire_hook: 10, water_bottle: 10,
  stick: 5, string: 5,
  fishing_rod: 2,
  ink_sac: 1,
});

/** Wiki: six treasure entries at 1/6 each. */
export const TREASURE_LOOT = Object.freeze([
  'bow', 'enchanted_book', 'fishing_rod', 'name_tag', 'nautilus_shell', 'saddle',
]);

/** The biomes whose junk table is the expanded one. */
export const JUNGLE_BIOMES = Object.freeze(['jungle', 'sparse_jungle', 'bamboo_jungle', 'jungle_hills']);

// --- helpers -------------------------------------------------------------------------------------------

/** A uniform integer in [min, max], inclusive, from a `random()` in [0, 1). */
function randInt(random, min, max) {
  if (max <= min) return min;
  return min + Math.floor(random() * (max - min + 1));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * A weighted pick from `{ id: weight }`.
 *
 * Takes a `random()` rather than a seeded generator so the model works with `Math.random`, a test stub, or
 * the engine's `JavaRandom` through a thin adapter.
 */
export function pickWeighted(weights, random) {
  const entries = Object.entries(weights);
  let total = 0;
  for (const [, w] of entries) total += w;
  if (total <= 0) return null;
  let roll = random() * total;
  for (const [id, w] of entries) {
    roll -= w;
    if (roll < 0) return id;
  }
  // Only reachable through floating-point drift on the last entry.
  return entries[entries.length - 1][0];
}

// --- the wait ------------------------------------------------------------------------------------------

/**
 * The wait before a bite, in ticks.
 *
 * Wiki: "a random period between 5 and 30 seconds (100 to 600 ticks)", with Lure subtracting 5 seconds from
 * both ends. Lure III therefore spans 0 to 300 ticks, and a result below zero is "generated in the next tick"
 * rather than being treated as an instant bite -- so this can return a negative number and the caller
 * re-rolls, which is what the wiki describes.
 */
export function rollWaitTicks(random, { lureLevel = 0 } = {}) {
  const shift = LURE_TICKS_PER_LEVEL * Math.max(0, lureLevel);
  const min = FISHING_WAIT.minTicks - shift;
  const max = FISHING_WAIT.maxTicks - shift;
  return min + Math.floor(random() * (max - min + 1));
}

/**
 * How many ticks of the wait are consumed this tick.
 *
 * Wiki: not directly exposed to sunlight -- "each tick has a 50% chance of not decrementing"; being rained on
 * -- "each tick has a 25% chance of counting down 2 instead of 1". Both apply in the same tick and cancel,
 * which is why the rain increase while sheltered is 33.3% and not 60%.
 */
export function waitDecrement({ exposedToSky = true, raining = false } = {}, random = Math.random) {
  let decrement = 1;
  if (!exposedToSky && random() < 0.5) decrement -= 1;
  if (raining && random() < 0.25) decrement += 1;
  return decrement;
}

/** Step a wait down by one tick's worth. Returns the remaining ticks, floored at zero. */
export function advanceWait(remainingTicks, conditions, random = Math.random) {
  return Math.max(0, remainingTicks - waitDecrement(conditions, random));
}

// --- the category split --------------------------------------------------------------------------------

/** The effective weight of each category at a given luck level, clamped at zero the way vanilla does. */
export function categoryWeights(luckLevel = 0) {
  const luck = Math.max(0, luckLevel);
  const out = {};
  for (const category of FISHING_CATEGORIES) {
    out[category.id] = Math.max(0, category.weight + category.quality * luck);
  }
  return out;
}

/** The category split as percentages. The tests compare these against the wiki's four columns. */
export function categoryChances(luckLevel = 0) {
  const weights = categoryWeights(luckLevel);
  let total = 0;
  for (const w of Object.values(weights)) total += w;
  const out = {};
  for (const [id, w] of Object.entries(weights)) out[id] = total > 0 ? (w / total) * 100 : 0;
  return out;
}

/** Roll the category. */
export function rollCategory(random, luckLevel = 0) {
  return pickWeighted(categoryWeights(luckLevel), random);
}

// --- open water ----------------------------------------------------------------------------------------

/** How a block reads for the open-water check. */
export const OPEN_WATER_BLOCK = Object.freeze({
  AIR: 'air',
  WATER: 'water',
  FLOWING: 'flowing',
  OTHER: 'other',
});

/**
 * Wiki: open water is the 5x4x5 volume around the bobber where "each horizontal layer ... must consist only
 * of either air and/or lily pads or water source blocks and/or waterlogged blocks without collision ...,
 * while flowing water is not allowed in any layers".
 *
 * `sample(x, y, z)` returns one of `OPEN_WATER_BLOCK`. `x, y, z` are the bobber's own block, resting on the
 * water surface. A lily pad counts as air for this check (it is a non-colliding overlay), and flowing water
 * fails the whole volume.
 */
export function isOpenWater(sample, x, y, z) {
  for (let dy = 1; dy <= OPEN_WATER.airLayers; dy++) {
    if (!layerIsAir(sample, x, y + dy, z)) return false;
  }
  for (let dy = 0; dy > -OPEN_WATER.waterLayers; dy--) {
    if (!layerIsWater(sample, x, y + dy, z)) return false;
  }
  return true;
}

function layerIsAir(sample, x, y, z) {
  for (let dx = -OPEN_WATER.radius; dx <= OPEN_WATER.radius; dx++) {
    for (let dz = -OPEN_WATER.radius; dz <= OPEN_WATER.radius; dz++) {
      const block = sample(x + dx, y, z + dz);
      if (block !== OPEN_WATER_BLOCK.AIR) return false;
    }
  }
  return true;
}

function layerIsWater(sample, x, y, z) {
  for (let dx = -OPEN_WATER.radius; dx <= OPEN_WATER.radius; dx++) {
    for (let dz = -OPEN_WATER.radius; dz <= OPEN_WATER.radius; dz++) {
      const block = sample(x + dx, y, z + dz);
      if (block !== OPEN_WATER_BLOCK.WATER) return false;
    }
  }
  return true;
}

/** The blocks the check visits, for a test to assert the volume's shape without a world. */
export function openWaterSamplePoints(x, y, z) {
  const points = [];
  for (let dy = -OPEN_WATER.waterLayers + 1; dy <= OPEN_WATER.airLayers; dy++) {
    for (let dx = -OPEN_WATER.radius; dx <= OPEN_WATER.radius; dx++) {
      for (let dz = -OPEN_WATER.radius; dz <= OPEN_WATER.radius; dz++) {
        points.push({ x: x + dx, y: y + dy, z: z + dz });
      }
    }
  }
  return points;
}

// --- the catch -----------------------------------------------------------------------------------------

/** True when the biome's junk table is the jungle one. */
export function isJungleBiome(biomeId) {
  const clean = String(biomeId ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  return JUNGLE_BIOMES.includes(clean);
}

/**
 * One fishing attempt.
 *
 * @param {() => number} random
 * @param {object} options
 * @param {number} [options.luckLevel]  Luck of the Sea plus the Luck effect, which the wiki says "grants the
 *                                      same benefit"
 * @param {boolean} [options.openWater] whether the bobber is in open water, which gates treasure
 * @param {string} [options.biomeId]    for the jungle junk table
 * @returns {{category: string, item: string, count: number, jungle: boolean}}
 */
export function rollCatch(random, { luckLevel = 0, openWater = true, biomeId = null } = {}) {
  const jungle = isJungleBiome(biomeId);
  let category = rollCategory(random, luckLevel);
  // Wiki: without open water "only items in the fish and junk categories can be obtained". Re-roll between
  // the two survivors rather than pretending treasure was never in the table, so the remaining split is
  // still proportional to their weights.
  if (category === 'treasure' && !openWater) {
    category = pickWeighted({ fish: categoryWeights(luckLevel).fish, junk: categoryWeights(luckLevel).junk }, random);
  }

  if (category === 'fish') {
    return { category, item: pickWeighted(FISH_LOOT, random), count: 1, jungle };
  }
  if (category === 'treasure') {
    // Six entries at 1/6 each: a uniform pick over the list.
    const index = clamp(Math.floor(random() * TREASURE_LOOT.length), 0, TREASURE_LOOT.length - 1);
    return { category, item: TREASURE_LOOT[index], count: 1, jungle };
  }
  const table = jungle ? JUNGLE_JUNK_LOOT : JUNK_LOOT;
  const item = pickWeighted(table, random);
  return { category, item, count: JUNK_COUNTS[item] ?? 1, jungle };
}

/** True when a caught item is gear that rolls the treasure enchantment treatment. */
export function isTreasureGear(item) {
  return item === 'bow' || item === 'fishing_rod';
}

/** True for the junk gear that arrives damaged but "always unenchanted". */
export function isJunkGear(item) {
  return item === 'fishing_rod' || item === 'leather_boots';
}

/**
 * Wiki: treasure bows and rods have "0-25% durability remaining" -- so the roll is a fraction REMAINING, and
 * the damage is the rest of it.
 */
export function rollTreasureDurabilityRemaining(random) {
  return random() * TREASURE_DURABILITY_REMAINING;
}

/**
 * Wiki: junk rods and boots are "0-90% damaged (i.e., have 10-100% durability remaining)". Ten percent of a
 * 64-use rod is 6, which is the floor this returns.
 */
export function rollJunkDamage(random) {
  return random() * JUNK_DAMAGE_MAX;
}

/** Wiki: treasure gear is enchanted "at a random level between 22 and 30". */
export function rollTreasureEnchantLevel(random) {
  return randInt(random, TREASURE_ENCHANT_LEVEL.min, TREASURE_ENCHANT_LEVEL.max);
}

/** Wiki: no Swift Sneak, Soul Speed or Wind Burst from fishing. */
export function treasureEnchantmentAllowed(id) {
  return !TREASURE_EXCLUDED_ENCHANTMENTS.includes(String(id ?? '').toLowerCase());
}

/** Wiki: "An experience orb worth 1-6 experience points". */
export function rollFishingXp(random) {
  return randInt(random, FISHING_XP.min, FISHING_XP.max);
}

/** How long the particles take to reach the bobber, in seconds. */
export function rollBiteApproachSeconds(random) {
  return BITE_APPROACH_SECONDS.min
    + random() * (BITE_APPROACH_SECONDS.max - BITE_APPROACH_SECONDS.min);
}

/** How long the player has to reel once the bobber dips, in seconds. Java's window. */
export function rollBiteWindowSeconds(random) {
  return BITE_WINDOW_SECONDS.min + random() * (BITE_WINDOW_SECONDS.max - BITE_WINDOW_SECONDS.min);
}

/** The durability a reel-in costs, by what was on the hook. */
export function reelDurability({ caught = false, stuckInBlock = false, hookedItem = false, hookedEntity = false } = {}) {
  if (hookedEntity) return REEL_DURABILITY.entity;
  if (hookedItem) return REEL_DURABILITY.droppedItem;
  if (caught) return REEL_DURABILITY.caught;
  if (stuckInBlock) return REEL_DURABILITY.stuckInBlock;
  return REEL_DURABILITY.nothing;
}

/** Convenience for the callers: the total luck that shifts the category split. */
export function totalLuck({ luckOfTheSea = 0, luckEffect = 0 } = {}) {
  return Math.max(0, luckOfTheSea) + Math.max(0, luckEffect);
}
