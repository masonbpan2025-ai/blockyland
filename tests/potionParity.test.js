// Potions against the wiki's Potion page (https://minecraft.wiki/w/Potion), Java Edition: every variant in its tables
// with its effect, level and exact duration; the base potions; Luck, which cannot be brewed; the modifier and
// corruption rules; drinking (a second potion resets, never adds, and never downgrades); Healing and Harming reversed
// on the undead; and where potions come from -- the witch, the wandering trader, piglin bartering, fishing and the
// End ship. Brewing itself is tests/brewingParity.test.js; the effects' own numbers are statusEffectWikiLedger.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { POTION_DATA, UNBREWABLE_POTIONS, BASE_BREWING_RECIPES, getBrewingResult, BrewingManager } from '../src/brewing.js';
import { ITEMS, BLOCKS } from '../src/blocks.js';
import { effectsFor, instantOutcomeOnMob, immuneToEffect, isUndeadType } from '../src/statusEffects.js';
import { applyPotionEffect, drinkPotion } from '../src/potionUse.js';
import { Player } from '../src/player.js';
import { chooseWitchDrink, updateWitchDrinking, witchPotionDrop, WITCH_DRINKS, WITCH_DRINK_SECONDS } from '../src/witchPotions.js';
import { TRADES } from '../src/wanderingTraderBehavior.js';
import { PIGLIN_BARTER_LOOT } from '../src/piglin.js';
import { JUNK_LOOT } from '../src/fishing.js';
import { buildEndCity } from '../src/worldgen/generators/endCity.js';
import { World } from '../src/world.js';
import { throwSplashPotion } from '../src/splashPotion.js';
import { consumeSeconds } from '../src/eating.js';
import { readFileSync } from 'node:fs';

const m = (min, sec = 0) => min * 60 + sec;

// The page's three effect tables, Java's figures. [id, effect, duration in seconds (null: instant), level].
const WIKI_POTIONS = [
  // Potions with positive effects
  ['potion_of_regeneration', 'regeneration', m(0, 45), 1],
  ['potion_of_regeneration_long', 'regeneration', m(1, 30), 1],
  ['potion_of_regeneration_2', 'regeneration', 22.5, 2],
  ['potion_of_swiftness', 'speed', m(3), 1],
  ['potion_of_swiftness_long', 'speed', m(8), 1],
  ['potion_of_swiftness_2', 'speed', m(1, 30), 2],
  ['potion_of_fire_resistance', 'fire_resistance', m(3), 1],
  ['potion_of_fire_resistance_long', 'fire_resistance', m(8), 1],
  ['potion_of_healing', 'instant_health', null, 1],
  ['potion_of_healing_2', 'instant_health', null, 2],
  ['potion_of_night_vision', 'night_vision', m(3), 1],
  ['potion_of_night_vision_long', 'night_vision', m(8), 1],
  ['potion_of_strength', 'strength', m(3), 1],
  ['potion_of_strength_long', 'strength', m(8), 1],
  ['potion_of_strength_2', 'strength', m(1, 30), 2],
  ['potion_of_leaping', 'jump_boost', m(3), 1],
  ['potion_of_leaping_long', 'jump_boost', m(8), 1],
  ['potion_of_leaping_2', 'jump_boost', m(1, 30), 2],
  ['potion_of_water_breathing', 'water_breathing', m(3), 1],
  ['potion_of_water_breathing_long', 'water_breathing', m(8), 1],
  ['potion_of_invisibility', 'invisibility', m(3), 1],
  ['potion_of_invisibility_long', 'invisibility', m(8), 1],
  ['potion_of_slow_falling', 'slow_falling', m(1, 30), 1],
  ['potion_of_slow_falling_long', 'slow_falling', m(4), 1],
  ['potion_of_luck', 'luck', m(5), 1],
  // Potions with negative effects
  ['potion_of_poison', 'poison', m(0, 45), 1],
  ['potion_of_poison_long', 'poison', m(1, 30), 1],
  ['potion_of_poison_2', 'poison', 21.6, 2],
  ['potion_of_weakness', 'weakness', m(1, 30), 1],
  ['potion_of_weakness_long', 'weakness', m(4), 1],
  ['potion_of_slowness', 'slowness', m(1, 30), 1],
  ['potion_of_slowness_long', 'slowness', m(4), 1],
  ['potion_of_slowness_2', 'slowness', m(0, 20), 4],
  ['potion_of_harming', 'instant_damage', null, 1],
  ['potion_of_harming_2', 'instant_damage', null, 2],
  ['potion_of_infestation', 'infested', m(3), 1],
  ['potion_of_oozing', 'oozing', m(3), 1],
  ['potion_of_weaving', 'weaving', m(3), 1],
  ['potion_of_wind_charging', 'wind_charged', m(3), 1],
  // Potions with mixed effects
  ['potion_of_turtle_master', 'turtle_master', m(0, 20), 1],
  ['potion_of_turtle_master_long', 'turtle_master', m(0, 40), 1],
  ['potion_of_turtle_master_2', 'turtle_master', m(0, 20), 2],
];

