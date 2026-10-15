import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/player.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { UIManager } from '../src/ui.js';
import { Inventory } from '../src/inventory.js';
import { showDifficultyDialog } from '../src/dialogUtils.js';

function createMockElement(id = '', tag = 'div') {
  const children = [];
  const classList = new Set();
  if (id.includes('modal') || id.includes('menu') || id.includes('overlay')) {
    classList.add('hidden');
  }
  const attributes = new Map();
  const listeners = new Map();

  const el = {
    id,
    tagName: tag.toUpperCase(),
    children,
    style: {},
    dataset: {},
    get className() { return Array.from(classList).join(' '); },
    set className(val) {
      classList.clear();
      String(val || '').split(/\s+/).filter(Boolean).forEach(c => classList.add(c));
    },
    classList: {
      add: (...cls) => cls.forEach(c => classList.add(c)),
      remove: (...cls) => cls.forEach(c => classList.delete(c)),
      contains: (c) => classList.has(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classList.has(c)) classList.delete(c);
          else classList.add(c);
        } else if (force) {
          classList.add(c);
        } else {
          classList.delete(c);
        }
      }
    },
    setAttribute: (k, v) => attributes.set(k, String(v)),
    getAttribute: (k) => attributes.get(k) || null,
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    removeChild: (child) => {
      const idx = children.indexOf(child);
      if (idx !== -1) children.splice(idx, 1);
      return child;
    },
    replaceChildren: (...args) => {
      children.length = 0;
      if (args.length) children.push(...args);
    },
    querySelector: (sel) => {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return children.find(c => c.classList.contains(cls)) || null;
      }
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return children.filter(c => c.classList.contains(cls));
      }
      return [];
    },
    addEventListener: (evt, fn) => {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt).push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (listeners.has(evt)) {
        const arr = listeners.get(evt).filter(f => f !== fn);
        listeners.set(evt, arr);
      }
    },
    dispatchEvent: (event) => {
      const arr = listeners.get(event.type) || [];
      arr.forEach(fn => fn(event));
    },
    click: () => {
      if (el.onclick) el.onclick({ stopPropagation: () => {} });
      const arr = listeners.get('click') || [];
      arr.forEach(fn => fn({ stopPropagation: () => {} }));
    },
    textContent: '',
    innerHTML: ''
  };

  Object.defineProperty(el, 'innerHTML', {
    get: () => '',
    set: (val) => {
      if (val === '') children.length = 0;
    }
  });

  return el;
}

