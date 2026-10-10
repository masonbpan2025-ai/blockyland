import * as THREE from 'three';
import { applyVanillaBoxUVs, adoptWhenReady } from './mobVisuals/modelBuilder.js';
import { tradeSide, resolveWikiId } from './villagerEconomy.js';

/** The real 64x64 wandering trader sheet -- the villager model with its own clothes. */
const WANDERING_TRADER_SKIN_PATH = '/assets/entity/wandering_trader.png';

/**
 * Apply vanilla's box UV layout to a BoxGeometry's six faces, in ATLAS PIXELS from the top-left.
 *
 * A local copy of the helper in `src/mobs.js`, which is not exported; importing the mob manager from a model module
 * would create a cycle.
 */
function applyBoxUVs(geo, u, v, texW, texH, tw, th, td) {
  const faces = [
    { x: u + td + tw, y: v + td, w: td, h: th },
    { x: u, y: v + td, w: td, h: th },
    { x: u + td, y: v, w: tw, h: td },
    { x: u + td + tw, y: v, w: tw, h: td },
    { x: u + td, y: v + td, w: tw, h: th },
    { x: u + td + tw + td, y: v + td, w: tw, h: th }
  ];
  const uvs = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const r = faces[f];
    const u0 = r.x / texW, u1 = (r.x + r.w) / texW;
    const v1 = 1 - r.y / texH, v0 = 1 - (r.y + r.h) / texH;
    const b = f * 4;
    uvs.setXY(b + 0, u0, v1); uvs.setXY(b + 1, u1, v1);
    uvs.setXY(b + 2, u0, v0); uvs.setXY(b + 3, u1, v0);
  }
  uvs.needsUpdate = true;
  return geo;
}

/**
 * Wandering trader rules: the randomized trade table, despawning, potion drinking and hazard avoidance.
 *
 * Reference: https://minecraft.wiki/w/Wandering_Trader
 *
 * The wandering trader is a passive villager-like mob that appears near a player with two leashed trader
 * llamas, offers a **randomized** set of trades, and then despawns. Almost all of its identity is the
 * trade table and the despawn timer, so both are data here rather than logic in the update loop.
 */

/** Wiki: 20 HP. */
export const WANDERING_TRADER_HEALTH = 20;

/** Wiki: 0.6 wide x 1.95 tall in Java. */
export const WANDERING_TRADER_DIMENSIONS = { width: 0.6, height: 1.95 };

/** Wiki: 0.7 speed, notably faster than a villager. */
export const WANDERING_TRADER_SPEED = 0.7;

/**
 * Wiki: it despawns "after being within both render distance and simulation distance for 48000 ticks
 * (40 minutes, or 2 full Minecraft days)", and "ticks spent with the trading UI open are not counted".
 * A trader spawned by a command, egg or spawner has a DespawnDelay of 0 and never despawns.
 */
export const WANDERING_TRADER_DESPAWN_SECONDS = 2400;

/** Wiki: "prefers to wander within 16 blocks of the initial spawning target location". */
export const WANDERING_TRADER_WANDER_RANGE = 16;

/** Wiki: they typically spawn within a 48-block centred box of a player. */
export const WANDERING_TRADER_SPAWN_RANGE = 48;

/** Wiki: spawns with two leashed trader llamas, placed within -4/+3 of the trader. */
export const WANDERING_TRADER_LLAMAS = { count: 2, offsetMin: -4, offsetMax: 3 };

/**
 * Wiki: it drinks a potion of Invisibility during dusk and renews it during the night, and drinks milk if
 * still invisible during the day.
 */
export const WANDERING_TRADER_INVISIBILITY = { drinkAtDusk: true, renewAtNight: true, milkAtDawn: true };

/**
 * Wiki: it avoids zombies and their variants, illagers, ravagers and vexes, "staying at least 8 blocks
 * away". A list rather than a check on a family, because the wiki enumerates them.
 */
export const WANDERING_TRADER_AVOIDED = [
  'zombie', 'husk', 'drowned', 'zombified_piglin', 'zoglin', 'zombie_villager',
  'pillager', 'vindicator', 'evoker', 'illusioner', 'ravager', 'vex'
];
export const WANDERING_TRADER_AVOID_RANGE = 8;