test('every potion in the wiki\'s tables exists, with its effect, its level and its exact duration', () => {
  for (const [id, effect, seconds, level] of WIKI_POTIONS) {
    const p = POTION_DATA[id];
    assert.ok(p, `${id} exists`);
    assert.equal(p.effect, effect, `${id}: effect`);
    assert.equal(p.level ?? 1, level, `${id}: level`);
    if (seconds === null) assert.equal(p.duration, undefined, `${id} is instant`);
    else assert.equal(p.duration, seconds, `${id}: ${seconds} s`);
  }
  // And nothing with an effect that the page does not list.
  const listed = new Set(WIKI_POTIONS.map(([id]) => id));
  const extra = Object.entries(POTION_DATA).filter(([id, p]) => p.effect && !listed.has(id)).map(([id]) => id);
  assert.deepEqual(extra, []);
});

test('the instant potions: Healing 4 and 8, Harming 6 and 12, doubling with every level', () => {
  assert.equal(POTION_DATA.potion_of_healing.amount, 4);
  assert.equal(POTION_DATA.potion_of_healing_2.amount, 8);
  assert.equal(POTION_DATA.potion_of_harming.amount, 6);
  assert.equal(POTION_DATA.potion_of_harming_2.amount, 12);
});

test('the Turtle Master: Slowness IV with Resistance III, and Slowness VI with Resistance IV enhanced', () => {
  assert.deepEqual(effectsFor('turtle_master', 1), [['slowness', 4], ['resistance', 3]]);
  assert.deepEqual(effectsFor('turtle_master', 2), [['slowness', 6], ['resistance', 4]]);
});

test('the base potions are potions with no effect, and the water bottle is one', () => {
  for (const id of ['water_bottle', 'awkward_potion', 'mundane_potion', 'thick_potion']) {
    assert.ok(POTION_DATA[id], id);
    assert.equal(POTION_DATA[id].effect, undefined, `${id} has no effect`);
  }
});

test('the Potion of Luck: in all three forms, in the Creative inventory, and not brewable', () => {
  assert.deepEqual([...UNBREWABLE_POTIONS], ['potion_of_luck']);
  for (const id of ['potion_of_luck', 'splash_potion_of_luck', 'lingering_potion_of_luck']) {
    assert.ok(ITEMS[id], `${id} is an item`);
    assert.equal(ITEMS[id].stackSize, 1, 'potions do not stack');
  }
  assert.ok(!BASE_BREWING_RECIPES.some((r) => r.result.includes('luck')), 'no recipe makes it');
  for (const bottle of Object.keys(POTION_DATA)) for (const ingredient of ['nether_wart', 'redstone', 'glowstone_dust', 'fermented_spider_eye', 'rabbit_foot', 'golden_carrot']) {
    assert.ok(!String(getBrewingResult(bottle, ingredient) ?? '').includes('luck'), `${bottle} + ${ingredient}`);
  }
});

