// What a witch drinks, and the potion it can leave when killed drinking it.
//
// Wiki (Witch): each game tick a witch that is not already drinking may start one of four potions, in this order --
//   Water Breathing, 15%, "when the hitbox of the witch is 80% under water and the witch is lacking the Water
//     Breathing status effect";
//   Fire Resistance, 15%, "when the witch is on fire or the last damage taken by it in the past two seconds was fire
//     damage";
//   Healing, 5%, "when the witch is not at full health" ("which heals 4HP");
//   Swiftness, 50%, "when the witch is eleven or more blocks from a target and does not have the Speed effect".
// "Drinking the potion takes 1.6 seconds ... The witch does not attack during this time."
// Wiki (Potion, Witch): it "has an 8.5% chance to drop a potion of Healing, Fire Resistance, Swiftness, or Water
// Breathing if it dies while drinking one of them" and kill credit goes to a player; "increased by 1% for every level
// of Looting".
//
// Pure, so tests/potionParity.test.js drives it with its own random numbers; hostileMobBehaviors.js runs it.
import { POTION_DATA } from './brewing.js';

export const WITCH_DRINK_SECONDS = 1.6;
export const WITCH_POTION_DROP_CHANCE = 0.085;
export const WITCH_POTION_DROP_PER_LOOTING = 0.01;
const TICK = 1 / 20;

/** The four drinks, in the order a tick tries them; each roll is its own. */
export const WITCH_DRINKS = Object.freeze([
  { potion: 'potion_of_water_breathing', chance: 0.15, when: (s) => s.submerged && !s.effects?.water_breathing },
  { potion: 'potion_of_fire_resistance', chance: 0.15, when: (s) => s.burning && !s.effects?.fire_resistance },
  { potion: 'potion_of_healing', chance: 0.05, when: (s) => s.health < s.maxHealth },
  { potion: 'potion_of_swiftness', chance: 0.5, when: (s) => s.targetDistance >= 11 && !s.effects?.speed },
]);

/**
 * One game tick's choice: the potion the witch starts drinking, or null.
 * @param {{submerged:boolean, burning:boolean, health:number, maxHealth:number, targetDistance:number,
 *   effects?:object}} situation
 */
export function chooseWitchDrink(situation, random = Math.random) {
  for (const drink of WITCH_DRINKS) if (random() < drink.chance && drink.when(situation)) return drink.potion;
  return null;
}

/**
 * Advance a witch's drinking by `dt` seconds, a game tick at a time: start a drink when a tick chooses one, finish it
 * 1.6 seconds later. A finished potion takes effect: Healing restores 4 HP at once, the others last their potion's
 * duration (kept on the witch in `witchEffects`, seconds left, so it does not drink one it already has).
 * @returns {{started: string|null, finished: string|null}}
 */
export function updateWitchDrinking(mob, dt, situation, random = Math.random) {
  const result = { started: null, finished: null };
  const effects = (mob.witchEffects ??= {});
  for (const name of Object.keys(effects)) if ((effects[name] -= dt) <= 0) delete effects[name];
  if (mob.isDrinking) {
    mob.drinkTimer -= dt;
    if (mob.drinkTimer > 0) return result;
    result.finished = mob.drinkingPotion;
    const potion = POTION_DATA[mob.drinkingPotion];
    if (potion?.effect === 'instant_health') {
      const before = mob.health;
      mob.health = Math.min(mob.maxHealth, mob.health + (potion.amount ?? 4));
      // What its potions have healed, in all: a test measuring other damage takes it back out.
      mob.potionHealed = (mob.potionHealed ?? 0) + (mob.health - before);
    }
    else if (potion?.effect) effects[potion.effect] = potion.duration;
    mob.isDrinking = false; mob.drinkingPotion = null; mob.drinkTimer = 0;
    return result;
  }
  mob.drinkTicks = (mob.drinkTicks ?? 0) + dt;
  while (mob.drinkTicks >= TICK) {
    mob.drinkTicks -= TICK;
    const potion = chooseWitchDrink({ ...situation, effects }, random);
    if (!potion) continue;
    mob.isDrinking = true; mob.drinkingPotion = potion; mob.drinkTimer = WITCH_DRINK_SECONDS; mob.drinkTicks = 0;
    result.started = potion;
    break;
  }
  return result;
}

/** The potion a witch leaves, if it died while drinking one and a player gets the kill; null otherwise. */
export function witchPotionDrop(mob, random = Math.random) {
  if (!mob?.isDrinking || !mob.drinkingPotion || !mob.playerDamaged) return null;
  const chance = WITCH_POTION_DROP_CHANCE + WITCH_POTION_DROP_PER_LOOTING * (mob.lootingLevel || 0);
  return random() < chance ? mob.drinkingPotion : null;
}
