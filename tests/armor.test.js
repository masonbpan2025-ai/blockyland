import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS, ITEMS, BLOCK_DEFS } from '../src/blocks.js';
import { Inventory } from '../src/inventory.js';
import { Player } from '../src/player.js';
import { RECIPES_3X3, findMatchingRecipe } from '../src/crafting.js';

function createMockSounds() {
  let shieldBlocked = false;
  let armorEquipped = false;
  let clicked = false;
  let hurt = false;
  return {
    playShieldBlock: () => { shieldBlocked = true; },
    playArmorEquip: () => { armorEquipped = true; },
    playClick: () => { clicked = true; },
    playHurt: () => { hurt = true; },
    get flags() {
      return { shieldBlocked, armorEquipped, clicked, hurt };
    },
    reset() {
      shieldBlocked = false;
      armorEquipped = false;
      clicked = false;
      hurt = false;
    }
  };
}

function createMockWorld() {
  return {
    getVoxel: () => BLOCKS.AIR,
    setVoxel: () => {},
    redstone: { interact: () => null }
  };
}

test('Armor System - Armor Item Stats and Tier Properties', () => {
  // Leather: 1, 3, 2, 1 = 7 total
  assert.equal(ITEMS.leather_helmet.armor, 1);
  assert.equal(ITEMS.leather_chestplate.armor, 3);
  assert.equal(ITEMS.leather_leggings.armor, 2);
  assert.equal(ITEMS.leather_boots.armor, 1);

  // Golden: 2, 5, 3, 1 = 11 total
  assert.equal(ITEMS.golden_helmet.armor, 2);
  assert.equal(ITEMS.golden_chestplate.armor, 5);
  assert.equal(ITEMS.golden_leggings.armor, 3);
  assert.equal(ITEMS.golden_boots.armor, 1);

  // Chainmail: 2, 5, 4, 1 = 12 total
  assert.equal(ITEMS.chainmail_helmet.armor, 2);
  assert.equal(ITEMS.chainmail_chestplate.armor, 5);
  assert.equal(ITEMS.chainmail_leggings.armor, 4);
  assert.equal(ITEMS.chainmail_boots.armor, 1);

  // Iron: 2, 6, 5, 2 = 15 total
  assert.equal(ITEMS.iron_helmet.armor, 2);
  assert.equal(ITEMS.iron_chestplate.armor, 6);
  assert.equal(ITEMS.iron_leggings.armor, 5);
  assert.equal(ITEMS.iron_boots.armor, 2);

  // Diamond: 3, 8, 6, 3 = 20 total, toughness 2 each = 8 total
  assert.equal(ITEMS.diamond_helmet.armor, 3);
  assert.equal(ITEMS.diamond_chestplate.armor, 8);
  assert.equal(ITEMS.diamond_leggings.armor, 6);
  assert.equal(ITEMS.diamond_boots.armor, 3);
  assert.equal(ITEMS.diamond_chestplate.toughness, 2);

  // Netherite: 3, 8, 6, 3 = 20 total, toughness 3 each = 12 total, knockback resistance 1 each = 4 total
  assert.equal(ITEMS.netherite_helmet.armor, 3);
  assert.equal(ITEMS.netherite_chestplate.armor, 8);
  assert.equal(ITEMS.netherite_leggings.armor, 6);
  assert.equal(ITEMS.netherite_boots.armor, 3);
  assert.equal(ITEMS.netherite_chestplate.toughness, 3);
  assert.equal(ITEMS.netherite_chestplate.knockbackResistance, 1);

  // Turtle Helmet: 2 armor, head slot
  assert.equal(ITEMS.turtle_helmet.armor, 2);
  assert.equal(ITEMS.turtle_helmet.armorSlot, 'head');

  // Shield: type 'shield', offhand: true
  assert.equal(ITEMS.shield.type, 'shield');
  assert.equal(ITEMS.shield.offhand, true);
});

