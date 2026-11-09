// Context menu suppression: right-clicking in-game (to interact with crafting tables,
// chests, furnaces, doors, etc.) or inside workstation modals must NEVER show the
// browser's native context menu ("Save image as...", "Copy image", "Inspect").
import test from 'node:test';
import assert from 'node:assert/strict';
import { preventGameContextMenu, UIManager } from '../src/ui.js';

test('preventGameContextMenu suppresses context menu on game canvas', () => {
  let prevented = false;
  const fakeEvent = {
    target: { tagName: 'CANVAS', isContentEditable: false },
    preventDefault() { prevented = true; }
  };
  preventGameContextMenu(fakeEvent);
  assert.equal(prevented, true, 'canvas right-click must prevent native context menu');
});

test('preventGameContextMenu suppresses context menu on slot icons and images', () => {
  let prevented = false;
  const fakeEvent = {
    target: { tagName: 'IMG', className: 'slot-icon', isContentEditable: false },
    preventDefault() { prevented = true; }
  };
  preventGameContextMenu(fakeEvent);
  assert.equal(prevented, true, 'image right-click must prevent "Save image as..." / "Copy image"');
});

test('preventGameContextMenu suppresses context menu on modals, slots and UI elements', () => {
  const elementTags = ['DIV', 'SPAN', 'BUTTON', 'P', 'LABEL', 'HEADER', 'SECTION'];
  for (const tagName of elementTags) {
    let prevented = false;
    const fakeEvent = {
      target: { tagName, isContentEditable: false },
      preventDefault() { prevented = true; }
    };
    preventGameContextMenu(fakeEvent);
    assert.equal(prevented, true, `${tagName} in game UI must prevent context menu`);
  }
});

test('preventGameContextMenu allows native context menu in editable text inputs and textareas', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    let prevented = false;
    const fakeEvent = {
      target: { tagName, isContentEditable: false },
      preventDefault() { prevented = true; }
    };
    preventGameContextMenu(fakeEvent);
    assert.equal(prevented, false, `${tagName} must permit native copy/paste context menu`);
  }

  let contentEditablePrevented = false;
  const editableEvent = {
    target: { tagName: 'DIV', isContentEditable: true },
    preventDefault() { contentEditablePrevented = true; }
  };
  preventGameContextMenu(editableEvent);
  assert.equal(contentEditablePrevented, false, 'contentEditable must permit native context menu');
});