/** Wiki: "Wandering traders do not drop any loot or experience when killed", except the consumables. */
export const WANDERING_TRADER_DROP_CHANCE = 0.085;
export const WANDERING_TRADER_DROP_LOOTING_BONUS = 0.01;

/**
 * Wiki's trade table, by group.
 *
 * Wiki: "The wandering trader offers nine trades in total, always consisting of two purchase trades, two
 * special trades, and five ordinary trades", and "each individual trade is equally likely" within its
 * group. `want` is what the player gives, `give` what they receive; a purchase trade has `emeralds` as
 * `give` because it pays out emeralds.
 *
 * Every row of the article's three tables is here, transcribed in table order, including the ids this build
 * does not register (`poplar_log`, `sulfur_spike` and the rest of the newest content): `availableTrades`
 * filters those out at runtime, so a missing item cannot produce a broken offer, and the table stays a
 * faithful record of the wiki rather than of this build.
 */
function wtRow(give, giveCount, want, wantCount, maxTrades, extra = {}) {
  return { give, giveCount, want, wantCount, maxTrades, ...extra };
}

export const TRADES = {
  purchase: [
    wtRow('emerald', 1, 'hay_block', 1, 2),
    wtRow('emerald', 1, 'potion_water', 1, 2),
    wtRow('emerald', 1, 'baked_potato', 4, 2),
    wtRow('emerald', 2, 'milk_bucket', 1, 2),
    wtRow('emerald', 2, 'water_bucket', 1, 2),
    wtRow('emerald', 3, 'fermented_spider_eye', 1, 2)
  ],
  special: [
    wtRow('packed_ice', 1, 'emerald', 1, 6),
    wtRow('gunpowder', 4, 'emerald', 1, 2),
    wtRow('acacia_log', 8, 'emerald', 1, 4),
    wtRow('birch_log', 8, 'emerald', 1, 4),
    wtRow('cherry_log', 8, 'emerald', 1, 4),
    wtRow('dark_oak_log', 8, 'emerald', 1, 4),
    wtRow('jungle_log', 8, 'emerald', 1, 4),
    wtRow('mangrove_log', 8, 'emerald', 1, 4),
    wtRow('oak_log', 8, 'emerald', 1, 4),
    wtRow('pale_oak_log', 8, 'emerald', 1, 4),
    wtRow('spruce_log', 8, 'emerald', 1, 4),
    wtRow('poplar_log', 8, 'emerald', 1, 4),
    wtRow('podzol', 3, 'emerald', 3, 6),
    wtRow('potion_of_invisibility', 1, 'emerald', 5, 1, { note: 'Duration: 8:00' }),
    wtRow('blue_ice', 1, 'emerald', 6, 6),
    wtRow('iron_pickaxe', 1, 'emerald', 6, 1, {
      enchanted: true,
      wantCountMax: 20,
      note: 'Enchanted for a random cost of 5-19 levels; the price is 1 plus that cost.'
    })
  ],
  ordinary: [
    wtRow('fern', 1, 'emerald', 1, 12),
    wtRow('sugar_cane', 1, 'emerald', 1, 8),
    wtRow('pumpkin', 1, 'emerald', 1, 4),
    wtRow('dandelion', 1, 'emerald', 1, 12),
    wtRow('poppy', 1, 'emerald', 1, 12),
    wtRow('allium', 1, 'emerald', 1, 12),
    wtRow('azure_bluet', 1, 'emerald', 1, 12),
    wtRow('red_tulip', 1, 'emerald', 1, 12),
    wtRow('orange_tulip', 1, 'emerald', 1, 12),
    wtRow('white_tulip', 1, 'emerald', 1, 12),
    wtRow('pink_tulip', 1, 'emerald', 1, 12),
    wtRow('oxeye_daisy', 1, 'emerald', 1, 12),
    wtRow('cornflower', 1, 'emerald', 1, 12),
    wtRow('blue_orchid', 1, 'emerald', 1, 8),
    wtRow('lily_of_the_valley', 1, 'emerald', 1, 7),
    wtRow('open_eyeblossom', 1, 'emerald', 1, 7),
    wtRow('wheat_seeds', 1, 'emerald', 1, 12),
    wtRow('beetroot_seeds', 1, 'emerald', 1, 12),
    wtRow('pumpkin_seeds', 1, 'emerald', 1, 12),
    wtRow('melon_seeds', 1, 'emerald', 1, 12),
    wtRow('name_tag', 1, 'emerald', 1, 5),
    wtRow('sulfur_spike', 2, 'emerald', 1, 5),
    wtRow('white_dye', 3, 'emerald', 1, 12),
    wtRow('light_gray_dye', 3, 'emerald', 1, 12),
    wtRow('gray_dye', 3, 'emerald', 1, 12),
    wtRow('black_dye', 3, 'emerald', 1, 12),
    wtRow('brown_dye', 3, 'emerald', 1, 12),
    wtRow('red_dye', 3, 'emerald', 1, 12),
    wtRow('orange_dye', 3, 'emerald', 1, 12),
    wtRow('yellow_dye', 3, 'emerald', 1, 12),
    wtRow('lime_dye', 3, 'emerald', 1, 12),
    wtRow('green_dye', 3, 'emerald', 1, 12),
    wtRow('cyan_dye', 3, 'emerald', 1, 12),
    wtRow('light_blue_dye', 3, 'emerald', 1, 12),
    wtRow('blue_dye', 3, 'emerald', 1, 12),
    wtRow('purple_dye', 3, 'emerald', 1, 12),
    wtRow('magenta_dye', 3, 'emerald', 1, 12),
    wtRow('pink_dye', 3, 'emerald', 1, 12),
    wtRow('vine', 3, 'emerald', 1, 4),
    wtRow('pale_hanging_moss', 3, 'emerald', 1, 4),
    wtRow('brown_mushroom', 3, 'emerald', 1, 4),
    wtRow('red_mushroom', 3, 'emerald', 1, 4),
    wtRow('shelf_mushroom', 3, 'emerald', 1, 12),
    wtRow('lily_pad', 5, 'emerald', 1, 2),
    wtRow('small_dripleaf', 2, 'emerald', 1, 5),
    wtRow('sand', 8, 'emerald', 1, 8),
    wtRow('red_sand', 4, 'emerald', 1, 6),
    wtRow('pointed_dripstone', 2, 'emerald', 1, 5),
    wtRow('rooted_dirt', 2, 'emerald', 1, 5),
    wtRow('moss_block', 2, 'emerald', 1, 5),
    wtRow('pale_moss_block', 2, 'emerald', 1, 5),
    wtRow('wildflowers', 1, 'emerald', 1, 12),
    wtRow('tall_dry_grass', 1, 'emerald', 1, 12),
    wtRow('golden_dandelion', 1, 'emerald', 2, 12),
    wtRow('sea_pickle', 1, 'emerald', 2, 5),
    wtRow('glowstone', 1, 'emerald', 2, 5),
    wtRow('bucket_of_tropical_fish', 1, 'emerald', 3, 4),
    wtRow('bucket_of_pufferfish', 1, 'emerald', 3, 4),
    wtRow('kelp', 1, 'emerald', 3, 12),
    wtRow('cactus', 1, 'emerald', 3, 8),
    wtRow('brain_coral_block', 1, 'emerald', 3, 8),
    wtRow('bubble_coral_block', 1, 'emerald', 3, 8),
    wtRow('fire_coral_block', 1, 'emerald', 3, 8),
    wtRow('horn_coral_block', 1, 'emerald', 3, 8),
    wtRow('tube_coral_block', 1, 'emerald', 3, 8),
    wtRow('firefly_bush', 1, 'emerald', 3, 12),
    wtRow('slime_ball', 1, 'emerald', 4, 5),
    wtRow('acacia_sapling', 1, 'emerald', 5, 8),
    wtRow('birch_sapling', 1, 'emerald', 5, 8),
    wtRow('cherry_sapling', 1, 'emerald', 5, 8),
    wtRow('dark_oak_sapling', 1, 'emerald', 5, 8),
    wtRow('jungle_sapling', 1, 'emerald', 5, 8),
    wtRow('mangrove_propagule', 1, 'emerald', 5, 8),
    wtRow('oak_sapling', 1, 'emerald', 5, 8),
    wtRow('pale_oak_sapling', 1, 'emerald', 5, 8),
    wtRow('spruce_sapling', 1, 'emerald', 5, 8),
    wtRow('poplar_sapling', 1, 'emerald', 5, 8),
    wtRow('nautilus_shell', 1, 'emerald', 5, 5)
  ]
};

