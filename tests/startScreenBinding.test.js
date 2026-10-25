// Guards the start screen's responsiveness. bindEvents() runs at the end of start(), after the whole
// texture atlas has decoded, so binding the start buttons there left them dead for the first seconds of
// every load: clicks landed on a button with no listener and were dropped, which is why "Generate New
// World" appeared to need several attempts. These assertions pin the binding to the top of start().
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const main = fs.readFileSync(path.join(process.cwd(), 'src/main.js'), 'utf8');

const START_BUTTONS = [
  'btn-start-new-world',
  'btn-start-designed-world',
  'btn-start-load-world',
  'btn-start-building-studio',
  'btn-start-packs',
  // The four Inspector buttons are one button and a picker now, so the picker's own controls are bound here
  // too: they are on the start screen and they must be live from the first frame, like the rest.
  'btn-start-inspector',
  'btn-close-inspector-picker',
  'btn-pick-inspector-structure',
  'btn-pick-inspector-item',
  'btn-pick-inspector-block',
  'btn-pick-inspector-mob',
];

function bindStartScreenBody() {
  const from = main.indexOf('bindStartScreen() {');
  assert.ok(from >= 0, 'bindStartScreen() exists');
  const openBrace = main.indexOf('{', from);
  let depth = 1;
  let idx = openBrace + 1;
  while (depth > 0 && idx < main.length) {
    if (main[idx] === '{') depth++;
    else if (main[idx] === '}') depth--;
    idx++;
  }
  return main.slice(from, idx);
}

test('the start screen is bound before the first thing start() awaits', () => {
  const body = main.slice(main.indexOf('async start()'));
  const firstAwait = body.indexOf('await ');
  const bind = body.indexOf('this.bindStartScreen()');
  assert.ok(bind >= 0, 'start() binds the start screen');
  assert.ok(firstAwait >= 0, 'start() still awaits its loading steps');
  assert.ok(bind < firstAwait, 'and binds before the atlas load, not after it');
});

test('every start-screen button is bound in bindStartScreen()', () => {
  const body = bindStartScreenBody();
  for (const id of START_BUTTONS) {
    assert.ok(body.includes(`'${id}'`), `bindStartScreen binds #${id}`);
  }
});

test('all buttons declared in #start-overlay in index.html are bound or accounted for', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  const startIdx = html.indexOf('id="start-overlay"');
  assert.ok(startIdx >= 0, 'index.html has #start-overlay');
  const endIdx = html.indexOf('<!-- Share This World', startIdx);
  const overlayHtml = html.slice(startIdx, endIdx);
  const matches = Array.from(overlayHtml.matchAll(/id="(btn-[^"]+)"/g)).map((m) => m[1]);
  assert.ok(matches.length >= 7, 'start overlay has buttons');
  const body = bindStartScreenBody();
  for (const btnId of matches) {
    // Join and its code box are bound by WorldSyncManager when multiplayer is wired.
    if (['btn-start-join', 'btn-join-code-confirm', 'btn-join-code-cancel'].includes(btnId)) continue;
    assert.ok(body.includes(`'${btnId}'`), `start overlay button #${btnId} is bound in bindStartScreen()`);
  }
});

test('all JavaScript source files parse cleanly with no syntax errors or duplicate declarations', () => {
  function getJsFiles(dir) {
    let results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(getJsFiles(fullPath));
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
        results.push(fullPath);
      }
    }
    return results;
  }
  const files = getJsFiles(path.join(process.cwd(), 'src'));
  assert.ok(files.length > 50, 'found src JavaScript files');
  // node -c validates syntax of files. Any duplicate declaration
  // (such as `const def`) or syntax error will exit with a non-zero code.
  // We batch in chunks to respect command line length limits on Windows.
  const CHUNK_SIZE = 25;
  for (let i = 0; i < files.length; i += CHUNK_SIZE) {
    const batch = files.slice(i, i + CHUNK_SIZE);
    assert.doesNotThrow(() => {
      execFileSync(process.execPath, ['-c', ...batch], { stdio: 'pipe' });
    }, `Src files batch ${i / CHUNK_SIZE} must parse without SyntaxError`);
  }
});

