import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderPlayerDollSVG,
  getArmorMaterial,
  ARMOR_PALETTES
} from '../src/playerDoll.js';
import { Inventory } from '../src/inventory.js';
import { ITEMS } from '../src/blocks.js';

test('Player Doll - Material detection across all armor tiers', () => {
  assert.equal(getArmorMaterial({ id: 'diamond_helmet' }), 'diamond');
  assert.equal(getArmorMaterial({ id: 'netherite_chestplate' }), 'netherite');
  assert.equal(getArmorMaterial({ id: 'iron_leggings' }), 'iron');
  assert.equal(getArmorMaterial({ id: 'golden_boots' }), 'golden');
  assert.equal(getArmorMaterial({ id: 'chainmail_chestplate' }), 'chainmail');
  assert.equal(getArmorMaterial({ id: 'leather_helmet' }), 'leather');
  assert.equal(getArmorMaterial({ id: 'turtle_helmet' }), 'turtle');
  assert.equal(getArmorMaterial(null), null);
  assert.equal(getArmorMaterial({}), null);
});

test('Player Doll - Base Steve renders when no armor is equipped', () => {
  const svg = renderPlayerDollSVG();
  assert.ok(svg.includes('id="steve-base"'), 'Must contain base Steve body');
  assert.ok(svg.includes('fill="#009c9c"'), 'Must contain cyan shirt');
  assert.ok(svg.includes('fill="#2c3b88"'), 'Must contain blue jeans');
  assert.ok(!svg.includes('id="armor-head"'), 'Must not have head armor');
  assert.ok(!svg.includes('id="armor-chest"'), 'Must not have chest armor');
  assert.ok(!svg.includes('id="armor-legs"'), 'Must not have legs armor');
  assert.ok(!svg.includes('id="armor-feet"'), 'Must not have feet armor');
});

test('Player Doll - Equipping individual armor pieces adds appropriate SVG layers', () => {
  // Test helmet
  const withHelmet = renderPlayerDollSVG({ head: { id: 'iron_helmet' } });
  assert.ok(withHelmet.includes('id="armor-head"'), 'Must contain head armor');
  assert.ok(withHelmet.includes(ARMOR_PALETTES.iron.main), 'Must use iron palette');
  assert.ok(!withHelmet.includes('id="armor-chest"'), 'Must not contain chestplate');

  // Test chestplate
  const withChest = renderPlayerDollSVG({ chest: { id: 'golden_chestplate' } });
  assert.ok(withChest.includes('id="armor-chest"'), 'Must contain chest armor');
  assert.ok(withChest.includes(ARMOR_PALETTES.golden.main), 'Must use golden palette');

  // Test leggings
  const withLegs = renderPlayerDollSVG({ legs: { id: 'netherite_leggings' } });
  assert.ok(withLegs.includes('id="armor-legs"'), 'Must contain legs armor');
  assert.ok(withLegs.includes(ARMOR_PALETTES.netherite.main), 'Must use netherite palette');

  // Test boots
  const withBoots = renderPlayerDollSVG({ feet: { id: 'leather_boots' } });
  assert.ok(withBoots.includes('id="armor-feet"'), 'Must contain boots armor');
  assert.ok(withBoots.includes(ARMOR_PALETTES.leather.main), 'Must use leather palette');
});

test('Player Doll - Full Diamond Armor set (matching user screenshot) renders all 4 armor layers', () => {
  const diamondArmor = {
    head: { id: 'diamond_helmet' },
    chest: { id: 'diamond_chestplate' },
    legs: { id: 'diamond_leggings' },
    feet: { id: 'diamond_boots' }
  };
  const svg = renderPlayerDollSVG(diamondArmor);
  assert.ok(svg.includes('id="steve-base"'), 'Must contain base body');
  assert.ok(svg.includes('id="armor-head"'), 'Must contain helmet');
  assert.ok(svg.includes('id="armor-chest"'), 'Must contain chestplate');
  assert.ok(svg.includes('id="armor-legs"'), 'Must contain leggings');
  assert.ok(svg.includes('id="armor-feet"'), 'Must contain boots');
  assert.ok(svg.includes(ARMOR_PALETTES.diamond.main), 'Must use diamond cyan color #2ee8d6');
});

test('Armor Equipment - Slot validation rejects wrong armor types and non-armor items', () => {
  const inv = new Inventory();

  // Try equipping stone block into head slot
  inv.cursorItem = { id: 1, isBlock: true, count: 64 }; // stone block
  inv.handleArmorSlotClick('head');
  assert.equal(inv.armor.head, null, 'Cannot place stone block in head slot');
  assert.notEqual(inv.cursorItem, null, 'Cursor item remains held');

  // Try equipping diamond boots into helmet slot
  inv.cursorItem = { id: 'diamond_boots', count: 1 };
  inv.handleArmorSlotClick('head');
  assert.equal(inv.armor.head, null, 'Cannot place boots in head slot');

  // Equip correct diamond helmet into head slot
  inv.cursorItem = { id: 'diamond_helmet', count: 1 };
  inv.handleArmorSlotClick('head');
  assert.deepEqual(inv.armor.head, { id: 'diamond_helmet', count: 1 }, 'Helmet equips successfully');
  assert.equal(inv.cursorItem, null, 'Cursor item is cleared after equipping');
});

