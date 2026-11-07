// The Weather Inspector (weather-inspector.html, src/weatherInspector.js, src/weatherShowcase.js): the sixth choice
// behind the start screen's Inspector button. Its showcase runs every weather rule against the game's own weather
// code; this file runs the same scenarios in Node, so a weather regression fails here as well as on the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { weatherScenarios, runWeatherShowcase } from '../src/weatherShowcase.js';
import { inspectorBiomes } from '../src/biomeInspectorSession.js';
import { BLOCKS } from '../src/blocks.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('the page exists, is a build input, and is opened from the Inspector picker', () => {
  assert.ok(existsSync(new URL('../weather-inspector.html', import.meta.url)));
  const html = read('weather-inspector.html');
  assert.match(html, /<script type="module" src="\/src\/weatherInspector\.js"><\/script>/);
  assert.match(html, /<a class="back" href="\/">/, 'a way back to the game');
  for (const id of ['showcase', 'showcase-stop', 'showcase-status', 'showcase-results', 'strike', 'cycle']) assert.match(html, new RegExp(`id="${id}"`), id);
  for (const type of ['clear', 'rain', 'thunder']) assert.match(html, new RegExp(`data-weather="${type}"`), type);
  const vite = read('vite.config.js');
  assert.match(vite, /weatherInspector: path\.resolve\('weather-inspector\.html'\)/);
  assert.match(vite, /'weather-inspector\.html'\]/);
  assert.match(read('index.html'), /id="btn-pick-inspector-weather">Weather</);
  const main = read('src/main.js');
  assert.match(main, /const btnPickInspectorWeather = document\.getElementById\('btn-pick-inspector-weather'\);\s*if \(btnPickInspectorWeather\) \{\s*btnPickInspectorWeather\.addEventListener\('click', \(e\) => \{ e\.stopPropagation\(\); this\.openInspector\('weather'\); \}\);/);
  assert.match(main, /if \(kind === 'weather'\) return this\.openWeatherInspector\(\);/);
});

test('every weather rule in the showcase passes against the game code', () => {
  const results = runWeatherShowcase();
  assert.ok(results.length >= 20, `${results.length} scenarios`);
  for (const r of results) assert.ok(r.ok, `${r.id}: ${r.title}\n${r.detail}`);
});

test('the showcase covers precipitation, the cycle, light, lightning and surfaces, each with the wiki and a view', () => {
  const scenarios = weatherScenarios();
  assert.equal(new Set(scenarios.map((s) => s.id)).size, scenarios.length, 'ids are unique (the page finds results by id)');
  assert.deepEqual([...new Set(scenarios.map((s) => s.group))], ['Precipitation', 'Weather cycle', 'Light and mobs', 'Lightning', 'Surfaces']);
  const biomes = new Set(inspectorBiomes().flatMap((g) => g.biomes.map((b) => b.id)));
  for (const s of scenarios) {
    assert.ok(s.wiki.length > 20, `${s.id} quotes its source`);
    assert.ok(biomes.has(s.view.biome), `${s.id}: the page can show ${s.view.biome}`);
    assert.ok(['clear', 'rain', 'thunder'].includes(s.view.weather), `${s.id}: weather ${s.view.weather}`);
    for (const p of s.view.props ?? []) assert.ok(Number.isInteger(p.block) && p.block !== BLOCKS.AIR, `${s.id}: a prop is a real block`);
  }
});
