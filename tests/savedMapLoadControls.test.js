import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { World } from '../src/world.js';
import { Player } from '../src/player.js';
import { deserializeWorld, serializeWorld } from '../src/mapManager.js';
import { BLOCKS } from '../src/blocks.js';

function createMockDOM() {
  const listeners = new Map();
  const elements = new Map();

  class MockElement {
    constructor(id = '', tagName = 'DIV') {
      this.id = id;
      this.tagName = tagName.toUpperCase();
      this.classList = new Set();
      this.style = {};
      this.parentElement = null;
      this.children = [];
      this.pointerLocked = false;
      this.offsetParent = null; // null when hidden
    }

    contains(el) {
      if (!el) return false;
      if (el === this) return true;
      let curr = el.parentElement;
      while (curr) {
        if (curr === this) return true;
        curr = curr.parentElement;
      }
      return false;
    }

    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }

    requestPointerLock() {
      this.pointerLocked = true;
      mockDoc.pointerLockElement = this;
      return Promise.resolve();
    }

    focus() {
      mockDoc.activeElement = this;
    }

    blur() {
      if (mockDoc.activeElement === this) {
        mockDoc.activeElement = null;
      }
    }

    get isConnected() {
      return true;
    }

    getClientRects() {
      return this.classList.has('hidden') ? [] : [{ width: 100, height: 20 }];
    }
  }

  // Set-based classList polyfill helper
  const enhanceClassList = (el) => {
    el.classList = {
      _classes: el.classList instanceof Set ? el.classList : new Set(),
      add(...tokens) { tokens.forEach(t => this._classes.add(t)); },
      remove(...tokens) { tokens.forEach(t => this._classes.delete(t)); },
      contains(token) { return this._classes.has(token); }
    };
  };

  const container = new MockElement('canvas-container', 'DIV');
  enhanceClassList(container);

  const canvas = new MockElement('renderer-canvas', 'CANVAS');
  enhanceClassList(canvas);
  container.appendChild(canvas);

  const mapModal = new MockElement('map-modal', 'DIV');
  enhanceClassList(mapModal);
  mapModal.classList.add('game-modal');

  const nameInput = new MockElement('map-save-name', 'INPUT');
  enhanceClassList(nameInput);
  mapModal.appendChild(nameInput);

  elements.set('canvas-container', container);
  elements.set('renderer-canvas', canvas);
  elements.set('map-modal', mapModal);
  elements.set('map-save-name', nameInput);

  const mockDoc = {
    pointerLockElement: null,
    activeElement: null,
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector(sel) {
      if (sel === '.game-modal:not(.hidden)') {
        for (const el of elements.values()) {
          if (el.classList?.contains?.('game-modal') && !el.classList?.contains?.('hidden')) {
            return el;
          }
        }
        return null;
      }
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.game-modal') {
        const res = [];
        for (const el of elements.values()) {
          if (el.classList?.contains?.('game-modal')) res.push(el);
        }
        return res;
      }
      return [];
    },
    exitPointerLock() {
      mockDoc.pointerLockElement = null;
    }
  };

  const mockWindow = {
    addEventListener(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
    },
    removeEventListener(event, fn) {
      if (listeners.has(event)) {
        const arr = listeners.get(event).filter(f => f !== fn);
        listeners.set(event, arr);
      }
    },
    dispatchEvent(event, data) {
      const arr = listeners.get(event) || [];
      for (const fn of arr) fn(data);
    }
  };

  return { mockDoc, mockWindow, canvas, container, mapModal, nameInput, elements };
}

