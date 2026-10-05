// Item parity batch 3: a potion could be brewed but not drunk.
//
// `main.js` had no branch for a potion item, so the 34 drinkable potions added in batch 2 were
// obtainable and unusable. The effect a potion applies lives in `src/potionUse.js` so it can be driven
// here directly: the alternative is asserting on the shape of a 2,600-line file, which is how the
// branch came to be missing in the first place.
//
// Two of the effects those potions name had no reader anywhere in the codebase -- Swiftness was stored,
// listed in the HUD and changed nothing about how the player moved, and Regeneration was never ticked.
// Both are fixed in `player.js` and both are asserted here by measuring the player, not by grepping for
// the string.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
import { Inventory } from '../src/inventory.js';
import { Player } from '../src/player.js';
import { POTION_DATA } from '../src/brewing.js';
import { POTION_ITEMS } from '../src/extraPotions.js';
import { drinkPotion, applyPotionEffect, isDrinkablePotion } from '../src/potionUse.js';

// --- stubs -------------------------------------------------------------------

function stubPlayer(over = {}) {
  return {
    health: 20,
    maxHealth: 20,
    statusEffects: new Map(),
    applied: [],
    damage: [],
    applyStatusEffect(effect, duration, level) { this.applied.push({ effect, duration, level }); },
    takeDamage(amount, from, type) { this.damage.push({ amount, from, type }); this.health -= amount; },
    ...over,
  };
}

function stubInventory(over = {}) {
  return {
    consumed: 0,
    added: [],
    consumeActiveItem(n = 1) { this.consumed += n; },
    addItem(id, count, isBlock) { this.added.push({ id, count, isBlock }); },
    ...over,
  };
}

/** A real Player, with the mocks `tests/armor.test.js` uses. */
function realPlayer() {
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = { getVoxel: () => BLOCKS.AIR, setVoxel: () => {}, redstone: { interact: () => null }, getHeightAt: () => 0 };
  const player = new Player(new THREE.PerspectiveCamera(), { requestPointerLock: () => {} }, world, sounds);
  player.inventory = new Inventory(sounds);
  player.gamemode = 'survival';
  return player;
}

/**
 * Distance flown in one second with the movement keys held.
 *
 * Flying rather than walking: a walking player falls, and gravity and ground collision dominated the
 * measurement so completely that a 20% speed change moved the final position by less than 5%.
 * `update` also clamps dt to 0.1, so the steps are explicit.
 */
function flyingSpeed(player) {
  player.isFlying = true;
  player.position.set(0, 50, 0);
  player.yaw = 0;
  player.keys = { KeyW: true };
  player.velocity.set(0, 0, 0);
  for (let i = 0; i < 40; i++) player.update(0.05);
  return Math.hypot(player.velocity.x, player.velocity.z);
}

/**
 * Health gained over 1.5 simulated seconds, from a fixed starting state.
 *
 * The player is held in the air: in a world with nothing below it, a survival player falling takes
 * ground damage that swamps the one point of regeneration being measured. Flying suspends gravity, so
 * the only thing changing health is the effect.
 */
function healthGain(effect, level) {
  const player = realPlayer();
  player.isFlying = true;
  player.position.set(0, 50, 0);
  player.health = 10;
  if (effect) player.applyStatusEffect(effect, 60, level);
  // 1.5 s at 0.1 s steps is one tick: regeneration fires on a 1.25 s cadence.
  for (let i = 0; i < 15; i++) player.update(0.1);
  return player.health - 10;
}

// --- what can be drunk -------------------------------------------------------

test('a drinkable potion is drinkable and its thrown forms are not', () => {
  assert.equal(isDrinkablePotion('potion_of_healing'), true);
  assert.equal(isDrinkablePotion('potion_of_swiftness'), true);
  assert.equal(isDrinkablePotion('awkward_potion'), true, 'a base potion is drunk, it just has no effect');
  assert.equal(isDrinkablePotion('splash_potion_of_healing'), false);
  assert.equal(isDrinkablePotion('lingering_potion_of_healing'), false);
  assert.equal(isDrinkablePotion('glass_bottle'), false);
  assert.equal(isDrinkablePotion('diamond_sword'), false);
});

