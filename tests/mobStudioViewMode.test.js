// Mob Studio's view/create modes and the Test Action button.
//
// The requested behaviour: every existing mob can be opened and inspected but not modified,
// newly created mobs are editable and saveable, an opened mob stands still, and Test Action
// runs the behavioural scenario suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobStudioManager } from '../src/mobStudio.js';
import { MobLibrary } from '../src/mobLibrary.js';
import { studioCatalog } from '../src/mobShowcase.js';

/**
 * A minimal element stand-in. Only what the Studio touches: text, classes, style, disabled.
 */
function fakeElement(id) {
  return {
    id,
    style: {},
    className: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    title: '',
    value: '',
    checked: false,
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    appendChild() {}, append() {}, addEventListener() {}, querySelectorAll: () => [], focus() {}
  };
}

/**
 * Install a fake `document` for the duration of a test.
 *
 * Always restored: the suite shares one process, and a leaked global `document` breaks
 * unrelated files.
 */
function withFakeDocument(t) {
  const elements = new Map();
  const previous = globalThis.document;
  const make = () => {
    const el = fakeElement('created');
    // A catch-all 2D context: the mob texture painters use a wide slice of the canvas API,
    // and enumerating it would be a losing game. Any unknown method is a no-op, and the few
    // calls whose return value matters are given real answers.
    const real = {
      measureText: () => ({ width: 8 }),
      getImageData: (x, y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }),
      createImageData: (w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)) }),
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      createPattern: () => ({}),
      isPointInPath: () => false
    };
    el.getContext = () => new Proxy(real, {
      get: (target, prop) => (prop in target ? target[prop] : (typeof prop === 'string' ? () => {} : undefined)),
      set: (target, prop, value) => { target[prop] = value; return true; }
    });
    el.toDataURL = () => 'data:image/png;base64,AAAA';
    el.width = 64;
    el.height = 64;
    return el;
  };
  globalThis.document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { ...fakeElement(id), ...make(), id });
      return elements.get(id);
    },
    createElement: make,
    createElementNS: make,
    querySelectorAll: () => [],
    body: make()
  };
  t.after(() => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  });
  return elements;
}

function fakeGame() {
  const scene = new THREE.Scene();
  const messages = [];
  return {
    scene,
    player: { position: new THREE.Vector3(0, 5, 0), gamemode: 'creative', yaw: 0, pitch: 0, health: 100 },
    world: { getVoxel: () => 0, setVoxel: () => {} },
    mobs: { spawnCustomMob: (def) => ({ mesh: new THREE.Group(), customDef: def }), mobs: [] },
    ui: { addChatMessage: (m) => messages.push(m), updateHotbar() {} },
    inventory: { hotbar: [], storage: [], getActiveItem: () => null },
    _messages: messages
  };
}

/** A native mob as the open-list would supply it. */
const nativeEntry = (id) => {
  const found = studioCatalog(MobLibrary).find(m => m.id === id);
  assert.ok(found, `${id} should be in the studio catalogue`);
  return found;
};

// --- opening a native mob: view mode ---------------------------------------

test('opening a native mob enters read-only view mode', (t) => {
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  studio.loadMob(nativeEntry('ocelot'));

  assert.equal(studio.viewMode, 'view', 'a native mob opens read-only');
  assert.ok(studio.debugSession, 'a debug session backs the view');
  assert.equal(studio.currentMob.id, 'ocelot');
  assert.equal(studio.currentMob.name, 'Ocelot');
});

test('an opened native mob does not move', (t) => {
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  studio.loadMob(nativeEntry('cow'));

  const mob = studio.debugSession.mob;
  assert.equal(mob.frozen, true, 'the mob is frozen on open');
  const start = mob.mesh.position.clone();
  for (let i = 0; i < 150; i++) studio.debugSession.tick(1 / 30);
  assert.ok(mob.mesh.position.distanceTo(start) < 1e-6, 'and stays put while you inspect it');
});

test('view mode hides the edit controls and disables saving', (t) => {
  const elements = withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  studio.loadMob(nativeEntry('pig'));

  const controls = elements.get('studio-mob-controls');
  const info = elements.get('mob-view-info');
  assert.equal(controls.style.display, 'none', 'the create controls are hidden');
  assert.equal(info.style.display, '', 'the read-only info panel is shown');
  assert.equal(studio.btnSave.disabled, true, 'a native mob cannot be saved');
});

test('the read-only panel describes the mob it opened', (t) => {
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  studio.loadMob(nativeEntry('cow'));

  const html = studio.viewInfoContent.innerHTML;
  assert.match(html, /cow|Cow/i, 'the mob is named');
  assert.match(html, /Health:/, 'health is shown');
  assert.match(html, /Width:/, 'dimensions are shown');
  assert.match(html, /Test Action/, 'and it points at the Test Action button');
});

