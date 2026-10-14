// Guards the start screen's responsiveness. bindEvents() runs at the end of start(), after the whole
// texture atlas has decoded, so binding the start buttons there left them dead for the first seconds of
// every load: clicks landed on a button with no listener and were dropped, which is why "Generate New
// World" appeared to need several attempts. These assertions pin the binding to the top of start().
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const main = fs.readFileSync(path.join(process.cwd(), 'src/main.js'), 'utf8');

const START_BUTTONS = [
  'btn-start-new-world',
  'btn-start-designed-world',
  'btn-start-load-world',
  'btn-start-building-studio',
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
  const to = main.indexOf('\n  bindEvents() {', from);
  assert.ok(to > from, 'and is followed by bindEvents()');
  return main.slice(from, to);
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
