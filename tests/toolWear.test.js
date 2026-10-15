// Durability per action (src/toolWear.js), against the wiki's Durability page, "Tool & weapon durability" (Java).
// Found by the wiki-tutorial play-test (Durability management): every block cost 1 whatever the tool and block, an
// attack cost nothing, and a blocked hit cost the shield a flat 1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blockBreakWear, attackWear, shieldWear } from '../src/toolWear.js';

test('breaking blocks: 0 for an instant block, 1 for digging tools and hoes, 2 for swords, maces and tridents', () => {
  for (const tool of ['stone_pickaxe', 'iron_axe', 'diamond_shovel', 'wooden_hoe']) {
    assert.equal(blockBreakWear(tool, 0), 0, `${tool} on short grass`);
    assert.equal(blockBreakWear(tool, 1.5), 1, `${tool} on stone`);
  }
  for (const weapon of ['iron_sword', 'mace', 'trident']) {
    assert.equal(blockBreakWear(weapon, 0), 0);
    assert.equal(blockBreakWear(weapon, 0.5), 2, `"Using a sword to mine any block with non-zero hardness consumes 2"`);
  }
  assert.equal(blockBreakWear('shears', 0), 1, 'shears: "Breaking any block (except fire and soul fire) counts as 1"');
  assert.equal(blockBreakWear('shears', 0, { fire: true }), 0);
  for (const other of ['fishing_rod', 'bow', 'flint_and_steel', 'brush', 'shield', 'stick']) assert.equal(blockBreakWear(other, 3), 0, other);
});

test('hitting a mob: 2 for an axe, pickaxe or shovel, 1 for a sword, mace, trident or (Java) hoe, 0 for shears', () => {
  assert.equal(attackWear('stone_axe'), 2, '"Using a pickaxe, axe, shovel, or hoe to attack mobs consumes 2" -- the hoe is 1 in Java');
  assert.equal(attackWear('iron_pickaxe'), 2);
  assert.equal(attackWear('wooden_shovel'), 2);
  assert.equal(attackWear('golden_hoe'), 1);
  assert.equal(attackWear('diamond_sword'), 1);
  assert.equal(attackWear('trident'), 1);
  assert.equal(attackWear('shears'), 0);
  assert.equal(attackWear(null), 0);
});

test('shield: floor(damage) + 1 for a blocked hit of more than 3, else nothing', () => {
  assert.equal(shieldWear(3), 0);
  assert.equal(shieldWear(3.5), 4);
  assert.equal(shieldWear(9), 10);
});

test('the game charges them where a block breaks and where a hit lands', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /const breakCost = heldAtBreak && !heldAtBreak\.isBlock \? blockBreakWear\(/);
  assert.match(main, /attackWear\(activeItem\.id\)/);
  const player = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(player, /const shieldCost = shieldWear\(amount\);/);
});

// Durability: elytra "Flying for one second counts as 1 use. The durability cannot go below 1"; at 1 it is broken,
// "unusable until repaired" -- not destroyed, which is what the game did.
test('an elytra wears to 1 and stops flying, but stays in the chest slot', async () => {
  const { tickElytraWear, hasElytraEquipped } = await import('../src/elytra.js');
  const player = { gamemode: 'survival', inventory: { armor: { chest: { id: 'elytra', durability: 3, maxDurability: 432 } } } };
  for (let i = 0; i < 5; i++) tickElytraWear(player, 1, () => 0.99);
  assert.equal(player.inventory.armor.chest?.durability, 1);
  assert.equal(hasElytraEquipped(player), false, 'cannot glide');
});

// Unbreaking: armour takes each point with p = 0.6 + 0.4 / (level + 1); tools keep it with p = level / (level + 1).
// The game used the tool rule for armour too, so Unbreaking III armour lasted 4x instead of ~1.43x.
test('Unbreaking III: a tool lasts four times as long, armour about 43% longer', async () => {
  const { keepChance } = await import('../src/durability.js');
  assert.equal(keepChance('diamond_pickaxe', 3), 0.75);
  assert.ok(Math.abs(1 / (1 - keepChance('diamond_chestplate', 3)) - 1 / 0.7) < 1e-9, '1 / 0.7 = 1.43');
});
