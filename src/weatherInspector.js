// The Weather Inspector page (weather-inspector.html): a biome's real terrain (the game's world generator, mesher and
// textures, as the Biome Inspector builds it) under the game's own WeatherManager -- rain, snow, storms, lightning --
// with buttons for each weather, the weather cycle at speed, and the showcase of src/weatherShowcase.js: every weather
// rule tested against the game's code, one view at a time.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ChunkMesher } from './mesher.js';
import { loadTextures } from './structureInspectorWorldView.js';
import { inspectorBiomes, buildBiomeWorld } from './biomeInspectorSession.js';
import { WeatherManager } from './weather.js';
import { precipitationColumn, precipitationForBiome, weatherDimension } from './weatherRules.js';
import { skyDarkenForDimension } from './spawning/spawnClock.js';
import { monsterIsDarkEnoughToSpawn } from './spawning/mobSpawnPredicates.js';
import { weatherScenarios, runWeatherShowcase } from './weatherShowcase.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 600);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('view').append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const ambient = new THREE.HemisphereLight(0xffffff, 0x5a6577, 2.2);
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(40, 80, 30);
scene.add(ambient, sun);
const background = new THREE.Color(0x78a7ff);
scene.background = background;
scene.fog = new THREE.Fog(0x78a7ff, 90, 200);
const terrain = new THREE.Group();
scene.add(terrain);
const marker = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), new THREE.MeshBasicMaterial({ color: 0xff3b3b, wireframe: true }));
scene.add(marker);
const WATER = new THREE.MeshLambertMaterial({ color: 0x3a6fd0, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false });

// The weather: the game's manager, no sound, fire off so a bolt does not burn the terrain it is shown on.
const weather = new WeatherManager(scene, null);
const state = { built: null, night: false, cycle: false, speed: 600, worldTime: 6000, busy: false, showcase: null, props: [], dirty: new Set(), remeshIn: 0 };
const game = { world: null, weather, player: { position: new THREE.Vector3(), gamemode: 'creative', health: 20 }, gamerules: { doWeatherCycle: false, doFireTick: false }, difficulty: 'normal', mobs: null, renderDistance: 6 };
weather.game = game;

let mesher = null, textures = null;
const chunkMeshes = new Map(); // "cx,cz" -> meshes
const worlds = new Map();      // "biome|seed" -> built world, so the showcase revisits a biome at once

for (const group of inspectorBiomes()) {
  const optgroup = document.createElement('optgroup');
  optgroup.label = `${group.icon} ${group.name}`;
  for (const b of group.biomes) optgroup.appendChild(new Option(b.name, b.id));
  $('biome').appendChild(optgroup);
}
const has = (id) => [...$('biome').options].some((o) => o.value === id);
$('biome').value = has(params.get('biome')) ? params.get('biome') : 'plains';
if (params.get('seed')) $('seed').value = params.get('seed');

function meshChunk(cx, cz) {
  const key = `${cx},${cz}`;
  for (const m of chunkMeshes.get(key) ?? []) { terrain.remove(m); m.geometry.dispose(); }
  const geo = mesher.meshChunk(state.built.world.getOrCreateChunk(cx, cz), state.built.world);
  const meshes = [];
  const add = (geometry, material, order = 0) => { if (!geometry) return; const m = new THREE.Mesh(geometry, material); m.renderOrder = order; terrain.add(m); meshes.push(m); };
  add(geo.opaqueGeo, textures.opaqueMaterial);
  add(geo.lightGeo, textures.lightMaterial);
  add(geo.waterGeo, WATER, 1);
  add(geo.transparentGeo, textures.transparentMaterial, 2);
  chunkMeshes.set(key, meshes);
}

function meshAll() {
  for (const meshes of chunkMeshes.values()) for (const m of meshes) { terrain.remove(m); m.geometry.dispose(); }
  chunkMeshes.clear();
  const { range } = state.built;
  for (let cx = range.minCx; cx <= range.maxCx; cx++) for (let cz = range.minCz; cz <= range.maxCz; cz++) meshChunk(cx, cz);
}

/** Watch the world's edits (snow layers, ice, cauldrons, the showcase's props) so their chunks are redrawn. */
function watchEdits(world) {
  if (world.__weatherInspectorWatched) return;
  world.__weatherInspectorWatched = true;
  const setVoxel = world.setVoxel.bind(world);
  world.setVoxel = (x, y, z, id, ...rest) => {
    const result = setVoxel(x, y, z, id, ...rest);
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16), lx = x - cx * 16, lz = z - cz * 16;
    state.dirty.add(`${cx},${cz}`);
    if (lx === 0) state.dirty.add(`${cx - 1},${cz}`); if (lx === 15) state.dirty.add(`${cx + 1},${cz}`);
    if (lz === 0) state.dirty.add(`${cx},${cz - 1}`); if (lz === 15) state.dirty.add(`${cx},${cz + 1}`);
    return result;
  };
}