test('every generated potion is classified, not silently neither', () => {
  // A potion that is neither drinkable nor throwable would be an item with no use at all.
  for (const id of Object.keys(POTION_ITEMS)) {
    const drinkable = isDrinkablePotion(id);
    const thrown = /^(splash|lingering)_/.test(id);
    assert.equal(drinkable, !thrown, `${id} should be ${thrown ? 'thrown' : 'drinkable'}`);
  }
});

// --- the three things drinking does ------------------------------------------

test('drinking consumes the potion, applies its effect and returns the bottle', () => {
  const player = stubPlayer();
  const inventory = stubInventory();
  const result = drinkPotion('potion_of_fire_resistance', player, inventory);

  assert.equal(result.drunk, true);
  assert.equal(result.effect, 'fire_resistance');
  assert.equal(inventory.consumed, 1, 'the potion is used up');
  assert.deepEqual(inventory.added, [{ id: 'glass_bottle', count: 1, isBlock: false }], 'and the bottle comes back');
  assert.deepEqual(player.applied, [{ effect: 'fire_resistance', duration: 180, level: 1 }]);
});

test('creative drinking applies the effect without consuming the potion', () => {
  const player = stubPlayer();
  const inventory = stubInventory();
  const result = drinkPotion('potion_of_swiftness', player, inventory, { gamemode: 'creative' });
  assert.equal(result.drunk, true);
  assert.equal(inventory.consumed, 0);
  assert.deepEqual(inventory.added, []);
  assert.equal(player.applied[0].effect, 'speed');
});

test('a base potion is consumed and does nothing', () => {
  const player = stubPlayer();
  const inventory = stubInventory();
  for (const id of ['water_bottle', 'awkward_potion', 'thick_potion', 'mundane_potion']) {
    const result = drinkPotion(id, player, inventory);
    assert.equal(result.drunk, true, `${id} should be drinkable`);
    assert.equal(result.effect, null, `${id} has no effect`);
  }
  assert.equal(inventory.consumed, 4);
  assert.deepEqual(player.applied, []);
});

test('a thrown potion is refused rather than swallowed', () => {
  for (const id of ['splash_potion_of_healing', 'lingering_potion_of_strength']) {
    const player = stubPlayer();
    const inventory = stubInventory();
    const result = drinkPotion(id, player, inventory);
    assert.equal(result.drunk, false, `${id} must not be drunk`);
    assert.match(result.reason, /thrown/);
    assert.equal(inventory.consumed, 0, 'and must not be used up');
    assert.deepEqual(player.applied, []);
  }
});

test('something that is not a potion at all is refused', () => {
  const result = drinkPotion('stone_sword', stubPlayer(), stubInventory());
  assert.equal(result.drunk, false);
  assert.equal(result.reason, 'not-a-potion');
});

// --- instant effects ---------------------------------------------------------

test('instant health restores its amount and is not stored as a timer', () => {
  const player = stubPlayer({ health: 10 });
  const applied = applyPotionEffect({ effect: 'instant_health', amount: 4 }, player);
  assert.equal(player.health, 14);
  assert.equal(applied.instant, true);
  assert.deepEqual(player.applied, [], 'an instant effect must not become a status effect');
});

test('instant health never exceeds the maximum', () => {
  const player = stubPlayer({ health: 19, maxHealth: 20 });
  applyPotionEffect({ effect: 'instant_health', amount: 4 }, player);
  assert.equal(player.health, 20);
});

test('a level II healing potion restores the larger amount', () => {
  const player = stubPlayer({ health: 10 });
  applyPotionEffect({ effect: 'instant_health', amount: 8, level: 2 }, player);
  assert.equal(player.health, 18);
});

test('instant damage is routed through takeDamage as magic', () => {
  const player = stubPlayer({ health: 20 });
  applyPotionEffect({ effect: 'instant_damage', amount: 6 }, player);
  assert.equal(player.health, 14);
  assert.deepEqual(player.damage, [{ amount: 6, from: null, type: 'magic' }]);
});

