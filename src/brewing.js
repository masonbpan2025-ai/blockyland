/**
 * Minecraft Brewing & Alchemy Engine
 * Reference: https://minecraft.wiki/w/Brewing
 */
import { BLOCK_DEFS } from './blocks.js';

// Canonical Potion Registry with Names, Types, and Effects
export const POTION_DATA = {
  water_bottle: { name: 'Water Bottle', color: '#3b82f6', type: 'base' },
  awkward_potion: { name: 'Awkward Potion', color: '#6366f1', type: 'base' },
  thick_potion: { name: 'Thick Potion', color: '#4f46e5', type: 'base' },
  mundane_potion: { name: 'Mundane Potion', color: '#6b7280', type: 'base' },

  // Standard Effect Potions
  potion_of_healing: { name: 'Potion of Healing', color: '#f43f5e', effect: 'instant_health', amount: 4 },
  potion_of_regeneration: { name: 'Potion of Regeneration', color: '#ec4899', effect: 'regeneration', duration: 45 },
  potion_of_strength: { name: 'Potion of Strength', color: '#b91c1c', effect: 'strength', duration: 180 },
  potion_of_swiftness: { name: 'Potion of Swiftness', color: '#38bdf8', effect: 'speed', duration: 180 },
  potion_of_fire_resistance: { name: 'Potion of Fire Resistance', color: '#ea580c', effect: 'fire_resistance', duration: 180 },
  potion_of_night_vision: { name: 'Potion of Night Vision', color: '#1e3a8a', effect: 'night_vision', duration: 180 },
  potion_of_invisibility: { name: 'Potion of Invisibility', color: '#94a3b8', effect: 'invisibility', duration: 180 },
  potion_of_water_breathing: { name: 'Potion of Water Breathing', color: '#0284c7', effect: 'water_breathing', duration: 180 },
  potion_of_leaping: { name: 'Potion of Leaping', color: '#22c55e', effect: 'jump_boost', duration: 180 },
  potion_of_slow_falling: { name: 'Potion of Slow Falling', color: '#fbcfe8', effect: 'slow_falling', duration: 90 },
  potion_of_poison: { name: 'Potion of Poison', color: '#84cc16', effect: 'poison', duration: 45 },
  potion_of_weakness: { name: 'Potion of Weakness', color: '#475569', effect: 'weakness', duration: 90 },
  potion_of_harming: { name: 'Potion of Harming', color: '#881337', effect: 'instant_damage', amount: 6 },
  potion_of_turtle_master: { name: 'Potion of the Turtle Master', color: '#14532d', effect: 'turtle_master', duration: 20 },

  // Tier II (Potency)
  potion_of_healing_2: { name: 'Potion of Healing II', color: '#f43f5e', effect: 'instant_health', amount: 8, level: 2 },
  potion_of_regeneration_2: { name: 'Potion of Regeneration II', color: '#ec4899', effect: 'regeneration', duration: 22, level: 2 },
  potion_of_strength_2: { name: 'Potion of Strength II', color: '#b91c1c', effect: 'strength', duration: 90, level: 2 },
  potion_of_swiftness_2: { name: 'Potion of Swiftness II', color: '#38bdf8', effect: 'speed', duration: 90, level: 2 },
  potion_of_leaping_2: { name: 'Potion of Leaping II', color: '#22c55e', effect: 'jump_boost', duration: 90, level: 2 },
  potion_of_poison_2: { name: 'Potion of Poison II', color: '#84cc16', effect: 'poison', duration: 21, level: 2 },
  potion_of_harming_2: { name: 'Potion of Harming II', color: '#881337', effect: 'instant_damage', amount: 12, level: 2 },

  // Extended (Duration)
  potion_of_regeneration_long: { name: 'Potion of Regeneration (Extended)', color: '#ec4899', effect: 'regeneration', duration: 90 },
  potion_of_strength_long: { name: 'Potion of Strength (Extended)', color: '#b91c1c', effect: 'strength', duration: 480 },
  potion_of_swiftness_long: { name: 'Potion of Swiftness (Extended)', color: '#38bdf8', effect: 'speed', duration: 480 },
  potion_of_fire_resistance_long: { name: 'Potion of Fire Resistance (Extended)', color: '#ea580c', effect: 'fire_resistance', duration: 480 },
  potion_of_night_vision_long: { name: 'Potion of Night Vision (Extended)', color: '#1e3a8a', effect: 'night_vision', duration: 480 },
  potion_of_invisibility_long: { name: 'Potion of Invisibility (Extended)', color: '#94a3b8', effect: 'invisibility', duration: 480 },
  potion_of_water_breathing_long: { name: 'Potion of Water Breathing (Extended)', color: '#0284c7', effect: 'water_breathing', duration: 480 },
  potion_of_leaping_long: { name: 'Potion of Leaping (Extended)', color: '#22c55e', effect: 'jump_boost', duration: 480 },
  potion_of_slow_falling_long: { name: 'Potion of Slow Falling (Extended)', color: '#fbcfe8', effect: 'slow_falling', duration: 240 },
  potion_of_poison_long: { name: 'Potion of Poison (Extended)', color: '#84cc16', effect: 'poison', duration: 90 },
  potion_of_weakness_long: { name: 'Potion of Weakness (Extended)', color: '#475569', effect: 'weakness', duration: 240 },

  // Slowness. Vanilla has this in three forms and it comes from swiftness or leaping plus a fermented
  // spider eye, but it was missing entirely: the corruption table converted night vision, healing and
  // poison, and had no swiftness or leaping row, so the potion could not be brewed at all.
  //
  // Durations are vanilla's: 1:30 base, 4:00 extended, 0:20 at level IV.
  potion_of_slowness: { name: 'Potion of Slowness', color: '#64748b', effect: 'slowness', duration: 90 },
  potion_of_slowness_long: { name: 'Potion of Slowness (Extended)', color: '#64748b', effect: 'slowness', duration: 240 },
  potion_of_slowness_2: { name: 'Potion of Slowness IV', color: '#64748b', effect: 'slowness', duration: 20, level: 4 },

  // Turtle Master, which vanilla has in three forms and this table had only the base one. All three
  // come from one ingredient -- turtle scute on an awkward potion -- and then redstone extends it
  // (0:20 -> 0:40) or glowstone enhances it (Slowness IV/Resistance III -> Slowness VI/Resistance IV).
  // Without these two the Potion of the Turtle Master was the only potion in the game with no extended
  // form, so a player who extended it got nothing at all; the brew simply did not happen.
  //
  // The pair of effects and the levels for each tier live in `statusEffects.js` under `turtle_master`.
  // The potion carries only which tier it is; `compoundEffects` reads the pair for that tier.
  potion_of_turtle_master_long: { name: 'Potion of the Turtle Master (Extended)', color: '#14532d', effect: 'turtle_master', duration: 40 },
  potion_of_turtle_master_2: { name: 'Potion of the Turtle Master II', color: '#14532d', effect: 'turtle_master', duration: 20, level: 2 },

  // The four potions Java 1.21 added (their wiki pages: brewed from an awkward potion with a slime block, a cobweb,
  // a breeze rod and stone; 3:00 each; colours the effects' particle colours). The effects were already in
  // statusEffects.js and nothing could give them; found by the recipe parity audit, whose tipped-arrow recipes
  // named potions this game did not have.
  potion_of_oozing: { name: 'Potion of Oozing', color: '#99ffa3', effect: 'oozing', duration: 180 },
  potion_of_weaving: { name: 'Potion of Weaving', color: '#78695a', effect: 'weaving', duration: 180 },
  potion_of_wind_charging: { name: 'Potion of Wind Charging', color: '#bdc9ff', effect: 'wind_charged', duration: 180 },
  potion_of_infestation: { name: 'Potion of Infestation', color: '#8c9b8c', effect: 'infested', duration: 180 },
};