test('modifiers: redstone extends by 8/3 for the 3:00 potions, glowstone enhances, and the two never combine', () => {
  for (const id of ['potion_of_swiftness', 'potion_of_strength', 'potion_of_leaping', 'potion_of_night_vision', 'potion_of_fire_resistance', 'potion_of_water_breathing', 'potion_of_invisibility']) {
    assert.equal(getBrewingResult(id, 'redstone'), `${id}_long`);
    assert.equal(POTION_DATA[`${id}_long`].duration, POTION_DATA[id].duration * 8 / 3);
  }
  assert.equal(getBrewingResult('potion_of_swiftness', 'glowstone_dust'), 'potion_of_swiftness_2');
  // "The modifications of enhancement and extension are mutually exclusive."
  assert.notEqual(getBrewingResult('potion_of_swiftness_long', 'glowstone_dust'), 'potion_of_swiftness_2');
  assert.notEqual(getBrewingResult('potion_of_swiftness_2', 'redstone'), 'potion_of_swiftness_long');
  // Gunpowder makes a splash potion, dragon's breath a lingering one of a splash potion.
  assert.equal(getBrewingResult('potion_of_healing', 'gunpowder'), 'splash_potion_of_healing');
  assert.equal(getBrewingResult('splash_potion_of_healing', 'dragon_breath'), 'lingering_potion_of_healing');
});

test('corruption, as the page lists it', () => {
  const eye = 'fermented_spider_eye';
  assert.equal(getBrewingResult('potion_of_swiftness', eye), 'potion_of_slowness');
  assert.equal(getBrewingResult('potion_of_leaping', eye), 'potion_of_slowness');
  // Poison makes Harming, not Regeneration; Night Vision makes Invisibility, not Blindness.
  assert.equal(getBrewingResult('potion_of_poison', eye), 'potion_of_harming');
  assert.equal(getBrewingResult('potion_of_healing', eye), 'potion_of_harming');
  assert.equal(getBrewingResult('potion_of_night_vision', eye), 'potion_of_invisibility');
  // Weakness comes from a water bottle, not from Strength.
  assert.equal(getBrewingResult('water_bottle', eye), 'potion_of_weakness');
  assert.notEqual(getBrewingResult('potion_of_strength', eye), 'potion_of_weakness');
  // The modifier carries over where the corrupted effect has it...
  assert.equal(getBrewingResult('potion_of_swiftness_long', eye), 'potion_of_slowness_long');
  assert.equal(getBrewingResult('potion_of_poison_2', eye), 'potion_of_harming_2');
  assert.equal(getBrewingResult('potion_of_night_vision_long', eye), 'potion_of_invisibility_long');
  // ...except enhanced Slowness, which "cannot be brewed by corrupting an enhanced potion of Swiftness or Leaping".
  assert.notEqual(getBrewingResult('potion_of_swiftness_2', eye), 'potion_of_slowness_2');
  assert.notEqual(getBrewingResult('potion_of_leaping_2', eye), 'potion_of_slowness_2');
});

/** A player with only what applyStatusEffect needs. */
function player() {
  const p = Object.create(Player.prototype);
  p.statusEffects = new Map(); p.health = 20; p.maxHealth = 20; p.absorption = 0;
  return p;
}

test('drinking: the bottle comes back, and a second potion resets the time rather than adding to it', () => {
  const p = player(), given = [];
  const inventory = { consumeActiveItem: () => given.push('drunk'), addItem: (id) => given.push(id) };
  drinkPotion('potion_of_swiftness', p, inventory);
  assert.deepEqual(given, ['drunk', 'glass_bottle']);
  p.statusEffects.get('speed').duration = 60; // two minutes later
  drinkPotion('potion_of_swiftness', p, inventory);
  assert.equal(p.statusEffects.get('speed').duration, 180, 'reset to 3:00, not 4:00');
});

