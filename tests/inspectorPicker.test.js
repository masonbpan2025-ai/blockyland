// The Inspector picker: one start-screen button and four choices.
//
// The three entry tests scan for the wiring -- the button exists, is looked up, is bound. This file runs the
// dispatch instead: which page each choice opens, that an unknown choice opens nothing, and that showing and
// hiding the modal touches nothing but its own `hidden` class. The methods are sliced out of `src/main.js`
// and run against a stub, which is how the entry tests already verify the navigation methods without a DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mainJs = readFileSync(join(process.cwd(), 'src/main.js'), 'utf8');

/** One method's source, so it can be run against a stub without importing the whole game. */
function methodFor(signature) {
  const from = mainJs.indexOf(signature);
  assert.ok(from >= 0, `${signature} exists in main.js`);
  const end = mainJs.indexOf('\n  }', from);
  assert.ok(end > from, `${signature} has a body`);
  const source = mainJs.slice(from, end + 4);
  const name = signature.slice(0, signature.indexOf('('));
  return new Function(`return ({ ${source} })[${JSON.stringify(name)}];`)();
}

test('each picker choice opens the Inspector that owns it', () => {
  const opened = [];
  const stub = {
    closeInspectorPicker: () => { opened.push('close'); },
    openStructureInspector: () => { opened.push('structure'); return '/structure-inspector.html'; },
    openMobInspector: () => { opened.push('mob'); return '/mob-debug.html'; },
    openResourceInspector: ({ kind = null } = {}) => {
      opened.push(`resource:${kind}`);
      return kind === 'block' ? '/block-debug.html' : '/item-debug.html';
    },
  };
  const openInspector = methodFor('openInspector(choice) {');

  assert.equal(openInspector.call(stub, 'structure'), '/structure-inspector.html');
  assert.equal(openInspector.call(stub, 'mob'), '/mob-debug.html');
  assert.equal(openInspector.call(stub, 'item'), '/item-debug.html');
  assert.equal(openInspector.call(stub, 'block'), '/block-debug.html');
  // Case should not matter: the picker's ids are lower case, the method is called by hand too.
  assert.equal(openInspector.call(stub, 'MOB'), '/mob-debug.html');
  assert.equal(openInspector.call(stub, 'nonsense'), null, 'an unknown choice opens nothing');
  assert.deepEqual(opened, [
    'close', 'structure', 'close', 'mob', 'close', 'resource:item', 'close', 'resource:block', 'close', 'mob', 'close',
  ], 'the picker closes before every navigation');
});

test('the picker shows and hides the modal it owns', () => {
  const classes = new Set(['hidden', 'game-modal']);
  const modal = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } };
  const previous = globalThis.document;
  globalThis.document = { getElementById: (id) => (id === 'inspector-picker-modal' ? modal : null) };
  try {
    const open = methodFor('openInspectorPicker() {');
    const close = methodFor('closeInspectorPicker() {');
    assert.equal(open.call({}), true, 'opening reports the modal was found');
    assert.equal(classes.has('hidden'), false, 'opening reveals it');
    assert.equal(close.call({}), true);
    assert.equal(classes.has('hidden'), true, 'closing hides it again');
    // A page without the markup must not throw: the picker is optional.
    globalThis.document = { getElementById: () => null };
    assert.equal(open.call({}), false, 'a missing modal is reported rather than thrown on');
  } finally {
    globalThis.document = previous;
  }
});

test('the picker markup offers the four choices in the order the request named them', () => {
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
  const options = [...html.matchAll(/id="btn-pick-inspector-([a-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(options, ['structure', 'item', 'block', 'mob']);
  assert.match(html, /id="btn-start-inspector"/, 'behind one start-screen button');
  for (const old of ['btn-start-mob-inspector', 'btn-start-resource-inspector', 'btn-start-structure-inspector']) {
    assert.doesNotMatch(html, new RegExp(`id="${old}"`), `${old} should be gone`);
  }
});

test('each Inspector page locks its list to the kind its own page declares', () => {
  const pageJs = readFileSync(join(process.cwd(), 'src/resourceDebug.js'), 'utf8');
  assert.match(pageJs, /const PAGE_KIND = document\.body\.dataset\.kind/, 'the kind comes from the page, not the query string');
  assert.match(pageJs, /searchResources\(\$\('search'\)\.value, \{ kind: PAGE_KIND/, 'and the list is filtered by it');
  assert.doesNotMatch(pageJs, /\$\('kind'\)/, 'there is no Kind selector to read');
});
