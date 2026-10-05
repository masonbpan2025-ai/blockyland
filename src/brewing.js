/**
 * Minecraft Brewing & Alchemy Engine
 * Reference: https://minecraft.wiki/w/Brewing
 */

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
  potion_of_weakness_long: { name: 'Potion of Weakness (Extended)', color: '#475569', effect: 'weakness', duration: 240 }
};

// Base Brewing Recipes: (bottleId + ingredientId) -> resultId
export const BASE_BREWING_RECIPES = [
  // Awkward Potion (Foundation for most potions)
  { bottle: 'water_bottle', ingredient: 'nether_wart', result: 'awkward_potion' },
  { bottle: 'water_bottle', ingredient: 'fermented_spider_eye', result: 'potion_of_weakness' },
  { bottle: 'water_bottle', ingredient: 'glowstone_dust', result: 'thick_potion' },
  { bottle: 'water_bottle', ingredient: 'redstone', result: 'mundane_potion' },

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
  // The ingredient is `turtle_scute`; naming it `scute` meant no bottle could ever produce this
  // potion, because the ingredient id did not exist. The item itself was already registered.
  { bottle: 'awkward_potion', ingredient: 'turtle_scute', result: 'potion_of_turtle_master' },

  // Fermented Spider Eye Corruptions
  { bottle: 'potion_of_night_vision', ingredient: 'fermented_spider_eye', result: 'potion_of_invisibility' },
  { bottle: 'potion_of_night_vision_long', ingredient: 'fermented_spider_eye', result: 'potion_of_invisibility_long' },
  { bottle: 'potion_of_healing', ingredient: 'fermented_spider_eye', result: 'potion_of_harming' },
  { bottle: 'potion_of_healing_2', ingredient: 'fermented_spider_eye', result: 'potion_of_harming_2' },
  { bottle: 'potion_of_poison', ingredient: 'fermented_spider_eye', result: 'potion_of_harming' },
  { bottle: 'potion_of_poison_2', ingredient: 'fermented_spider_eye', result: 'potion_of_harming_2' },
  { bottle: 'potion_of_poison_long', ingredient: 'fermented_spider_eye', result: 'potion_of_harming' },

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

  // Glowstone Dust Enhancement (Level II Potency)
  { bottle: 'potion_of_healing', ingredient: 'glowstone_dust', result: 'potion_of_healing_2' },
  { bottle: 'potion_of_regeneration', ingredient: 'glowstone_dust', result: 'potion_of_regeneration_2' },
  { bottle: 'potion_of_strength', ingredient: 'glowstone_dust', result: 'potion_of_strength_2' },
  { bottle: 'potion_of_swiftness', ingredient: 'glowstone_dust', result: 'potion_of_swiftness_2' },
  { bottle: 'potion_of_leaping', ingredient: 'glowstone_dust', result: 'potion_of_leaping_2' },
  { bottle: 'potion_of_poison', ingredient: 'glowstone_dust', result: 'potion_of_poison_2' },
  { bottle: 'potion_of_harming', ingredient: 'glowstone_dust', result: 'potion_of_harming_2' }
];

/**
 * Returns resulting potion id when given a bottle and ingredient, or null if no recipe matches
 */
export function getBrewingResult(bottleId, ingredientId) {
  if (!bottleId || !ingredientId) return null;

  // Gunpowder: converts any regular drinkable potion to a Splash potion
  if (ingredientId === 'gunpowder') {
    if (bottleId.startsWith('splash_') || bottleId.startsWith('lingering_')) return null;
    return `splash_${bottleId}`;
  }

  // Dragon's Breath: converts any Splash potion to a Lingering potion
  if (ingredientId === 'dragon_breath') {
    if (bottleId.startsWith('splash_')) {
      return bottleId.replace(/^splash_/, 'lingering_');
    }
    return null;
  }

  // Check prefix for splash and lingering
  let prefix = '';
  let coreBottle = bottleId;
  if (bottleId.startsWith('splash_')) {
    prefix = 'splash_';
    coreBottle = bottleId.replace(/^splash_/, '');
  } else if (bottleId.startsWith('lingering_')) {
    prefix = 'lingering_';
    coreBottle = bottleId.replace(/^lingering_/, '');
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
  const base = itemId.replace(/^(splash|lingering)_/, '');
  const data = POTION_DATA[base];
  if (!data) return null;
  return { id: itemId, base, ...data, splash, lingering };
}

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
    this.maxFuel = 20;
    this.brewTimer = 0; // 20.0 seconds when brewing
    this.brewDuration = 20.0;
    this.isBrewing = false;
  }

  /**
   * Adds Blaze Powder as fuel (1 Blaze Powder = 20 brewing operations)
   */
  addFuel(item) {
    if (!item || item.id !== 'blaze_powder') return false;
    if (this.fuel >= this.maxFuel) return false;

    this.fuel = Math.min(this.maxFuel, this.fuel + 20);
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
