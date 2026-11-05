// The World Martial Arts Tournament's house rules for its mobs, applied only in the tournament world:
//
//   * the announcer, the trainers and the spectating villagers cannot be hurt (they are `invulnerable`, which the game's
//     damageMob honours for every source -- a punch, a sword, an arrow and a ki blast alike);
//   * zombies and skeletons do not burn in daylight;
//   * the training mobs -- zombies, skeletons and pillagers -- stay on the training ground they were put on.
//
// registerMobs (mobs.js) wraps the mob manager's update with these: the marking before the mobs move (so a mob never
// gets a frame in the sun or a hit in before it is marked), the keeping-in after (so none is drawn past an edge).

/** The training grounds, as boxes on the ground (x and z, in blocks). */
export const TRAINING_GROUNDS = [
  { id: 'punching_yard', minX: 28, maxX: 72, minZ: -18, maxZ: 18 },
  { id: 'kamehameha_range', minX: -72, maxX: -28, minZ: -18, maxZ: 18 },
  { id: 'genki_dama_crater', minX: -18, maxX: 18, minZ: -72, maxZ: -28 },
  { id: 'south_parkour', minX: -18, maxX: 18, minZ: 28, maxZ: 72 },
  { id: 'central_arena', minX: -32, maxX: 32, minZ: -32, maxZ: 32 },
];

/** The training ground a point is on, or null. */
export function trainingGroundAt(x, z) {
  return TRAINING_GROUNDS.find((g) => x >= g.minX && x <= g.maxX && z >= g.minZ && z <= g.maxZ) ?? null;
}

/** Who cannot be hurt here: the announcer, the trainers and the spectators. */
export const PROTECTED_TOURNAMENT_MOBS = new Set(['tournament_host', 'site_manager', 'villager']);
/** Who does not burn in daylight here: the zombies and the skeletons. */
export const SUNPROOF_TOURNAMENT_MOBS = new Set(['zombie', 'zombie_villager', 'drowned', 'skeleton', 'stray', 'bogged']);
/** Who keeps to their training ground: the zombies, the skeletons and the pillagers. */
export const CONFINED_TOURNAMENT_MOBS = new Set(['zombie', 'zombie_villager', 'drowned', 'husk', 'skeleton', 'stray', 'bogged', 'pillager']);

/** Before the mobs move: mark each mob the first time it is seen with the rules that apply to it. */
export function applyTournamentRules(mobs = []) {
  for (const mob of mobs) {
    if (!mob || mob.tournamentRules) continue;
    mob.tournamentRules = true;
    if (PROTECTED_TOURNAMENT_MOBS.has(mob.type)) mob.invulnerable = true;
    if (SUNPROOF_TOURNAMENT_MOBS.has(mob.type)) mob.burnsInDaylight = false;
    if (CONFINED_TOURNAMENT_MOBS.has(mob.type) && mob.mesh) mob.trainingGround = trainingGroundAt(mob.mesh.position.x, mob.mesh.position.z);
  }
}

/** After the mobs move: any training mob that has stepped past its ground's edge is put back on it, its outward speed stopped. */
export function keepToTrainingGrounds(mobs = []) {
  for (const mob of mobs) {
    const g = mob?.trainingGround;
    if (!g || !mob.mesh || mob.health <= 0) continue;
    const p = mob.mesh.position, v = mob.velocity, half = (mob.width ?? 0.6) / 2;
    if (p.x < g.minX + half) { p.x = g.minX + half; if (v && v.x < 0) v.x = 0; }
    else if (p.x > g.maxX - half) { p.x = g.maxX - half; if (v && v.x > 0) v.x = 0; }
    if (p.z < g.minZ + half) { p.z = g.minZ + half; if (v && v.z < 0) v.z = 0; }
    else if (p.z > g.maxZ - half) { p.z = g.maxZ - half; if (v && v.z > 0) v.z = 0; }
  }
}
