/**
 * Piglin brute rules.
 *
 * Reference: https://minecraft.wiki/w/Piglin_Brute
 *
 * The brute is a stronger piglin, and almost all of its identity is what it does NOT do: "Unlike piglins,
 * piglin brutes do not barter, retreat, or get distracted by gold." So the differences are gates on the
 * piglin's own behaviour rather than a separate AI, and they live here as predicates the piglin's module can
 * consult.
 */

/** Wiki: 50 HP. */
export const PIGLIN_BRUTE_HEALTH = 50;

/** Wiki: the same 0.6 x 1.95 box as a piglin. */
export const PIGLIN_BRUTE_DIMENSIONS = { width: 0.6, height: 1.95 };

/** Wiki: 16 HP -- here only to state the contrast the brute is defined by. */
export const PIGLIN_HEALTH = 16;

/**
 * Wiki: armed with a golden axe, Easy 7.5 / Normal 13 / Hard 19.5. Unarmed, 4.5 / 7 / 10.5. Note that the
 * Bedrock values differ (6/10/15 and the same unarmed set), and Java is what this codebase follows.
 */
export const PIGLIN_BRUTE_DAMAGE = {
  armed: { peaceful: 0, easy: 7.5, normal: 13, hard: 19.5 },
  unarmed: { peaceful: 0, easy: 4.5, normal: 7, hard: 10.5 }
};

/** Wiki: a golden axe is its weapon, dropped on an 8.5% roll like other naturally spawned equipment. */
export const PIGLIN_BRUTE_WEAPON = 'golden_axe';
export const PIGLIN_BRUTE_WEAPON_DROP_CHANCE = 0.085;

/**
 * The three things it does not do, from the wiki's own sentence. A table rather than three booleans scattered
 * through the piglin's AI, so the contrast is readable in one place and a test can assert the whole set.
 */
export const PIGLIN_BRUTE_DIFFERENCES = {
  barters: false,
  retreats: false,
  distractedByGold: false
};

/**
 * What it keeps from the piglin.
 *
 * The wiki lists only the three differences above, so everything else is shared: it still zombifies in the
 * Overworld, still fears soul fire, and is still a Piglin for anger and equipment purposes.
 */
export const PIGLIN_BRUTE_SHARED = {
  zombifies: true,
  fearsSoulFire: true,
  angeredAsGroup: true,
  isPiglin: true
};

/** Body colours: the piglin palette, slightly darker leather, with the brute's own clothes. */
export const PIGLIN_BRUTE_COLORS = { skin: 0xbf9468, clothes: 0x4a3a2a, tusk: 0xf8fafc };

/** True when the mob is a piglin brute. */
export function isPiglinBrute(mob) {
  const type = typeof mob === 'string' ? mob : mob?.type;
  // The brute keeps `type: 'piglin'`, because it IS a piglin for anger, equipment and zombification, and the
  // alternative was duplicating the piglin's whole AI to change three things. So the flag is the identity.
  return type === 'piglin_brute' || (!!mob && typeof mob === 'object' && mob.isBrute === true);
}

/** Wiki: 50 HP. */
export function piglinBruteHealth() {
  return PIGLIN_BRUTE_HEALTH;
}

/** Wiki: 0.6 x 1.95, the piglin box. */
export function piglinBruteDimensions() {
  return { ...PIGLIN_BRUTE_DIMENSIONS };
}

/**
 * Melee damage by difficulty and whether it still has its axe.
 *
 * Wiki: 7.5/13/19.5 armed, 4.5/7/10.5 unarmed.
 */
export function piglinBruteDamageFor(difficulty = 'normal', { armed = true } = {}) {
  const table = armed ? PIGLIN_BRUTE_DAMAGE.armed : PIGLIN_BRUTE_DAMAGE.unarmed;
  return table[difficulty] ?? table.normal;
}

/** Whether it barters. Wiki: it does not. */
export function piglinBruteBarters() {
  return PIGLIN_BRUTE_DIFFERENCES.barters;
}

/**
 * Whether it retreats from a threat.
 *
 * Wiki: "do not barter, retreat, or get distracted by gold". A piglin flees zombies, zoglins and soul fire; a
 * brute stands its ground, which is what makes it the harder fight.
 */
export function piglinBruteRetreats() {
  return PIGLIN_BRUTE_DIFFERENCES.retreats;
}

/**
 * Whether gold distracts it.
 *
 * Wiki: it is "not distracted by gold", so a player wearing gold armour does NOT stop it attacking -- the
 * opposite of a piglin, and the single most dangerous consequence of the difference. Also means it ignores the
 * gold it would otherwise admire.
 */
export function piglinBruteDistractedByGold() {
  return PIGLIN_BRUTE_DIFFERENCES.distractedByGold;
}

/**
 * Whether it pursues a player regardless of their armour.
 *
 * The piglin's pursuit is conditioned on `!isPlayerWearingGold`; a brute has no such condition, so this
 * reports the pursuit as unconditional.
 */
export function piglinBrutePursues(player) {
  if (!player) return false;
  // Wiki: it is hostile, and unlike a piglin, gold does not pacify it.
  return !['creative', 'spectator'].includes(player.gamemode);
}

/**
 * Apply the brute identity to a piglin mob.
 *
 * Called by the spawner rather than duplicated there, so the brute's numbers live in one place.
 */
export function makePiglinBrute(mob) {
  if (!mob || mob.type !== 'piglin') return false;
  mob.isBrute = true;
  mob.name = 'Piglin Brute';
  mob.health = PIGLIN_BRUTE_HEALTH;
  mob.maxHealth = PIGLIN_BRUTE_HEALTH;
  // Wiki: it "wields a golden axe". Unlike a piglin it never spawns unarmed, which is why the armed damage
  // ladder is the one that matters in play.
  mob.weapon = PIGLIN_BRUTE_WEAPON;
  mob.hasGoldenAxe = true;
  mob.attackDamage = PIGLIN_BRUTE_DAMAGE.armed.normal;
  return true;
}

/**
 * Death drops.
 *
 * Wiki: its golden axe on an 8.5% roll, and nothing else beyond the ordinary equipment handling the piglin's
 * own code already does.
 */
export function piglinBruteDrops(mob, random = Math.random) {
  if (!isPiglinBrute(mob)) return [];
  const rows = [];
  if (mob.hasGoldenAxe && random() < PIGLIN_BRUTE_WEAPON_DROP_CHANCE) {
    rows.push([PIGLIN_BRUTE_WEAPON, false, 1, 1]);
  }
  return rows;
}

/** Wiki: a brute is worth 5 XP with player credit, like other hostile Nether mobs here. */
export function piglinBruteXp(mob) {
  if (!isPiglinBrute(mob)) return 0;
  return 5;
}
