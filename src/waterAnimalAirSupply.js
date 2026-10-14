// Out-of-water suffocation for water animals.
//
// Java Edition `WaterAnimal.handleAirSupply`: a fish out of water spends its air supply (300 ticks, 15 s;
// 6000 ticks, 5 min, for an axolotl). Once the supply is empty it takes 2 damage (one heart) every second until
// it is back in water. Dolphins (moistness) and squid (their own dry timer) have separate rules and are not covered.
// https://minecraft.wiki/w/Cod, https://minecraft.wiki/w/Salmon, https://minecraft.wiki/w/Axolotl

export const FISH_AIR_SECONDS = 15;
export const AXOLOTL_AIR_SECONDS = 300;
export const DRY_DAMAGE = 2;
export const DRY_DAMAGE_INTERVAL = 1;

export const AIR_SUPPLY_TYPES = ['cod', 'salmon', 'pufferfish', 'tropical_fish', 'axolotl'];

export function airSupplySeconds(type) {
  return type === 'axolotl' ? AXOLOTL_AIR_SECONDS : FISH_AIR_SECONDS;
}

export function usesAirSupply(mob) {
  return !!mob && AIR_SUPPLY_TYPES.includes(mob.type);
}

/**
 * Advance a water animal's air supply by `dt` seconds. Returns true when this call dealt damage.
 * Being in water (or rained on is NOT enough: only water refills it) restores the supply at once.
 */
export function updateWaterAnimalAirSupply(manager, mob, dt) {
  if (!usesAirSupply(mob)) return false;
  const max = airSupplySeconds(mob.type);
  if (mob.inWater) {
    mob.airSupply = max;
    mob.dryDamageTimer = 0;
    return false;
  }
  mob.airSupply = Math.max(0, (mob.airSupply ?? max) - dt);
  if (mob.airSupply > 0) return false;
  mob.dryDamageTimer = (mob.dryDamageTimer || 0) + dt;
  if (mob.dryDamageTimer < DRY_DAMAGE_INTERVAL) return false;
  mob.dryDamageTimer -= DRY_DAMAGE_INTERVAL;
  manager.damageMob(mob, DRY_DAMAGE, null, true, null, true);
  return true;
}