// Base Brewing Recipes: (bottleId + ingredientId) -> resultId
export const BASE_BREWING_RECIPES = [
  // Awkward Potion (Foundation for most potions)
  { bottle: 'water_bottle', ingredient: 'nether_wart', result: 'awkward_potion' },
  { bottle: 'water_bottle', ingredient: 'fermented_spider_eye', result: 'potion_of_weakness' },
  { bottle: 'water_bottle', ingredient: 'glowstone_dust', result: 'thick_potion' },
  { bottle: 'water_bottle', ingredient: 'redstone', result: 'mundane_potion' },
  // The Brewing page's Mundane Potion row: a water bottle also turns mundane with any of these effect ingredients
  // ("The exceptions to this are the golden carrot, pufferfish, turtle shell, and phantom membrane"). Found by the
  // systems parity audit (src/systemsWikiAudit.js); only redstone was here.
  ...['sugar', 'rabbit_foot', 'glistering_melon_slice', 'spider_eye', 'magma_cream', 'blaze_powder', 'ghast_tear',
    'breeze_rod', 'stone', 'cobweb', 'slime_block'].map((ingredient) => ({ bottle: 'water_bottle', ingredient, result: 'mundane_potion' })),

  // Standard Potions from Awkward
  { bottle: 'awkward_potion', ingredient: 'sugar', result: 'potion_of_swiftness' },
  { bottle: 'awkward_potion', ingredient: 'rabbit_foot', result: 'potion_of_leaping' },
  { bottle: 'awkward_potion', ingredient: 'blaze_powder', result: 'potion_of_strength' },
  { bottle: 'awkward_potion', ingredient: 'glistering_melon_slice', result: 'potion_of_healing' },
  { bottle: 'awkward_potion', ingredient: 'spider_eye', result: 'potion_of_poison' },
  { bottle: 'awkward_potion', ingredient: 'ghast_tear', result: 'potion_of_regeneration' },
  { bottle: 'awkward_potion', ingredient: 'magma_cream', result: 'potion_of_fire_resistance' },
  { bottle: 'awkward_potion', ingredient: 'pufferfish', result: 'potion_of_water_breathing' },
  { bottle: 'awkward_potion', ingredient: 'golden_carrot', result: 'potion_of_night_vision' },
  { bottle: 'awkward_potion', ingredient: 'phantom_membrane', result: 'potion_of_slow_falling' },
  // The ingredient is the Turtle Shell (`turtle_helmet`): the Brewing page's recipe is "Input= Turtle Shell" on an
  // awkward potion. It was `turtle_scute`, the shell's crafting material, which the wiki does not brew.
  { bottle: 'awkward_potion', ingredient: 'turtle_helmet', result: 'potion_of_turtle_master' },
  // Java 1.21's four. Block ingredients are named by block (a stand slot holds a block as its id; see below).
  { bottle: 'awkward_potion', ingredient: 'slime_block', result: 'potion_of_oozing' },
  { bottle: 'awkward_potion', ingredient: 'cobweb', result: 'potion_of_weaving' },
  { bottle: 'awkward_potion', ingredient: 'breeze_rod', result: 'potion_of_wind_charging' },
  { bottle: 'awkward_potion', ingredient: 'stone', result: 'potion_of_infestation' },

  // Fermented Spider Eye Corruptions
  { bottle: 'potion_of_night_vision', ingredient: 'fermented_spider_eye', result: 'potion_of_invisibility' },
  { bottle: 'potion_of_night_vision_long', ingredient: 'fermented_spider_eye', result: 'potion_of_invisibility_long' },
  { bottle: 'potion_of_healing', ingredient: 'fermented_spider_eye', result: 'potion_of_harming' },
  { bottle: 'potion_of_healing_2', ingredient: 'fermented_spider_eye', result: 'potion_of_harming_2' },
  { bottle: 'potion_of_poison', ingredient: 'fermented_spider_eye', result: 'potion_of_harming' },
  { bottle: 'potion_of_poison_2', ingredient: 'fermented_spider_eye', result: 'potion_of_harming_2' },
  { bottle: 'potion_of_poison_long', ingredient: 'fermented_spider_eye', result: 'potion_of_harming' },
  // Slowness comes from swiftness OR leaping, which vanilla both allow. Neither row existed, so the
  // potion was unobtainable even though the data table now defines it.
  { bottle: 'potion_of_swiftness', ingredient: 'fermented_spider_eye', result: 'potion_of_slowness' },
  { bottle: 'potion_of_swiftness_long', ingredient: 'fermented_spider_eye', result: 'potion_of_slowness_long' },
  { bottle: 'potion_of_leaping', ingredient: 'fermented_spider_eye', result: 'potion_of_slowness' },
  { bottle: 'potion_of_leaping_long', ingredient: 'fermented_spider_eye', result: 'potion_of_slowness_long' },
  // The enhanced Swiftness II and Leaping II rows used to be here, and they were wrong. The Brewing page's
  // rule is "Enhanced potions of Leaping or Swiftness cannot be corrupted", and the Potion of Slowness page
  // lists only the regular and extended Swiftness and Leaping among its brewing ingredients -- no enhanced
  // form. With those rows present, the one potion vanilla refuses to make by corruption was brewed by it,
  // and the Slowness IV that vanilla reaches with glowstone on Slowness was reachable a second way.

  // Redstone Extension (Extended Duration)
  { bottle: 'potion_of_regeneration', ingredient: 'redstone', result: 'potion_of_regeneration_long' },
  { bottle: 'potion_of_strength', ingredient: 'redstone', result: 'potion_of_strength_long' },
  { bottle: 'potion_of_swiftness', ingredient: 'redstone', result: 'potion_of_swiftness_long' },
  { bottle: 'potion_of_fire_resistance', ingredient: 'redstone', result: 'potion_of_fire_resistance_long' },
  { bottle: 'potion_of_night_vision', ingredient: 'redstone', result: 'potion_of_night_vision_long' },
  { bottle: 'potion_of_invisibility', ingredient: 'redstone', result: 'potion_of_invisibility_long' },
  { bottle: 'potion_of_water_breathing', ingredient: 'redstone', result: 'potion_of_water_breathing_long' },
  { bottle: 'potion_of_leaping', ingredient: 'redstone', result: 'potion_of_leaping_long' },
  { bottle: 'potion_of_slow_falling', ingredient: 'redstone', result: 'potion_of_slow_falling_long' },
  { bottle: 'potion_of_poison', ingredient: 'redstone', result: 'potion_of_poison_long' },
  { bottle: 'potion_of_weakness', ingredient: 'redstone', result: 'potion_of_weakness_long' },
  // Vanilla extends Slowness with redstone, and this table had no row for it. `potion_of_slowness_long`
  // was reachable only by corrupting an *already extended* swiftness or leaping potion, so extending a
  // Slowness potion directly -- the obvious route -- silently brewed nothing.
  { bottle: 'potion_of_slowness', ingredient: 'redstone', result: 'potion_of_slowness_long' },
  // And Turtle Master extends, which is the row whose absence made it the one potion in the game with
  // no way to lengthen it.
  { bottle: 'potion_of_turtle_master', ingredient: 'redstone', result: 'potion_of_turtle_master_long' },

  // Glowstone Dust Enhancement (Level II Potency)
  { bottle: 'potion_of_healing', ingredient: 'glowstone_dust', result: 'potion_of_healing_2' },
  { bottle: 'potion_of_regeneration', ingredient: 'glowstone_dust', result: 'potion_of_regeneration_2' },
  { bottle: 'potion_of_strength', ingredient: 'glowstone_dust', result: 'potion_of_strength_2' },
  { bottle: 'potion_of_swiftness', ingredient: 'glowstone_dust', result: 'potion_of_swiftness_2' },
  { bottle: 'potion_of_leaping', ingredient: 'glowstone_dust', result: 'potion_of_leaping_2' },
  { bottle: 'potion_of_poison', ingredient: 'glowstone_dust', result: 'potion_of_poison_2' },
  { bottle: 'potion_of_harming', ingredient: 'glowstone_dust', result: 'potion_of_harming_2' },
  // Slowness IV, which vanilla reaches with glowstone on Slowness. Without this row the potion existed
  // in POTION_DATA with nothing able to produce it -- the mirror of the slowness bug above, where a
  // recipe existed with no potion behind it.
  { bottle: 'potion_of_slowness', ingredient: 'glowstone_dust', result: 'potion_of_slowness_2' },
  // Turtle Master II, glowstone on Turtle Master, the same rule as every other enhanced potion.
  { bottle: 'potion_of_turtle_master', ingredient: 'glowstone_dust', result: 'potion_of_turtle_master_2' }
];