test('Crafting Recipes - Shield and Armor Crafting', () => {
  // Shield recipe: 6 planks + 1 iron ingot in Y-pattern:
  // [planks, iron_ingot, planks]
  // [planks, planks,     planks]
  // [null,   planks,     null  ]
  const shieldGrid = [
    { id: BLOCKS.OAK_PLANKS, count: 1 }, { id: 'iron_ingot', count: 1 }, { id: BLOCKS.OAK_PLANKS, count: 1 },
    { id: BLOCKS.OAK_PLANKS, count: 1 }, { id: BLOCKS.OAK_PLANKS, count: 1 }, { id: BLOCKS.OAK_PLANKS, count: 1 },
    null, { id: BLOCKS.OAK_PLANKS, count: 1 }, null
  ];
  const shieldRecipe = findMatchingRecipe(shieldGrid, 3, 3, RECIPES_3X3);
  assert.ok(shieldRecipe, 'Shield recipe should match in 3x3 crafting grid');
  assert.equal(shieldRecipe.id, 'shield');
  assert.equal(shieldRecipe.count, 1);

  // Iron Chestplate recipe: 8 iron ingots (all except top-middle)
  const chestGrid = [
    { id: 'iron_ingot', count: 1 }, null, { id: 'iron_ingot', count: 1 },
    { id: 'iron_ingot', count: 1 }, { id: 'iron_ingot', count: 1 }, { id: 'iron_ingot', count: 1 },
    { id: 'iron_ingot', count: 1 }, { id: 'iron_ingot', count: 1 }, { id: 'iron_ingot', count: 1 }
  ];
  const chestRecipe = findMatchingRecipe(chestGrid, 3, 3, RECIPES_3X3);
  assert.ok(chestRecipe, 'Iron chestplate recipe should match');
  assert.equal(chestRecipe.id, 'iron_chestplate');

  // Diamond Helmet recipe: 5 diamonds
  const helmGrid = [
    { id: 'diamond', count: 1 }, { id: 'diamond', count: 1 }, { id: 'diamond', count: 1 },
    { id: 'diamond', count: 1 }, null, { id: 'diamond', count: 1 },
    null, null, null
  ];
  const helmRecipe = findMatchingRecipe(helmGrid, 3, 3, RECIPES_3X3);
  assert.ok(helmRecipe, 'Diamond helmet recipe should match');
  assert.equal(helmRecipe.id, 'diamond_helmet');
});

test('Inventory - Armor and Off-hand Equipment Slot Management', () => {
  const sounds = createMockSounds();
  const inv = new Inventory(sounds);

  // Initial state: empty armor and offhand
  assert.deepEqual(inv.armor, { head: null, chest: null, legs: null, feet: null });
  assert.equal(inv.offhand, null);
  assert.equal(inv.getTotalArmorPoints(), 0);
  assert.equal(inv.getTotalArmorToughness(), 0);
  assert.equal(inv.getTotalKnockbackResistance(), 0);

  // Equip full diamond set
  inv.armor.head = { id: 'diamond_helmet', count: 1 };
  inv.armor.chest = { id: 'diamond_chestplate', count: 1 };
  inv.armor.legs = { id: 'diamond_leggings', count: 1 };
  inv.armor.feet = { id: 'diamond_boots', count: 1 };

  assert.equal(inv.getTotalArmorPoints(), 20); // 3 + 8 + 6 + 3 = 20
  assert.equal(inv.getTotalArmorToughness(), 8); // 2 * 4 = 8
  assert.equal(inv.getTotalKnockbackResistance(), 0);

  // Equip netherite set
  inv.armor.head = { id: 'netherite_helmet', count: 1 };
  inv.armor.chest = { id: 'netherite_chestplate', count: 1 };
  inv.armor.legs = { id: 'netherite_leggings', count: 1 };
  inv.armor.feet = { id: 'netherite_boots', count: 1 };

  assert.equal(inv.getTotalArmorPoints(), 20);
  assert.equal(inv.getTotalArmorToughness(), 12); // 3 * 4 = 12
  assert.equal(inv.getTotalKnockbackResistance(), 4); // 1 * 4 = 4
});

test('Inventory - Off-hand Swapping (F Keybind)', () => {
  const sounds = createMockSounds();
  const inv = new Inventory(sounds);

  // Put a shield in hotbar slot 0 and bread in offhand
  inv.activeSlot = 0;
  inv.hotbar[0] = { id: 'shield', count: 1 };
  inv.offhand = { id: 'bread', count: 5 };

  inv.swapOffhand();

  assert.equal(inv.hotbar[0]?.id, 'bread');
  assert.equal(inv.hotbar[0]?.count, 5);
  assert.equal(inv.offhand?.id, 'shield');
  assert.equal(inv.offhand?.count, 1);

  // Swap back
  inv.swapOffhand();
  assert.equal(inv.hotbar[0]?.id, 'shield');
  assert.equal(inv.offhand?.id, 'bread');
});

