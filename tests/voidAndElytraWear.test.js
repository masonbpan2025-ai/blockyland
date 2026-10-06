// Two rules that were declared and never applied.
//
// Both were found by asking which branches exist that nothing reaches -- the question that found fall damage
// last round. `takeDamage` skipped the armour formula for `'void'` and `durability.js` carried the elytra's
// 432 points, and neither had a caller.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isInVoid, VOID_Y_THRESHOLD, VOID_DAMAGE } from '../src/voidDamage.js';
import { tickElytraWear, ELYTRA_SECONDS_PER_DURABILITY } from '../src/elytra.js';
import { maxDurabilityFor } from '../src/durability.js';

// --- the void ------------------------------------------------------------------

test('out of the world is below the threshold, not merely low', () => {
  assert.equal(VOID_Y_THRESHOLD, -10);
  assert.ok(VOID_DAMAGE > 0);
  for (const y of [64, 1, 0, -1, -9.9, -10]) {
    assert.equal(isInVoid({ y }), false, 'y=' + y + ' is still inside the world');
  }
  for (const y of [-10.1, -11, -64, -1000]) {
    assert.equal(isInVoid({ y }), true, 'y=' + y + ' is out of the world');
  }
});

test('a nonsense position is not treated as the void', () => {
  // A NaN y would otherwise teleport and damage the player every frame.
  for (const p of [undefined, null, {}, { y: NaN }, { y: undefined }, { y: 'low' }]) {
    assert.equal(isInVoid(p), false, JSON.stringify(p) + ' should not count as the void');
  }
});

test('the void damage is passed with its own type, so armour cannot reduce it', () => {
  // This is the whole fix. `takeDamage` skips the armour formula for `'void'` and excludes it from shield
  // blocking and Thorns, and the call site passed NO type at all -- so armour was reducing the one thing in
  // vanilla that nothing protects you from.
  const source = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ isInVoid, VOID_DAMAGE \} from '\.\/voidDamage\.js'/,
    'the void rule should be imported');
  assert.match(source, /this\.takeDamage\(VOID_DAMAGE, null, 'void'\)/,
    'and applied with the void type');
  // And the old untyped call must be gone, or it would still take precedence.
  assert.equal(/this\.takeDamage\(10\);/.test(source), false, 'the untyped call should be gone');
});

test('takeDamage really does bypass armour for the void, which is why the type matters', () => {
  // The type is only worth passing if it changes something. This pins the branch the fix depends on.
  const source = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(source, /damageType !== 'void' && damageType !== 'starvation' && damageType !== 'fall'/,
    'void should be excluded from the armour formula');
});

// --- the elytra -----------------------------------------------------------------

/** A player shaped object wearing an elytra unless told otherwise. */
function flyer(over = {}) {
  return {
    gamemode: 'survival', elytraFlight: 0,
    inventory: { armor: { chest: { id: 'elytra' } } },
    ...over,
  };
}

test('flight wears the elytra at one point per second', () => {
  assert.equal(ELYTRA_SECONDS_PER_DURABILITY, 1);
  const p = flyer();
  // Half a second is not yet a point, and the half is kept rather than discarded.
  assert.deepEqual(tickElytraWear(p, 0.5, () => 0.999), { spent: 0, broke: false });
  assert.equal(p.inventory.armor.chest.durability, undefined, 'nothing should be written yet');
  // The second half completes it.
  assert.deepEqual(tickElytraWear(p, 0.5, () => 0.999), { spent: 1, broke: false });
  assert.equal(p.inventory.armor.chest.durability, maxDurabilityFor('elytra') - 1);
  // Three seconds at once is three points.
  assert.deepEqual(tickElytraWear(p, 3, () => 0.999), { spent: 3, broke: false });
  assert.equal(p.inventory.armor.chest.durability, maxDurabilityFor('elytra') - 4);
});

test('the remainder carries, so a long frame is not rounded into a free point', () => {
  const p = flyer();
  tickElytraWear(p, 1.9, () => 0.999);
  assert.equal(p.inventory.armor.chest.durability, maxDurabilityFor('elytra') - 1, '1.9s is one point');
  assert.ok(Math.abs(p.elytraFlight - 0.9) < 1e-9, 'and 0.9s is carried, got ' + p.elytraFlight);
  tickElytraWear(p, 0.1, () => 0.999);
  assert.equal(p.inventory.armor.chest.durability, maxDurabilityFor('elytra') - 2,
    'the carried remainder should complete the next point');
});

test('the elytra lasts its full 432 seconds of flight', () => {
  const p = flyer();
  // One second at a time, which is how the loop actually calls it.
  for (let i = 0; i < 431; i++) tickElytraWear(p, 1, () => 0.999);
  assert.equal(p.inventory.armor.chest.durability, 1, 'after 431 seconds one point should be left');
  const last = tickElytraWear(p, 1, () => 0.999);
  assert.equal(last.broke, true, 'the 432nd second should break it');
  assert.equal(p.inventory.armor.chest, null, 'and clear the slot, which is what stops the glide');
});

test('creative does not wear the elytra out', () => {
  const p = flyer({ gamemode: 'creative' });
  assert.deepEqual(tickElytraWear(p, 100, () => 0.999), { spent: 0, broke: false });
  assert.equal(p.inventory.armor.chest.durability, undefined);
});

test('unbreaking reduces elytra wear', () => {
  // The same keep roll the other forms of durability use. A plain elytra spends its point even on a passing
  // roll, because unbreaking level 0 keeps nothing; an unbreaking III one keeps it.
  const plain = flyer();
  tickElytraWear(plain, 1, () => 0);
  assert.equal(plain.inventory.armor.chest.durability, maxDurabilityFor('elytra') - 1);
  const warded = flyer();
  warded.inventory.armor.chest.enchantments = [{ id: 'unbreaking', level: 3 }];
  tickElytraWear(warded, 1, () => 0);
  assert.equal(warded.inventory.armor.chest.durability, maxDurabilityFor('elytra'),
    'an unbreaking III elytra should be left at full when the keep roll passes');
});

test('a chest that is not an elytra wears nothing', () => {
  // The wear is driven by gliding, and gliding cannot happen without an elytra -- but the function is called
  // from the movement loop, so it must not charge an iron chestplate if the two ever disagree.
  for (const chest of [null, undefined, { id: 'iron_chestplate' }, {}]) {
    const p = flyer({ inventory: { armor: { chest } } });
    const before = JSON.stringify(p.inventory.armor.chest);
    assert.deepEqual(tickElytraWear(p, 5, () => 0.999), { spent: 0, broke: false }, 'for ' + before);
    assert.equal(JSON.stringify(p.inventory.armor.chest), before, 'and it is left untouched');
  }
});

test('a malformed player or delta does not throw', () => {
  for (const p of [undefined, null, {}]) {
    assert.deepEqual(tickElytraWear(p, 1, () => 0.999), { spent: 0, broke: false });
  }
  const p = flyer();
  assert.doesNotThrow(() => tickElytraWear(p, -5, () => 0.999));
  assert.doesNotThrow(() => tickElytraWear(p, NaN, () => 0.999));
  assert.ok(Number.isFinite(p.elytraFlight), 'and the accumulator stays finite, got ' + p.elytraFlight);
});

test('the movement loop calls the wear and reports a break', () => {
  const source = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(source, /tickElytraWear\(this, dt, roll\)/, 'the glide branch should tick the wear');
  assert.match(source, /Your elytra broke/, 'and tell the player when it breaks');
  assert.match(source, /this\.elytraFlight = 0;/, 'the accumulator should be initialised in the constructor');
});
