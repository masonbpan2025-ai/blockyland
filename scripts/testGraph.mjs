// Which unit tests can a change reach?
//
// Builds the import graph of the repository's own JavaScript (static `import`/`export ... from`, literal
// `import('...')` and `new URL('...', import.meta.url)` workers), then walks it backwards from the changed files
// to the test files that depend on them. A test that names a changed file in a string (one that reads
// `index.html` or `src/main.js` with readFileSync) counts too, since an import graph can't see that.
//
// Distance, not reach, decides what runs. The graph is dense: `blockGeometry.js` and `world.js` import `bed.js`, and
// most tests import one of them, so 307 of 514 tests can reach `bed.js`. Horizon narrows its harnesses by which Rust
// items a probe can reach; a regex graph can't, so each test gets its distance from the change (1 = it imports the
// changed file, or names it) and the runner takes the nearest tests by default (scripts/test.mjs --changed).
//
// Over-approximates on purpose: imports inside comments still count. Kept free of side effects so tests can run it
// on a fixture tree (tests/testGraph.test.js).
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, posix, sep, basename, extname } from 'node:path';

/** Folders whose JavaScript makes up the graph. Others (node_modules, dist, outputs) are never read. */
export const GRAPH_DIRS = ['src', 'tests', 'server', 'scripts', 'functions', 'cloudflare', 'packages'];

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'outputs', 'test-results', '.cache']);
const JS_EXT = new Set(['.js', '.mjs', '.cjs']);

export const toPosix = p => p.split(sep).join('/');
export const isTestFile = f => f.startsWith('tests/') && f.endsWith('.test.js');

/**
 * The relative specifiers a module names.
 *
 * Each pattern is anchored on a fixed word and a quote, so it runs in linear time: an earlier version that matched
 * the whole `import {a, b} from` clause backtracked for minutes on the repository's long generated files.
 */
