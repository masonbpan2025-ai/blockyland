// Escape releases the pointer, and the game must follow: the view stops turning and the pause menu opens.
//
// The bug: Chrome takes Escape while the pointer is locked and does not send the page a keydown. The lock was
// released, the pause menu never opened, and the look code kept turning the view on any mouse movement over the canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cameraTurnAllowed, shouldPauseOnLockLoss } from '../src/pointerLock.js';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

test('the camera turns while the pointer is locked', () => {
  assert.equal(cameraTurnAllowed({ locked: true }), true);
});

test('the camera does not turn on hover: unlocked and no button held', () => {
  // The bug. The old check let any mouse movement over the canvas turn the view.
  assert.equal(cameraTurnAllowed({ locked: false, buttonHeld: false }), false);
  assert.equal(cameraTurnAllowed({}), false);
});

test('a button held to drag turns the camera even without the lock', () => {
  assert.equal(cameraTurnAllowed({ locked: false, buttonHeld: true }), true);
});

test('a menu, chat or the terminal stops the camera turning, locked or not', () => {
  assert.equal(cameraTurnAllowed({ locked: true, controlsDisabled: true }), false);
  assert.equal(cameraTurnAllowed({ locked: false, buttonHeld: true, controlsDisabled: true }), false);
});

test('losing the lock in a running world opens the pause menu', () => {
  assert.equal(shouldPauseOnLockLoss({ worldReady: true, phase: 'ready' }), true);
});

test('losing the lock while a modal, chat or the terminal is open does not open a second menu', () => {
  const running = { worldReady: true, phase: 'ready' };
  assert.equal(shouldPauseOnLockLoss({ ...running, modalOpen: true }), false, 'the inventory released the lock itself');
  assert.equal(shouldPauseOnLockLoss({ ...running, chatOpen: true }), false);
  assert.equal(shouldPauseOnLockLoss({ ...running, geminiOpen: true }), false);
});

test('losing the lock on the start screen, while loading or after death does nothing', () => {
  assert.equal(shouldPauseOnLockLoss({ worldReady: false, phase: 'idle' }), false, 'start screen');
  assert.equal(shouldPauseOnLockLoss({ worldReady: true, phase: 'loading' }), false, 'still loading');
  assert.equal(shouldPauseOnLockLoss({ worldReady: true, phase: 'ready', dead: true }), false, 'the death screen owns the input');
  assert.equal(shouldPauseOnLockLoss({ worldReady: true, phase: 'ready', sleeping: true }), false);
});

test('the player stops turning the view on hover, and the lock-loss handler pauses the game', () => {
  const player = read('src/player.js');
  const at = player.indexOf("window.addEventListener('mousemove', (e) => {");
  const handler = player.slice(at, player.indexOf('\n    });', at));
  assert.match(handler, /cameraTurnAllowed\(\{ locked: false, buttonHeld: isInteracting \}\)/);
  assert.doesNotMatch(handler, /if \(!isOverCanvas && !isInteracting\)/, 'hover no longer turns the view');

  const main = read('src/main.js');
  const lock = main.slice(main.indexOf("document.addEventListener('pointerlockchange', () => {"), main.indexOf("window.addEventListener('mouseup', (e) => {", main.indexOf("document.addEventListener('pointerlockchange'")));
  // The listener hands lock loss to `handlePointerLockLoss`, which opens the pause menu as vanilla's Escape does
  // (Chrome takes that Escape and sends only the lock change).
  assert.doesNotMatch(lock, /togglePauseMenu/, 'the listener itself does not toggle the menu');
  assert.match(lock, /this\.handlePointerLockLoss\(\)/);
  // Only a lock that was held and is gone: a change with nothing locked before (a click's request that did not take)
  // paused the game on a left click.
  assert.match(lock, /if \(wasLocked && !this\.pointerLocked\) \{/);
  // And a click asks for the lock only when it is not held already.
  assert.match(main, /this\.renderer\.domElement\.addEventListener\('click', requestLockOnClick\);/);
  const loss = main.slice(main.indexOf('  handlePointerLockLoss() {'), main.indexOf('\n  }', main.indexOf('  handlePointerLockLoss() {')));
  // It read `this.phase`, which the game does not have: undefined counted as idle and the menu never opened.
  assert.match(loss, /phase: this\.lifecycle\?\.phase/, 'the decision sees the real lifecycle phase');
  assert.match(read('src/ui.js'), /document\.pointerLockElement\) \{\s*\/\/ Mouse attached[\s\S]*?exitPointerLock\(\);/);
});