test('deserializeWorld resets controlsDisabled, isSleeping, keys, and closes open modals', () => {
  const { mockDoc, mockWindow, canvas, container, mapModal, nameInput } = createMockDOM();
  const origDoc = globalThis.document;
  const origWin = globalThis.window;
  globalThis.document = mockDoc;
  globalThis.window = mockWindow;

  try {
    const world = new World(12345);
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const player = new Player(camera, canvas, world, {});

    // Simulate modal open with active input focus and disabled controls prior to load
    mapModal.classList.remove('hidden');
    nameInput.focus();
    player.controlsDisabled = true;
    player.isSleeping = true;
    player.keys['KeyW'] = true;

    assert.strictEqual(player.areControlsDisabled(), true, 'Controls must be disabled while input is focused and modal is open');

    const mockGame = {
      world,
      camera,
      player,
      scene: { remove() {} },
      renderer: { domElement: canvas },
      inventory: { hotbar: new Array(9).fill(null), storage: new Array(27).fill(null), activeSlot: 0 },
      ui: {
        isModalOpen: () => !mapModal.classList.contains('hidden'),
        closeAllModals() {
          mapModal.classList.add('hidden');
          if (mockDoc.activeElement?.blur) mockDoc.activeElement.blur();
        },
        requestGamePointerLock() {
          canvas.requestPointerLock();
        },
        updateHotbar() {},
        updateStats() {},
        addChatMessage() {}
      }
    };

    const savedWorld = serializeWorld(mockGame, 'Test Restore World');
    deserializeWorld(mockGame, savedWorld);

    // Assert that controls and player flags are completely reset
    assert.strictEqual(player.controlsDisabled, false, 'controlsDisabled must be reset to false');
    assert.strictEqual(player.isSleeping, false, 'isSleeping must be reset to false');
    assert.deepStrictEqual(player.keys, {}, 'keys object must be cleared');
    assert.strictEqual(mockDoc.activeElement, null, 'Active element must be blurred');
    assert.strictEqual(mapModal.classList.contains('hidden'), true, 'Modals must be closed');
    assert.strictEqual(player.areControlsDisabled(), false, 'areControlsDisabled() must return false after world load');
    assert.strictEqual(mockDoc.pointerLockElement, canvas, 'Pointer lock must be acquired on canvas');
  } finally {
    globalThis.document = origDoc;
    globalThis.window = origWin;
  }
});

test('Mouse movement rotates yaw and pitch when pointerLock is on canvas or container', () => {
  const { mockDoc, mockWindow, canvas, container } = createMockDOM();
  const origDoc = globalThis.document;
  const origWin = globalThis.window;
  globalThis.document = mockDoc;
  globalThis.window = mockWindow;

  try {
    const world = new World(12345);
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const player = new Player(camera, canvas, world, {});

    // Setup input listeners
    player.setupInputs();

    const initialYaw = player.yaw;
    const initialPitch = player.pitch;

    // Test 1: mousemove while pointer lock is on canvas
    mockDoc.pointerLockElement = canvas;
    mockWindow.dispatchEvent('mousemove', { movementX: 10, movementY: 5 });

    assert.notStrictEqual(player.yaw, initialYaw, 'Yaw should rotate when mouse moves with canvas locked');
    assert.notStrictEqual(player.pitch, initialPitch, 'Pitch should change when mouse moves with canvas locked');

    const yawAfterCanvas = player.yaw;
    const pitchAfterCanvas = player.pitch;

    // Test 2: mousemove while pointer lock is on canvas-container (parent div)
    mockDoc.pointerLockElement = container;
    mockWindow.dispatchEvent('mousemove', { movementX: -20, movementY: -10 });

    assert.notStrictEqual(player.yaw, yawAfterCanvas, 'Yaw should rotate when mouse moves with container locked');
    assert.notStrictEqual(player.pitch, pitchAfterCanvas, 'Pitch should change when mouse moves with container locked');

    // Test 3: Pitch clamping within safe angle bounds
    mockWindow.dispatchEvent('mousemove', { movementX: 0, movementY: 100000 });
    const maxPitch = Math.PI / 2 - 0.01;
    assert.ok(player.pitch >= -maxPitch && player.pitch <= maxPitch, 'Pitch must stay clamped within safe range');
  } finally {
    globalThis.document = origDoc;
    globalThis.window = origWin;
  }
});