/**
 * Vanilla's *generic* potion ids, and the core this game derives them from.
 *
 * Vanilla's generic splash and lingering potions **are** the water ones: `minecraft:splash_potion` with no
 * stored effect is water, and it displays as "Splash Water Bottle". This game models the water potion as the
 * core `water_bottle`, so deriving `splash_water_bottle` produced an id vanilla does not have. The two derived
 * forms therefore take vanilla's names.
 *
 * Both the item generator and the accessors below read this table, so the ids and the data behind them cannot
 * drift apart -- which is exactly what happened when the generator was the only thing that knew.
 */
export const VANILLA_GENERIC_POTION_FORMS = {
  // The display names are vanilla's too. This game builds a splash potion's name as "Splash " + the core's
  // name, which for the water potion gives "Splash Water Bottle" -- but vanilla's *item* is `splash_potion`
  // and its name is "Splash Potion", which is what the Inspector's `name-parity` check compares against.
  water_bottle: {
    splash: 'splash_potion',
    lingering: 'lingering_potion',
    splashName: 'Splash Potion',
    lingeringName: 'Lingering Potion',
  },
};

/**
 * The core potion a splash or lingering id belongs to, or the id itself when it is already a core.
 *
 * Both potionDataFor here and splashPotion.js need this, and both used to derive it by stripping the
 * prefix -- which cannot resolve vanilla's generic splash_potion, whose core is this game's water_bottle
 * and not anything called potion. That made a thrown splash potion fall through to block placement, which
 * 	ests/splashPotion.test.js caught the round the rename landed.
 *
 * @param {string} itemId
 * @returns {string} a POTION_DATA key when there is one
 */
