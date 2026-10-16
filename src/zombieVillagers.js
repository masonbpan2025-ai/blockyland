// Zombies hunting villagers, and villagers killed by zombies turning into zombie villagers (Java Edition).
//
// Wiki (Villager, Zombies): "Zombies, zombie villagers, husks, drowned ... seek out and attack villagers within a 35- to
// 52.5-block radius (depending on regional difficulty)". Tutorial:Curing a zombie villager: "a villager killed by a
// zombie has a chance of converting into a zombie villager (0% on Easy, 50% on Normal, and 100% on Hard)". A zombie
// prefers the player when the player is the nearer target. Found by the wiki-tutorial play-test: zombies ignored
// villagers, so neither happened.
export const ZOMBIE_KIN = new Set(['zombie', 'husk', 'zombie_villager', 'drowned']);
export const VILLAGER_HUNT_RANGE = 35;
export const CONVERSION_CHANCE = { peaceful: 0, easy: 0, normal: 0.5, hard: 1 };

/** The villager a zombie goes after, or null when the player is the nearer target (or none is in range). */
export function villagerTarget(mob, mobs, player) {
  if (!ZOMBIE_KIN.has(mob.type) || mob.health <= 0 || !mob.mesh) return null;
  const pos = mob.mesh.position;
  let best = null, bestD = VILLAGER_HUNT_RANGE;
  for (const v of mobs) {
    if ((v.type !== 'villager' && v.type !== 'wandering_trader') || v.health <= 0 || !v.mesh) continue;
    const d = v.mesh.position.distanceTo(pos);
    if (d < bestD) { bestD = d; best = v; }
  }
  if (!best) return null;
  const playerAvailable = player?.position && !player.isDead && !['creative', 'spectator'].includes(player.gamemode);
  if (playerAvailable && player.position.distanceTo(pos) <= bestD) return null;
  return best;
}

/** Zombie melee damage by difficulty (wiki, Zombie: 2.5 / 3 / 4.5). */
export const zombieDamage = (difficulty) => ({ easy: 2.5, normal: 3, hard: 4.5 }[String(difficulty)] ?? 3);

/** Does a villager killed by `killerType` convert? */
export function convertsOnDeath(killerType, difficulty, random = Math.random) {
  if (!ZOMBIE_KIN.has(killerType)) return false;
  return random() < (CONVERSION_CHANCE[String(difficulty)] ?? 0);
}