/** Show a biome (built once per biome and seed). */
async function showBiome(biome, seed = $('seed').value.trim() || '4242') {
  const key = `${biome}|${seed}`;
  if (state.built && state.built.biome === biome && state.built.seed === String(seed)) return state.built;
  $('status').textContent = `Generating ${biome}…`;
  if (!mesher) { textures = await loadTextures(); mesher = new ChunkMesher(textures); }
  clearProps();
  let built = worlds.get(key);
  if (!built) { built = await buildBiomeWorld({ biome, seed }); worlds.set(key, built); watchEdits(built.world); }
  state.built = built;
  game.world = built.world;
  weather.columns.clear();
  const { centre } = built;
  game.player.position.set(centre.x + 0.5, centre.y, centre.z + 0.5);
  marker.position.set(centre.x + 0.5, centre.y + 0.9, centre.z + 0.5);
  controls.target.set(centre.x + 0.5, centre.y + 2, centre.z + 0.5);
  // From above at a steep angle, so trees and huts around the spawn do not hide it.
  camera.position.set(centre.x + 11, centre.y + 19, centre.z + 14);
  meshAll();
  state.dirty.clear();
  if ($('biome').value !== biome) $('biome').value = biome;
  history.replaceState(null, '', `?biome=${encodeURIComponent(biome)}&seed=${encodeURIComponent(seed)}`);
  $('status').textContent = '';
  return built;
}

/** The showcase's props: blocks placed relative to the spawn's surface, put back as they were afterwards. */
function placeProps(props = []) {
  clearProps();
  const { world, centre } = state.built;
  for (const p of props) {
    const x = centre.x + p.dx, y = centre.y - 1 + p.dy, z = centre.z + p.dz;
    state.props.push({ x, y, z, was: world.getVoxel(x, y, z) });
    world.setVoxel(x, y, z, p.block);
  }
  weather.columns.clear();
}
function clearProps() {
  if (!state.built) { state.props = []; return; }
  for (const p of state.props.reverse()) state.built.world.setVoxel(p.x, p.y, p.z, p.was);
  state.props = [];
  weather.columns.clear();
}

function setWeather(type) {
  weather.setWeather(type);
  for (const b of document.querySelectorAll('#weather-buttons button')) b.classList.toggle('on', b.dataset.weather === type);
}
function setNight(night) {
  state.night = night;
  state.worldTime = night ? 18000 : 6000;
  $('night').classList.toggle('on', night);
  $('night').textContent = night ? '☀ Day' : '🌙 Night';
}

/** A bolt beside the spawn, on top of the column (dx, dz) from it, as /summon lightning_bolt. */
function strike({ dx = 4, dz = 2 } = {}) {
  if (!state.built) return false;
  const { centre, world } = state.built;
  const x = centre.x + dx, z = centre.z + dz, column = precipitationColumn(world, x, z);
  const y = Number.isFinite(column.height) ? column.height : centre.y;
  return weather.triggerLightning(null, null, new THREE.Vector3(x + 0.5, y, z + 0.5));
}

const ticksText = (ticks) => {
  const s = Math.max(0, Math.round(ticks / 20));
  return `${ticks.toLocaleString()} ticks (${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}, ${(ticks / 24000).toFixed(2)} days)`;
};