test('drinking: a weaker potion does not downgrade a stronger effect', () => {
  const p = player();
  applyPotionEffect(POTION_DATA.potion_of_regeneration_2, p);
  applyPotionEffect(POTION_DATA.potion_of_regeneration, p);
  assert.equal(p.statusEffects.get('regeneration').level, 2, '"drinking a regular potion of Regeneration does not have any effect"');
  assert.equal(p.statusEffects.get('regeneration').duration, 22.5);
});

test('the undead: Healing hurts them and Harming heals them; Poison and Regeneration do nothing to them', () => {
  assert.deepEqual(instantOutcomeOnMob('instant_health', 1, 'zombie'), { damage: 6 });
  assert.deepEqual(instantOutcomeOnMob('instant_health', 2, 'skeleton'), { damage: 12 });
  assert.deepEqual(instantOutcomeOnMob('instant_damage', 1, 'zombie'), { heal: 4 });
  assert.deepEqual(instantOutcomeOnMob('instant_health', 1, 'cow'), { heal: 4 });
  assert.deepEqual(instantOutcomeOnMob('instant_damage', 2, 'cow'), { damage: 12 });
  for (const type of ['zombie', 'skeleton', 'husk', 'drowned', 'stray', 'phantom', 'zombified_piglin', 'wither_skeleton']) {
    assert.ok(isUndeadType(type), type);
    assert.ok(immuneToEffect('poison', type) && immuneToEffect('regeneration', type), `${type} ignores Poison and Regeneration`);
  }
  assert.ok(!isUndeadType('cow') && !isUndeadType('creeper'));
});

test('a splash of Healing hurts a zombie and heals a cow; a splash of Harming the other way round', () => {
  const at = (x) => ({ x, y: 0, z: 0 });
  const damaged = [];
  const zombie = { type: 'zombie', health: 10, maxHealth: 20, mesh: { position: at(0) } };
  const cow = { type: 'cow', health: 5, maxHealth: 10, mesh: { position: at(1) } };
  const game = { mobs: { mobs: [zombie, cow], damageMob: (mob, amount) => { damaged.push([mob.type, amount]); mob.health -= amount; } } };
  throwSplashPotion(game, at(0), 'splash_potion_of_healing');
  assert.deepEqual(damaged, [['zombie', 6]]);
  assert.equal(cow.health, 9);
  damaged.length = 0;
  throwSplashPotion(game, at(0), 'splash_potion_of_harming');
  assert.deepEqual(damaged, [['cow', 6]]);
  assert.equal(zombie.health, 8, 'the zombie is healed by 4');
});

// --- where potions come from -------------------------------------------------------------------------------------

const always = () => 0, never = () => 0.99;
const calm = { submerged: false, burning: false, health: 26, maxHealth: 26, targetDistance: 5 };

test('a witch drinks Water Breathing, Fire Resistance, Healing or Swiftness, when and as often as the wiki says', () => {
  assert.deepEqual(WITCH_DRINKS.map((d) => [d.potion, d.chance]), [
    ['potion_of_water_breathing', 0.15], ['potion_of_fire_resistance', 0.15], ['potion_of_healing', 0.05], ['potion_of_swiftness', 0.5],
  ]);
  assert.equal(chooseWitchDrink(calm, always), null, 'nothing to drink for');
  assert.equal(chooseWitchDrink({ ...calm, submerged: true }, always), 'potion_of_water_breathing');
  assert.equal(chooseWitchDrink({ ...calm, burning: true }, always), 'potion_of_fire_resistance');
  assert.equal(chooseWitchDrink({ ...calm, health: 20 }, always), 'potion_of_healing');
  assert.equal(chooseWitchDrink({ ...calm, targetDistance: 11 }, always), 'potion_of_swiftness');
  assert.equal(chooseWitchDrink({ ...calm, targetDistance: 10.9 }, always), null, 'eleven or more blocks');
  assert.equal(chooseWitchDrink({ ...calm, submerged: true, effects: { water_breathing: 60 } }, always), null, 'not one it has');
  assert.equal(chooseWitchDrink({ ...calm, health: 1 }, never), null, 'a 5% chance, not a certainty');
});

