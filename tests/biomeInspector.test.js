// The Biome Inspector (biome-inspector.html, src/biomeInspector.js, src/biomeInspectorSession.js): the fifth choice
// behind the start screen's Inspector button. It builds one biome choice's world with the game's own code, starts a
// player there as a new world does, and checks what that start should have.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { BIOME_CATEGORIES } from '../src/biomes.js';
import { inspectorBiomes, buildBiomeWorld, biomeChecks, biomeSummary } from '../src/biomeInspectorSession.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('the page exists, is a build input, and is opened from the Inspector picker', () => {
  assert.ok(existsSync(new URL('../biome-inspector.html', import.meta.url)));
  const html = read('biome-inspector.html');
  assert.match(html, /<script type="module" src="\/src\/biomeInspector\.js"><\/script>/);
  assert.match(html, /<a class="back" href="\/">/, 'a way back to the game');
  const vite = read('vite.config.js');
  assert.match(vite, /biomeInspector: path\.resolve\('biome-inspector\.html'\)/);
  assert.match(vite, /'structure-inspector\.html', 'biome-inspector\.html'[,\]]/);
  assert.match(read('index.html'), /id="btn-pick-inspector-biome">Biome</);
  const main = read('src/main.js');
  assert.match(main, /const btnPickInspectorBiome = document\.getElementById\('btn-pick-inspector-biome'\);\s*if \(btnPickInspectorBiome\) \{\s*btnPickInspectorBiome\.addEventListener\('click', \(e\) => \{ e\.stopPropagation\(\); this\.openInspector\('biome'\); \}\);/);
  assert.match(main, /if \(kind === 'biome'\) return this\.openBiomeInspector\(\);/);
});

test('its picker is the new-world screen\'s biome list', () => {
  const groups = inspectorBiomes();
  assert.deepEqual(groups.map((g) => g.id), BIOME_CATEGORIES.map((c) => c.id));
  const ids = groups.flatMap((g) => g.biomes.map((b) => b.id));
  for (const id of ['sunflower_plains', 'crimson_forest', 'the_end', 'small_end_islands', 'big_end_islands', 'chorus_forest', 'end_city']) assert.ok(ids.includes(id), id);
});

test('"Play this biome" opens the game with the biome and seed chosen on the new-world screen', () => {
  assert.match(read('src/biomeInspector.js'), /location\.href = `\/\?biome=\$\{encodeURIComponent\(\$\('biome'\)\.value\)\}&seed=/);
  const ui = read('src/ui.js');
  assert.match(ui, /const wanted = query\?\.get\('biome'\);/);
  assert.match(ui, /this\.worldBiomeSelect\.value = wanted;/);
});

test('an Overworld biome: the spawn is in it and has room to stand, and the summary describes it', async () => {
  const built = await buildBiomeWorld({ biome: 'desert', seed: 99 });
  assert.deepEqual(biomeChecks(built).filter((c) => !c.ok), []);
  const summary = biomeSummary(built);
  assert.equal(summary.name, 'Desert');
  assert.equal(summary.dimension, 'overworld');
  assert.ok(summary.surface.length > 0);
});
