// The Java Edition hotkeys in src/hotkeys.js. The module is only a table of key -> Game method, so the tests
// check three things: the table matches the Java Edition list, typing in a field is never a hotkey, and every
// action named in the table is a method the Game actually has (a rename would otherwise fail silently).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DEBUG_COMBOS, debugActionFor, isTypingTarget, installHotkeys } from '../src/hotkeys.js';

test('the debug combinations are the Java Edition set', () => {
  const expected = {
    KeyA: 'reloadChunks',
    KeyB: 'toggleHitboxes',
    KeyC: 'copyLocation',
    KeyD: 'clearChat',
    KeyG: 'toggleChunkBorders',
    KeyH: 'toggleAdvancedTooltips',
    KeyI: 'copyBlockData',
    KeyN: 'cycleGameMode',
    KeyP: 'toggleFocusPause',
    KeyT: 'reloadResources',
    KeyV: 'dumpVersionInfo',
  };
  assert.deepEqual(DEBUG_COMBOS, expected);
  assert.equal(debugActionFor('KeyZ'), null, 'a key outside the set is not a combination');
  assert.equal(debugActionFor('toString'), null, 'and neither is an inherited property');
});

test('typing in a text field is never a game hotkey', () => {
  assert.equal(isTypingTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTypingTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV' }), false);
  assert.equal(isTypingTarget(null), false);
});

test('every action named in the table is a Game method', () => {
  const main = fs.readFileSync(path.join(process.cwd(), 'src/main.js'), 'utf8');
  const actions = [...Object.values(DEBUG_COMBOS), 'toggleHud', 'captureScreenshot', 'toggleFullscreen', 'toggleNarrator'];
  for (const action of actions) {
    assert.match(main, new RegExp(`\\n  (?:async )?${action}\\(`), `Game.${action}() exists`);
  }
});

test('the game installs the hotkeys', () => {
  const main = fs.readFileSync(path.join(process.cwd(), 'src/main.js'), 'utf8');
  assert.match(main, /import \{ installHotkeys \} from '\.\/hotkeys\.js'/, 'the module is imported');
  assert.match(main, /installHotkeys\(this\)/, 'and installed');
});

test('F3 arms the combinations, releasing it disarms them, and typing is left alone', () => {
  const listeners = {};
  const win = {
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: () => {},
  };
  const calls = [];
  const game = new Proxy({}, { get: (_, prop) => (typeof prop === 'string' ? () => calls.push(prop) : undefined) });
  const remove = installHotkeys(game, { window: win, document: {} });
  const fire = (type, event) => { for (const fn of listeners[type] ?? []) fn(event); };
  const key = (code, extra = {}) => ({ code, target: { tagName: 'BODY' }, preventDefault() {}, ...extra });

  fire('keydown', key('KeyA'));
  assert.deepEqual(calls, [], 'A on its own is not a debug combination');

  fire('keydown', key('F3'));
  fire('keydown', key('KeyA'));
  assert.deepEqual(calls, ['reloadChunks'], 'F3+A reloads the chunks');

  fire('keyup', key('F3'));
  calls.length = 0;
  fire('keydown', key('KeyA'));
  assert.deepEqual(calls, [], 'and once F3 is released it is an ordinary key again');

  fire('keydown', key('F1'));
  fire('keydown', key('F2'));
  fire('keydown', key('F11'));
  fire('keydown', key('KeyB', { ctrlKey: true }));
  assert.deepEqual(calls, ['toggleHud', 'captureScreenshot', 'toggleFullscreen', 'toggleNarrator']);

  calls.length = 0;
  fire('keydown', { code: 'F1', target: { tagName: 'INPUT' }, preventDefault() {} });
  assert.deepEqual(calls, [], 'F1 inside a text field is not a hotkey');

  assert.equal(typeof remove, 'function', 'and the listeners can be removed again');
  remove();
});
