// Every tipped arrow this game has: its id, its name (the wiki's "Arrow of ..."), and the potion it is tipped with.
// Pure data, so blocks.js can register the items and tippedArrows.js read the potions without importing each other.
// The first three were the only ones until the recipe parity audit (src/resourceRecipeAudit.js): the wiki crafts an
// arrow from eight arrows around a lingering potion of any effect, and the game had lingering potions of all of
// them and arrows of three.
export const TIPPED_ARROWS = [
  { id: 'tipped_arrow_slowness', name: 'Arrow of Slowness', potion: 'potion_of_slowness' },
  { id: 'tipped_arrow_weakness', name: 'Arrow of Weakness', potion: 'potion_of_weakness' },
  { id: 'tipped_arrow_poison', name: 'Arrow of Poison', potion: 'potion_of_poison' },
  { id: 'tipped_arrow_healing', name: 'Arrow of Healing', potion: 'potion_of_healing' },
  { id: 'tipped_arrow_harming', name: 'Arrow of Harming', potion: 'potion_of_harming' },
  { id: 'tipped_arrow_regeneration', name: 'Arrow of Regeneration', potion: 'potion_of_regeneration' },
  { id: 'tipped_arrow_swiftness', name: 'Arrow of Swiftness', potion: 'potion_of_swiftness' },
  { id: 'tipped_arrow_fire_resistance', name: 'Arrow of Fire Resistance', potion: 'potion_of_fire_resistance' },
  { id: 'tipped_arrow_leaping', name: 'Arrow of Leaping', potion: 'potion_of_leaping' },
  { id: 'tipped_arrow_strength', name: 'Arrow of Strength', potion: 'potion_of_strength' },
  { id: 'tipped_arrow_night_vision', name: 'Arrow of Night Vision', potion: 'potion_of_night_vision' },
  { id: 'tipped_arrow_invisibility', name: 'Arrow of Invisibility', potion: 'potion_of_invisibility' },
  { id: 'tipped_arrow_water_breathing', name: 'Arrow of Water Breathing', potion: 'potion_of_water_breathing' },
  { id: 'tipped_arrow_slow_falling', name: 'Arrow of Slow Falling', potion: 'potion_of_slow_falling' },
  { id: 'tipped_arrow_turtle_master', name: 'Arrow of the Turtle Master', potion: 'potion_of_turtle_master' },
  { id: 'tipped_arrow_oozing', name: 'Arrow of Oozing', potion: 'potion_of_oozing' },
  { id: 'tipped_arrow_weaving', name: 'Arrow of Weaving', potion: 'potion_of_weaving' },
  { id: 'tipped_arrow_wind_charging', name: 'Arrow of Wind Charging', potion: 'potion_of_wind_charging' },
  { id: 'tipped_arrow_infestation', name: 'Arrow of Infestation', potion: 'potion_of_infestation' },
  // Java's Arrow of Luck, from a lingering Potion of Luck (which only Creative and commands give).
  { id: 'tipped_arrow_luck', name: 'Arrow of Luck', potion: 'potion_of_luck' },
  // Java only: "If crafted with a water bottle, the arrow is called an arrow of Splashing", and it "behave[s] like
  // regular arrows" -- water carries no effect, so tippedArrowEffect gives it none.
  { id: 'tipped_arrow_splashing', name: 'Arrow of Splashing', potion: 'water_bottle' },
];