test('Air Bar - 10 breathing bubbles initialized and toggled by water submersion', () => {
  const elements = {};
  ['status-bars', 'health-bar', 'armor-bar', 'hunger-bar', 'air-bar', 'exp-container', 'exp-bar', 'exp-level',
   'hotbar-wrapper', 'inventory-modal', 'crafting-modal', 'furnace-modal', 'chest-modal', 'enchanting-modal',
   'villager-modal', 'brewing-modal', 'anvil-modal', 'smithing-modal', 'grindstone-modal', 'beacon-modal',
   'pause-menu', 'btn-gamemode', 'btn-difficulty', 'close-inv', 'close-crafting', 'craft2x2-result', 'craft3x3-result'
  ].forEach(id => {
    elements[id] = createMockElement(id);
  });

  const origDoc = globalThis.document;
  const origWindow = globalThis.window;

  globalThis.document = {
    getElementById: (id) => elements[id] || createMockElement(id),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => createMockElement('', tag),
    exitPointerLock: () => {}
  };
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  try {
    const inv = new Inventory();
    const player = new Player(null, inv, null, null);
    player.gamemode = 'survival';
    player.health = 20;
    player.maxHealth = 20;
    player.hunger = 20;
    player.breath = 15;
    player.inWater = false;

    const ui = new UIManager(inv, player, null, null, null, { difficulty: 'normal', settings: { gameMode: 'survival' } });
    ui.initStatusBarsDOM();

    const airBar = elements['air-bar'];
    assert.equal(airBar.children.length, 10, 'Air bar must have 10 bubble icons');
    assert.ok(airBar.children[0].classList.contains('bubble-icon'), 'Bubble icon class must be present');

    // On land with full breath: air bar is hidden
    ui.updateStats();
    assert.equal(airBar.style.display, 'none', 'Air bar is hidden on land with full air');

    // In water: air bar is displayed
    player.inWater = true;
    ui.updateStats();
    assert.equal(airBar.style.display, 'flex', 'Air bar is visible when in water');
    // All 10 bubbles visible
    assert.equal(airBar.children[0].style.opacity, '1');
    assert.equal(airBar.children[9].style.opacity, '1');

    // Half breath remaining (7.5s / 15s = 5 bubbles)
    player.breath = 7.5;
    ui.updateStats();
    assert.equal(airBar.style.display, 'flex');
    assert.equal(airBar.children[4].style.opacity, '1', '5th bubble visible');
    assert.equal(airBar.children[5].style.opacity, '0', '6th bubble hidden');
    assert.equal(airBar.children[9].style.opacity, '0', '10th bubble hidden');

    // Out of water but breath still replenishing (e.g. 10s < 15s)
    player.inWater = false;
    ui.updateStats();
    assert.equal(airBar.style.display, 'flex', 'Air bar remains visible while breath is below capacity');

    // Full breath recovered on land: hides
    player.breath = 15;
    ui.updateStats();
    assert.equal(airBar.style.display, 'none', 'Air bar hides once air is fully replenished');

    // Creative mode: always hidden
    player.gamemode = 'creative';
    player.inWater = true;
    player.breath = 5;
    ui.updateStats();
    assert.equal(elements['status-bars'].style.display, 'none', 'Status bars hidden in creative mode');
  } finally {
    globalThis.document = origDoc;
    globalThis.window = origWindow;
  }
});

test('Wiki Parity - Drowning damage bypasses armor points, shield blocking, and preserves armor durability', () => {
  const inv = new Inventory();
  const player = new Player(null, inv, null, null);
  player.gamemode = 'survival';
  player.health = 20;

  // Equip full diamond armor (20 armor points, 8 toughness)
  inv.armor.head = { id: 'diamond_helmet', durability: 100, maxDurability: 100 };
  inv.armor.chest = { id: 'diamond_chestplate', durability: 100, maxDurability: 100 };
  inv.armor.legs = { id: 'diamond_leggings', durability: 100, maxDurability: 100 };
  inv.armor.feet = { id: 'diamond_boots', durability: 100, maxDurability: 100 };
  assert.equal(inv.getTotalArmorPoints(), 20);

  // Equip shield and block
  inv.offhand = { id: 'shield', durability: 336, maxDurability: 336 };
  player.isBlocking = true;

  // Apply drowning damage: 2 HP
  player.takeDamage(2, null, 'drowning');

  // Should take exact 2 HP (1 full heart) without mitigation
  assert.equal(player.health, 18, 'Drowning damage must deal full 2 damage bypassing 20 armor points and shield');

  // Armor durability must remain untouched
  assert.equal(inv.armor.head.durability, 100, 'Drowning must not degrade helmet durability');
  assert.equal(inv.armor.chest.durability, 100, 'Drowning must not degrade chestplate durability');
  assert.equal(inv.offhand.durability, 336, 'Drowning must not degrade shield durability');
});

