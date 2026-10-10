// Item parity batch 8: the effects that did nothing, and the two foods that were supposed to hand them out.
//
// Three shapes of the same defect, all found by asking which effects have a reader rather than by
// reading the items.
//
// 1. `absorption` was named in the effect table and nowhere else in the game. Vanilla's Absorption is a
//    shield in front of the health bar, and the only two items that grant it are the golden apples -- so
//    neither apple did the thing it exists for.
// 2. `turtle_master` was not in the effect table at all. The Potion of the Turtle Master could be brewed,
//    drunk, shown in the HUD and did nothing whatsoever.
// 3. `jump_boost` had only half a reader: the fall half worked after the fall-damage batch, and the jump
//    half never did, so a Potion of Leaping made a player land softly and jump normally.
//
// The golden apple also fed twice what it should. That is a fourth thing, found by tightening the
// Inspector's `edible` check rather than by looking at the item: the check compared `foodData.js` against
// vanilla and never compared the item against `foodData.js`, so a table that was right and an item that
// disagreed with it both passed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import { EXTRA_ITEMS } from '../src/extraItems.js';
import { FOODS } from '../src/foodData.js';
import { Inventory } from '../src/inventory.js';
import { Player } from '../src/player.js';
import { POTION_DATA } from '../src/brewing.js';
import { drinkPotion } from '../src/potionUse.js';
import { RESOURCE_CHECKS } from '../src/resourceShowcase.js';
import {
  absorptionShield, jumpVelocityMultiplier, compoundEffects, EFFECTS,
} from '../src/statusEffects.js';

const near = (actual, expected, message) => {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
};

const atLevel = (name, level = 1) => new Map([[name, { duration: 30, level }]]);

/** A player standing on a single block of stone at y = 4. */
function standing({ gamemode = 'survival' } = {}) {
  const camera = new THREE.PerspectiveCamera();
  const domElement = { requestPointerLock: () => {} };
  const sounds = { playHurt: () => {}, playStep: () => {}, playShieldBlock: () => {}, playClick: () => {} };
  const world = {
    getVoxel: (x, y, z) => (y === 4 ? BLOCKS.STONE : BLOCKS.AIR),
    setVoxel: () => {},
    redstone: { interact: () => null },
  };
  const player = new Player(camera, domElement, world, sounds);
  player.inventory = new Inventory(sounds);
  player.gamemode = gamemode;
  player.health = 20;
  player.position.set(0.5, 5, 0.5);
  player.invulnerableTimer = 0;
  return player;
}

