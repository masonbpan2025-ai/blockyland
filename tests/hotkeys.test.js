// The Java Edition hotkeys in src/hotkeys.js. The module is only a table of key -> Game method, so the tests
// check three things: the table matches the Java Edition list, typing in a field is never a hotkey, and every
// action named in the table is a method the Game actually has (a rename would otherwise fail silently).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DEBUG_COMBOS, debugActionFor, isTypingTarget, installHotkeys } from '../src/hotkeys.js';
import { UIManager } from '../src/ui.js';

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

test('Control+Q throws the whole stack, plain Q throws one', () => {
  const main = fs.readFileSync(path.join(process.cwd(), 'src/main.js'), 'utf8');
  assert.match(main, /dropHeldItem\(wholeStack = false\)/, 'the drop takes a whole-stack flag');
  assert.match(main, /this\.dropHeldItem\(e\.ctrlKey \|\| e\.metaKey\)/, 'and Control+Q passes it');
  assert.match(main, /const requested = wholeStack \? Math\.max\(1, active\.count \?\? 1\) : 1;/, 'one entity, whole count');
  assert.match(main, /for \(let i = 0; i < requested; i\+\+\) this\.inventory\.consumeActiveItem\(\);/, 'and the slot is emptied');
});

test('double-tapping the forward key sprints, and hunger gates it', () => {
  const player = fs.readFileSync(path.join(process.cwd(), 'src/player.js'), 'utf8');
  assert.match(player, /if \(now - this\.lastForwardPress < 280\) this\.sprintKeyToggled = true;/, 'W twice starts it');
  assert.match(player, /if \(e\.code === 'KeyW'\) this\.sprintKeyToggled = false;/, 'releasing W ends it');
  assert.match(player, /const wantsSprint = !!this\.keys\['ControlLeft'\] \|\| this\.sprintKeyToggled;/, 'either binding sprints');
  assert.match(player, /this\.hunger > 6/, 'and vanilla refuses a sprint when hunger is low');
});

test('a Creative toolbar row can be saved and loaded again', () => {
  // The methods only need the inventory, the chat and a re-render, so no DOM is required.
  const ui = Object.create(UIManager.prototype);
  const messages = [];
  let renders = 0;
  ui.inv = { hotbar: [{ id: 'stone', count: 4 }, null, { id: 'iron_pickaxe', count: 1, durability: 3, maxDurability: 250 }] };
  ui.addChatMessage = (message) => messages.push(message);
  ui.updateHotbar = () => { renders++; };

  const saved = ui.saveCreativeToolbar(2);
  assert.equal(saved[0].id, 'stone', 'the row holds what the hotbar held');
  assert.equal(ui.savedToolbars[2][2].durability, 3);

  ui.inv.hotbar[0] = null;
  ui.inv.hotbar[2] = null;
  assert.equal(ui.loadCreativeToolbar(2)[0].id, 'stone', 'loading puts it back');
  assert.equal(ui.inv.hotbar[2].id, 'iron_pickaxe');
  assert.equal(renders, 1, 'the hotbar is redrawn');

  // A saved row is a copy: editing the hotbar afterwards must not rewrite it.
  ui.inv.hotbar[0].count = 64;
  assert.equal(ui.savedToolbars[2][0].count, 4, 'the saved row is a copy');

  assert.equal(ui.loadCreativeToolbar(5), null, 'an empty slot reports rather than throws');
  assert.match(messages.join(' | '), /No saved toolbar 6/);
});