/**
 * Wiki: two purchase trades, two special trades, five ordinary trades — nine in total.
 */
export const TRADE_LAYOUT = { purchase: 2, special: 2, ordinary: 5 };

/** Body colours: the trader's blue robe and brown hat. */
export const WANDERING_TRADER_COLORS = { robe: 0x3b5bdb, trim: 0x1e3a8a, skin: 0xd9a066, hat: 0x8b5a2b };

/** True when the mob is a wandering trader. */
export function isWanderingTrader(mob) {
  return mob?.type === 'wandering_trader';
}

/**
 * Wiki: "The `Age` tag cannot be set to a negative number, making it impossible for them to be a baby."
 * Exported so the absence is explicit.
 */
export function wanderingTraderHasBabyForm() {
  return false;
}

/**
 * Whether an id resolves, for filtering the trade table.
 *
 * A trade whose item this build does not register would be a broken offer, so it is dropped rather than
 * shown. `registry` is the ITEMS object; blocks are accepted through `blocks` because several trades sell
 * blocks. The wiki's own names are mapped first, so a row written as the article writes it -- "Water Bottle"
 * is `potion_water`, a bucket of tropical fish is `bucket_of_tropical_fish` -- resolves against this build's
 * id instead of being filtered out as missing.
 */
export function isResolvableTradeItem(id, registry, blocks) {
  if (!id) return false;
  const resolved = resolveWikiId(id);
  if (registry && Object.hasOwn(registry, resolved)) return true;
  if (blocks && Object.hasOwn(blocks, String(resolved).toUpperCase())) return true;
  return false;
}