test('all static named imports in src/main.js resolve to actual exports in target modules', () => {
  function isExported(content, name) {
    const directDecl = new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function\\*?|const|let|var|class)\\s+${name}\\b`);
    if (directDecl.test(content)) return true;
    if (name === 'default' && /\bexport\s+default\b/.test(content)) return true;
    const exportBlocks = content.match(/export\s*\{[^}]+\}/g) || [];
    for (const block of exportBlocks) {
      const exportedItems = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}')).split(',');
      for (const item of exportedItems) {
        const parts = item.trim().split(/\s+as\s+/);
        const exportedAs = parts[parts.length - 1].trim();
        if (exportedAs === name) return true;
      }
    }
    return false;
  }

  function verifyMainImports(baseDir) {
    const mainFile = path.join(baseDir, 'src/main.js');
    if (!fs.existsSync(mainFile)) return;
    const mainContent = fs.readFileSync(mainFile, 'utf8');
    const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"](\.\/[^'"]+)['"]/g;
    let match;
    const missingExports = [];
    while ((match = importRegex.exec(mainContent)) !== null) {
      const rawNames = match[1];
      const relPath = match[2];
      const targetPath = path.resolve(baseDir, 'src', relPath);
      assert.ok(fs.existsSync(targetPath), `Target module exists in ${baseDir}: ${relPath}`);
      const targetContent = fs.readFileSync(targetPath, 'utf8');
      const names = rawNames.split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      for (const name of names) {
        if (name.startsWith('type ')) continue;
        if (!isExported(targetContent, name)) {
          missingExports.push(`${relPath} does not export "${name}" (imported by ${path.relative(process.cwd(), mainFile)})`);
        }
      }
    }
    assert.deepEqual(missingExports, [], `All named imports in ${mainFile} must be exported`);
  }

  // Verify in root repository
  verifyMainImports(process.cwd());

  // Also verify in active worktrees if present
  const worktreeDir = path.join(process.cwd(), '.worktrees', 'quadruped-motion');
  if (fs.existsSync(worktreeDir)) {
    verifyMainImports(worktreeDir);
  }
});

test('bindEvents no longer binds them, so nothing gets two listeners', () => {
  const from = main.indexOf('bindEvents() {');
  const to = main.indexOf('this.renderer.domElement.addEventListener', from);
  const body = main.slice(from, to);
  for (const id of START_BUTTONS) {
    assert.ok(!body.includes(id), `bindEvents should not bind #${id} as well`);
  }
});

test('a click during loading waits for the UI rather than being dropped', () => {
  const body = bindStartScreenBody();
  assert.match(body, /await this\.whenUiReady\(\)/, 'the handlers await UI readiness');
  assert.match(main, /_resolveUiReady\?\.\(\)/, 'the readiness promise is resolved when the UI is built');
  assert.match(main, /this\._uiReady = new Promise/, 'and created before start() runs');
});

test('a click that has to wait says so, instead of looking like a dead button', () => {
  const body = bindStartScreenBody();
  assert.match(body, /classList\.add\('is-waiting'\)/, 'the button marks itself as waiting');
  assert.match(body, /classList\.remove\('is-waiting'\)/, 'and clears the mark when the action runs');
  const css = fs.readFileSync(path.join(process.cwd(), 'src/style.css'), 'utf8');
  assert.match(css, /\.mc-btn\.is-waiting\s*\{/, 'the waiting style exists');
});

test('clicking Create New World / Generate New World triggers openBiomeModal when UI is ready', async () => {
  // DOM stub to test functional event firing
  const listeners = {};
  const mockButton = {
    id: 'btn-start-new-world',
    disabled: false,
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
    },
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
  };

  const oldDoc = globalThis.document;
  let openedBiomeModal = false;
  try {
    globalThis.document = {
      getElementById(id) {
        if (id === 'btn-start-new-world') return mockButton;
        return null;
      },
    };

    // Extract and run bindStartScreen on a mock game context
    let resolveUi;
    const uiPromise = new Promise((r) => { resolveUi = r; });
    const game = {
      ui: null,
      sounds: { init() {} },
      _uiReady: uiPromise,
      whenUiReady() { return this._uiReady; },
    };

    // Dynamically evaluate bindStartScreen on game
    const fnBody = bindStartScreenBody();
    const bodyCode = fnBody.slice(fnBody.indexOf('{') + 1, fnBody.lastIndexOf('}'));
    const bindStartScreen = new Function('packsModal', bodyCode);

    bindStartScreen.call(game, { open() {} });
    assert.ok(listeners.click, 'click listener registered on btn-start-new-world');

    // Simulate click while UI is still loading
    const event = { stopPropagation() {}, currentTarget: mockButton };
    const clickPromise = listeners.click(event);

    // Button should show is-waiting
    assert.equal(mockButton.disabled, true);
    assert.equal(mockButton.classList.contains('is-waiting'), true);

    // Now UI finishes loading
    game.ui = {
      openBiomeModal() {
        openedBiomeModal = true;
      },
    };
    resolveUi();
    await clickPromise;

    // Button is no longer waiting and openBiomeModal was executed
    assert.equal(mockButton.disabled, false);
    assert.equal(mockButton.classList.contains('is-waiting'), false);
    assert.equal(openedBiomeModal, true, 'openBiomeModal was called');
  } finally {
    globalThis.document = oldDoc;
  }
});