test('Inventory - Right-click and Shift-click Auto-Equip Armor & Shield', () => {
  const sounds = createMockSounds();
  const inv = new Inventory(sounds);

  // Put an iron helmet in active hotbar slot
  inv.activeSlot = 0;
  inv.hotbar[0] = { id: 'iron_helmet', count: 1 };
  assert.equal(inv.armor.head, null);

  // Right-click in hand auto-equips
  const equipped = inv.equipArmorItem(true);
  assert.equal(equipped, true);
  assert.equal(inv.armor.head?.id, 'iron_helmet');
  assert.equal(inv.hotbar[0], null);
  assert.equal(sounds.flags.armorEquipped, true);

  // Shift-clicking armor in storage auto-equips into empty armor slot
  inv.storage[0] = { id: 'diamond_chestplate', count: 1 };
  inv.handleSlotClick(inv.storage, 0, false, true); // shift-click
  assert.equal(inv.armor.chest?.id, 'diamond_chestplate');
  assert.equal(inv.storage[0], null);

  // Shift-clicking shield in storage auto-equips into offhand slot
  inv.storage[1] = { id: 'shield', count: 1 };
  inv.handleSlotClick(inv.storage, 1, false, true); // shift-click
  assert.equal(inv.offhand?.id, 'shield');
  assert.equal(inv.storage[1], null);

  // Shift-clicking equipped armor returns it to inventory
  inv.handleArmorSlotClick('chest', false, true);
  assert.equal(inv.armor.chest, null);
  assert.ok(inv.hotbar.some(s => s?.id === 'diamond_chestplate') || inv.storage.some(s => s?.id === 'diamond_chestplate'));
});

test('Player - Damage Mitigation Formula (Minecraft Java Edition)', () => {
  const sounds = createMockSounds();
  const world = createMockWorld();
  const camera = new THREE.PerspectiveCamera();
  const domElement = { requestPointerLock: () => {} };
  const player = new Player(camera, domElement, world, sounds);
  const inv = new Inventory(sounds);
  player.inventory = inv;
  player.gamemode = 'survival';
  player.health = 20;

  // 1. Unarmored: taking 4 damage deals full 4 damage
  player.takeDamage(4);
  assert.equal(player.health, 16);

  // Reset health and invulnerable timer
  player.health = 20;
  player.invulnerableTimer = 0;

  // 2. Full Iron Armor (15 armor, 0 toughness)
  // A = 15, T = 0, D = 4
  // A_eff = max(15/5, 15 - 4 / 2) = max(3, 13) = 13
  // Reduction = 13 / 25 = 0.52 (52% reduction)
  // Mitigated damage = 4 * (1 - 0.52) = 1.92
  // Final HP = 20 - 1.92 = 18.08
  inv.armor.head = { id: 'iron_helmet', count: 1 };
  inv.armor.chest = { id: 'iron_chestplate', count: 1 };
  inv.armor.legs = { id: 'iron_leggings', count: 1 };
  inv.armor.feet = { id: 'iron_boots', count: 1 };

  player.takeDamage(4);
  assert.ok(Math.abs(player.health - 18.08) < 0.001, `Expected ~18.08 HP, got ${player.health}`);

  // Reset health
  player.health = 20;
  player.invulnerableTimer = 0;

  // 3. Full Diamond Armor (20 armor, 8 toughness)
  // A = 20, T = 8, D = 4
  // A_eff = max(20/5, 20 - 4 / (2 + 2)) = max(4, 19) = 19
  // Reduction = 19 / 25 = 0.76 (76% reduction)
  // Mitigated damage = 4 * (1 - 0.76) = 0.96
  // Final HP = 20 - 0.96 = 19.04
  inv.armor.head = { id: 'diamond_helmet', count: 1 };
  inv.armor.chest = { id: 'diamond_chestplate', count: 1 };
  inv.armor.legs = { id: 'diamond_leggings', count: 1 };
  inv.armor.feet = { id: 'diamond_boots', count: 1 };

  player.takeDamage(4);
  assert.ok(Math.abs(player.health - 19.04) < 0.001, `Expected ~19.04 HP, got ${player.health}`);

  // 4. Void / Starvation / Fall damage bypasses armor
  player.health = 20;
  player.invulnerableTimer = 0;
  player.takeDamage(5, null, 'fall');
  assert.equal(player.health, 15, 'Fall damage should bypass armor mitigation');
});