export function potionCoreFor(itemId) {
  if (typeof itemId !== 'string') return '';
  return CORE_FOR_GENERIC_FORM[itemId] ?? itemId.replace(/^(splash|lingering)_/, '');
}
/** The core a derived id belongs to, inverted from the table above. */
const CORE_FOR_GENERIC_FORM = Object.fromEntries(
  Object.entries(VANILLA_GENERIC_POTION_FORMS)
    .flatMap(([core, forms]) => Object.values(forms).map((id) => [id, core])),
);

/**
 * Returns resulting potion id when given a bottle and ingredient, or null if no recipe matches
 */
export function getBrewingResult(bottleId, ingredientId) {
  if (!bottleId || !ingredientId) return null;
  // A block ingredient arrives as its numeric id; the recipes name it.
  if (typeof ingredientId === 'number') {
    ingredientId = String(BLOCK_DEFS[ingredientId]?.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!ingredientId) return null;
  }

  // Gunpowder: converts any regular drinkable potion to a Splash potion. The water potion is vanilla's
  // generic one, so this asks the table rather than gluing a prefix on -- `splash_water_bottle` was an id
  // vanilla does not have, and brewing into it would have produced a phantom stack.
  if (ingredientId === 'gunpowder') {
    if (bottleId.startsWith('splash_') || bottleId.startsWith('lingering_')) return null;
    return VANILLA_GENERIC_POTION_FORMS[bottleId]?.splash ?? `splash_${bottleId}`;
  }

  // Dragon's Breath: converts any Splash potion to a Lingering potion. The generic case needs the table too,
  // because `splash_potion` does not start with a core name this can prefix.
  if (ingredientId === 'dragon_breath') {
    if (CORE_FOR_GENERIC_FORM[bottleId]) return VANILLA_GENERIC_POTION_FORMS[CORE_FOR_GENERIC_FORM[bottleId]].lingering;
    if (bottleId.startsWith('splash_')) {
      return bottleId.replace(/^splash_/, 'lingering_');
    }
    return null;
  }

  // Check prefix for splash and lingering.
  //
  // The generic forms are resolved FIRST, from the whole id: vanilla's generic splash and lingering
  // potions are the water ones and their ids are `splash_potion` / `lingering_potion`, not
  // `splash_water_bottle`. Stripping the prefix turns them into the meaningless `potion`, so this has to
  // happen before the strip. Without it these resolved to no recipe at all, and the wiki's rule that "a
  // splash water bottle can be brewed with any of the base ingredients; the result remains a splash
  // potion" could not happen -- `splash_potion + nether_wart` brewed nothing.
  let prefix = '';
  let coreBottle = CORE_FOR_GENERIC_FORM[bottleId] ?? bottleId;
  if (!CORE_FOR_GENERIC_FORM[bottleId]) {
    if (bottleId.startsWith('splash_')) {
      prefix = 'splash_';
      coreBottle = bottleId.replace(/^splash_/, '');
    } else if (bottleId.startsWith('lingering_')) {
      prefix = 'lingering_';
      coreBottle = bottleId.replace(/^lingering_/, '');
    }
  } else {
    prefix = bottleId.startsWith('lingering_') ? 'lingering_' : 'splash_';
  }

  const recipe = BASE_BREWING_RECIPES.find(r => r.bottle === coreBottle && r.ingredient === ingredientId);
  if (recipe) {
    return `${prefix}${recipe.result}`;
  }

  return null;
}

