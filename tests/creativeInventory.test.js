import test from 'node:test';
import assert from 'node:assert';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import {
  CREATIVE_TABS,
  ALL_CREATIVE_ITEMS,
  getCreativeItemsByTab,
  searchCreativeItems
} from '../src/creativeCatalog.js';

test('Creative Catalog includes all official tabs', () => {
  assert.strictEqual(CREATIVE_TABS.length, 12);
  const expectedTabs = [
    'building_blocks', 'colored_blocks', 'natural_blocks', 'functional_blocks',
    'redstone_blocks', 'tools_utilities', 'combat', 'food_drinks',
    'ingredients', 'spawn_eggs', 'building', 'all_items'
  ];
  for (const id of expectedTabs) {
    const found = CREATIVE_TABS.find(t => t.id === id);
    assert.ok(found, `Tab ${id} must exist in CREATIVE_TABS`);
  }
});

test('Creative Catalog has over 200 items spanning blocks and tools', () => {
  assert.ok(ALL_CREATIVE_ITEMS.length >= 200, `Expected at least 200 items, got ${ALL_CREATIVE_ITEMS.length}`);

  // Test each tab has items
  for (const tab of CREATIVE_TABS) {
    const items = getCreativeItemsByTab(tab.id);
    assert.ok(items.length > 0, `Tab ${tab.id} should have items`);
  }
});

test('Search creative items filters correctly', () => {
  const diamondItems = searchCreativeItems('diamond');
  assert.ok(diamondItems.length >= 8, `Expected at least 8 diamond items, got ${diamondItems.length}`);
  for (const item of diamondItems) {
    const match = item.name.toLowerCase().includes('diamond') || item.searchTerms.includes('diamond');
    assert.ok(match, `Item ${item.name} should match "diamond"`);
  }

  const swordItems = searchCreativeItems('sword');
  assert.ok(swordItems.length >= 6, `Expected all swords (Netherite, Diamond, Golden, Iron, Stone, Wooden)`);

  const spawnEggs = searchCreativeItems('spawn egg');
  assert.ok(spawnEggs.length >= 10, `Expected at least 10 spawn eggs`);
});

test('All item and block definitions have valid names and icons', () => {
  for (const item of ALL_CREATIVE_ITEMS) {
    assert.ok(item.id !== undefined && item.id !== null, 'Item must have an id');
    assert.ok(item.name && item.name.length > 0, 'Item must have a name');
    assert.ok(item.icon && item.icon.startsWith('/assets/'), `Icon must be in assets: ${item.icon}`);
    assert.ok(item.count === 64 || item.count === 1, `Count must be 64 or 1, got ${item.count}`);
  }
});

test('Building category has all library buildings and is accessible via getCreativeItemsByTab', () => {
  const buildingItems = getCreativeItemsByTab('building');
  assert.ok(buildingItems.length >= 9, 'Should have at least 9 buildings');
  for (const st of buildingItems) {
    assert.strictEqual(st.tab, 'building');
    assert.strictEqual(st.isBuilding, true);
    assert.ok(st.buildingId);
    assert.ok(st.name);
    assert.ok(st.icon.startsWith('/assets/'));
  }
});