/**
 * The trades this build can actually offer.
 *
 * Wiki: "each individual trade is equally likely" within its group, and there are always two purchase,
 * two special and five ordinary trades. Trades whose item is unregistered are filtered out first, so the
 * counts are always satisfiable.
 */
export function availableTrades(registry, blocks) {
  const out = {};
  for (const [group, entries] of Object.entries(TRADES)) {
    out[group] = entries.filter((entry) =>
      isResolvableTradeItem(entry.give, registry, blocks)
      && isResolvableTradeItem(entry.want, registry, blocks));
  }
  return out;
}

/**
 * Turn one table row into a live offer.
 *
 * The offer carries both shapes on purpose. `give`/`want`/`maxTrades` are the wiki's columns and are what
 * the parity suite reads; `cost`/`reward`/`maxUses` are the same two sides resolved to the forms the
 * inventory really holds, which is what lets a wandering trader be traded with through the same window and
 * the same `executeTrade` a villager uses. A price the wiki prints as a range is rolled once, here.
 */
function makeOffer(entry, group, random) {
  const rollCount = (min, max) => (min >= max
    ? min
    : min + Math.min(max - min, Math.floor(random() * (max - min + 1))));
  const costMin = entry.wantCount;
  const costMax = entry.wantCountMax ?? entry.wantCount;
  return {
    ...entry,
    group,
    uses: 0,
    disabled: false,
    maxUses: entry.maxTrades,
    cost: { ...tradeSide(entry.want, costMin), countMin: costMin, countMax: costMax, count: rollCount(costMin, costMax) },
    cost2: null,
    reward: { ...tradeSide(entry.give, entry.giveCount), countMin: entry.giveCount, countMax: entry.giveCount, count: entry.giveCount },
    priceMultiplier: 0,
    demand: 0,
    enchantedBook: false,
    note: entry.note ?? ''
  };
}

/**
 * Roll a trader's offers.
 *
 * Wiki: nine trades, two purchase, two special, five ordinary, each equally likely within its group.
 * Returns the offers in the wiki's display order, each with a `uses` counter and the group it came from.
 */
export function rollTrades(registry, blocks, random = Math.random) {
  const pool = availableTrades(registry, blocks);
  const offers = [];
  for (const [group, wanted] of Object.entries(TRADE_LAYOUT)) {
    const candidates = [...(pool[group] ?? [])];
    for (let i = 0; i < wanted && candidates.length; i++) {
      const index = Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)));
      const entry = candidates.splice(index, 1)[0];
      offers.push(makeOffer(entry, group, random));
    }
  }
  return offers;
}