test('switching from a native mob to a custom one returns to create mode', (t) => {
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  studio.loadMob(nativeEntry('cow'));
  assert.equal(studio.viewMode, 'view');

  studio.loadMob({ id: 'custom_thing', name: 'Thing', look: {}, behavior: {}, skills: [], eggColors: {} });
  assert.equal(studio.viewMode, 'create', 'a custom mob is editable');
  assert.equal(studio.debugSession, null, 'the debug session is torn down');
  assert.equal(studio.btnSave.disabled, false, 'and saving is allowed again');
});

test('opening a native mob replaces any previous debug session', (t) => {
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  studio.loadMob(nativeEntry('cow'));
  const first = studio.debugSession;
  studio.loadMob(nativeEntry('pig'));
  assert.notEqual(studio.debugSession, first, 'a fresh session is created');
  assert.equal(studio.debugSession.manager.mobs.length, 1, 'only the new mob is present');
});

test('every catalogue mob can be opened in view mode without throwing', (t) => {
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  for (const entry of studioCatalog(MobLibrary)) {
    assert.doesNotThrow(() => studio.loadMob(entry), `opening ${entry.id} should work`);
    assert.ok(studio.currentMob, `${entry.id} should become the current mob`);
  }
});

// --- Test Action / Animate --------------------------------------------------

test('Test Action runs the behavioural scenario suite for a native mob', (t) => {
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  studio.loadMob(nativeEntry('cow'));

  assert.doesNotThrow(() => studio.testPreviewAction());
  assert.ok(studio.showcase, 'a showcase was created');
  assert.ok(studio.showcase.cases.length >= 3, 'it has scenarios to run');
  // There is no requestAnimationFrame under Node, so the runner's headless fallback drives
  // the whole suite synchronously; by the time this returns the run has finished.
  assert.equal(studio.showcase.running, false, 'the headless fallback completes the run');
  assert.equal(studio.showcase.results.length, studio.showcase.cases.length,
    'every scenario produced a result');
});

test('a finished run leaves the mob posed on its pedestal again', (t) => {
  // Studio freezes the mob it opens. The runner un-freezes it per scenario so behaviour can
  // be observed, and the run must end with it posed again.
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  studio.loadMob(nativeEntry('cow'));
  assert.equal(studio.debugSession.mob.frozen, true, 'posed on open');

  studio.testPreviewAction();
  assert.equal(studio.showcase.running, false, 'the headless run completed');
  assert.equal(studio.debugSession.mob.frozen, true, 'and the mob is posed again');
  assert.ok(studio.showcase.results.length > 0, 'having actually run scenarios');
});

test('the showcase completes and re-freezes the mob afterwards', (t) => {
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  studio.loadMob(nativeEntry('cow'));
  studio.testPreviewAction();

  // Headless (no requestAnimationFrame) means the runner drives itself to completion.
  assert.equal(studio.showcase.running, false, 'the run finished');
  assert.equal(studio.debugSession.mob.frozen, true, 'and the mob is posed again');
  assert.ok(studio.showcase.results.length > 0, 'results were recorded');
});

test('the showcase result is reported to the terminal and the status panel', (t) => {
  const elements = withFakeDocument(t);
  const game = fakeGame();
  const studio = new MobStudioManager(game);
  studio.loadMob(nativeEntry('cow'));
  studio.testPreviewAction();

  const status = elements.get('mob-showcase-status');
  assert.match(status.textContent, /scenarios passed/, 'the status panel summarises the run');
  assert.match(status.className, /mob-showcase-/, 'and carries a state class for styling');
  assert.ok(game._messages.some(m => /scenarios passed/.test(m)), 'the terminal is told as well');
});

test('Test Action works for a custom mob in create mode too', (t) => {
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  assert.equal(studio.viewMode, 'create', 'a fresh studio is in create mode');
  assert.doesNotThrow(() => studio.testPreviewAction());
  assert.ok(studio.showcase, 'custom mobs get a scenario suite as well');
});

test('running Test Action twice does not leave two showcases running', (t) => {
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  studio.loadMob(nativeEntry('cow'));
  studio.testPreviewAction();
  const first = studio.showcase;
  studio.testPreviewAction();
  assert.notEqual(studio.showcase, first, 'a new run replaces the old one');
  assert.ok(!(first.running && studio.showcase.running), 'they are not both running');
});

// --- custom mobs stay editable ---------------------------------------------

test('saving is offered for a custom mob and refused for a native one', (t) => {
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  studio.loadMob(nativeEntry('cow'));
  assert.equal(studio.btnSave.disabled, true);

  studio.loadMob({ id: 'custom_save_me', name: 'Save Me', look: {}, behavior: {}, skills: [], eggColors: {} });
  assert.equal(studio.btnSave.disabled, false);
});

