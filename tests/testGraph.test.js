import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { buildGraph, reachTests, pickTests, parseSpecifiers, hubsOf } from '../scripts/testGraph.mjs';
import { planChanged } from '../scripts/test.mjs';

/** A small repository on disk. Expected selections below are worked out by hand from this layout. */
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'test-graph-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

const LAYOUT = {
  'src/leaf.js': 'export const leaf = 1;\n',
  'src/mid.js': "import { leaf } from './leaf.js';\nexport const mid = leaf + 1;\n",
  'src/barrel.js': "export * from './mid.js';\nexport { leaf } from './leaf.js';\n",
  'src/top.js': "import { mid } from './barrel.js';\nexport const top = mid;\n",
  // a cycle: a imports b, b imports a
  'src/cycleA.js': "import { b } from './cycleB.js';\nexport const a = () => b;\n",
  'src/cycleB.js': "import { a } from './cycleA.js';\nexport const b = () => a;\n",
  'src/worker.js': 'self.onmessage = () => {};\n',
  'src/spawner.js': "export const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });\n",
  'src/lazy.js': "export const load = () => import('./leaf.js');\n",
  'tests/leaf.test.js': "import { leaf } from '../src/leaf.js';\n",
  'tests/top.test.js': "import { top } from '../src/top.js';\n",
  'tests/cycle.test.js': "import { a } from '../src/cycleA.js';\n",
  'tests/worker.test.js': "import { w } from '../src/spawner.js';\n",
  'tests/page.test.js': "import { readFileSync } from 'node:fs';\nreadFileSync(new URL('../index.html', import.meta.url));\n",
  'tests/helpers/setup.js': "export { mid } from '../../src/mid.js';\n",
  'tests/viaHelper.test.js': "import { mid } from './helpers/setup.js';\n",
  'index.html': '<!doctype html>\n',
};

test('parseSpecifiers reads every relative import form and ignores packages', () => {
  const source = [
    "import a from './a.js';",
    "import { b,\n  c } from '../b.js';",
    "import './side.js';",
    "export * from './re.js';",
    "const d = await import('./dyn.js');",
    "new Worker(new URL('./w.js', import.meta.url));",
    "import * as THREE from 'three';",
    "import fs from 'node:fs';",
  ].join('\n');
  assert.deepEqual(parseSpecifiers(source).sort(),
    ['../b.js', './a.js', './dyn.js', './re.js', './side.js', './w.js']);
});

test('parseSpecifiers stays fast on long generated lines', () => {
  const long = `export const data = [${'1,'.repeat(200000)}];\nimport x from './x.js';\n${'word '.repeat(100000)}`;
  const start = Date.now();
  assert.deepEqual(parseSpecifiers(long), ['./x.js']);
  assert.ok(Date.now() - start < 1000, `took ${Date.now() - start} ms`);
});

test('a change reaches tests through imports, re-exports, helpers, workers and dynamic imports', t => {
  const root = fixture(LAYOUT);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const graph = buildGraph(root, ['src', 'tests']);
  const { reach } = reachTests(graph, ['src/leaf.js']);
  const found = reach.get('src/leaf.js');
  const distances = Object.fromEntries([...found].map(([f, v]) => [f, v.distance]));
  assert.deepEqual(distances, {
    'tests/leaf.test.js': 1, // imports leaf directly
    'tests/viaHelper.test.js': 3, // viaHelper -> helpers/setup -> mid -> leaf
    'tests/top.test.js': 3, // top.test -> top -> barrel -> leaf (barrel re-exports leaf)
  });
  assert.deepEqual(found.get('tests/top.test.js').chain, ['tests/top.test.js', 'src/top.js', 'src/barrel.js', 'src/leaf.js']);

  const worker = reachTests(graph, ['src/worker.js']).reach.get('src/worker.js');
  assert.deepEqual([...worker.keys()], ['tests/worker.test.js']);
});

test('a cycle terminates, and both members reach the test', t => {
  const root = fixture(LAYOUT);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const graph = buildGraph(root, ['src', 'tests']);
  const { reach } = reachTests(graph, ['src/cycleB.js']);
  assert.equal(reach.get('src/cycleB.js').get('tests/cycle.test.js').distance, 2);
});

test('a test that names a non-JavaScript file is picked; a file nothing reaches is reported', t => {
  const root = fixture({ ...LAYOUT, 'src/orphan.js': 'export const o = 1;\n' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const graph = buildGraph(root, ['src', 'tests']);
  const { reach, unreached } = reachTests(graph, ['index.html', 'src/orphan.js']);
  assert.deepEqual([...reach.get('index.html').keys()], ['tests/page.test.js']);
  assert.deepEqual(unreached, ['src/orphan.js']);
});

test('nearest picks the closest tier per changed file; a depth adds further tests', t => {
  const root = fixture(LAYOUT);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const graph = buildGraph(root, ['src', 'tests']);
  const { reach } = reachTests(graph, ['src/leaf.js', 'src/mid.js']);
  // leaf: leaf.test at 1. mid: nothing at 1, viaHelper at 2 (viaHelper -> setup -> mid), top.test at 3.
  assert.deepEqual([...pickTests(reach).selected.keys()].sort(), ['tests/leaf.test.js', 'tests/viaHelper.test.js']);
  assert.equal(pickTests(reach).skipped, 1);
  assert.deepEqual([...pickTests(reach, { depth: Infinity }).selected.keys()].sort(),
    ['tests/leaf.test.js', 'tests/top.test.js', 'tests/viaHelper.test.js']);
});

test('reach stops at a hub but a change to the hub selects its importers', t => {
  const hubImports = Array.from({ length: 5 }, (_, i) => `import './m${i}.js';`).join('\n');
  const files = {
    'src/core.js': 'export const core = 1;\n',
    'src/main.js': `import './core.js';\n${hubImports}\n`,
    'tests/boot.test.js': "import '../src/main.js';\n",
    'tests/core.test.js': "import '../src/core.js';\n",
  };
  for (let i = 0; i < 5; i++) files[`src/m${i}.js`] = 'export {};\n';
  const root = fixture(files);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const graph = buildGraph(root, ['src', 'tests']);
  const hubs = hubsOf(graph, 4); // main.js imports 6 modules
  assert.deepEqual([...hubs], ['src/main.js']);
  assert.deepEqual([...reachTests(graph, ['src/core.js'], { hubs }).reach.get('src/core.js').keys()], ['tests/core.test.js']);
  assert.deepEqual([...reachTests(graph, ['src/main.js'], { hubs }).reach.get('src/main.js').keys()], ['tests/boot.test.js']);
});

test('planChanged repeats changed test files and refuses oversized selections', t => {
  const root = fixture(LAYOUT);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const graph = buildGraph(root, ['src', 'tests']);
  const plan = planChanged({ changed: ['tests/leaf.test.js', 'src/worker.js'], graph });
  assert.deepEqual(plan.files, ['tests/leaf.test.js', 'tests/worker.test.js']);
  assert.deepEqual(plan.repeat, ['tests/leaf.test.js']);
  assert.equal(plan.refused, false);
  assert.equal(planChanged({ changed: ['src/leaf.js', 'src/worker.js'], graph, max: 1 }).refused, true);
  assert.equal(planChanged({ changed: ['src/leaf.js', 'src/worker.js'], graph, max: 1, yes: true }).refused, false);
});