function renderSummary() {
  if (!state.built) return;
  const { world, centre, def } = state.built;
  const c = weather.clock, dim = weatherDimension(world);
  const raining = weather.isRaining(), thunder = raining && c.thundering;
  const here = weather.precipitationAt(centre.x + 0.5, centre.y + 0.1, centre.z + 0.5);
  const biomeKind = precipitationForBiome(state.built.biome, centre.y, world);
  const darken = skyDarkenForDimension(dim, state.worldTime, { rain: raining, thunder });
  const monsters = dim === 'overworld' && monsterIsDarkEnoughToSpawn({ skyLight: 15, blockLight: 0, skyDarken: darken, thunder, dimension: 'overworld' }, { nextInt: (n) => n - 1 });
  $('summary').textContent = [
    `${def?.name ?? state.built.biome} · ${dim} · ${state.night ? 'midnight' : 'noon'}`,
    `weather: ${c.type}${dim !== 'overworld' ? ' (none here: Overworld only)' : raining && biomeKind === 'snow' ? ' (falling as snow)' : ''}`,
    c.clearTicks > 0 ? `clear held: ${ticksText(c.clearTicks)}` : `rain ${c.raining ? 'stops' : 'starts'} in ${ticksText(c.rainTicks)}`,
    `thunder ${c.thundering ? 'stops' : 'starts'} in ${ticksText(c.thunderTicks)}`,
    `this biome gets: ${biomeKind}`,
    `falling on the spawn: ${here}`,
    `sky darken: ${darken}`,
    `monsters in open sky light 15: ${monsters ? 'can spawn' : 'cannot'}`,
    state.cycle ? `weather cycle on at ${state.speed}×` : 'weather cycle off (doWeatherCycle false)',
  ].join('\n');
  const view = state.showcase?.current;
  $('badge').replaceChildren();
  const title = document.createElement('div');
  // What is seen: rain weather in a cold biome is snowfall; in a dry one nothing falls.
  const seen = !raining ? c.type : `${c.type}${biomeKind === 'snow' ? ' (falling as snow)' : biomeKind === 'none' ? ' (nothing falls: too dry)' : ''}`;
  title.textContent = view ? `${view.index + 1}/${view.total} · ${view.scenario.title}` : `${def?.name ?? state.built.biome} — ${seen}`;
  $('badge').append(title);
  if (view) { const q = document.createElement('q'); q.textContent = view.scenario.wiki; $('badge').append(q); }
  window.__weatherInspector = { biome: state.built.biome, weather: c.type, raining, thunder, here, darken, monsters, results: state.results ?? null, running: !!state.showcase };
}

// --- The showcase ---

async function showView(scenario) {
  const v = scenario.view;
  await showBiome(v.biome);
  setNight(!!v.night);
  setWeather(v.weather);
  weather.rainIntensity = v.weather === 'clear' ? 0 : 0.6; // the change shows at once
  placeProps(v.props);
}

function resultItem(scenario, result) {
  const li = document.createElement('li');
  li.className = result ? (result.ok ? 'ok' : 'fail') : '';
  li.dataset.id = scenario.id;
  const head = document.createElement('div');
  head.textContent = `${result ? (result.ok ? '✓' : '✗') : '…'} ${scenario.title}`;
  const q = document.createElement('q'); q.textContent = scenario.wiki;
  li.append(head, q);
  if (result) { const pre = document.createElement('pre'); pre.textContent = result.detail; li.append(pre); }
  li.onclick = () => { if (!state.showcase) { showView(scenario).then(() => { if (scenario.view.bolt) strike(scenario.view.bolt); }); markCurrent(scenario.id); } };
  return li;
}
function markCurrent(id) { for (const li of $('showcase-results').children) li.classList.toggle('current', li.dataset?.id === id); }

const wait = (ms, run) => new Promise((resolve) => { const t0 = performance.now(); const step = () => (run.stopped || performance.now() - t0 >= ms ? resolve() : requestAnimationFrame(step)); step(); });

async function runShowcase() {
  if (state.showcase) return;
  const scenarios = weatherScenarios(), run = { stopped: false, current: null };
  state.showcase = run; state.results = [];
  $('showcase').disabled = true; $('showcase-stop').disabled = false;
  $('showcase-results').replaceChildren();
  const status = $('showcase-status');
  status.className = 'running';
  let group = null;
  for (const [index, scenario] of scenarios.entries()) {
    if (run.stopped) break;
    run.current = { index, total: scenarios.length, scenario };
    status.textContent = `Running ${index + 1}/${scenarios.length}: ${scenario.title}`;
    await showView(scenario);
    if (scenario.group !== group) { group = scenario.group; const g = document.createElement('li'); g.className = 'group'; g.textContent = group; g.style.cursor = 'default'; $('showcase-results').append(g); }
    const li = resultItem(scenario, null); $('showcase-results').append(li); markCurrent(scenario.id); li.scrollIntoView({ block: 'nearest' });
    // A bolt lasts under half a second (the game's own timing), so a lightning view strikes twice.
    await wait(900, run);
    if (scenario.view.bolt) strike(scenario.view.bolt);
    await wait(800, run);
    if (scenario.view.bolt) strike({ dx: scenario.view.bolt.dx - 2, dz: scenario.view.bolt.dz + 1 });
    await wait(800, run);
    const [result] = runWeatherShowcase([scenario.id]);
    state.results.push(result);
    li.replaceWith(resultItem(scenario, result)); markCurrent(scenario.id);
  }
  const passed = state.results.filter((r) => r.ok).length;
  if (run.stopped) { status.className = 'skipped'; status.textContent = `Stopped after ${state.results.length}/${scenarios.length}: ${passed} passed.`; }
  else { status.className = passed === scenarios.length ? 'pass' : 'partial'; status.textContent = `${passed}/${scenarios.length} weather rules pass.${passed < scenarios.length ? ' Failed: ' + state.results.filter((r) => !r.ok).map((r) => r.title).join('; ') : ''}`; }
  state.showcase = null;
  $('showcase').disabled = false; $('showcase-stop').disabled = true;
  markCurrent(null);
}