test('Armor Equipment - Shift-click auto-equips armor and recalculates defense stats', () => {
  const inv = new Inventory();
  inv.storage[0] = { id: 'diamond_helmet', count: 1 };
  inv.storage[1] = { id: 'diamond_chestplate', count: 1 };
  inv.storage[2] = { id: 'diamond_leggings', count: 1 };
  inv.storage[3] = { id: 'diamond_boots', count: 1 };

  assert.equal(inv.getTotalArmorPoints(), 0);

  // Shift-click each piece from storage
  inv.handleSlotClick(inv.storage, 0, false, true);
  assert.equal(inv.armor.head?.id, 'diamond_helmet');
  assert.equal(inv.storage[0], null);

  inv.handleSlotClick(inv.storage, 1, false, true);
  assert.equal(inv.armor.chest?.id, 'diamond_chestplate');

  inv.handleSlotClick(inv.storage, 2, false, true);
  assert.equal(inv.armor.legs?.id, 'diamond_leggings');

  inv.handleSlotClick(inv.storage, 3, false, true);
  assert.equal(inv.armor.feet?.id, 'diamond_boots');

  // Full diamond armor stats
  assert.equal(inv.getTotalArmorPoints(), 20, 'Full diamond set gives 20 armor points');
  assert.equal(inv.getTotalArmorToughness(), 8, 'Full diamond set gives 8 toughness (2 per piece)');

  // Shift-click to unequip helmet back to hotbar/storage
  inv.handleArmorSlotClick('head', false, true);
  assert.equal(inv.armor.head, null, 'Helmet unequipped');
  assert.equal(inv.hotbar[0]?.id, 'diamond_helmet', 'Moved to hotbar slot 0');
  assert.equal(inv.getTotalArmorPoints(), 17, 'Armor points decreased from 20 to 17');
});

test('Armor Equipment - Swapping equipped armor with held armor piece on cursor', () => {
  const inv = new Inventory();
  inv.armor.chest = { id: 'iron_chestplate', count: 1 };
  inv.cursorItem = { id: 'diamond_chestplate', count: 1 };

  inv.handleArmorSlotClick('chest');
  assert.equal(inv.armor.chest?.id, 'diamond_chestplate', 'Equipped diamond chestplate');
  assert.equal(inv.cursorItem?.id, 'iron_chestplate', 'Iron chestplate returned to cursor');
  assert.equal(inv.getTotalArmorPoints(), 8, 'Armor points updated to diamond chestplate value (8)');
});

test('Armor Equipment - Rejection across all 4 slots for mismatched slot types', () => {
  const inv = new Inventory();

  // Helmet into chest slot -> reject
  inv.cursorItem = { id: 'diamond_helmet', count: 1 };
  inv.handleArmorSlotClick('chest');
  assert.equal(inv.armor.chest, null);
  assert.equal(inv.cursorItem?.id, 'diamond_helmet');

  // Chestplate into legs slot -> reject
  inv.cursorItem = { id: 'diamond_chestplate', count: 1 };
  inv.handleArmorSlotClick('legs');
  assert.equal(inv.armor.legs, null);

  // Leggings into feet slot -> reject
  inv.cursorItem = { id: 'diamond_leggings', count: 1 };
  inv.handleArmorSlotClick('feet');
  assert.equal(inv.armor.feet, null);

  // Boots into head slot -> reject
  inv.cursorItem = { id: 'diamond_boots', count: 1 };
  inv.handleArmorSlotClick('head');
  assert.equal(inv.armor.head, null);
});

test('Creative Inventory HTML Structure - Survival Inventory tab contains all 4 armor slots and player preview', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync('index.html', 'utf8');

  // Check survival view container
  assert.ok(html.includes('id="creative-survival-view"'), 'creative-survival-view must exist in index.html');

  // Check 4 armor slots in creative survival view
  assert.ok(html.includes('id="creative-armor-slot-head"'), 'creative-armor-slot-head must exist');
  assert.ok(html.includes('id="creative-armor-slot-chest"'), 'creative-armor-slot-chest must exist');
  assert.ok(html.includes('id="creative-armor-slot-legs"'), 'creative-armor-slot-legs must exist');
  assert.ok(html.includes('id="creative-armor-slot-feet"'), 'creative-armor-slot-feet must exist');

  // Check player preview doll container and storage grid
  assert.ok(html.includes('id="creative-player-preview"'), 'creative-player-preview must exist');
  assert.ok(html.includes('id="creative-storage-grid"'), 'creative-storage-grid must exist');

  // Check survival modal player preview box
  assert.ok(html.includes('id="player-preview-box"'), 'player-preview-box must exist');
});