test('clicking any other start screen button triggers its action handler', async () => {
  const elements = new Map();
  function getOrCreateElement(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        disabled: false,
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
        listeners: {},
        addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
        fire(type, e = {}) {
          e.stopPropagation ??= () => {};
          e.currentTarget = this;
          return Promise.all((this.listeners[type] ?? []).map((fn) => fn(e)));
        },
      });
    }
    return elements.get(id);
  }

  const oldDoc = globalThis.document;
  try {
    globalThis.document = {
      getElementById(id) {
        return getOrCreateElement(id);
      },
    };

    const actionsCalled = {};
    const game = {
      ui: {
        openDesignedWorldsModal() { actionsCalled.designedWorlds = true; },
        openMapModal(mode) { actionsCalled.loadMap = mode; },
      },
      sounds: { init() {} },
      whenUiReady() { return Promise.resolve(); },
      startBuildingStudio() { actionsCalled.buildingStudio = true; },
      openInspectorPicker() { actionsCalled.openPicker = true; },
      closeInspectorPicker() { actionsCalled.closePicker = true; },
      openInspector(dest) { actionsCalled[`inspector_${dest}`] = true; },
    };

    const packsModalMock = {
      open() { actionsCalled.packsModal = true; },
    };

    const fnBody = bindStartScreenBody();
    const bodyCode = fnBody.slice(fnBody.indexOf('{') + 1, fnBody.lastIndexOf('}'));
    const bindStartScreen = new Function('packsModal', bodyCode);
    bindStartScreen.call(game, packsModalMock);

    // Click designed worlds
    await getOrCreateElement('btn-start-designed-world').fire('click');
    assert.equal(actionsCalled.designedWorlds, true, 'btn-start-designed-world opens designed worlds modal');

    // Click load world
    await getOrCreateElement('btn-start-load-world').fire('click');
    assert.equal(actionsCalled.loadMap, 'load', 'btn-start-load-world opens map load modal');

    // Click building studio
    await getOrCreateElement('btn-start-building-studio').fire('click');
    assert.equal(actionsCalled.buildingStudio, true, 'btn-start-building-studio opens studio');

    // Click packs & skins
    await getOrCreateElement('btn-start-packs').fire('click');
    assert.equal(actionsCalled.packsModal, true, 'btn-start-packs opens packsModal');

    // Click inspector & picker
    await getOrCreateElement('btn-start-inspector').fire('click');
    assert.equal(actionsCalled.openPicker, true, 'btn-start-inspector opens picker');

    await getOrCreateElement('btn-close-inspector-picker').fire('click');
    assert.equal(actionsCalled.closePicker, true, 'btn-close-inspector-picker closes picker');

    await getOrCreateElement('btn-pick-inspector-structure').fire('click');
    assert.equal(actionsCalled.inspector_structure, true, 'structure inspector opened');

    await getOrCreateElement('btn-pick-inspector-item').fire('click');
    assert.equal(actionsCalled.inspector_item, true, 'item inspector opened');

    await getOrCreateElement('btn-pick-inspector-block').fire('click');
    assert.equal(actionsCalled.inspector_block, true, 'block inspector opened');

    await getOrCreateElement('btn-pick-inspector-mob').fire('click');
    assert.equal(actionsCalled.inspector_mob, true, 'mob inspector opened');
  } finally {
    globalThis.document = oldDoc;
  }
});