export function parseSpecifiers(source) {
  const out = new Set();
  const patterns = [
    /\bfrom\s*['"](\.{1,2}\/[^'"\n]*)['"]/g, // import x from '...', export ... from '...'
    /\bimport\s*\(?\s*['"](\.{1,2}\/[^'"\n]*)['"]/g, // import '...', import('...')
    /\bnew\s+URL\s*\(\s*['"](\.{1,2}\/[^'"\n]*)['"]\s*,\s*import\.meta\.url/g, // workers and assets
  ];
  for (const re of patterns) for (const m of source.matchAll(re)) out.add(m[1]);
  return [...out];
}

/** Resolve a relative specifier from `fromFile` (repo-relative, posix) to a repo-relative path, or null. */
export function resolveSpecifier(fromFile, spec, exists) {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null;
  const base = posix.normalize(posix.join(posix.dirname(fromFile), spec.split('?')[0]));
  if (base.startsWith('..')) return null;
  for (const candidate of [base, `${base}.js`, `${base}.mjs`, `${base}/index.js`]) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

function walk(root, dir, files) {
  let entries;
  try { entries = readdirSync(join(root, dir), { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(root, rel, files);
    } else if (JS_EXT.has(extname(entry.name))) {
      files.push(rel);
    }
  }
}

/**
 * Read the graph from disk (about 250 ms for the whole repository).
 * @returns {{files: string[], deps: Map<string, Set<string>>, sources: Map<string, string>}}
 *   paths are repo-relative and posix; `deps.get(a)` holds the files `a` imports.
 */
export function buildGraph(root, dirs = GRAPH_DIRS) {
  const files = [];
  for (const dir of dirs) walk(root, dir, files);
  // Top-level modules (vite.config.js and friends) are graph members too.
  for (const name of readdirSync(root)) {
    if (JS_EXT.has(extname(name)) && statSync(join(root, name)).isFile()) files.push(name);
  }
  const known = new Set(files);
  const exists = p => known.has(p) || existsSync(join(root, p));
  const deps = new Map();
  const sources = new Map();
  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    sources.set(file, source);
    const set = new Set();
    for (const spec of parseSpecifiers(source)) {
      const target = resolveSpecifier(file, spec, exists);
      if (target && target !== file) set.add(target);
    }
    deps.set(file, set);
  }
  return { files, deps, sources };
}

/**
 * A hub imports so much of the game that "imports the hub" says nothing about what a test covers: `src/main.js`
 * imports 144 modules. Reach stops at a hub, so `--deep` doesn't run every test that boots the game. A change to the
 * hub itself still selects the tests that import it. Aggregators below the threshold (`mobs.js` at 96,
 * `worldgen/index.js` at 40) pass reach on: the tests that import them exercise the modules they collect.
 */
export const HUB_IMPORTS = 100;

export function hubsOf(graph, threshold = HUB_IMPORTS) {
  return new Set([...graph.deps].filter(([f, s]) => !isTestFile(f) && s.size > threshold).map(([f]) => f));
}

/** A changed file is named by a test when the test's source quotes its path or its file name. */
function mentions(source, changed) {
  if (source.includes(changed)) return true;
  const name = basename(changed);
  // 'main.js' in join(root, 'src', 'main.js'), or '../index.html'
  return [`'${name}'`, `"${name}"`, `\`${name}\``, `/${name}'`, `/${name}"`, `/${name}\``].some(q => source.includes(q));
}

/**
 * Every test a set of changed files can reach, with its distance.
 * @param {{deps: Map<string, Set<string>>, sources: Map<string, string>}} graph
 * @param {string[]} changed repo-relative posix paths
 * @param {{hubs?: Set<string>}} [options] modules reach stops at (default: `hubsOf(graph)`)
 * @returns {{reach: Map<string, Map<string, {distance: number, chain: string[]}>>, unreached: string[]}}
 *   `reach.get(changedFile).get(testFile)`: how far the test is and the chain that reached it (test → … → changed
 *   file). A changed test file is at distance 0 from itself. `unreached` lists changed files no test reaches.
 */
export function reachTests(graph, changed, { hubs = hubsOf(graph) } = {}) {
  const dependents = new Map();
  for (const [file, set] of graph.deps) {
    for (const dep of set) {
      if (!dependents.has(dep)) dependents.set(dep, new Set());
      dependents.get(dep).add(file);
    }
  }
  const reach = new Map();
  const unreached = [];
  for (const start of changed) {
    const found = new Map();
    if (isTestFile(start) && graph.deps.has(start)) found.set(start, { distance: 0, chain: [start] });
    // Breadth first, so each test's distance is its shortest one.
    const parent = new Map([[start, null]]);
    let frontier = [start];
    for (let distance = 1; frontier.length; distance++) {
      const next = [];
      for (const node of frontier) {
        if (node !== start && hubs.has(node)) continue;
        for (const up of dependents.get(node) || []) {
          if (parent.has(up)) continue;
          parent.set(up, node);
          next.push(up);
          if (isTestFile(up)) {
            const chain = [];
            for (let n = up; n !== null; n = parent.get(n)) chain.push(n);
            found.set(up, { distance, chain });
          }
        }
      }
      frontier = next;
    }
    for (const [file, source] of graph.sources) {
      if (!isTestFile(file) || file === start || !mentions(source, start)) continue;
      const known = found.get(file);
      if (!known || known.distance > 1) found.set(file, { distance: 1, chain: [file, `(names ${start})`] });
    }
    if (found.size) reach.set(start, found);
    else unreached.push(start);
  }
  return { reach, unreached };
}

/**
 * Choose which reached tests to run.
 * @param {ReturnType<typeof reachTests>['reach']} reach
 * @param {{depth?: number|'nearest'}} [options] `'nearest'` (default): for each changed file, the tests at the
 *   smallest distance that has any, and at least every test at distance 1. A number: every test up to it.
 * @returns {{selected: Map<string, {distance: number, chain: string[]}>, skipped: number}} `skipped` counts
 *   reachable tests left out, which `--deep` would add.
 */
export function pickTests(reach, { depth = 'nearest' } = {}) {
  const selected = new Map();
  const all = new Set();
  for (const found of reach.values()) {
    const distances = [...found.values()].map(f => f.distance).filter(d => d > 0);
    const limit = depth === 'nearest' ? Math.max(1, distances.length ? Math.min(...distances) : 1) : depth;
    for (const [test, info] of found) {
      all.add(test);
      if (info.distance > limit) continue;
      const known = selected.get(test);
      if (!known || known.distance > info.distance) selected.set(test, info);
    }
  }
  return { selected, skipped: [...all].filter(t => !selected.has(t)).length };
}

/** Files changed in the working tree (staged, unstaged, untracked), and since `base` when given. */
export function changedFiles(root, git, base = null) {
  const run = args => git(args).split('\n').map(s => s.trim()).filter(Boolean);
  const lines = [...run(['diff', '--name-only', 'HEAD']), ...run(['ls-files', '--others', '--exclude-standard'])];
  if (base) lines.push(...run(['diff', '--name-only', `${base}...HEAD`]));
  return [...new Set(lines.map(toPosix))].filter(f => existsSync(join(root, f))).sort();
}