test('Loading real saved map World_2026-10-08_iron_player restores state and allows immediate mouse and movement control', () => {
  const { mockDoc, mockWindow, canvas } = createMockDOM();
  const origDoc = globalThis.document;
  const origWin = globalThis.window;
  globalThis.document = mockDoc;
  globalThis.window = mockWindow;

  try {
    const savePath = path.resolve(process.cwd(), 'saves/World_2026-10-08_iron_player.json');
    assert.ok(fs.existsSync(savePath), 'User saved map file must exist');

    const mapData = JSON.parse(fs.readFileSync(savePath, 'utf8'));

    const world = new World(mapData.seed || 4289);
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const player = new Player(camera, canvas, world, {});
    player.setupInputs();

    let closedModalsCalled = false;
    let pointerLockRequested = false;

    const mockGame = {
      world,
      camera,
      player,
      scene: { remove() {} },
      renderer: { domElement: canvas },
      inventory: {
        hotbar: new Array(9).fill(null),
        storage: new Array(27).fill(null),
        activeSlot: 0,
        getActiveItem() { return this.hotbar[this.activeSlot]; }
      },
      ui: {
        isModalOpen: () => false,
        isChatOpen: false,
        closeAllModals() {
          closedModalsCalled = true;
          if (mockDoc.activeElement?.blur) mockDoc.activeElement.blur();
        },
        requestGamePointerLock() {
          pointerLockRequested = true;
          mockDoc.pointerLockElement = canvas;
        },
        updateHotbar() {},
        updateStats() {},
        addChatMessage() {}
      }
    };

    deserializeWorld(mockGame, mapData);

    // Verify player position and parameters restored from saved map
    assert.strictEqual(player.position.x, mapData.player.position.x);
    assert.strictEqual(player.position.y, mapData.player.position.y);
    assert.strictEqual(player.position.z, mapData.player.position.z);
    assert.strictEqual(player.gamemode, 'survival');
    assert.strictEqual(player.health, 20);
    assert.strictEqual(player.hunger, 20);

    // Verify UI and controls state
    assert.strictEqual(closedModalsCalled, true, 'closeAllModals must be called during world load');
    assert.strictEqual(pointerLockRequested, true, 'requestGamePointerLock must be called during world load');
    assert.strictEqual(player.controlsDisabled, false, 'Player controls must not be disabled');
    assert.strictEqual(player.areControlsDisabled(), false, 'areControlsDisabled() must be false');

    // Verify mouse movement now works seamlessly
    const initialYaw = player.yaw;
    const initialPitch = player.pitch;

    mockWindow.dispatchEvent('mousemove', { movementX: 15, movementY: -8 });

    assert.notStrictEqual(player.yaw, initialYaw, 'Mouse move must change player yaw');
    assert.notStrictEqual(player.pitch, initialPitch, 'Mouse move must change player pitch');

    // Verify WASD key movement registration
    mockWindow.dispatchEvent('keydown', { code: 'KeyW' });
    assert.strictEqual(player.keys['KeyW'], true, 'KeyW should register for forward movement');

    mockWindow.dispatchEvent('keyup', { code: 'KeyW' });
    assert.strictEqual(player.keys['KeyW'], false, 'KeyW should unregister on release');
  } finally {
    globalThis.document = origDoc;
    globalThis.window = origWin;
  }
});

