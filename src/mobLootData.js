// GENERATED FILE - do not edit by hand.
//
// Canonical mob drops, from vanilla loot tables.
//
// Produced by scripts/generate-mc-data.mjs from PrismarineJS/minecraft-data
// (https://github.com/PrismarineJS/minecraft-data). Regenerate with:
//   node scripts/generate-mc-data.mjs
//
// Each entry is [item, chance, count, flags]. A missing chance means it always drops; a
// // missing count means one; a 0-0 count range means the drop scales with looting, which is
// // recorded as 0-0 and left to the caller. `playerKill` marks drops that only happen when a
// // player lands the kill.

export const MOB_LOOT = {
  blaze: [['blaze_rod',null,null,'playerKill']],
  cat: [['string']],
  cave_spider: [['string'],['spider_eye',null,null,'playerKill']],
  chicken: [['feather'],['chicken']],
  cod: [['cod'],['bone_meal',0.05]],
  cow: [['leather'],['beef']],
  creeper: [['gunpowder']],
  dolphin: [['cod']],
  donkey: [['leather']],
  drowned: [['rotten_flesh'],['copper_ingot',0.11,null,'playerKill']],
  elder_guardian: [['prismarine_shard'],['cod',0.6],['prismarine_crystals',0.4],['wet_sponge',null,null,'playerKill'],['tide_armor_trim_smithing_template']],
  enderman: [['ender_pearl']],
  evoker: [['totem_of_undying'],['emerald',null,null,'playerKill']],
  ghast: [['ghast_tear'],['gunpowder']],
  glow_squid: [['glow_ink_sac']],
  guardian: [['prismarine_shard'],['cod',0.5],['prismarine_crystals',0.5]],
  hoglin: [['porkchop'],['leather']],
  horse: [['leather']],
  husk: [['rotten_flesh'],['iron_ingot',0.008333,null,'playerKill'],['carrot',0.008333,null,'playerKill'],['potato',0.008333,null,'playerKill']],
  iron_golem: [['poppy'],['iron_ingot']],
  llama: [['leather']],
  magma_cube: [['magma_cream',0.25],['pearlescent_froglight',0.25],['verdant_froglight',0.25],['ochre_froglight',0.25]],
  mooshroom: [['leather'],['beef']],
  mule: [['leather']],
  panda: [['bamboo']],
  parrot: [['feather']],
  phantom: [['phantom_membrane',null,null,'playerKill']],
  pig: [['porkchop']],
  polar_bear: [['cod',0.75],['salmon',0.25]],
  pufferfish: [['pufferfish'],['bone_meal',0.05]],
  rabbit: [['rabbit_hide'],['rabbit'],['rabbit_foot',0.1,null,'playerKill']],
  ravager: [['saddle']],
  salmon: [['salmon'],['bone_meal',0.05]],
  sheep: [['mutton']],
  shulker: [['shulker_shell',0.5]],
  skeleton: [['arrow'],['bone']],
  skeleton_horse: [['bone']],
  slime: [['slime_ball',0.5]],
  snow_golem: [['snowball']],
  spider: [['string'],['spider_eye',null,null,'playerKill']],
  squid: [['ink_sac']],
  stray: [['arrow'],['bone'],['tipped_arrow',null,null,'playerKill']],
  strider: [['string']],
  trader_llama: [['leather']],
  tropical_fish: [['tropical_fish'],['bone_meal',0.05]],
  turtle: [['seagrass'],['bowl']],
  vindicator: [['emerald',null,null,'playerKill']],
  warden: [['sculk_catalyst']],
  witch: [['glowstone_dust',0.125],['sugar',0.125],['redstone',0.125],['spider_eye',0.125],['glass_bottle',0.125],['gunpowder',0.125],['stick',0.25]],
  wither_skeleton: [['coal'],['bone'],['wither_skeleton_skull',0.025,null,'playerKill']],
  zoglin: [['rotten_flesh']],
  zombie: [['rotten_flesh'],['iron_ingot',0.008333,null,'playerKill'],['carrot',0.008333,null,'playerKill'],['potato',0.008333,null,'playerKill']],
  zombie_horse: [['rotten_flesh']],
  zombie_villager: [['rotten_flesh'],['iron_ingot',0.008333,null,'playerKill'],['carrot',0.008333,null,'playerKill'],['potato',0.008333,null,'playerKill']],
  zombified_piglin: [['rotten_flesh'],['gold_nugget'],['gold_ingot',0.025,null,'playerKill']],
};

/** Drop entries for a mob type, or an empty array when it drops nothing. */
export function lootFor(mobType) {
  return MOB_LOOT[mobType] || [];
}

/**
 * Roll a mob's drops.
 *
 * @param {string} mobType
 * @param {() => number} [random] injectable for deterministic tests
 * @param {{ playerKill?: boolean }} [options]
 * @returns {Array<{item: string, count: number}>}
 */
export function rollLoot(mobType, random = Math.random, options = {}) {
  const out = [];
  for (const [item, chance, count, flags] of lootFor(mobType)) {
    if (flags === 'playerKill' && !options.playerKill) continue;
    if (chance !== undefined && random() >= chance) continue;
    let n = 1;
    if (typeof count === 'number') n = count;
    else if (typeof count === 'string' && count.includes('-')) {
      const [lo, hi] = count.split('-').map(Number);
      n = lo + Math.floor(random() * (hi - lo + 1));
    }
    if (n > 0) out.push({ item, count: n });
  }
  return out;
}
