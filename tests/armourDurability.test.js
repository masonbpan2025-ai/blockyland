// Armour durability.
//
// Armour did not wear out at all, which makes it an infinite shield -- the same class of gap as a
// permanent pickaxe, and it became fixable only once src/durability.js existed.
//
// Vanilla charges every worn piece `max(1, floor(damage / 4))` points per hit, with unbreaking rolled per
// piece, and the piece is destroyed when it reaches zero.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Player } from '../src/player.js';
import { maxDurabilityFor } from '../src/durability.js';

/** A Player-shaped object with armour and a deterministic random. */
function wearer(armour, opts = {}) {
  const p = Object.create(Player.prototype);
  p.inventory = { armor: armour };
  p.gamemode = opts.gamemode ?? 'survival';
  // 0.999 fails every unbreaking keep-check, so every point is spent.
  p.random = opts.random ?? (() => 0.999);
  p.messages = [];
  p.ui = { addChatMessage: (m) => p.messages.push(m) };
  return p;
}

test('the charge is max(1, floor(damage / 4)) per piece', () => {
  // Reported through the resulting durability rather than by reaching into the method, so the rule is
  // checked where it has an effect.
  const cases = [[1, 1], [3, 1], [4, 1], [7, 1], [8, 2], [12, 3], [20, 5]];
  for (const [damage, expected] of cases) {
    const piece = { id: 'iron_chestplate' };
    wearer({ chest: piece }).wearArmour(damage);
    assert.equal(piece.maxDurability - piece.durability, expected,
      damage + ' damage should cost ' + expected + ' points');
  }
});

test('every worn piece is charged, and empty slots are skipped', () => {
  const head = { id: 'iron_helmet' };
  const chest = { id: 'iron_chestplate' };
  const feet = { id: 'iron_boots' };
  wearer({ head, chest, legs: null, feet }).wearArmour(8);
  for (const [name, piece] of [['head', head], ['chest', chest], ['feet', feet]]) {
    assert.equal(piece.maxDurability - piece.durability, 2, name + ' should be charged');
  }
});

test('the durability comes from the material table, not a guess', () => {
  const piece = { id: 'diamond_chestplate' };
  wearer({ chest: piece }).wearArmour(8);
  assert.equal(piece.maxDurability, maxDurabilityFor('diamond_chestplate'),
    'a diamond chestplate should use the table figure');
  assert.equal(piece.maxDurability, 528);
});

test('a piece that reaches zero is destroyed and the slot cleared', () => {
  const chest = { id: 'leather_chestplate', durability: 2, maxDurability: 80 };
  const p = wearer({ head: null, chest, legs: null, feet: null });
  const broken = p.wearArmour(8);
  assert.deepEqual(broken, ['chest'], 'the broken slot should be reported');
  assert.equal(p.inventory.armor.chest, null, 'and the slot cleared');
  // wearArmour REPORTS rather than notifying: telling the player is takeDamage's job, because the same
  // method could be used where no UI is attached.
  assert.deepEqual(p.messages, [], 'wearArmour itself should not emit a message');
});

test('a piece survives with one point left', () => {
  const chest = { id: 'leather_chestplate', durability: 3, maxDurability: 80 };
  const p = wearer({ chest });
  assert.deepEqual(p.wearArmour(8), [], 'nothing should break with a point to spare');
  assert.equal(chest.durability, 1);
  assert.notEqual(p.inventory.armor.chest, null);
});

test('unbreaking reduces armour wear, per piece', () => {
  // The same keep-roll as tools: p = level / (level + 1). With a random of 0 every check passes, so an
  // unbreaking III piece spends nothing.
  const plain = { id: 'iron_chestplate' };
  const warded = { id: 'iron_chestplate', enchantments: [{ id: 'unbreaking', level: 3 }] };
  wearer({ chest: plain }, { random: () => 0 }).wearArmour(8);
  wearer({ chest: warded }, { random: () => 0 }).wearArmour(8);
  assert.equal(plain.maxDurability - plain.durability, 2, 'no unbreaking: every point is spent');
  assert.equal(warded.durability, warded.maxDurability, 'unbreaking III with a passing roll spends nothing');
});

test('damage that is not positive wears nothing', () => {
  // A zero-damage hit is possible from a fully absorbed attack, and it must not cost durability.
  for (const damage of [0, -1, -100, undefined, null]) {
    const chest = { id: 'iron_chestplate' };
    const broken = wearer({ chest }).wearArmour(damage);
    assert.deepEqual(broken, [], 'damage ' + String(damage) + ' should break nothing');
    assert.equal(chest.durability, undefined, 'and write nothing on to the piece');
  }
});

test('a player with no armour is unaffected', () => {
  const p = Object.create(Player.prototype);
  p.inventory = {};
  p.random = () => 0.999;
  assert.deepEqual(p.wearArmour(10), [], 'no armour to wear');
  p.inventory = { armor: null };
  assert.deepEqual(p.wearArmour(10), []);
});

test('wearArmour is called from takeDamage in survival', () => {
  // The wiring, checked at the source because driving takeDamage to completion needs most of a game
  // engine stubbed. This is weaker than the tests above and is labelled as such: it proves the call
  // exists and is gated on survival, not that a specific hit wears a specific amount.
  const source = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  const start = source.indexOf('  takeDamage(amount, sourcePos');
  assert.ok(start > 0, 'takeDamage should exist');
  // The method ends at the first closing brace at two-space indentation after it. Searching for the NEXT
  // `wearArmour(` instead would not work: the method is defined above takeDamage, so that search returns
  // -1 and the slice silently becomes almost the whole file, making every assertion pass.
  const end = source.indexOf('\n  }', start);
  assert.ok(end > start, 'takeDamage should be closed');
  const body = source.slice(start, end);
  assert.ok(body.includes('this.wearArmour('), 'takeDamage should wear the armour');
  assert.ok(/gamemode === 'survival'/.test(body), 'and only in survival');
  assert.ok(body.includes('addChatMessage'), 'and tell the player which slot broke');
  assert.ok(body.length < 12000, 'the slice should be one method, got ' + body.length + ' chars');
});