/**
 * The potion data behind an item id, whichever of the three forms it names.
 *
 * A potion is one entry in POTION_DATA plus a delivery form that `getBrewingResult` encodes in the id
 * prefix. Callers should not parse that prefix themselves: the generated item set and the brewing
 * table both derive from POTION_DATA, so this is the one place the mapping is written down.
 *
 * @param {string} itemId  `potion_of_healing`, `splash_potion_of_healing`, `lingering_...`
 * @returns {{id: string, base: string, name: string, color: string, effect?: string,
 *            duration?: number, amount?: number, level?: number,
 *            splash: boolean, lingering: boolean}|null}
 */
export function potionDataFor(itemId) {
  if (typeof itemId !== 'string' || !itemId) return null;
  const splash = itemId.startsWith('splash_');
  const lingering = itemId.startsWith('lingering_');
  // Vanilla's generic splash_potion and lingering_potion are the water potion, whose core is this
  // game's water_bottle; the table is authoritative for them and the prefix rule handles the other 110.
  const base = potionCoreFor(itemId);
  const data = POTION_DATA[base];
  if (!data) return null;
  return { id: itemId, base, ...data, splash, lingering };
}

/**
 * How long one brewing stage takes, in seconds.
 *
 * Vanilla's brewing stand takes 20 seconds -- 400 game ticks -- per stage, and the Brewing Stand article
 * states it in as many words. This was 10, with a comment asserting that "vanilla and Mineclonia both
 * take 10 s"; the code and its own comment agreed with each other and disagreed with the game, and the
 * test asserted the same wrong figure, so the whole brew was twice as fast as the game it copies.
 */