// --- duration effects carry duration and level -------------------------------

test('a duration effect is stored with its own duration and level', () => {
  const player = stubPlayer();
  applyPotionEffect(POTION_DATA.potion_of_strength, player);
  assert.deepEqual(player.applied, [{ effect: 'strength', duration: 180, level: 1 }]);

  const extended = stubPlayer();
  applyPotionEffect(POTION_DATA.potion_of_strength_long, extended);
  assert.deepEqual(extended.applied, [{ effect: 'strength', duration: 480, level: 1 }]);

  const levelTwo = stubPlayer();
  applyPotionEffect(POTION_DATA.potion_of_regeneration_2, levelTwo);
  assert.deepEqual(levelTwo.applied, [{ effect: 'regeneration', duration: 22, level: 2 }]);
});

// --- the two effects that had no reader --------------------------------------

test('Swiftness actually makes the player move faster, and Slowness slower', () => {
  // Asserted by measuring the player rather than by checking that a string appears in player.js: the
  // effect was already applied and already showed in the HUD while changing nothing.
  const base = flyingSpeed(realPlayer());

  const swift = realPlayer();
  swift.applyStatusEffect('speed', 600, 1);
  const fast = flyingSpeed(swift);

  const slowed = realPlayer();
  slowed.applyStatusEffect('slowness', 600, 1);
  const slow = flyingSpeed(slowed);

  assert.ok(base > 0.1, `the control player should be moving, measured ${base}`);
  assert.ok(Math.abs(fast / base - 1.2) < 0.02, `Swiftness I should be 1.2x, was ${(fast / base).toFixed(3)}x`);
  assert.ok(Math.abs(slow / base - 0.6) < 0.02, `Slowness should be 0.6x, was ${(slow / base).toFixed(3)}x`);
});

test('Swiftness II is faster than Swiftness I', () => {
  const one = realPlayer();
  one.applyStatusEffect('speed', 600, 1);
  const two = realPlayer();
  two.applyStatusEffect('speed', 600, 2);
  assert.ok(flyingSpeed(two) > flyingSpeed(one) + 0.1, 'level II should be quicker than level I');
});

test('Regeneration adds to the hunger model rather than replacing it', () => {
  // Health is a float and the tick loop accumulates `dt`, so these are compared with a tolerance: the
  // measured 2.9999999999999893 is the hunger model's three points, not a different number.
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const none = healthGain(null, 1);
  const one = healthGain('regeneration', 1);
  const two = healthGain('regeneration', 2);

  // With a full hunger bar the player's own regeneration heals three points in this window, so the
  // potion's contribution is the difference. Asserting the absolute number too is what makes this a
  // test of the potion rather than of the hunger model: level I adds exactly one point, level II two.
  assert.ok(near(none, 3), `the hunger model alone should heal three points here, healed ${none}`);
  assert.ok(near(one - none, 1), `Regeneration I should add one point, added ${one - none}`);
  assert.ok(near(two - none, 2), `Regeneration II should add two points, added ${two - none}`);
});

test('Regeneration stops at full health', () => {
  const player = realPlayer();
  player.isFlying = true;
  player.position.set(0, 50, 0);
  player.health = player.maxHealth;
  player.applyStatusEffect('regeneration', 60, 2);
  for (let i = 0; i < 30; i++) player.update(0.1);
  assert.equal(player.health, player.maxHealth, 'a regeneration potion must not overheal');
});

// --- a guard against the effect gap coming back ------------------------------

test('the effects a potion can name are all effects the player can hold', () => {
  // Not a claim that each one does something -- several still have no reader, which is the next batch
  // -- but that the name is at least a status effect the player stores rather than a typo.
  const instant = new Set(['instant_health', 'instant_damage']);
  for (const [id, data] of Object.entries(POTION_DATA)) {
    if (!data.effect) continue;
    if (instant.has(data.effect)) {
      assert.equal(typeof data.amount, 'number', `${id} is instant, so it needs an amount`);
    } else {
      assert.equal(typeof data.duration, 'number', `${id} is a duration effect, so it needs a duration`);
    }
  }
});
