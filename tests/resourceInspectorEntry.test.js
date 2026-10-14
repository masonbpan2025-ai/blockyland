// The Resource Inspector is the block and item counterpart to the Mob Inspector, and these tests pin
// the same two halves that `mobInspectorEntry.test.js` pins for mobs: the start-screen entry point
// really opens the standalone page, and the page really drives the shared inspection core.
//
// The last group is the property the whole design rests on. `src/resourceRegistry.js` and
// `src/resourceShowcase.js` must stay free of Three.js and of the DOM, because that is what lets
// `node scripts/inspect-resource.mjs` and these tests check a block or an item without a renderer --
// in an environment where no dependencies are installed at all. A single `import * as THREE` in
// either file would quietly take that away, so it is asserted rather than trusted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const html = read('index.html');
const mainJs = read('src/main.js');
const itemHtml = read('item-debug.html');
const blockHtml = read('block-debug.html');
const inspectorJs = read('src/resourceDebug.js');
const registryJs = read('src/resourceRegistry.js');
const showcaseJs = read('src/resourceShowcase.js');
const cliJs = read('scripts/inspect-resource.mjs');

// --- the start-screen button -------------------------------------------------

test('the start screen reaches the Resource Inspector through the picker', () => {
  // There used to be a Resource Inspector button of its own. The four Inspector buttons are now one button
  // and a picker, and this Inspector's two lists -- items and blocks -- are two of its four choices.
  assert.match(html, /id="btn-start-inspector"/, 'the single Inspector button exists');
  assert.match(html, /id="btn-pick-inspector-item"/, 'the picker offers Item');
  assert.match(html, /id="btn-pick-inspector-block"/, 'and Block');
  assert.doesNotMatch(html, /id="btn-start-resource-inspector"/, 'the old Resource Inspector button is gone');
});

test('the picker left the Mob Inspector, Structure Inspector and Building Studio alone', () => {
  assert.match(html, /id="btn-pick-inspector-mob"/, 'the Mob Inspector is still reachable');
  assert.match(html, /id="btn-pick-inspector-structure"/, 'and so is the Structure Inspector');
  assert.match(html, /id="btn-start-building-studio"/, 'and Building Studio keeps its own button');
  assert.ok(existsSync(join(process.cwd(), 'mob-debug.html')), 'mob-debug.html is untouched');
  assert.ok(existsSync(join(process.cwd(), 'structure-inspector.html')), 'and structure-inspector.html');
});