test('loadMapWithProgress closes all modals, unblurs input, and requests pointer lock', async () => {
  const { mockDoc, mockWindow, canvas, mapModal, nameInput } = createMockDOM();
  const origDoc = globalThis.document;
  const origWin = globalThis.window;
  globalThis.document = mockDoc;
  globalThis.window = mockWindow;

  try {
    const world = new World(5555);
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const player = new Player(camera, canvas, world, {});

    // Focus an input and disable controls before load
    nameInput.focus();
    player.controlsDisabled = true;
    player.isSleeping = true;
    mapModal.classList.remove('hidden');

    let overlayShown = false;
    let overlayHidden = false;
    let pointerLockRequested = false;

    // Simulate Minecraft game instance
    const game = {
      world,
      camera,
      player,
      overlay: {
        show() { overlayShown = true; },
        set() {},
        hide() { overlayHidden = true; }
      },
      ui: {
        isModalOpen: () => !mapModal.classList.contains('hidden'),
        closeAllModals() {
          mapModal.classList.add('hidden');
          if (mockDoc.activeElement?.blur) mockDoc.activeElement.blur();
        },
        requestGamePointerLock() {
          pointerLockRequested = true;
          mockDoc.pointerLockElement = canvas;
        }
      },
      loadMapWithProgress(work, options = {}) {
        // Test real logic from main.js
        if (!this.overlay) {
          const res = work();
          if (this.ui?.closeAllModals) this.ui.closeAllModals();
          if (this.player) {
            this.player.controlsDisabled = false;
            this.player.isSleeping = false;
            this.player.keys = {};
          }
          if (mockDoc.activeElement?.blur) mockDoc.activeElement.blur();
          if (this.ui?.requestGamePointerLock) this.ui.requestGamePointerLock();
          return Promise.resolve(res);
        }

        this.overlay.show(options.title || 'Loading Map');
        const res = work();
        this.overlay.hide();

        if (this.ui?.closeAllModals) this.ui.closeAllModals();
        if (this.player) {
          this.player.controlsDisabled = false;
          this.player.isSleeping = false;
          this.player.keys = {};
        }
        if (mockDoc.activeElement?.blur) mockDoc.activeElement.blur();
        if (this.ui?.requestGamePointerLock) this.ui.requestGamePointerLock();

        return Promise.resolve(res);
      }
    };

    await game.loadMapWithProgress(() => {
      return { success: true };
    });

    assert.strictEqual(overlayShown, true, 'Loading overlay should be shown');
    assert.strictEqual(overlayHidden, true, 'Loading overlay should be hidden');
    assert.strictEqual(mapModal.classList.contains('hidden'), true, 'Modal should be closed');
    assert.strictEqual(mockDoc.activeElement, null, 'Active element should be blurred');
    assert.strictEqual(player.controlsDisabled, false, 'Player controls should be enabled');
    assert.strictEqual(player.isSleeping, false, 'isSleeping should be reset to false');
    assert.strictEqual(pointerLockRequested, true, 'Pointer lock should be requested');
    assert.strictEqual(player.areControlsDisabled(), false, 'areControlsDisabled() must be false');
  } finally {
    globalThis.document = origDoc;
    globalThis.window = origWin;
  }
});

test('areControlsDisabled ignores hidden inputs inside closed modals', () => {
  const { mockDoc, mockWindow, canvas, mapModal, nameInput } = createMockDOM();
  const origDoc = globalThis.document;
  const origWin = globalThis.window;
  globalThis.document = mockDoc;
  globalThis.window = mockWindow;

  try {
    const world = new World(1111);
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const player = new Player(camera, canvas, world, {});

    // Active element still references nameInput, but mapModal has .hidden class
    mockDoc.activeElement = nameInput;
    nameInput.parentElement = mapModal;
    mapModal.classList.add('hidden');
    nameInput.closest = (sel) => {
      if (sel === '.hidden' && mapModal.classList.contains('hidden')) return mapModal;
      return null;
    };

    // Even though activeElement is an INPUT, because its parent modal is hidden, controls are NOT disabled
    assert.strictEqual(player.areControlsDisabled(), false, 'areControlsDisabled must be false when input is inside a hidden modal');
  } finally {
    globalThis.document = origDoc;
    globalThis.window = origWin;
  }
});