export const BREW_DURATION = 20.0;

/** Blaze powder charges one piece holds, and the stand's ceiling. */
export const MAX_FUEL = 20;

/** Bottle slots on a stand, as in vanilla's brewing stand GUI. */
export const BOTTLE_SLOTS = 3;

/**
 * BrewingStand Simulation Model
 */
export class BrewingStand {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.ingredient = null; // { id, count }
    this.bottles = [null, null, null]; // 3 bottom slots: { id, count }
    this.fuel = 0; // 0 to 20 units
    this.maxFuel = MAX_FUEL;
    this.brewTimer = 0;
    this.brewDuration = BREW_DURATION;
    this.isBrewing = false;
  }

  /**
   * Adds Blaze Powder as fuel (1 Blaze Powder = 20 brewing operations)
   */
  addFuel(item) {
    if (!item || item.id !== 'blaze_powder') return false;
    if (this.fuel >= this.maxFuel) return false;

    this.fuel = Math.min(this.maxFuel, this.fuel + MAX_FUEL);
    return true;
  }

  /**
   * Checks if current slots can begin a brewing operation
   */
  canBrew() {
    if (!this.ingredient || this.ingredient.count <= 0) return false;
    if (this.fuel <= 0) return false;

    // Must have at least one bottle that transforms with this ingredient
    const hasValidTransform = this.bottles.some(b => {
      if (!b || b.count <= 0) return false;
      const res = getBrewingResult(b.id, this.ingredient.id);
      return res && res !== b.id;
    });

    return hasValidTransform;
  }

  /**
   * Performs the instant brewing step (or final transformation)
   */
  completeBrew() {
    if (!this.canBrew()) {
      this.isBrewing = false;
      this.brewTimer = 0;
      return false;
    }

    const ingId = this.ingredient.id;

    // Transform all eligible bottles
    for (let i = 0; i < 3; i++) {
      const b = this.bottles[i];
      if (b && b.count > 0) {
        const nextId = getBrewingResult(b.id, ingId);
        if (nextId) {
          b.id = nextId;
        }
      }
    }

    // Deduct 1 ingredient
    this.ingredient.count -= 1;
    if (this.ingredient.count <= 0) {
      this.ingredient = null;
    }

    // Deduct 1 fuel unit
    this.fuel = Math.max(0, this.fuel - 1);
    this.isBrewing = false;
    this.brewTimer = 0;

    return true;
  }

  /**
   * Ticks brewing progress
   */
  update(dt, options = {}) {
    if (options.instant) {
      return this.completeBrew();
    }

    if (this.canBrew()) {
      if (!this.isBrewing) {
        this.isBrewing = true;
        this.brewTimer = this.brewDuration;
      }
      this.brewTimer -= dt;
      if (this.brewTimer <= 0) {
        return this.completeBrew();
      }
    } else {
      this.isBrewing = false;
      this.brewTimer = 0;
    }

    return false;
  }

  getProgress() {
    if (!this.isBrewing || this.brewDuration <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - (this.brewTimer / this.brewDuration)));
  }
}