test('Player - Shield Blocking & 180-Degree Frontal Deflection', () => {
  const sounds = createMockSounds();
  const world = createMockWorld();
  const camera = new THREE.PerspectiveCamera();
  const domElement = { requestPointerLock: () => {} };
  const player = new Player(camera, domElement, world, sounds);
  const inv = new Inventory(sounds);
  player.inventory = inv;
  player.gamemode = 'survival';
  player.health = 20;
  player.yaw = 0; // Facing negative Z: forward is (0, 0, -1)
  player.position.set(0, 0, 0);

  // Equip shield in offhand
  inv.offhand = { id: 'shield', count: 1 };

  // Case A: Not blocking -> takes full damage
  player.isBlocking = false;
  player.takeDamage(5, new THREE.Vector3(0, 0, -5));
  assert.equal(player.health, 15);
  assert.equal(sounds.flags.shieldBlocked, false);

  // Case B: Blocking and attacked from the FRONT (0, 0, -5) -> 100% blocked!
  player.health = 20;
  player.invulnerableTimer = 0;
  player.isBlocking = true;
  sounds.reset();

  player.takeDamage(10, new THREE.Vector3(0, 0, -5));
  assert.equal(player.health, 20, 'Frontal attack must be 100% blocked by shield');
  assert.equal(sounds.flags.shieldBlocked, true, 'Shield deflection sound should play');

  // Case C: Blocking and attacked from the REAR (0, 0, 5) -> Outside frontal 180° cone -> NOT blocked
  player.health = 20;
  player.invulnerableTimer = 0;
  player.isBlocking = true;
  sounds.reset();

  player.takeDamage(6, new THREE.Vector3(0, 0, 5));
  assert.ok(player.health < 20, 'Attack from behind must NOT be blocked by shield');

  // Case D: Shield blocking with shield in main hand hotbar active slot
  inv.offhand = null;
  inv.hotbar[0] = { id: 'shield', count: 1 };
  inv.activeSlot = 0;
  player.health = 20;
  player.invulnerableTimer = 0;
  player.isBlocking = true;
  sounds.reset();

  player.takeDamage(8, new THREE.Vector3(0, 0, -5));
  assert.equal(player.health, 20, 'Shield in main hand should also block frontal attack');
  assert.equal(sounds.flags.shieldBlocked, true);
});

test('Player - Shield Blocking Slows Movement Speed', () => {
  const sounds = createMockSounds();
  const world = createMockWorld();
  const camera = new THREE.PerspectiveCamera();
  const domElement = { requestPointerLock: () => {} };
  const player = new Player(camera, domElement, world, sounds);
  const inv = new Inventory(sounds);
  player.inventory = inv;
  inv.offhand = { id: 'shield', count: 1 };

  // When not blocking: walkSpeed
  player.onGround = true;
  player.isBlocking = false;
  player.keys['KeyW'] = true;
  for (let i = 0; i < 60; i++) player.update(0.016);
  const walkVel = new THREE.Vector2(player.velocity.x, player.velocity.z).length();

  // Reset velocity
  player.velocity.set(0, 0, 0);

  // When blocking: sneakSpeed (~0.3x walk speed)
  player.isBlocking = true;
  for (let i = 0; i < 60; i++) player.update(0.016);
  const blockVel = new THREE.Vector2(player.velocity.x, player.velocity.z).length();

  assert.ok(blockVel < walkVel, 'Movement speed while blocking must be slower than normal walk speed');
  assert.ok(Math.abs(blockVel - player.sneakSpeed) < 0.2, 'Movement speed while blocking must match sneakSpeed');
});