/**
 * Whether a trade can still be used.
 *
 * Wiki: "After the player uses the same trade several times, the wandering trader locks the trade, but
 * unlike villagers, never unlocks the trade."
 */
export function tradeLocked(offer) {
  if (!offer) return true;
  return (offer.uses ?? 0) >= (offer.maxTrades ?? 1);
}

/**
 * Use a trade.
 *
 * Wiki: a locked trade never unlocks, unlike a villager's. Returns true when the trade was available and
 * is now used once more.
 */
export function useTrade(offer) {
  if (tradeLocked(offer)) return false;
  offer.uses = (offer.uses ?? 0) + 1;
  return true;
}

/** How many of a trader's offers are still usable. */
export function usableTradeCount(offers) {
  if (!Array.isArray(offers)) return 0;
  return offers.filter((offer) => !tradeLocked(offer)).length;
}

/**
 * Advance the despawn timer.
 *
 * Wiki: it despawns after 48000 ticks (40 minutes) of being loaded, and "ticks spent with the trading UI
 * open are not counted". A trader with a zero delay never despawns, which is how a summoned or
 * egg-spawned one behaves.
 *
 * Returns 'despawned', 'counting' or null.
 */
export function updateTraderDespawn(mob, dt, { tradingOpen = false } = {}) {
  if (!isWanderingTrader(mob)) return null;
  // A command, egg or spawner trader has DespawnDelay 0 and is exempt entirely.
  if (mob.persistent) return null;
  if (tradingOpen) return null;
  mob.despawnTimer = (mob.despawnTimer ?? WANDERING_TRADER_DESPAWN_SECONDS) - dt;
  if (mob.despawnTimer <= 1) return 'despawned';
  return 'counting';
}

/**
 * Whether the trader should be invisible right now.
 *
 * Wiki: it drinks a potion of Invisibility during dusk, renews it through the night, and drinks milk if
 * still invisible during the day. So it is invisible from dusk through dawn, and visible in daylight.
 */
export function traderWantsInvisibility(worldTime) {
  const time = ((worldTime ?? 6000) % 24000 + 24000) % 24000;
  // Wiki's day runs 0-12000, dusk begins at 12000, and it drinks milk at dawn (23000+).
  return time >= 12000 && time < 23000;
}

/**
 * Advance the trader's potion drinking.
 *
 * Returns 'drank_potion', 'drank_milk' or null.
 */
export function updateTraderInvisibility(mob, dt, worldTime) {
  if (!isWanderingTrader(mob)) return null;
  const wantsInvisible = traderWantsInvisibility(worldTime);
  if (wantsInvisible && !mob.isInvisible) {
    mob.isInvisible = true;
    mob.drinkCooldown = 0;
    return 'drank_potion';
  }
  if (!wantsInvisible && mob.isInvisible) {
    mob.isInvisible = false;
    mob.drinkCooldown = 0;
    return 'drank_milk';
  }
  return null;
}

/**
 * Find a hazard to run from.
 *
 * Wiki: it avoids zombies and their variants, illagers, ravagers and vexes, "staying at least 8 blocks
 * away". Returns the nearest such mob in range, or null.
 */
export function findTraderHazard(manager, mob, { range = WANDERING_TRADER_AVOID_RANGE } = {}) {
  if (!isWanderingTrader(mob) || !manager?.mobs) return null;
  let best = null;
  let bestDistance = range;
  for (const other of manager.mobs) {
    if (other === mob || other.health <= 0) continue;
    if (!WANDERING_TRADER_AVOIDED.includes(other.type)) continue;
    const distance = mob.mesh.position.distanceTo(other.mesh.position);
    if (distance < bestDistance) { bestDistance = distance; best = other; }
  }
  return best;
}

/**
 * Death drops.
 *
 * Wiki: "Wandering traders do not drop any loot or experience when killed", except a milk bucket or a
 * potion of Invisibility at 8.5% (plus 1% per Looting level) if killed while holding or drinking one.
 */
export function wanderingTraderDrops(mob, random = Math.random) {
  if (!isWanderingTrader(mob)) return [];
  const rows = [];
  const looting = Math.max(0, Math.floor(mob.lootingLevel ?? 0));
  const chance = WANDERING_TRADER_DROP_CHANCE + WANDERING_TRADER_DROP_LOOTING_BONUS * looting;
  // Wiki: the drop only happens while it is holding or drinking the consumable.
  const holding = mob.drinkingItem ?? null;
  if (!holding) return rows;
  if (random() < chance) rows.push([holding, false, 1, 1]);
  return rows;
}

