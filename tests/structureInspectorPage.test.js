// The Structure Inspector page and its script must agree on element ids.
//
// `tests/domWiring.test.js` exists because the main page and `src/ui.js` drifted apart, and the failure
// mode is bad: `$('thing').value` on a missing element throws during the first paint, with nothing in
// the test suite to catch it. The inspector is a second page with the same hazard, so it gets the same
// guard. This is a static check on purpose -- it needs no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HTML = 'structure-inspector.html';
const SCRIPT = 'src/structureInspector.js';

test('every element the inspector script looks up exists in its page', () => {
  const html = readFileSync(HTML, 'utf8');
  const script = readFileSync(SCRIPT, 'utf8');

  const declared = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const looked = new Set();
  for (const match of script.matchAll(/\$\('([^']+)'\)/g)) looked.add(match[1]);
  for (const match of script.matchAll(/getElementById\('([^']+)'\)/g)) looked.add(match[1]);

  const missing = [...looked].filter((id) => !declared.has(id));
  assert.deepEqual(missing, [], `the script looks up ids the page does not define: ${missing.join(', ')}`);
});

test('the page loads the inspector script and is registered as a build entry', () => {
  const html = readFileSync(HTML, 'utf8');
  assert.match(html, /src="\/src\/structureInspector\.js"/, 'the page must load the inspector module');
  // The dev server serves the page from the repository root, but a production build only includes the
  // pages named in the Vite input list -- an unregistered page 404s after `npm run build`.
  const vite = readFileSync('vite.config.js', 'utf8');
  assert.match(vite, /structureInspector: path\.resolve\('structure-inspector\.html'\)/,
    'structure-inspector.html must be a Vite build input');
});

test('the inspector does not import the game entry point or create a world', () => {
  // The whole point of the page is that it inspects a structure without generating a world. Importing
  // main.js or world.js would drag in terrain generation, saves and the render loop.
  const script = readFileSync(SCRIPT, 'utf8');
  const imports = [...script.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
  for (const specifier of imports) {
    assert.doesNotMatch(specifier, /(^|\/)(main|world|mapManager)\.js$/, `the inspector must not import ${specifier}`);
  }
  const session = readFileSync('src/structureInspectorSession.js', 'utf8');
  const sessionImports = [...session.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
  for (const specifier of sessionImports) {
    assert.doesNotMatch(specifier, /(^|\/)(main|world|mapManager|mesher)\.js$/, `the session must not import ${specifier}`);
  }
});