test('a witch\'s drink takes 1.6 seconds; Healing restores 4 HP', () => {
  const witch = { health: 18, maxHealth: 26 };
  const start = updateWitchDrinking(witch, 0.05, { ...calm, health: 18 }, always);
  assert.equal(start.started, 'potion_of_healing');
  assert.equal(WITCH_DRINK_SECONDS, 1.6);
  assert.equal(updateWitchDrinking(witch, 1.5, calm, always).finished, null);
  assert.equal(witch.health, 18);
  assert.equal(updateWitchDrinking(witch, 0.11, calm, always).finished, 'potion_of_healing');
  assert.equal(witch.health, 22);
});

test('a witch killed while drinking drops that potion 8.5% of the time, plus 1% a Looting level, for a player\'s kill', () => {
  const drinking = { isDrinking: true, drinkingPotion: 'potion_of_fire_resistance', playerDamaged: true };
  assert.equal(witchPotionDrop(drinking, () => 0.084), 'potion_of_fire_resistance');
  assert.equal(witchPotionDrop(drinking, () => 0.086), null);
  assert.equal(witchPotionDrop({ ...drinking, lootingLevel: 3 }, () => 0.114), 'potion_of_fire_resistance');
  assert.equal(witchPotionDrop({ ...drinking, playerDamaged: false }, always), null, 'only for a player\'s kill');
  assert.equal(witchPotionDrop({ ...drinking, isDrinking: false }, always), null, 'only while drinking');
});

test('the wandering trader sells the extended Potion of Invisibility for 5 emeralds', () => {
  const rows = Object.values(TRADES).flat().filter((r) => String(r.give).includes('invisibility'));
  assert.deepEqual(rows.map((r) => [r.give, r.giveCount, r.want, r.wantCount]), [['potion_of_invisibility_long', 1, 'emerald', 5]]);
  assert.equal(POTION_DATA.potion_of_invisibility_long.duration, m(8));
});

test('piglins barter a water bottle 10/469 and a Potion of Fire Resistance 8/469 of the time; fishing catches water bottles', () => {
  const total = PIGLIN_BARTER_LOOT.reduce((sum, row) => sum + row.weight, 0);
  assert.equal(total, 469);
  assert.equal(PIGLIN_BARTER_LOOT.find((r) => r.id === 'water_bottle').weight, 10);
  assert.equal(PIGLIN_BARTER_LOOT.find((r) => r.id === 'potion_of_fire_resistance').weight, 8);
  assert.ok(JUNK_LOOT.water_bottle > 0, 'water bottles are fishing junk');
});

test('the End ship\'s brewing stand holds two potions of Healing II, put in its bottle slots when the ship is placed', () => {
  let stand = null;
  for (let s = 1; s <= 200 && !stand; s++) {
    const { canvas, ships } = buildEndCity({ seed: s, x: 0, y: 29, z: 0 });
    if (ships) stand = [...canvas.cells.values()].find((c) => c.name === 'brewing_stand' && c.nbt?.extra);
  }
  assert.ok(stand, 'a ship\'s brewing stand is stocked');
  assert.deepEqual(stand.nbt.extra.map((i) => i.id), ['potion_of_healing_2', 'potion_of_healing_2']);
  // Placed: the world puts them in a stand at that block, once.
  const world = new World(), brewing = new BrewingManager();
  world.game = { ui: { brewingManager: brewing } };
  const request = { x: 4, y: 60, z: 7, id: BLOCKS.BREWING_STAND, extraItems: stand.nbt.extra };
  assert.equal(world.applyStructureOrientation(request), true);
  assert.deepEqual(brewing.getStand(4, 60, 7).bottles.map((b) => b?.id ?? null), ['potion_of_healing_2', 'potion_of_healing_2', null]);
  brewing.getStand(4, 60, 7).bottles[0] = null; // taken
  world.applyStructureOrientation(request);
  assert.equal(brewing.getStand(4, 60, 7).bottles[0], null, 'not refilled when the chunk is placed again');
});