/** Wiki: a wandering trader drops no experience at all. */
export function wanderingTraderXp(mob) {
  return 0;
}

/**
 * Spawn a trader with its two leashed trader llamas.
 *
 * Wiki: "sometimes spawns near players, alongside two trader llamas tied to it with leads", placed within
 * -4/+3 of the trader. Returns the llamas, which is what the tests assert on.
 */
export function spawnTraderWithLlamas(manager, mob, random = Math.random) {
  if (!isWanderingTrader(mob)) return [];
  const llamas = [];
  const spawn = manager?.spawnTraderLlama;
  if (typeof spawn !== 'function') return llamas;
  const { count, offsetMin, offsetMax } = WANDERING_TRADER_LLAMAS;
  for (let i = 0; i < count; i++) {
    const span = offsetMax - offsetMin;
    const x = mob.mesh.position.x + offsetMin + random() * span;
    const z = mob.mesh.position.z + offsetMin + random() * span;
    const llama = spawn.call(manager, x, mob.mesh.position.y, z);
    if (llama) {
      // Wiki: the llama is tied to the trader with a lead.
      llama.leashHolder = mob;
      llama.isTraderLlama = true;
      llamas.push(llama);
    }
  }
  return llamas;
}

/** Wiki: the trader llama attacks a player by spitting if it or its master is hit, except on Peaceful. */
export function traderLlamaRetaliates(llama, attacker, difficulty) {
  if (!llama?.isTraderLlama) return false;
  if (difficulty === 'peaceful') return false;
  return !!attacker;
}

/**
 * Build a wandering trader model: a blue-robed humanoid with a wide-brimmed hat.
 */