test('UI - Armor Bar and Off-hand Slot Rendering', async () => {
  const { UIManager } = await import('../src/ui.js');
  const sounds = createMockSounds();
  const world = createMockWorld();
  const camera = new THREE.PerspectiveCamera();
  const domElement = { requestPointerLock: () => {} };
  const player = new Player(camera, domElement, world, sounds);
  const inv = new Inventory(sounds);
  player.inventory = inv;
  player.gamemode = 'survival';

  function mockEl(id, tag = 'div') {
    const children = [];
    return {
      id,
      tagName: tag.toUpperCase(),
      setAttribute: () => {},
      style: {},
      dataset: {},
      children,
      get innerHTML() { return ''; },
      set innerHTML(val) { if (!val) children.length = 0; },
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      appendChild: (c) => children.push(c),
      addEventListener: () => {}
    };
  }

  const armorBar = mockEl('armor-bar');
  const healthBar = mockEl('health-bar');
  const hungerBar = mockEl('hunger-bar');
  const offhandHud = mockEl('offhand-hud-slot');
  const statusBars = mockEl('status-bars');
  const expContainer = mockEl('exp-container');
  const expBar = mockEl('exp-bar');
  const expLevel = mockEl('exp-level');
  const hotbarWrapper = mockEl('hotbar-wrapper');

  const elements = {
    'armor-bar': armorBar,
    'health-bar': healthBar,
    'hunger-bar': hungerBar,
    'offhand-hud-slot': offhandHud,
    'status-bars': statusBars,
    'exp-container': expContainer,
    'exp-bar': expBar,
    'exp-level': expLevel,
    'hotbar-wrapper': hotbarWrapper
  };

  const origDoc = globalThis.document;
  const origWindow = globalThis.window;
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  globalThis.document = {
    getElementById: (id) => elements[id] || mockEl(id),
    querySelector: (sel) => mockEl('selected'),
    querySelectorAll: () => [],
    createElement: (tag) => mockEl('created', tag)
  };

  try {
    const ui = new UIManager(inv, player, world, null, sounds);

    // 1. Initial DOM setup: 10 armor shields
    ui.initStatusBarsDOM();
    assert.equal(armorBar.children.length, 10, 'Armor bar must have 10 shield icons');

    // 2. 0 Armor points: Armor bar should be hidden
    ui.updateStats();
    assert.equal(armorBar.style.display, 'none', 'Armor bar should be hidden when armor points is 0');

    // 3. Equip Diamond Chestplate (8 points) + Iron Helmet (2 points) = 10 points (5 full shields)
    inv.armor.chest = { id: 'diamond_chestplate', count: 1 };
    inv.armor.head = { id: 'iron_helmet', count: 1 };
    assert.equal(inv.getTotalArmorPoints(), 10);

    ui.updateStats();
    assert.equal(armorBar.style.display, 'flex', 'Armor bar must be visible when armor is equipped');
    // First 5 shields should be full (opacity 1)
    for (let i = 0; i < 5; i++) {
      assert.equal(armorBar.children[i].style.opacity, '1');
    }
    // Remaining 5 shields should be empty (opacity 0.25)
    for (let i = 5; i < 10; i++) {
      assert.equal(armorBar.children[i].style.opacity, '0.25');
    }

    // 4. Odd armor points: Leather Helmet (1 point) -> Total 11 points (5 full + 1 half shield)
    inv.armor.feet = { id: 'leather_boots', count: 1 }; // +1 point -> 11 points total
    assert.equal(inv.getTotalArmorPoints(), 11);
    ui.updateStats();

    // 6th shield (index 5) should be half shield with linear gradient
    assert.equal(armorBar.children[5].style.opacity, '1');
    assert.ok(armorBar.children[5].style.background.includes('linear-gradient'), 'Odd armor point must render half shield');

    // 5. Off-hand HUD slot: hidden when empty, visible with icon when equipped
    inv.offhand = null;
    ui.updateHotbar();
    assert.equal(offhandHud.style.display, 'none');

    inv.offhand = { id: 'shield', count: 1 };
    ui.updateHotbar();
    assert.equal(offhandHud.style.display, 'flex');
    assert.equal(offhandHud.children.length, 1);
  } finally {
    globalThis.document = origDoc;
    globalThis.window = origWindow;
  }
});