/**
 * The brewing stands in a world, one per block position.
 *
 * Without this the game had a single stand living on the UI, and opening a second stand replaced it --
 * so the first stand's bottles and ingredient were simply gone, and a stand you had loaded and walked
 * away from forgot everything. Vanilla keeps a brewing stand's contents in its block entity and keeps
 * brewing while the interface is closed, which the wiki states outright: "there is no time limit; fuel
 * is consumed only when there are water bottles and an ingredient to brew into it."
 *
 * Keyed by floor(x), floor(y), floor(z), the same way `FurnaceManager` keys its furnaces.
 */
export class BrewingManager {
  constructor() {
    this.stands = new Map();
  }

  /** Key for the block a position is inside, matching how the world addresses voxels. */
  getKey(x, y, z) {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }

  /** The stand at a position, or null when nothing has ever been brewed there. */
  getStand(x, y, z) {
    return this.stands.get(this.getKey(x, y, z)) ?? null;
  }

  /** The stand at a position, created empty if this is the first time it is opened. */
  getOrCreateStand(x, y, z) {
    const key = this.getKey(x, y, z);
    let stand = this.stands.get(key);
    if (!stand) {
      stand = new BrewingStand(Math.floor(x), Math.floor(y), Math.floor(z));
      this.stands.set(key, stand);
    }
    return stand;
  }

  /** True when the block at this position is brewing, so a caller can tell "idle" from "running". */
  isBrewingAt(x, y, z) {
    return this.getStand(x, y, z)?.isBrewing === true;
  }

  /**
   * Advance every stand by `dt` seconds.
   *
   * This is what makes a brew take 20 seconds of game time rather than happening the instant the player
   * closes the window. `BrewingStand.update` already modelled the timer correctly, but nothing ever
   * called it: a stand never entered its brewing state, so the timer never ran and the progress bar in
   * the GUI was decorative.
   *
   * @returns {number} how many brewing stages completed this tick
   */
  update(dt) {
    let completed = 0;
    for (const stand of this.stands.values()) {
      if (stand.update(dt)) completed++;
    }
    return completed;
  }

  /** Drop the stand at a position, for when its block is broken. */
  removeStand(x, y, z) {
    const key = this.getKey(x, y, z);
    const stand = this.stands.get(key) ?? null;
    this.stands.delete(key);
    return stand;
  }
}