test('the create-mode form carries the mob appearance fields', (t) => {
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  // The defaults the panel loads into the inputs must cover the newer anatomy fields too,
  // otherwise the form silently drops properties the renderer supports.
  const look = studio.currentMob.look;
  for (const field of ['modelType', 'mainColor', 'accentColor', 'eyeColor', 'scale',
    'ears', 'earTipColor', 'tail', 'tailColor', 'hasCheekPatches', 'cheekColor',
    'hasMouth', 'hasNose', 'hasWings', 'hasHorns', 'hasGlowingEyes']) {
    assert.ok(field in look, `create mode should track look.${field}`);
  }
});

test('the studio does not leak a debug session after switching back to create', (t) => {
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  studio.loadMob(nativeEntry('cow'));
  studio.loadMob({ id: 'custom_x', name: 'X', look: {}, behavior: {}, skills: [], eggColors: {} });
  assert.equal(studio.debugSession, null);
  assert.equal(studio.btnSave.disabled, false);
});

// --- handing off to the standalone inspector --------------------------------

test('the studio can open the mob it is showing in the standalone inspector', (t) => {
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  studio.loadMob(nativeEntry('ocelot'));

  const opened = [];
  const url = studio.openDebugInspector({ open: (u) => opened.push(u) });

  assert.equal(url, '/mob-debug.html?mob=ocelot', 'it deep-links to the mob on the pedestal');
  assert.deepEqual(opened, [url], 'and opens it');
});

test('the inspector link follows whichever mob is currently open', (t) => {
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  const opened = [];
  const win = { open: (u) => opened.push(u) };

  studio.loadMob(nativeEntry('cow'));
  studio.openDebugInspector(win);
  studio.loadMob(nativeEntry('pig'));
  studio.openDebugInspector(win);
  studio.loadMob({ id: 'custom_thing', name: 'Thing', look: {}, behavior: {}, skills: [], eggColors: {} });
  studio.openDebugInspector(win);

  assert.deepEqual(opened, [
    '/mob-debug.html?mob=cow',
    '/mob-debug.html?mob=pig',
    '/mob-debug.html?mob=custom_thing'
  ], 'custom mobs can be inspected too');
});

test('the inspector id is URL-encoded, and a missing mob opens nothing', (t) => {
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  const opened = [];
  const win = { open: (u) => opened.push(u) };

  studio.currentMob = { id: 'custom_odd id/with?chars' };
  const url = studio.openDebugInspector(win);
  assert.ok(!url.includes(' '), 'the id is encoded');
  assert.match(url, /^\/mob-debug\.html\?mob=/);

  studio.currentMob = null;
  assert.equal(studio.openDebugInspector(win), null, 'nothing to open');
  assert.equal(opened.length, 1, 'and no window is opened');
});

test('opening the inspector is safe when no window is available', (t) => {
  withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  studio.loadMob(nativeEntry('cow'));
  assert.doesNotThrow(() => studio.openDebugInspector(null), 'headless use must not throw');
});

// --- reporting behaviour the game does not implement yet --------------------

test('unimplemented scenarios are reported but not counted against the mob', (t) => {
  const elements = withFakeDocument(t);
  const game = fakeGame();
  const studio = new MobStudioManager(game);
  // A mob whose attack AI does not exist: its attack scenario reports 'unsupported'.
  studio.loadMob(nativeEntry('vindicator'));
  studio.testPreviewAction();

  const status = elements.get('mob-showcase-status');
  assert.match(status.textContent, /not implemented yet/,
    'the missing behaviour is named, not hidden');
  // Scored scenarios must not be reduced by the unimplemented one.
  const summary = status.textContent.split('\n')[0];
  const [passed, total] = summary.match(/(\d+)\/(\d+)/).slice(1).map(Number);
  assert.ok(passed > 0, 'the mob still passes the scenarios that apply to it');
  assert.ok(total <= studio.showcase.results.length,
    'unsupported scenarios are excluded from the denominator');
  assert.equal(passed, total,
    `vindicator should pass everything scored, got ${summary}`);
});

test('a run with unimplemented scenarios is not shown as a failure', (t) => {
  const elements = withFakeDocument(t);
  const studio = new MobStudioManager(fakeGame());
  studio.loadMob(nativeEntry('vindicator'));
  studio.testPreviewAction();
  const status = elements.get('mob-showcase-status');
  assert.ok(!/❌/.test(status.textContent), 'nothing should be marked as failed');
  assert.ok(/➖/.test(status.textContent), 'the unimplemented one is marked distinctly');
});