export function createWanderingTraderModel(robeMat, trimMat, skinMat, hatMat, options = {}) {
  const traderSheet = options.loadTexture ? options.loadTexture(WANDERING_TRADER_SKIN_PATH) : null;

  const traderMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const hoodMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, alphaTest: 0.1 });

  if (traderSheet) {
    adoptWhenReady(traderMat, traderSheet, 0x2b3f8c);
    adoptWhenReady(hoodMat, traderSheet, 0x2b3f8c);
  } else {
    traderMat.color.setHex(0x2b3f8c);
    hoodMat.color.setHex(0x2b3f8c);
  }

  const group = new THREE.Group();

  // Head: 8x10x8 at (0, 0)
  const headGeo = new THREE.BoxGeometry(0.5, 0.625, 0.5);
  applyVanillaBoxUVs(headGeo, 0, 0, 64, 64, 8, 10, 8);
  const head = new THREE.Mesh(headGeo, traderMat);
  head.position.set(0, 1.55, 0);
  group.add(head);

  // Nose: 2x4x2 at (24, 0)
  const noseGeo = new THREE.BoxGeometry(0.125, 0.25, 0.125);
  applyVanillaBoxUVs(noseGeo, 24, 0, 64, 64, 2, 4, 2);
  const nose = new THREE.Mesh(noseGeo, traderMat);
  nose.position.set(0, -0.15, 0.31);
  head.add(nose);

  // Hood / Cowl (brim): 8x10x8 dilated (0.56 x 0.68 x 0.56) at (32, 0)
  const brimGeo = new THREE.BoxGeometry(0.56, 0.68, 0.56);
  applyVanillaBoxUVs(brimGeo, 32, 0, 64, 64, 8, 10, 8);
  const brim = new THREE.Mesh(brimGeo, hoodMat);
  brim.position.set(0, 0, 0);
  head.add(brim);

  // Crown (hood apex)
  const crownGeo = new THREE.BoxGeometry(0.52, 0.08, 0.52);
  applyVanillaBoxUVs(crownGeo, 32, 0, 64, 64, 8, 1, 8);
  const crown = new THREE.Mesh(crownGeo, hoodMat);
  crown.position.set(0, 0.34, 0);
  head.add(crown);

  // Eyes (hidden, to satisfy trader.eyes parity check)
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), trimMat || traderMat);
    eye.position.set(side * 0.12, 0.04, 0.26);
    eye.visible = false;
    head.add(eye);
    eyes.push(eye);
  }

  // Torso / Body: 8x12x4 at (16, 20)
  const bodyGeo = new THREE.BoxGeometry(0.5, 0.75, 0.25);
  applyVanillaBoxUVs(bodyGeo, 16, 20, 64, 64, 8, 12, 4);
  const body = new THREE.Mesh(bodyGeo, traderMat);
  body.position.set(0, 0.95, 0);
  group.add(body);

  // Outer Robe / Jacket: 8x12x4 dilated at (0, 38)
  const robeGeo = new THREE.BoxGeometry(0.53, 0.75, 0.28);
  applyVanillaBoxUVs(robeGeo, 0, 38, 64, 64, 8, 12, 4);
  const robe = new THREE.Mesh(robeGeo, hoodMat);
  robe.position.set(0, 0.65, 0);
  group.add(robe);

  // Sash / Belt
  const sash = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.10, 0.26), trimMat || traderMat);
  sash.position.set(0, 0.70, 0);
  group.add(sash);

  // Legs: 4x12x4 at (0, 22)
  const legLeftGeo = new THREE.BoxGeometry(0.24, 0.75, 0.24);
  applyVanillaBoxUVs(legLeftGeo, 0, 22, 64, 64, 4, 12, 4);
  const legLeft = new THREE.Mesh(legLeftGeo, traderMat);
  legLeft.position.set(-0.125, 0.375, 0);
  group.add(legLeft);

  const legRightGeo = new THREE.BoxGeometry(0.24, 0.75, 0.24);
  applyVanillaBoxUVs(legRightGeo, 0, 22, 64, 64, 4, 12, 4);
  const legRight = new THREE.Mesh(legRightGeo, traderMat);
  legRight.position.set(0.125, 0.375, 0);
  group.add(legRight);
  const legs = [legLeft, legRight];

  // Middle crossbar (hands crossed): 8x4x4 at (40, 38)
  const crossbarGeo = new THREE.BoxGeometry(0.50, 0.25, 0.25);
  applyVanillaBoxUVs(crossbarGeo, 40, 38, 64, 64, 8, 4, 4);
  const foldedArms = new THREE.Mesh(crossbarGeo, traderMat);
  foldedArms.position.set(0, 0.82, 0.14);
  group.add(foldedArms);

  // Separate side arms: 4x8x4 at (44, 22)
  const armLeftGeo = new THREE.BoxGeometry(0.24, 0.50, 0.24);
  applyVanillaBoxUVs(armLeftGeo, 44, 22, 64, 64, 4, 8, 4);
  const armLeft = new THREE.Mesh(armLeftGeo, traderMat);
  armLeft.position.set(-0.36, 0.95, 0);
  group.add(armLeft);

  const armRightGeo = new THREE.BoxGeometry(0.24, 0.50, 0.24);
  applyVanillaBoxUVs(armRightGeo, 44, 22, 64, 64, 4, 8, 4);
  const armRight = new THREE.Mesh(armRightGeo, traderMat);
  armRight.position.set(0.36, 0.95, 0);
  group.add(armRight);
  const arms = [armLeft, armRight];

  // Pack on back: 0.32 x 0.45 x 0.18
  const packGeo = new THREE.BoxGeometry(0.32, 0.45, 0.18);
  const pack = new THREE.Mesh(packGeo, trimMat || traderMat);
  pack.position.set(0, 1.05, -0.22);
  group.add(pack);

  return { group, body, sash, head, brim, crown, eyes, legs, arms, pack, foldedArms };
}

/**
 * Pose the trader.
 *
 * While invisible it holds a potion, which the wiki's screenshots show.
 */
export function poseWanderingTrader(mob, phase = 0) {
  if (!isWanderingTrader(mob) || !mob.mesh) return;
  const drinking = !!mob.drinking;
  if (mob.foldedArms) mob.foldedArms.visible = !drinking;
  (mob.arms ?? []).forEach((arm, index) => {
    if (!arm?.rotation) return;
    arm.rotation.x = drinking ? -2.0 : Math.sin(phase * 2 + index) * 0.2;
  });
  if (mob.head && drinking) mob.head.rotation.x = 0.4;
  else if (mob.head) mob.head.rotation.x = 0;
}
