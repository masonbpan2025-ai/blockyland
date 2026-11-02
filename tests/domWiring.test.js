// Guards the front-end wiring: every element id or class the UI looks up must
// exist in index.html, so renaming markup cannot silently break a control.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

/**
 * Ids the front-end creates and removes at runtime, so they are deliberately absent from index.html and
 * cannot be validated against the markup: `renderHorseInventory` appends the horse equipment panel when
 * a tamed horse is ridden, and `toggleInventory` removes it again. Everything else the UI looks up must
 * exist in the markup, which is what caught the Building Studio button being wired to an id that no
 * longer existed.
 */
const RUNTIME_CREATED_IDS = new Set(['horse-equipment']);
const RUNTIME_CREATED_CLASSES = new Set(['boss-bar-title', 'boss-bar-fill', 'compass-needle']); // updateBossBar creates the first two, renderHotbar the compass needles.

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('every element the front-end looks up exists in index.html', () => {
  const html = read('index.html');
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const htmlClasses = new Set(
    [...html.matchAll(/\bclass="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(Boolean)
  );

  const missing = [];
  for (const source of ['src/ui.js', 'src/main.js']) {
    const lines = read(source).split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)) {
        if (!htmlIds.has(match[1]) && !RUNTIME_CREATED_IDS.has(match[1])) missing.push(`${source}:${index + 1} #${match[1]}`);
      }
      for (const match of line.matchAll(/querySelector(?:All)?\(\s*'\.([a-zA-Z0-9_-]+)'/g)) {
        if (!htmlClasses.has(match[1]) && !RUNTIME_CREATED_CLASSES.has(match[1])) missing.push(`${source}:${index + 1} .${match[1]}`);
      }
    });
  }

  assert.deepEqual(missing, [], `unresolved DOM selectors:\n${missing.join('\n')}`);
});

test('the agent terminal offers Offline Mode and Connect AI, and no API-key settings', () => {
  const html = read('index.html');
  for (const id of [
    'gemini-offline-btn',
    'agent-connect-btn',
    'agent-connect-drawer',
    'agent-connect-status',
    'agent-connect-code',
    'agent-connect-setup',
    'agent-connect-copy-setup',
    'agent-connect-copy-prompt',
    'agent-connect-new-code',
    'agent-connect-collapse',
    'agent-connect-details',
    'agent-activity',
    'gemini-compact-btn',
    'gemini-view-toggle'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  // Keys are gone from the page: the player's own AI app brings its own account.
  for (const id of ['gemini-key-input', 'gemini-vault-passphrase', 'gemini-vendor-row', 'gemini-model-select']) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`), `#${id} should be gone`);
  }
  // Offline Mode starts ON, and the view checkbox starts checked.
  assert.match(html, /id="gemini-offline-btn"[^>]*aria-checked="true"/);
  assert.match(html, /id="gemini-view-toggle"[^>]*checked/);
});

test('the terminal is opened by the C key and still uses the chat/escape handlers', () => {
  const ui = read('src/ui.js');
  assert.match(ui, /e\.code === 'KeyC'/);
  assert.match(ui, /toggleGeminiTerminal\(\)/);
});