/**
 * The speed the player actually moves at, measured the way `tests/itemPotionDrinking.test.js` does it:
 * fly mode so gravity and terrain are out of the picture, hold forward, and read the velocity.
 *
 * `selectBaseSpeed` is not enough on its own -- the effect multipliers are applied in `update`, which is
 * the point, so a test that reads the base speed would pass whether or not the effect works.
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

// --- Absorption --------------------------------------------------------------

test('Absorption is four points per level, and a stronger dose does not stack', () => {
  assert.equal(absorptionShield(atLevel('absorption', 1)), 4, 'level I is two hearts');
  assert.equal(absorptionShield(atLevel('absorption', 4)), 16);
  assert.equal(absorptionShield(new Map()), 0);
  assert.equal(absorptionShield(atLevel('speed', 3)), 0, 'an unrelated effect grants none');

  const player = standing();
  player.applyStatusEffect('absorption', 120, 1);
  assert.equal(player.absorption, 4);
  // The second apple takes the larger shield rather than adding to the first, or two apples would be
  // sixteen points where vanilla gives four.
  player.applyStatusEffect('absorption', 120, 4);
  assert.equal(player.absorption, 16);
  player.applyStatusEffect('absorption', 120, 1);
  assert.equal(player.absorption, 16, 'a weaker dose must not replace a stronger shield');
});

test('the shield takes the damage first and the health bar does not move', () => {
  const player = standing();
  player.applyStatusEffect('absorption', 120, 4); // 16 points
  player.takeDamage(5, null, 'generic');
  assert.equal(player.health, 20, 'health is untouched while shield remains');
  assert.equal(player.absorption, 11);
  player.invulnerableTimer = 0;
  player.takeDamage(4, null, 'generic');
  assert.equal(player.absorption, 7);
  assert.equal(player.health, 20);
});

test('damage past the shield reaches the health bar, and the shield does not heal', () => {
  const player = standing();
  player.applyStatusEffect('absorption', 120, 1); // 4 points
  player.takeDamage(10, null, 'generic');
  assert.equal(player.absorption, 0, 'the shield is spent');
  assert.equal(player.health, 14, 'the remaining six points reach health');
  // It is a shield, not a heal: nothing is given back, and the pool does not refill on its own.
  assert.ok(player.health < 20);
  player.invulnerableTimer = 0;
  player.takeDamage(1, null, 'generic');
  assert.equal(player.absorption, 0, 'the pool stays empty');
  assert.equal(player.health, 13);
});

test('a shield can absorb a blow that would otherwise have been fatal', () => {
  const shielded = standing();
  shielded.applyStatusEffect('absorption', 120, 4); // 16
  shielded.takeDamage(20, null, 'generic');
  assert.ok(shielded.health > 0, `expected to survive, health ${shielded.health}`);

  const bare = standing();
  bare.takeDamage(20, null, 'generic');
  assert.equal(bare.health, 0, 'the same blow kills without the shield');
});

// --- Jump Boost --------------------------------------------------------------

test('Jump Boost scales the jump the way vanilla scales its own', () => {
  near(jumpVelocityMultiplier(new Map()), 1, 'no effect');
  near(jumpVelocityMultiplier(atLevel('jump_boost', 1)), 0.52 / 0.42, 'level I');
  near(jumpVelocityMultiplier(atLevel('jump_boost', 2)), 0.62 / 0.42, 'level II');
  assert.ok(jumpVelocityMultiplier(atLevel('jump_boost', 1)) > 1);
  // Height goes as the square of velocity, so level I should clear about 1.9 blocks against the base
  // 1.25. This is the check that the rule is scaled rather than a flat added number.
  const ratio = jumpVelocityMultiplier(atLevel('jump_boost', 1));
  assert.ok(ratio ** 2 > 1.4 && ratio ** 2 < 1.6, `expected about 1.5x the height, got ${(ratio ** 2).toFixed(3)}`);
});

test('a leaping player leaves the ground faster than one without', () => {
  const jumped = (withEffect) => {
    const player = standing();
    if (withEffect) player.applyStatusEffect('jump_boost', 180, 2);
    player.parentWorld = null;
    // One update with no key first, so the player settles on to the block below and `onGround` is true
    // for a reason rather than because the test said so.
    player.update(1 / 20);
    player.keys['Space'] = true;
    player.update(1 / 20);
    return player.velocity.y;
  };
  const normal = jumped(false);
  const boosted = jumped(true);
  assert.ok(normal > 0, `the control player should have jumped, got ${normal}`);
  assert.ok(boosted > normal + 0.5, `Jump Boost II should jump harder: ${boosted} vs ${normal}`);
});

test('each level of Jump Boost is higher than the last', () => {
  const heights = [0, 1, 2, 3].map((level) => {
    const effects = level === 0 ? new Map() : atLevel('jump_boost', level);
    return jumpVelocityMultiplier(effects);
  });
  for (let i = 1; i < heights.length; i++) {
    assert.ok(heights[i] > heights[i - 1], `level ${i} should be higher than level ${i - 1}`);
  }
});

// --- the Potion of the Turtle Master ----------------------------------------

test('Turtle Master is Slowness IV and Resistance III, and nothing else', () => {
  assert.deepEqual(compoundEffects('turtle_master'), [['slowness', 4], ['resistance', 3]]);
  assert.deepEqual(compoundEffects('speed'), [], 'an ordinary effect is not a compound');
  assert.equal(EFFECTS.turtle_master.compound.length, 2);
  // The enhanced tier is its own pair, written out rather than scaled: IV/III doubled would be VIII/VI,
  // and the two do not advance by the same amount (4 -> 6 against 3 -> 4), so no multiplier fits both.
  assert.deepEqual(compoundEffects('turtle_master', 2), [['slowness', 6], ['resistance', 4]]);
});

test('drinking a Turtle Master potion applies both of its effects', () => {
  const player = standing();
  const inventory = new Inventory({});
  inventory.addItem('potion_of_turtle_master', false, 1);
  const result = drinkPotion('potion_of_turtle_master', player, inventory, { gamemode: 'survival' });
  assert.equal(result.drunk, true);
  assert.ok(player.statusEffects.has('slowness'), 'slowness must be applied');
  assert.ok(player.statusEffects.has('resistance'), 'resistance must be applied');
  assert.equal(player.statusEffects.get('slowness').level, 4);
  assert.equal(player.statusEffects.get('resistance').level, 3);
  // Vanilla has no "Turtle Master" effect in the HUD, so the potion must not leave one behind.
  assert.equal(player.statusEffects.has('turtle_master'), false);
  assert.equal(player.statusEffects.get('slowness').duration, POTION_DATA.potion_of_turtle_master.duration);
});

test('the extended and enhanced Turtle Master potions work, at their own tiers', () => {
  // Both forms are brewable in vanilla and neither existed here, so extending the potion brewed nothing.
  const extended = standing();
  const extendedInv = new Inventory({});
  extendedInv.addItem('potion_of_turtle_master_long', false, 1);
  drinkPotion('potion_of_turtle_master_long', extended, extendedInv, { gamemode: 'survival' });
  assert.equal(extended.statusEffects.get('slowness').duration, 40, 'extended is 0:40');
  assert.equal(extended.statusEffects.get('slowness').level, 4, 'and keeps the regular levels');
  assert.equal(extended.statusEffects.get('resistance').level, 3);

  // The enhanced tier is Slowness VI and Resistance IV, measured through the rules the game applies
  // rather than through the table that declares them.
  const enhanced = standing();
  const enhancedInv = new Inventory({});
  enhancedInv.addItem('potion_of_turtle_master_2', false, 1);
  drinkPotion('potion_of_turtle_master_2', enhanced, enhancedInv, { gamemode: 'survival' });
  assert.equal(enhanced.statusEffects.get('slowness').level, 6, 'enhanced is Slowness VI');
  assert.equal(enhanced.statusEffects.get('resistance').level, 4, 'and Resistance IV');
  assert.equal(enhanced.statusEffects.get('slowness').duration, 20, 'still 0:20');
  assert.equal(enhanced.statusEffects.has('turtle_master'), false);

  const base = standing();
  const enhancedRatio = flyingSpeed(enhanced) / flyingSpeed(base);
  near(enhancedRatio, 1 - 0.15 * 6, 'Slowness VI removes 15% per level, additively');

  enhanced.takeDamage(8, null, 'generic');
  near(20 - enhanced.health, 8 * (1 - 0.2 * 4), 'Resistance IV removes 20% per level');
});

test('a Turtle Master potion is genuinely slow and genuinely protective', () => {
  const player = standing();
  const inventory = new Inventory({});
  inventory.addItem('potion_of_turtle_master', false, 1);
  drinkPotion('potion_of_turtle_master', player, inventory, { gamemode: 'survival' });

  // Resistance III, measured through the damage path rather than the table.
  player.takeDamage(8, null, 'generic');
  const resisted = 20 - player.health;
  assert.ok(resisted < 8, `resistance should reduce the blow, took ${resisted}`);
  near(resisted, 8 * (1 - 0.2 * 3), 'Resistance III removes 20% per level, additively');

  // Slowness IV, measured through the movement the player actually has rather than the base speed: the
  // effect multiplier is applied in `update`, so a base-speed comparison would pass either way.
  const slowed = player;
  const base = standing();
  const ratio = flyingSpeed(slowed) / flyingSpeed(base);
  near(ratio, 1 - 0.15 * 4, 'Slowness IV removes 15% per level, additively');
});

// --- the golden apples -------------------------------------------------------

test('the golden apples declare the effects vanilla gives them', () => {
  const golden = Object.fromEntries(ITEMS.golden_apple.effects.map(([e, d, l]) => [e, [d, l ?? 1]]));
  assert.deepEqual(Object.keys(golden).sort(), ['absorption', 'regeneration']);
  assert.deepEqual(golden.regeneration, [5, 2], 'Regeneration II for five seconds');
  assert.deepEqual(golden.absorption, [120, 1], 'Absorption I for two minutes');

  const enchanted = Object.fromEntries(EXTRA_ITEMS.enchanted_golden_apple.effects.map(([e, d, l]) => [e, [d, l ?? 1]]));
  assert.deepEqual(Object.keys(enchanted).sort(), ['absorption', 'fire_resistance', 'regeneration', 'resistance']);
  assert.deepEqual(enchanted.regeneration, [20, 2]);
  assert.deepEqual(enchanted.absorption, [120, 4], 'Absorption IV, four times the plain apple');
  assert.deepEqual(enchanted.resistance, [300, 1]);
  assert.deepEqual(enchanted.fire_resistance, [300, 1]);
});

test('every effect an apple names is one the game knows', () => {
  for (const id of ['golden_apple', 'enchanted_golden_apple']) {
    const def = id === 'golden_apple' ? ITEMS[id] : EXTRA_ITEMS[id];
    for (const [effect] of def.effects) {
      assert.ok(EFFECTS[effect], `${id} grants ${effect}, which is not in the effect table`);
    }
  }
});

test('a golden apple is an apple that also shields you, and it feeds what vanilla says', () => {
  // The doubled food value, asserted where it was wrong. `foodData.js` is the vanilla-aligned table and
  // the item is what the eating code reads, so the two have to agree.
  assert.equal(ITEMS.golden_apple.food, FOODS.golden_apple.hunger);
  assert.equal(ITEMS.golden_apple.food, 4, 'vanilla golden apple is 4 hunger, not 8');
  assert.equal(EXTRA_ITEMS.enchanted_golden_apple.food, FOODS.enchanted_golden_apple.hunger);

  const player = standing();
  player.applyStatusEffect('absorption', 120, 1);
  player.applyStatusEffect('regeneration', 5, 2);
  assert.equal(player.absorption, 4, 'the shield is up');
  assert.ok(player.statusEffects.has('regeneration'));
});

test('the eating branch applies the effects an item declares', () => {
  // Checked at the source because the eating branch lives in `main.js`, which needs most of an engine to
  // drive. This proves the loop exists and reads `it.effects`, which is the whole of the wiring.
  const source = readFileSync('src/main.js', 'utf8');
  assert.match(source, /Array\.isArray\(it\.effects\)/, 'the eating branch should read the item effects');
  assert.match(source, /applyStatusEffect\?\.\(effect, duration, level \?\? 1\)/,
    'and apply each of them through the ordinary effect path');
});

// --- the Inspector check that found the food bug ----------------------------

test('the edible check compares the item against its own table, not only the table against vanilla', () => {
  // This is the gap that let a golden apple feed 8 while `foodData.js` said 4: the check validated the
  // table and then only asked whether the item had *a* food value. The assertion below puts the item at
  // odds with the table and requires the check to notice.
  const check = RESOURCE_CHECKS.find((c) => c.id === 'edible');
  assert.ok(check, 'the edible check should exist');

  const entry = { id: 'apple', def: { food: 99, type: 'food' }, food: { hunger: 4, saturation: 1.2 } };
  const vanilla = { foodByName: new Map([['apple', { foodPoints: 4, saturation: 2.4 }]]) };
  const verdict = check.run({ entry, vanilla, registry: null });
  assert.equal(verdict.ok, false, 'an item that disagrees with foodData.js must fail');
  assert.match(verdict.detail, /99/, 'and the message should name the item value');

  const agreeing = { ...entry, def: { food: 4, type: 'food' } };
  assert.equal(check.run({ entry: agreeing, vanilla, registry: null }), true);
});