test('Wiki Parity - Suffocation damage inside solid opaque blocks (1 damage / 0.5s)', () => {
  const world = {
    getVoxel: (x, y, z) => BLOCKS.STONE
  };
  const inv = new Inventory();
  const player = new Player(null, null, world, null);
  player.inventory = inv;
  player.gamemode = 'survival';
  player.health = 20;
  player.position.set(10, 5, 10);

  // Equip full diamond armor
  inv.armor.chest = { id: 'diamond_chestplate', durability: 100, maxDurability: 100 };

  // Tick suffocation for 0.4s (no damage yet, interval is 0.5s)
  player.tickSuffocation(0.4);
  assert.equal(player.health, 20, 'No suffocation damage before 0.5s');

  // Tick another 0.1s (total 0.5s -> 1 damage / half heart)
  player.tickSuffocation(0.1);
  assert.equal(player.health, 19, 'Suffocation deals 1 damage every 0.5s');
  assert.equal(inv.armor.chest.durability, 100, 'Suffocation must not degrade armor durability');

  // Next 0.5s -> another 1 damage (simulate 0.5s time progression so invulnerability timer cools down)
  player.invulnerableTimer = Math.max(0, player.invulnerableTimer - 0.5);
  player.tickSuffocation(0.5);
  assert.equal(player.health, 18, 'Suffocation ticks again after another 0.5s');

  // Moving head to transparent or non-solid block stops suffocation
  world.getVoxel = (x, y, z) => BLOCKS.GLASS;
  player.tickSuffocation(1.0);
  assert.equal(player.health, 18, 'Glass block is transparent and does not suffocate');

  world.getVoxel = (x, y, z) => BLOCKS.AIR;
  player.tickSuffocation(1.0);
  assert.equal(player.health, 18, 'Air does not suffocate');
});

test('Pause Menu - ESC detaches pointer lock and immediately opens pause menu', () => {
  const elements = {};
  ['pause-menu', 'btn-gamemode', 'btn-difficulty', 'close-inv', 'close-crafting', 'craft2x2-result', 'craft3x3-result',
   'inventory-modal', 'crafting-modal', 'furnace-modal', 'chest-modal', 'enchanting-modal', 'villager-modal',
   'brewing-modal', 'anvil-modal', 'smithing-modal', 'grindstone-modal', 'beacon-modal', 'status-bars', 'hotbar-wrapper',
   'death-overlay', 'defeat-overlay', 'designed-worlds-modal', 'map-modal', 'biome-modal', 'creative-modal', 'gemini-modal'
  ].forEach(id => {
    const el = createMockElement(id);
    if (id.includes('modal') || id.includes('menu') || id.includes('overlay')) {
      el.classList.add('hidden');
    }
    elements[id] = el;
  });

  let pointerLocked = true;
  let exitPointerLockCalled = false;
  const keyListeners = [];

  const origDoc = globalThis.document;
  const origWindow = globalThis.window;

  globalThis.document = {
    getElementById: (id) => elements[id] || createMockElement(id),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => createMockElement('', tag),
    get pointerLockElement() { return pointerLocked ? {} : null; },
    exitPointerLock: () => {
      exitPointerLockCalled = true;
      pointerLocked = false;
    }
  };
  globalThis.window = {
    addEventListener: (evt, fn) => {
      if (evt === 'keydown') keyListeners.push(fn);
    },
    removeEventListener: () => {}
  };

  try {
    const inv = new Inventory();
    const player = new Player(null, inv, null, null);
    player.gamemode = 'survival';

    const mockGame = {
      difficulty: 'normal',
      settings: { gameMode: 'survival' },
      setGameMode: (m) => { player.gamemode = m; },
      setDifficulty: (d) => { mockGame.difficulty = d; }
    };

    const ui = new UIManager(inv, player, null, null, null, mockGame);

    const pauseMenu = elements['pause-menu'];
    pauseMenu.classList.add('hidden');

    // Simulate pressing Escape while pointer is locked
    assert.equal(keyListeners.length > 0, true);
    assert.equal(ui.isModalOpen(), false, 'isModalOpen should be false');
    assert.ok(document.pointerLockElement, 'pointerLockElement should be truthy');
    const escEvent = { code: 'Escape', preventDefault: () => {} };
    keyListeners.forEach(fn => fn(escEvent));

    assert.equal(exitPointerLockCalled, true, 'Pointer lock should be exited');
    assert.equal(pauseMenu.classList.contains('hidden'), false, 'Pause menu must open immediately on ESC');
  } finally {
    globalThis.document = origDoc;
    globalThis.window = origWindow;
  }
});

