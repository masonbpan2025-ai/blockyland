// The durability bar. Tools have worn out since src/durability.js landed (mining spends a point, unbreaking
// saves some, and the armour, shears, brush and elytra paths all use the same module), but nothing drew the
// remaining life: `durabilityFraction` was written for a bar that was never built, so a pickaxe on its last
// block looked exactly like a new one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { durabilityBarSpec, durabilityLabel, advancedTooltipLines } from '../src/ui.js';
import { maxDurabilityFor } from '../src/durability.js';

test('a pristine tool shows no bar, like vanilla', () => {
  const pick = { id: 'diamond_pickaxe', durability: 1561, maxDurability: 1561 };
  assert.equal(durabilityBarSpec(pick), null);
  assert.equal(durabilityLabel(pick), null);
  // A stack that has never been used records no durability at all, and is pristine too.
  assert.equal(durabilityBarSpec({ id: 'iron_pickaxe', count: 1 }), null);
});

test('the bar empties green, then yellow, then red', () => {
  const mk = (durability) => ({ id: 'iron_pickaxe', durability, maxDurability: 250 });
  assert.equal(durabilityBarSpec(mk(200)).tier, 'high');
  assert.equal(durabilityBarSpec(mk(100)).tier, 'mid');
  assert.equal(durabilityBarSpec(mk(10)).tier, 'low');
  assert.equal(durabilityBarSpec(mk(125)).fraction, 0.5, 'the fill is the fraction of life left');
  assert.equal(durabilityBarSpec(mk(0)).fraction, 0, 'a spent tool shows an empty trough');
});

test('items that never wear get no bar', () => {
  assert.equal(durabilityBarSpec({ id: 'dirt', count: 64 }), null);
  assert.equal(durabilityBarSpec(null), null);
  assert.equal(durabilityBarSpec(undefined), null);
});

test('the tooltip states the numbers a player needs', () => {
  assert.equal(durabilityLabel({ id: 'wooden_shovel', durability: 41, maxDurability: 59 }), 'Durability 41 / 59');
  // A stack carrying only the id falls back to the material table, so the total is still shown.
  assert.equal(
    durabilityLabel({ id: 'iron_pickaxe', durability: 3 }),
    `Durability 3 / ${maxDurabilityFor('iron_pickaxe')}`
  );
});

test('F3+H names the item and its exact durability', () => {
  assert.deepEqual(advancedTooltipLines({ id: 'iron_pickaxe', durability: 3, maxDurability: 250 }), [
    'minecraft:iron_pickaxe',
    'Durability 3 / 250',
  ]);
  assert.deepEqual(advancedTooltipLines({ id: 'dirt', count: 64 }), ['minecraft:dirt']);
  assert.deepEqual(advancedTooltipLines(null), []);
});

test('every place that draws an item icon draws the bar with it', () => {
  const ui = fs.readFileSync(path.join(process.cwd(), 'src/ui.js'), 'utf8');
  // The shared slot renderer covers the inventory, crafting, furnace, anvil, enchanting and the rest.
  const renderSlot = ui.slice(ui.indexOf('renderSlotContent(slotEl, item) {'));
  assert.match(renderSlot.slice(0, 1200), /this\.addDurabilityBar\(slotEl, item\)/, 'renderSlotContent draws it');
  // The hotbar and the off-hand HUD slot render themselves.
  assert.match(ui, /this\.addDurabilityBar\(slot, item\);/, 'the hotbar draws it');
  assert.match(ui, /this\.addDurabilityBar\(offhandSlot, offhandItem\);/, 'the off-hand slot draws it');
  // And the hover tooltips say how much is left, which is the readable form of the same fact.
  assert.match(ui, /durabilityLabel\(item\)/, 'tooltips report it');
  const css = fs.readFileSync(path.join(process.cwd(), 'src/style.css'), 'utf8');
  assert.match(css, /\.durability-bar\s*\{/, 'the bar is styled');
  assert.match(css, /\.durability-fill\s*\{/, 'and so is its fill');
});
