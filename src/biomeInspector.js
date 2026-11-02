// The Biome Inspector page (biome-inspector.html): one biome choice's world around its spawn, drawn with the game's
// own mesher and textures, with the checklist from biomeInspectorSession.js beside it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ChunkMesher } from './mesher.js';
import { loadTextures } from './structureInspectorWorldView.js';
import { inspectorBiomes, buildBiomeWorld, biomeChecks, biomeSummary, simulateDragonDefeat } from './biomeInspectorSession.js';

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
scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6577, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(40, 80, 30);
scene.add(sun);
const world = new THREE.Group();
scene.add(world);
const marker = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), new THREE.MeshBasicMaterial({ color: 0xff3b3b, wireframe: true }));
scene.add(marker);

const WATER = new THREE.MeshLambertMaterial({ color: 0x3a6fd0, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false });
let mesher = null, textures = null, built = null, busy = false;

// The picker, grouped as the new-world screen groups it.
for (const group of inspectorBiomes()) {
  const optgroup = document.createElement('optgroup');
  optgroup.label = `${group.icon} ${group.name}`;
  for (const b of group.biomes) optgroup.appendChild(new Option(b.name, b.id));
  $('biome').appendChild(optgroup);
}
$('biome').value = params.get('biome') && [...$('biome').options].some((o) => o.value === params.get('biome')) ? params.get('biome') : 'sunflower_plains';
if (params.get('seed')) $('seed').value = params.get('seed');

function clearWorld() {
  for (const child of [...world.children]) { world.remove(child); child.geometry?.dispose(); }
}

function meshWorld() {
  const { range } = built;
  for (let cx = range.minCx; cx <= range.maxCx; cx++) for (let cz = range.minCz; cz <= range.maxCz; cz++) {
    const geo = mesher.meshChunk(built.world.getOrCreateChunk(cx, cz), built.world);
    const add = (geometry, material, order = 0) => { if (!geometry) return; const m = new THREE.Mesh(geometry, material); m.renderOrder = order; world.add(m); };
    add(geo.opaqueGeo, textures.opaqueMaterial);
    add(geo.lightGeo, textures.lightMaterial);
    add(geo.waterGeo, WATER, 1);
    add(geo.transparentGeo, textures.transparentMaterial, 2);
  }
}

function renderPanel() {
  const checks = biomeChecks(built);
  $('checks').replaceChildren(...checks.map((c) => {
    const li = document.createElement('li');
    li.className = c.ok ? 'ok' : 'fail';
    li.textContent = `${c.ok ? '✓' : '✗'} ${c.label}`;
    const detail = document.createElement('span');
    detail.textContent = c.detail ?? '';
    li.appendChild(detail);
    return li;
  }));
  const s = biomeSummary(built);
  $('summary').textContent = [
    `${s.name} · ${s.dimension}${s.spawnKind ? ` · start: ${s.spawnKind}` : ''}`,
    `spawn ${s.spawn}`,
    s.reason,
    s.portal ? `spawn portal ${s.portal}` : null,
    `surface: ${s.surface.join(', ')}`,
    `mobs: ${s.mobs.join(', ') || 'none'}`
  ].filter(Boolean).join('\n');
  const passed = checks.filter((c) => c.ok).length;
  $('badge').textContent = `${s.name} — ${passed}/${checks.length} checks pass`;
  $('dragon').hidden = built.world.dimension !== 'the_end';
  window.__biomeInspector = { biome: built.biome, seed: built.seed, checks, summary: s };
}

async function regenerate() {
  if (busy) return;
  busy = true;
  $('regenerate').disabled = true;
  $('status').textContent = 'Generating…';
  try {
    if (!mesher) { textures = await loadTextures(); mesher = new ChunkMesher(textures); }
    clearWorld();
    built = await buildBiomeWorld({ biome: $('biome').value, seed: $('seed').value.trim() || '4242' });
    meshWorld();
    const { centre } = built;
    marker.position.set(centre.x + 0.5, centre.y + 0.9, centre.z + 0.5);
    controls.target.set(centre.x + 0.5, centre.y, centre.z + 0.5);
    // Up and back far enough to see over a tall End city or a forest.
    camera.position.set(centre.x + 22, centre.y + 26, centre.z + 30);
    scene.background = new THREE.Color(built.def?.skyColor ?? 0x78a7ff);
    renderPanel();
    history.replaceState(null, '', `?biome=${built.biome}&seed=${encodeURIComponent(built.seed)}`);
    $('status').textContent = '';
  } catch (error) {
    $('status').textContent = `Could not build it: ${error.message}`;
    console.error(error);
  } finally {
    busy = false;
    $('regenerate').disabled = false;
  }
}

$('biome').onchange = regenerate;
$('seed').onchange = regenerate;
$('regenerate').onclick = regenerate;
$('random-seed').onclick = () => { $('seed').value = String(Math.floor(Math.random() * 1e9)); regenerate(); };
$('play').onclick = () => { location.href = `/?biome=${encodeURIComponent($('biome').value)}&seed=${encodeURIComponent($('seed').value.trim())}`; };
$('dragon').onclick = () => {
  if (!built) return;
  const result = simulateDragonDefeat(built);
  if (!result?.links) { $('status').textContent = result ? 'No End city near enough for the gateways (this world\'s outer islands may have none).' : ''; return; }
  const { main, city } = result.links;
  $('status').textContent = `Gateways open: main island ${main.x}, ${main.y}, ${main.z} → End city ${city.x}, ${city.y}, ${city.z}, and back.`;
  window.__biomeInspector.dragon = result;
};

function resize() {
  const w = $('view').clientWidth, h = $('view').clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe($('view'));
resize();
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
regenerate();