test('Pause Menu - Switching Creative to Survival opens Difficulty selection and sets both', () => {
  const elements = {};
  ['pause-menu', 'btn-gamemode', 'btn-difficulty', 'close-inv', 'close-crafting', 'craft2x2-result', 'craft3x3-result',
   'inventory-modal', 'crafting-modal', 'furnace-modal', 'chest-modal', 'enchanting-modal', 'villager-modal',
   'brewing-modal', 'anvil-modal', 'smithing-modal', 'grindstone-modal', 'beacon-modal', 'status-bars', 'hotbar-wrapper'
  ].forEach(id => {
    elements[id] = createMockElement(id);
  });

  const modalSelectDiff = createMockElement('modal-select-difficulty');
  modalSelectDiff.classList.add('hidden');
  elements['modal-select-difficulty'] = modalSelectDiff;

  const btnEasy = createMockElement('btn-diff-easy');
  btnEasy.classList.add('difficulty-choice-btn');
  btnEasy.setAttribute('data-difficulty', 'hard');
  modalSelectDiff.appendChild(btnEasy);

  const origDoc = globalThis.document;
  const origWindow = globalThis.window;

  globalThis.document = {
    getElementById: (id) => elements[id] || createMockElement(id),
    querySelector: () => null,
    querySelectorAll: (sel) => {
      if (sel === '.difficulty-choice-btn') return [btnEasy];
      return [];
    },
    createElement: (tag) => createMockElement('', tag),
    exitPointerLock: () => {}
  };
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  try {
    const inv = new Inventory();
    const player = new Player(null, inv, null, null);
    player.gamemode = 'creative';

    let gameModeSet = '';
    let difficultySet = '';

    const mockGame = {
      difficulty: 'normal',
      settings: { gameMode: 'creative' },
      setGameMode: (m) => {
        gameModeSet = m;
        player.gamemode = m;
      },
      setDifficulty: (d) => {
        difficultySet = d;
        mockGame.difficulty = d;
      }
    };

    const ui = new UIManager(inv, player, null, null, null, mockGame);
    ui.bindPauseEvents();

    const btnGamemode = elements['btn-gamemode'];
    const btnDifficulty = elements['btn-difficulty'];

    // 1. Click Game Mode button when in Creative -> prompts difficulty dialog
    btnGamemode.click();
    assert.equal(modalSelectDiff.classList.contains('hidden'), false, 'Difficulty dialog modal is shown');

    // 2. Select 'hard' difficulty
    btnEasy.click();
    assert.equal(modalSelectDiff.classList.contains('hidden'), true, 'Difficulty dialog modal closes on selection');
    assert.equal(gameModeSet, 'survival', 'Game mode changed to survival');
    assert.equal(difficultySet, 'hard', 'Difficulty set to hard');
    assert.equal(btnGamemode.textContent, 'Game Mode: Survival');
    assert.equal(btnDifficulty.textContent, 'Difficulty: Hard');

    // 3. Click difficulty button to change difficulty independently
    btnEasy.setAttribute('data-difficulty', 'peaceful');
    btnDifficulty.click();
    assert.equal(modalSelectDiff.classList.contains('hidden'), false, 'Difficulty dialog opens on btn-difficulty click');
    btnEasy.click();
    assert.equal(difficultySet, 'peaceful', 'Difficulty changed to peaceful');
    assert.equal(btnDifficulty.textContent, 'Difficulty: Peaceful');
  } finally {
    globalThis.document = origDoc;
    globalThis.window = origWindow;
  }
});