test('crafting result slots bind oncontextmenu to take output and prevent default', () => {
  // Mock DOM environment for UI test
  const elements = {};
  const mockEl = (id, tag = 'div') => {
    const el = {
      id,
      tagName: tag.toUpperCase(),
      dataset: {},
      classList: {
        contains: () => false,
        add: () => {},
        remove: () => {},
        toggle: () => {}
      },
      style: {},
      children: [],
      childNodes: [],
      append: () => {},
      appendChild: (c) => c,
      replaceChildren: () => {},
      removeChild: () => {},
      getContext: () => new Proxy({}, { get: () => () => ({ width: 0 }) }),
      toDataURL: () => 'data:image/png;base64,',
      addEventListener: () => {},
      removeEventListener: () => {},
      setAttribute: () => {},
      removeAttribute: () => {},
      getAttribute: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      innerHTML: '',
      textContent: '',
      onclick: null,
      oncontextmenu: null
    };
    elements[id] = el;
    return el;
  };

  const oldDoc = globalThis.document;
  const oldWin = globalThis.window;

  try {
    globalThis.document = {
      getElementById: (id) => elements[id] || mockEl(id),
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: (tag) => mockEl(`created-${tag}`, tag),
      exitPointerLock: () => {}
    };
    globalThis.window = {
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    const res2 = mockEl('craft2x2-result');
    const res3 = mockEl('craft3x3-result');

    let craftTaken = null;
    const mockInv = {
      storage: new Array(27).fill(null),
      hotbar: new Array(9).fill(null),
      craft2x2: new Array(4).fill(null),
      craft3x3: new Array(9).fill(null),
      craft2x2Result: { id: 'stick', count: 4 },
      craft3x3Result: { id: 'oak_planks', count: 4 },
      takeCraftResult(is3x3) {
        craftTaken = is3x3;
      },
      getItemMeta: () => ({ name: 'Test', count: 1 })
    };

    const mockPlayer = { gamemode: 'survival', level: 0 };
    const ui = new UIManager(mockInv, mockPlayer, {}, null, { playClick: () => {} }, null);
    ui.bindInventoryEvents();

    assert.equal(typeof res2.oncontextmenu, 'function', 'craft2x2-result must have oncontextmenu');
    assert.equal(typeof res3.oncontextmenu, 'function', 'craft3x3-result must have oncontextmenu');

    // Trigger right click on 3x3 result
    let prevented = false;
    res3.oncontextmenu({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true, 'craft3x3 right-click must prevent context menu');
    assert.equal(craftTaken, true, 'craft3x3 right-click must take result');

    // Trigger right click on 2x2 result
    prevented = false;
    craftTaken = null;
    res2.oncontextmenu({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true, 'craft2x2 right-click must prevent context menu');
    assert.equal(craftTaken, false, 'craft2x2 right-click must take result');
  } finally {
    globalThis.document = oldDoc;
    globalThis.window = oldWin;
  }
});

test('workstation output slots (anvil, grindstone, smithing) prevent context menu on right click', () => {
  const elements = {};
  const mockEl = (id, tag = 'div') => {
    const el = {
      id,
      tagName: tag.toUpperCase(),
      dataset: {},
      classList: { contains: () => false, add: () => {}, remove: () => {}, toggle: () => {} },
      style: {},
      children: [],
      childNodes: [],
      append: () => {},
      appendChild: (c) => c,
      replaceChildren: () => {},
      removeChild: () => {},
      getContext: () => new Proxy({}, { get: () => () => ({ width: 0 }) }),
      toDataURL: () => 'data:image/png;base64,',
      addEventListener: () => {},
      removeEventListener: () => {},
      setAttribute: () => {},
      removeAttribute: () => {},
      getAttribute: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      innerHTML: '',
      textContent: '',
      onclick: null,
      oncontextmenu: null
    };
    elements[id] = el;
    return el;
  };

  const oldDoc = globalThis.document;
  const oldWin = globalThis.window;

  try {
    globalThis.document = {
      getElementById: (id) => elements[id] || mockEl(id),
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: (tag) => mockEl(`gen-${tag}`, tag),
      exitPointerLock: () => {}
    };
    globalThis.window = {
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    const anvilOutput = mockEl('anvil-output-slot');
    const grindstoneOutput = mockEl('grindstone-output-slot');
    const smithingOutput = mockEl('smithing-output-slot');

    const mockInv = {
      storage: new Array(27).fill(null),
      hotbar: new Array(9).fill(null),
      craft2x2: new Array(4).fill(null),
      craft3x3: new Array(9).fill(null),
      getItemMeta: () => ({ name: 'Test', count: 1 })
    };

    const ui = new UIManager(mockInv, { gamemode: 'survival', level: 30 }, {}, null, { playClick: () => {} }, null);

    // Test Anvil output slot
    ui.anvilLeftItem = { id: 'iron_sword', durability: 50, maxDurability: 250 };
    ui.anvilRightItem = { id: 'iron_ingot', count: 1 };
    ui.renderAnvilGUI();
    assert.equal(typeof anvilOutput.oncontextmenu, 'function', 'anvil-output-slot must have oncontextmenu');
    let anvilPrevented = false;
    anvilOutput.oncontextmenu({ preventDefault() { anvilPrevented = true; } });
    assert.equal(anvilPrevented, true, 'anvil output right-click must call preventDefault()');

    // Test Grindstone output slot
    ui.grindstoneTopItem = { id: 'diamond_sword', enchantments: [{ id: 'sharpness', level: 1 }] };
    ui.renderGrindstoneGUI();
    assert.equal(typeof grindstoneOutput.oncontextmenu, 'function', 'grindstone-output-slot must have oncontextmenu');
    let grindstonePrevented = false;
    grindstoneOutput.oncontextmenu({ preventDefault() { grindstonePrevented = true; } });
    assert.equal(grindstonePrevented, true, 'grindstone output right-click must call preventDefault()');

    // Test Smithing output slot
    ui.smithingTemplateItem = { id: 'netherite_upgrade_smithing_template', count: 1 };
    ui.smithingBaseItem = { id: 'diamond_chestplate', count: 1 };
    ui.smithingAdditionItem = { id: 'netherite_ingot', count: 1 };
    ui.renderSmithingGUI();
    assert.equal(typeof smithingOutput.oncontextmenu, 'function', 'smithing-output-slot must have oncontextmenu');
    let smithingPrevented = false;
    smithingOutput.oncontextmenu({ preventDefault() { smithingPrevented = true; } });
    assert.equal(smithingPrevented, true, 'smithing output right-click must call preventDefault()');
  } finally {
    globalThis.document = oldDoc;
    globalThis.window = oldWin;
  }
});