test('potions do not stack, and every one is drunk in 32 ticks (the page\'s consumption time)', () => {
  for (const [id] of WIKI_POTIONS) {
    assert.equal(ITEMS[id]?.stackSize, 1, id);
    assert.equal(consumeSeconds(id), 1.6, `${id}: 32 ticks`);
  }
  // Drunk by holding use for that time (eating.js), not on the click: the use chain starts it, the timer finishes it.
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /isDrinkablePotion\(potionItem\.id\)\) \{\s*(\/\/[^\n]*\s*)*this\.eating\.start\(potionItem/);
});

test('brewing stands are saved with the world: what they hold, their fuel and how far the brew has got', () => {
  const brewing = new BrewingManager();
  const stand = brewing.getOrCreateStand(4, 60, 7);
  stand.bottles = [{ id: 'potion_of_healing_2', count: 1 }, null, { id: 'awkward_potion', count: 1 }];
  stand.ingredient = { id: 'glowstone_dust', count: 3 }; stand.fuel = 12; stand.brewTimer = 7.5; stand.isBrewing = true;
  brewing.getOrCreateStand(0, 0, 0); // opened and left empty: nothing to save
  const saved = JSON.parse(JSON.stringify(brewing.serialize()));
  assert.equal(saved.length, 1);
  const loaded = new BrewingManager();
  loaded.getOrCreateStand(9, 9, 9);
  loaded.restore(saved);
  const back = loaded.getStand(4, 60, 7);
  assert.deepEqual(back.bottles.map((b) => b?.id ?? null), ['potion_of_healing_2', null, 'awkward_potion']);
  assert.deepEqual([back.ingredient.id, back.ingredient.count, back.fuel, back.brewTimer, back.isBrewing], ['glowstone_dust', 3, 12, 7.5, true]);
  assert.equal(loaded.getStand(9, 9, 9), null, 'the save replaces what was there');
  const mapManager = readFileSync('src/mapManager.js', 'utf8');
  assert.match(mapManager, /brewingStands: \(game\.ui\?\.brewingManager \?\? game\.brewingManager\)\?\.serialize/);
  assert.equal((mapManager.match(/brewingManager\)\?\.restore\?\.\(mapData\.brewingStands\)/g) ?? []).length, 2, 'both load paths');
});

test('the Uncraftable Potion: Java\'s potion with no contents, drinkable, with no effect and the water bottle\'s look', () => {
  assert.equal(ITEMS.potion.name, 'Uncraftable Potion');
  assert.equal(ITEMS.potion.icon, ITEMS.water_bottle.icon);
  assert.equal(ITEMS.potion.stackSize, 1);
  const p = player(), given = [];
  const result = drinkPotion('potion', p, { consumeActiveItem: () => given.push('drunk'), addItem: (id) => given.push(id) });
  assert.equal(result.drunk, true);
  assert.equal(result.effect, null);
  assert.deepEqual(given, ['drunk', 'glass_bottle']);
  assert.equal(p.statusEffects.size, 0);
});

test('the Arrow of Luck: a tipped arrow of the Potion of Luck, an eighth of its 5:00 in whole seconds, as the other arrows', async () => {
  const { TIPPED_ARROWS } = await import('../src/tippedArrowItems.js');
  const { tippedArrowEffect } = await import('../src/tippedArrows.js');
  assert.ok(TIPPED_ARROWS.some((a) => a.id === 'tipped_arrow_luck' && a.name === 'Arrow of Luck' && a.potion === 'potion_of_luck'));
  assert.ok(ITEMS.tipped_arrow_luck);
  assert.deepEqual(tippedArrowEffect('tipped_arrow_luck'), { id: 'luck', duration: 37, level: 1 });
});
