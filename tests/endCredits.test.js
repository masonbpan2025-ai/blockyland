// The credits after the ender dragon: rolled once, the first trip home through the exit portal (Exit portal, Minecraft
// Wiki: "The credits roll when a player enters the End podium for the first time"), skippable, and remembered in saves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { showEndCredits, END_CREDITS } from '../src/endCredits.js';
import { createEndState, captureEndState, restoreEndState } from '../src/endProgression.js';

/** Just enough of a document for the overlay: elements, a body, and key listeners. */
function fakeDocument() {
  const keyListeners = new Set();
  const make = (tag) => {
    const el = {
      tag, children: [], style: {}, attributes: {}, listeners: {}, className: '', textContent: '', id: '', parent: null,
      appendChild(child) { child.parent = el; el.children.push(child); return child; },
      append(...kids) { for (const k of kids) el.appendChild(k); },
      remove() { if (el.parent) el.parent.children = el.parent.children.filter(c => c !== el); el.parent = null; },
      setAttribute(k, v) { el.attributes[k] = v; },
      addEventListener(type, fn) { (el.listeners[type] ??= []).push(fn); },
      dispatch(type, event = {}) { for (const fn of el.listeners[type] ?? []) fn(event); },
      text() { return [el.textContent, ...el.children.map(c => c.text())].join(' '); },
    };
    return el;
  };
  const doc = {
    body: make('body'),
    createElement: make,
    addEventListener(type, fn) { if (type === 'keydown') keyListeners.add(fn); },
    removeEventListener(type, fn) { keyListeners.delete(fn); },
    press(code) { const e = { code, preventDefault() {}, stopPropagation() {} }; for (const fn of [...keyListeners]) fn(e); },
    overlay() { return doc.body.children.find(c => c.id === 'end-credits'); },
    keyListeners,
  };
  return doc;
}

test('the credits roll over the game and Escape skips them, leaving nothing behind', async () => {
  const doc = fakeDocument();
  const shown = showEndCredits({ doc, seconds: 30 });
  const overlay = doc.overlay();
  assert.ok(overlay, 'the overlay is on screen');
  assert.match(overlay.text(), /THE END/);
  assert.match(overlay.text(), /skip/i, 'it says how to skip');
  doc.press('Escape');
  assert.deepEqual(await shown, { skipped: true });
  assert.equal(doc.overlay(), undefined, 'the overlay is gone');
  assert.equal(doc.keyListeners.size, 0, 'and so is its key listener');
});

test('the credits end by themselves when the roll finishes, and a click skips them', async () => {
  const doc = fakeDocument();
  const finished = showEndCredits({ doc, seconds: 30 });
  doc.overlay().children[0].dispatch('animationend');
  assert.deepEqual(await finished, { skipped: false });
  const clicked = showEndCredits({ doc, seconds: 30 });
  doc.overlay().dispatch('click');
  assert.deepEqual(await clicked, { skipped: true });
});

test('the credits are this game\'s own words, with a title and a thank-you', () => {
  const text = END_CREDITS.map(([, t]) => t ?? '').join('\n');
  assert.match(text, /THE END/);
  assert.match(text, /Thank you for playing/);
});

test('a save remembers that the credits were seen, so they roll only once', () => {
  const world = { seed: 7 };
  world.endState = createEndState(7);
  assert.equal(world.endState.creditsSeen, false, 'not seen in a new world');
  world.endState.creditsSeen = true;
  const saved = captureEndState(world);
  const loaded = { seed: 7 };
  restoreEndState(loaded, saved);
  assert.equal(loaded.endState.creditsSeen, true);
  restoreEndState(loaded, { ...saved, creditsSeen: 'yes' });
  assert.equal(loaded.endState.creditsSeen, false, 'only a real true counts');
});
