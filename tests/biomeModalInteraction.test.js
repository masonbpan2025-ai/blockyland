import test from 'node:test';
import assert from 'node:assert/strict';

import { UIManager } from '../src/ui.js';

function createMockElement(id = '', tag = 'div') {
  const listeners = {};
  const classList = new Set();
  const children = [];

  const el = {
    id,
    tagName: tag.toUpperCase(),
    value: '',
    textContent: '',
    disabled: false,
    style: {},
    classList: {
      add: (cls) => classList.add(cls),
      remove: (cls) => classList.delete(cls),
      contains: (cls) => classList.has(cls)
    },
    addEventListener: (event, handler) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    click: async (evt = {}) => {
      if (listeners['click']) {
        for (const h of listeners['click']) {
          await h({ stopPropagation() {}, ...evt });
        }
      }
    },
    trigger: (event, evt = {}) => {
      if (listeners[event]) {
        for (const h of listeners[event]) {
          h(evt);
        }
      }
    },
    appendChild: (child) => children.push(child)
  };
  return el;
}

test('UIManager biome selection modal interaction and world creation flow', async () => {
  const elements = {
    'world-biome-modal': createMockElement('world-biome-modal'),
    'world-biome-select': createMockElement('world-biome-select', 'select'),
    'world-seed-input': createMockElement('world-seed-input', 'input'),
    'btn-randomize-seed': createMockElement('btn-randomize-seed', 'button'),
    'btn-create-world-confirm': createMockElement('btn-create-world-confirm', 'button'),
    'btn-close-biome-modal': createMockElement('btn-close-biome-modal', 'button'),
    'biome-info-card': createMockElement('biome-info-card'),
    'biome-info-icon': createMockElement('biome-info-icon'),
    'biome-info-name': createMockElement('biome-info-name'),
    'biome-info-dimension': createMockElement('biome-info-dimension'),
    'biome-info-desc': createMockElement('biome-info-desc'),
    'biome-tag-category': createMockElement('biome-tag-category'),
    'biome-tag-blocks': createMockElement('biome-tag-blocks'),
    'biome-tag-mobs': createMockElement('biome-tag-mobs'),
    'start-overlay': createMockElement('start-overlay'),
    'hotbar-wrapper': createMockElement('hotbar-wrapper'),
    'health-bar': createMockElement('health-bar'),
    'hunger-bar': createMockElement('hunger-bar'),
    'exp-bar': createMockElement('exp-bar'),
    'exp-level': createMockElement('exp-level'),
    'inventory-modal': createMockElement('inventory-modal'),
    'crafting-modal': createMockElement('crafting-modal'),
    'villager-modal': createMockElement('villager-modal'),
    'pause-menu': createMockElement('pause-menu'),
    'designed-worlds-modal': createMockElement('designed-worlds-modal'),
    'map-modal': createMockElement('map-modal'),
    'gemini-terminal-modal': createMockElement('gemini-terminal-modal')
  };

  const prevDoc = globalThis.document;
  const prevWindow = globalThis.window;

  globalThis.document = {
    getElementById: (id) => elements[id] || null,
    exitPointerLock: () => {}
  };
  globalThis.window = {
    addEventListener: () => {}
  };

  try {
    let reseededSeed = null;
    let reseededBiome = null;
    let generatedNewWorldCalled = false;

    const mockGame = {
      world: {
        seed: 4289,
        selectedBiome: 'all',
        reseed(seed, biome) {
          reseededSeed = seed;
          reseededBiome = biome;
        }
      },
      worldGenerated: false,
      worldReady: false,
      _worldStartInFlight: false,
      async generateNewWorld() {
        generatedNewWorldCalled = true;
        this.worldGenerated = true;
        this.worldReady = true;
      },
      overlay: { hide() {} }
    };

    const ui = Object.assign(Object.create(UIManager.prototype), {
      inv: { activeSlot: 0, items: [] },
      player: { position: { set() {} } },
      world: mockGame.world,
      mobs: {},
      sounds: { init() {}, playPop() {} },
      game: mockGame,
      startOverlay: elements['start-overlay'],
      invModal: elements['inventory-modal'],
      craftModal: elements['crafting-modal'],
      villagerModal: elements['villager-modal'],
      pauseModal: elements['pause-menu'],
      designedWorldsModal: elements['designed-worlds-modal'],
      mapModal: elements['map-modal'],
      geminiModal: elements['gemini-terminal-modal'],
      hideTooltip() {},
      updateFloatingCursor() {},
      isGeminiOpen() { return false; },
      playPopSound() {}
    });

    // Wire biome modal elements
    ui.biomeModal = elements['world-biome-modal'];
    ui.worldBiomeSelect = elements['world-biome-select'];
    ui.worldSeedInput = elements['world-seed-input'];
    ui.btnRandomizeSeed = elements['btn-randomize-seed'];
    ui.btnCreateWorldConfirm = elements['btn-create-world-confirm'];
    ui.btnCloseBiomeModal = elements['btn-close-biome-modal'];
    ui.biomeInfoCard = elements['biome-info-card'];
    ui.biomeInfoIcon = elements['biome-info-icon'];
    ui.biomeInfoName = elements['biome-info-name'];
    ui.biomeInfoDimension = elements['biome-info-dimension'];
    ui.biomeInfoDesc = elements['biome-info-desc'];
    ui.biomeTagCategory = elements['biome-tag-category'];
    ui.biomeTagBlocks = elements['biome-tag-blocks'];
    ui.biomeTagMobs = elements['biome-tag-mobs'];

    ui.biomeModal.classList.add('hidden');
    ui.bindBiomeModalEvents();

    // 1. Open Biome Modal
    ui.openBiomeModal();
    assert.equal(ui.biomeModal.classList.contains('hidden'), false);
    assert.equal(ui.worldSeedInput.value, '');

    // 2. Select Biome and Update Info Card
    ui.worldBiomeSelect.value = 'cherry_grove';
    ui.updateBiomeInfoCard();
    assert.equal(ui.biomeInfoName.textContent, 'Cherry Grove');
    assert.equal(ui.biomeInfoIcon.textContent, '🏔️');

    // 3. Randomize Seed
    await ui.btnRandomizeSeed.click();
    const randomizedSeed = parseInt(ui.worldSeedInput.value, 10);
    assert.ok(!isNaN(randomizedSeed) && randomizedSeed > 0);

    // 4. Confirm World Generation
    await ui.btnCreateWorldConfirm.click();
    assert.equal(reseededBiome, 'cherry_grove');
    assert.equal(reseededSeed, randomizedSeed);
    assert.equal(generatedNewWorldCalled, true);
    assert.equal(ui.biomeModal.classList.contains('hidden'), true);

    // 5. Test empty seed produces a fresh random seed automatically
    mockGame.worldGenerated = false;
    ui.openBiomeModal();
    ui.worldBiomeSelect.value = 'desert';
    ui.worldSeedInput.value = '';
    await ui.btnCreateWorldConfirm.click();
    assert.equal(reseededBiome, 'desert');
    assert.ok(typeof reseededSeed === 'number' && reseededSeed > 0);
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWindow;
  }
});
