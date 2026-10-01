// Guards the front-end wiring: every element id or class the UI looks up must
// exist in index.html, so renaming markup cannot silently break a control.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

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
        if (!htmlIds.has(match[1])) missing.push(`${source}:${index + 1} #${match[1]}`);
      }
      for (const match of line.matchAll(/querySelector(?:All)?\(\s*'\.([a-zA-Z0-9_-]+)'/g)) {
        if (!htmlClasses.has(match[1])) missing.push(`${source}:${index + 1} .${match[1]}`);
      }
    });
  }

  assert.deepEqual(missing, [], `unresolved DOM selectors:\n${missing.join('\n')}`);
});

test('the agent terminal exposes the multi-vendor controls', () => {
  const html = read('index.html');
  for (const id of [
    'gemini-vendor-row',
    'gemini-model-select',
    'gemini-effort-select',
    'gemini-view-toggle',
    'gemini-thinking-toggle',
    'gemini-key-input',
    'gemini-save-key-btn',
    'gemini-clear-key-btn',
    'gemini-offline-btn'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  for (const vendor of ['gemini', 'deepseek', 'chatgpt']) {
    assert.match(html, new RegExp(`data-vendor="${vendor}"`), `missing vendor button ${vendor}`);
  }
  // The player's view is capture-gated by a checkbox that starts checked.
  assert.match(html, /id="gemini-view-toggle"[^>]*checked/);
});

test('the terminal is opened by the C key and still uses the chat/escape handlers', () => {
  const ui = read('src/ui.js');
  assert.match(ui, /e\.code === 'KeyC'/);
  assert.match(ui, /toggleGeminiTerminal\(\)/);
  // The agent receives the captured view through executePrompt options.
  assert.match(ui, /executePrompt\(effectivePrompt, image, \{ viewImage \}\)/);
});