// --- Controls ---

for (const b of document.querySelectorAll('#weather-buttons button')) b.onclick = () => setWeather(b.dataset.weather);
// Minecraft has no snow weather: it is rain falling where the biome is cold enough. In a warm or dry biome this
// switches to Snowy Plains first.
$('snow').onclick = async () => {
  if (state.showcase || !state.built) return;
  const { world, centre } = state.built;
  if (precipitationForBiome(state.built.biome, centre.y, world) !== 'snow') await showBiome('snowy_plains').catch(fail);
  setWeather('rain');
  $('status').textContent = 'Snow is rain in a cold biome: /weather rain here.';
};
$('strike').onclick = () => strike({ dx: 3 + Math.floor(Math.random() * 5), dz: Math.floor(Math.random() * 9) - 4 });
$('night').onclick = () => setNight(!state.night);
$('cycle').onchange = () => { state.cycle = $('cycle').checked; game.gamerules.doWeatherCycle = state.cycle; };
$('speed').onchange = () => { state.speed = Number($('speed').value); };
$('biome').onchange = () => { if (!state.showcase) showBiome($('biome').value).catch(fail); };
$('seed').onchange = () => { if (!state.showcase) { state.built = null; showBiome($('biome').value).catch(fail); } };
$('showcase').onclick = () => runShowcase().catch(fail);
$('showcase-stop').onclick = () => { if (state.showcase) state.showcase.stopped = true; };
function fail(error) { $('status').textContent = `Error: ${error.message}`; console.error(error); }

function resize() {
  const w = $('view').clientWidth, h = $('view').clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe($('view'));
resize();

const clock = new THREE.Clock();
let summaryIn = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.1, clock.getDelta());
  controls.update();
  if (state.built) {
    // The base light of noon or midnight, which the weather then dims, darkens and flashes.
    const sky = state.built.def?.skyColor ?? 0x78a7ff;
    ambient.intensity = state.night ? 0.45 : 2.2;
    sun.intensity = state.night ? 0.12 : 1.4;
    background.set(state.night ? 0x0b1020 : sky);
    scene.fog.color.copy(background);
    // The cycle at speed: the clock alone runs faster; the drawing runs in real time.
    if (state.cycle && state.speed > 1) weather.clock.advance(dt * (state.speed - 1), true);
    // The game sizes snowflakes for a player standing in the snowfall; this camera is 20-30 blocks off, where they
    // would shrink to 2 px dots. Draw them the size they are 6 blocks from the eye.
    const away = Math.max(1, camera.position.distanceTo(controls.target) / 6);
    weather.snowMaterial.uniforms.pointScale.value = 55 * away;
    weather.snowMaterial.uniforms.pointMax.value = Math.min(14, 7 * away);
    weather.update(dt, controls.target, ambient, sun, scene.fog, background);
    for (const b of document.querySelectorAll('#weather-buttons button')) b.classList.toggle('on', b.dataset.weather === weather.weatherType);
    // Redraw chunks the weather (snow, ice, cauldrons) or the showcase changed, a few times a second.
    state.remeshIn -= dt;
    if (state.dirty.size && state.remeshIn <= 0) {
      const { range } = state.built;
      for (const key of state.dirty) { const [cx, cz] = key.split(',').map(Number); if (cx >= range.minCx && cx <= range.maxCx && cz >= range.minCz && cz <= range.maxCz) meshChunk(cx, cz); }
      state.dirty.clear(); state.remeshIn = 0.4;
    }
    summaryIn -= dt;
    if (summaryIn <= 0) { renderSummary(); summaryIn = 0.25; }
  }
  renderer.render(scene, camera);
});

setNight(false);
showBiome($('biome').value).then(() => { setWeather(params.get('weather') || 'rain'); if (params.get('showcase') === '1') runShowcase(); }).catch(fail);