test('choosing Item or Block leads to its own Inspector page', () => {
  assert.match(mainJs, /getElementById\('btn-start-inspector'\)/, 'the button is looked up');
  assert.match(mainJs, /btnInspector\.addEventListener\('click'/, 'a click handler is bound');
  assert.match(mainJs, /this\.openInspectorPicker\(\)/, 'which opens the picker');
  assert.match(mainJs, /getElementById\('btn-pick-inspector-item'\)/, 'the Item choice is looked up');
  assert.match(mainJs, /getElementById\('btn-pick-inspector-block'\)/, 'and the Block choice');
  assert.match(mainJs, /return this\.openResourceInspector\(\{ kind \}\)/, 'both open the Item or Block Inspector');
  assert.match(mainJs, /openResourceInspector\(\{ resource = null, kind = null \} = \{\}\) \{/, 'the method takes a Kind');
});

test('openResourceInspector navigates to the page for its kind and reports the URL', () => {
  const source = mainJs.slice(mainJs.indexOf('openResourceInspector({ resource = null'));
  const body = source.slice(0, source.indexOf('\n  }'));
  assert.match(body, /kind === 'block' \? '\/block-debug\.html' : '\/item-debug\.html'/, 'a block goes to block-debug.html, anything else to item-debug.html');
  assert.match(body, /window\.location\.href\s*=/, 'by navigating, not by starting a world');
  assert.match(body, /return url;/, 'and it reports the URL it used');
  assert.doesNotMatch(body, /resource-debug/, 'the combined page is gone');
});

test('each Inspector page is its own file, titled for its kind, and locks the list to that kind', () => {
  assert.ok(existsSync(join(process.cwd(), 'item-debug.html')), 'item-debug.html exists');
  assert.ok(existsSync(join(process.cwd(), 'block-debug.html')), 'block-debug.html exists');
  assert.ok(!existsSync(join(process.cwd(), 'resource-debug.html')), 'the combined resource-debug.html is removed');
  assert.match(itemHtml, /<title>Item Inspector<\/title>/, 'the item page titles itself Item Inspector');
  assert.match(itemHtml, /<body data-kind="item">/, 'and is locked to items');
  assert.match(blockHtml, /<title>Block Inspector<\/title>/, 'the block page titles itself Block Inspector');
  assert.match(blockHtml, /<body data-kind="block">/, 'and is locked to blocks');
  assert.match(inspectorJs, /document\.body\.dataset\.kind/, 'the shared script reads that lock');
});

test('each Inspector page offers a Back to Main link', () => {
  for (const [name, page] of [['item-debug.html', itemHtml], ['block-debug.html', blockHtml], ['mob-debug.html', read('mob-debug.html')], ['structure-inspector.html', read('structure-inspector.html')]]) {
    assert.match(page, /<a class="back" href="\/">&larr; Back to Main<\/a>/, `${name} links back to the main menu`);
  }
});

// --- the page drives the shared core ----------------------------------------

test('the Inspector pages bind the controls their script expects', () => {
  for (const page of [itemHtml, blockHtml]) {
    for (const id of ['search', 'resource', 'rerun', 'group', 'check-status', 'checks', 'dangling', 'facts', 'badge', 'error', 'events']) {
      assert.match(page, new RegExp(`id="${id}"`), `${id} should exist on the page`);
    }
  }
});

test('the page renders from the same core the CLI and the tests use', () => {
  assert.match(inspectorJs, /from '\.\/resourceRegistry\.js'/, 'the page uses the shared registry');
  assert.match(inspectorJs, /from '\.\/resourceShowcase\.js'/, 'and the shared checks');
  assert.match(inspectorJs, /buildRegistry\(\{fresh: true, \.\.\.inspectorSources/, 'it builds the registry using the explicit Inspector scope');
  assert.match(inspectorJs, /new ResourceShowcase\(/, 'it builds a showcase');
  assert.match(inspectorJs, /showcase\.run\(/, 'and runs the checks for the selected resource');
  assert.match(inspectorJs, /danglingReferences\(/, 'it reports dangling references');
});

test('the page uses the real block geometry and the real item icon for the preview', () => {
  // A preview that invented its own shapes would hide exactly the defects the Inspector exists to
  // find: a missing texture, a broken block shape, an item with no icon.
  assert.match(inspectorJs, /createBlockGeometry\(/, 'blocks render through the world geometry');
  assert.match(inspectorJs, /TextureManager/, 'using the real texture atlas');
  assert.match(inspectorJs, /entry\.icon/, 'items render their icon');
});

test('the page reports missing vanilla data instead of silently skipping the comparison', () => {
  assert.match(inspectorJs, /catch \{\s*return null;/, 'the fetch degrades to null');
  assert.match(inspectorJs, /Vanilla cache not served/, 'and it says so in the event log');
});

// --- the CLI -----------------------------------------------------------------

test('the CLI exists and does not run when it is imported', () => {
  assert.ok(existsSync(join(process.cwd(), 'scripts/inspect-resource.mjs')), 'the CLI exists');
  // No test in this project spawns a child process, so the CLI must be importable without running.
  assert.match(cliJs, /const invokedDirectly = process\.argv\[1\]/, 'there is a direct-invocation guard');
  assert.match(cliJs, /if \(invokedDirectly\) \{/, 'and the guard is what calls main');
  assert.match(cliJs, /export async function main\(/, 'main is exported for that reason');
});

test('the CLI offers the commands the parity loop needs', () => {
  for (const command of ['list', 'show', 'check', 'dangling', 'missing', 'audit']) {
    assert.match(cliJs, new RegExp(`case '${command}':`), `${command} should be a command`);
  }
});

// --- the core stays renderer-free -------------------------------------------

test('the inspection core imports no renderer and touches no DOM', () => {
  for (const [name, source] of [['resourceRegistry.js', registryJs], ['resourceShowcase.js', showcaseJs]]) {
    assert.doesNotMatch(source, /from 'three'/, `${name} must not import Three.js`);
    assert.doesNotMatch(source, /\bdocument\./, `${name} must not touch the document`);
    assert.doesNotMatch(source, /\bwindow\./, `${name} must not touch window`);
    assert.doesNotMatch(source, /getElementById/, `${name} must not query the DOM`);
  }
});

test('the core reads no files, so it runs in a browser as well as in Node', () => {
  for (const [name, source] of [['resourceRegistry.js', registryJs], ['resourceShowcase.js', showcaseJs]]) {
    assert.doesNotMatch(source, /from 'node:/, `${name} must not import a Node builtin`);
    assert.doesNotMatch(source, /\brequire\(/, `${name} must not use require`);
  }
});

test('the checks keep the four-status vocabulary the Mob Inspector established', () => {
  // Same words as `mobShowcase.js`: a parity reader should not have to learn a second set.
  assert.match(showcaseJs, /'unsupported'/, 'unsupported is reported, not scored');
  assert.match(showcaseJs, /'not observed'/, 'a gap is called not observed');
  assert.match(showcaseJs, /'observed'/, 'and a present behaviour is observed');
  assert.match(showcaseJs, /'error'/, 'a thrown check is an error');
  assert.match(showcaseJs, /filter\(\(r\) => r\.status !== 'unsupported'\)/, 'unsupported is excluded from the score');
});
