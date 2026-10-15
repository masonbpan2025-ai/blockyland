// Item repair in the crafting grid and the grindstone, against the wiki's Item repair and Grindstone pages. Found by
// the wiki-tutorial play-test (The second day: "put two damaged tools of the same type and material in a grindstone
// or your crafting grid"): the grid made nothing, and the grindstone stripped curses and refunded invented XP.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gridRepairResult } from '../src/crafting.js';
import { calculateGrindstoneResult, grindstoneExperience, minimumModifiedLevel } from '../src/grindstone.js';
import { Inventory } from '../src/inventory.js';

test('"Two stone axes have 10 and 45 uses. A newly crafted stone axe would have 61 uses."', () => {
  const r = gridRepairResult([{ id: 'stone_axe', count: 1, durability: 10 }, null, null, { id: 'stone_axe', count: 1, durability: 45 }]);
  assert.equal(r.durability, 61);
  assert.equal(r.maxDurability, 131);
});

test('capped at the maximum; different materials, or a third item, do not combine', () => {
  assert.equal(gridRepairResult([{ id: 'iron_pickaxe', count: 1, durability: 200 }, { id: 'iron_pickaxe', count: 1, durability: 200 }]).durability, 250);
  assert.equal(gridRepairResult([{ id: 'stone_pickaxe', count: 1, durability: 5 }, { id: 'wooden_pickaxe', count: 1, durability: 5 }]), null);
  assert.equal(gridRepairResult([{ id: 'stick', count: 1 }, { id: 'stick', count: 1 }]), null, 'only items with durability');
});

test('"never enchanted ... with the exception of curse enchantments, which are transferred"', () => {
  const r = gridRepairResult([
    { id: 'iron_sword', count: 1, durability: 50, enchantments: [{ id: 'sharpness', level: 5 }, { id: 'vanishing_curse', level: 1 }] },
    { id: 'iron_sword', count: 1, durability: 50, enchantments: [{ id: 'sharpness', level: 5 }] },
  ]);
  assert.deepEqual(r.enchantments, [{ id: 'vanishing_curse', level: 1 }]);
});

test('the inventory grid offers and hands over the repaired tool', () => {
  const inv = Object.create(Inventory.prototype);
  Object.assign(inv, { craft2x2: [{ id: 'stone_axe', count: 1, isBlock: false, durability: 10 }, null, null, { id: 'stone_axe', count: 1, isBlock: false, durability: 45 }], craft3x3: Array(9).fill(null), cursorItem: null, sounds: { playClick() {} } });
  inv.checkCrafting();
  assert.equal(inv.craft2x2Result?.durability, 61);
  inv.takeCraftResult(false);
  assert.equal(inv.cursorItem.durability, 61);
  assert.deepEqual(inv.craft2x2, [null, null, null, null]);
});

test('grindstone: curses stay, and XP is 50-100% of the minimum modified levels ("Sharpness V on average gives 35")', () => {
  assert.equal(minimumModifiedLevel('sharpness', 5), 45);
  assert.equal(grindstoneExperience([{ id: 'sharpness', level: 5 }], () => 0), 23);
  assert.equal(grindstoneExperience([{ id: 'sharpness', level: 5 }], () => 0.9999), 45);
  assert.equal(grindstoneExperience([{ id: 'vanishing_curse', level: 1 }], () => 0.5), 0, 'curses refund nothing');
  const r = calculateGrindstoneResult({ id: 'iron_sword', durability: 100, enchantments: [{ id: 'sharpness', level: 5 }, { id: 'binding_curse', level: 1 }] }, null, () => 0.5);
  assert.deepEqual(r.result.enchantments, [{ id: 'binding_curse', level: 1 }]);
  assert.equal(r.result.durability, 100);
  const book = calculateGrindstoneResult({ id: 'enchanted_book', enchantments: [{ id: 'mending', level: 1 }] }, null);
  assert.equal(book.result.id, 'book');
});
