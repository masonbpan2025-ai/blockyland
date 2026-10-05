// Structure Inspector: the browser half.
//
// The page is deliberately dumb: every decision lives in `structureInspectorSession.js`, which the
// tests drive. This file only turns a plan into pixels -- the preview blocks, the start and piece
// boxes, the chunk grid, the structure-set candidate grid -- and shows the metadata beside them.
//
// Rendering note (a documented limitation, not an oversight): blocks are drawn as coloured unit cubes
// with a legend, not with their real atlas textures. That is enough to judge a layout, and it keeps
// this page independent of the renderer, which nothing else in the repo guarantees for a preview. The
// block *identity* is never approximated, though: the legend, the click readout and the telemetry all
// report real block names and block-entity data.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { createStructureInspectorSession, inspectorStructures, PREVIEW_MIN_Y, PREVIEW_MAX_Y } from './structureInspectorSession.js';
import { renderStructurePanels } from './structureInspectorPanelsUi.js';
import { createVoxelGeometry, createVoxelMaterial, applyInstanceColours } from './structureInspectorGeometry.js';

const $ = (id) => document.getElementById(id);

// --- palette --------------------------------------------------------------------------------
// A few blocks are named explicitly because their colour carries meaning in a preview (a chest that
// looks like stone reads as a bug); everything else gets a stable colour from its block name.
const NAMED_COLOURS = {
  [BLOCKS.CHEST]: '#a1662f',
  [BLOCKS.WATER]: '#2f6fb5',
  [BLOCKS.LAVA]: '#d4611c',
  [BLOCKS.AIR]: '#000000'
};

function colourForBlock(id) {
  if (NAMED_COLOURS[id]) return new THREE.Color(NAMED_COLOURS[id]);
  const name = BLOCK_DEFS[id]?.name || `block ${id}`;
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return new THREE.Color().setHSL((hash % 360) / 360, 0.45, 0.55);
}

function blockLabel(id) {
  if (id === BLOCKS.AIR) return 'Air';
  return BLOCK_DEFS[id]?.name || `Block ${id}`;
}

// --- scene ---------------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1d2634');
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1200);
camera.position.set(40, 46, 40);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('view').append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 70, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(60, 120, 40);
scene.add(sun);

const blockGroup = new THREE.Group();
const overlayGroup = new THREE.Group();
const candidateGroup = new THREE.Group();
scene.add(blockGroup, overlayGroup, candidateGroup);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshLambertMaterial({ color: 0x2b3648 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const worldGrid = new THREE.GridHelper(400, 100, 0x44536b, 0x334053);
scene.add(worldGrid);

// --- session -------------------------------------------------------------------------------
const session = createStructureInspectorSession();
let selectedPiece = null;
let placement = null;
let blockIndex = []; // instance index -> { x, y, z, id }

const events = [];
function log(message) {
  events.unshift(message);
  events.length = Math.min(40, events.length);
  $('events').textContent = events.join('\n');
}

function fillPicker() {
  const select = $('structure');
  const groups = new Map();
  for (const entry of inspectorStructures()) {
    if (!groups.has(entry.family)) groups.set(entry.family, []);
    groups.get(entry.family).push(entry);
  }
  select.innerHTML = '';
  for (const [family, entries] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    const group = document.createElement('optgroup');
    group.label = `${family} (${entries.length})`;
    for (const entry of entries) {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.implemented ? entry.id : `${entry.id} — no generator yet`;
      group.append(option);
    }
    select.append(group);
  }
  select.value = session.state.structureId;
}

function describePlacement(entry) {
  if (!entry) return '';
  return [
    `set: ${entry.set ?? 'none'}`,
    entry.placement,
    `step: ${entry.step}`,
    `terrain: ${entry.terrainAdaptation}`,
    `biomes: ${entry.biomes.length ? entry.biomes.join(', ') : 'all (or tag-gated)'}`
  ].join('\n');
}

// --- rendering -----------------------------------------------------------------------------
function clearGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  }
}

function renderBlocks() {
  clearGroup(blockGroup);
  blockIndex = [];
  // Air is filtered HERE as well as in the session, because a black cube is the one rendering outcome that
  // reads as a broken preview rather than as missing data: air is black in the palette, and a structure whose
  // air cells were drawn looked like a handful of black blocks instead of a building.
  const entries = [...session.world.blocks.entries()].filter(([, id]) => id !== BLOCKS.AIR);
  if (entries.length === 0) return;
  const geometry = createVoxelGeometry(THREE);
  const material = createVoxelMaterial(THREE);
  const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
  const matrix = new THREE.Matrix4();
  entries.forEach(([key, id], index) => {
    const [x, y, z] = key.split(',').map(Number);
    matrix.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
    mesh.setMatrixAt(index, matrix);
    blockIndex.push({ x, y, z, id });
  });
  // Colours go through the shared helper: `setColorAt` per instance, then an explicit upload. Writing the
  // buffer by hand without marking it dirty left the colours at zero, and the material/geometry pair is what
  // decides whether the fragment stage applies them at all -- see structureInspectorGeometry.js.
  applyInstanceColours(mesh, entries, colourForBlock);
  mesh.instanceMatrix.needsUpdate = true;
  blockGroup.add(mesh);
}

function boxHelper(box, colour, opacity = 1) {
  const [minX, minY, minZ, maxX, maxY, maxZ] = box;
  const g = new THREE.BoxGeometry(maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1);
  const edges = new THREE.EdgesGeometry(g);
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: colour, transparent: opacity < 1, opacity }));
  line.position.set((minX + maxX + 1) / 2, (minY + maxY + 1) / 2, (minZ + maxZ + 1) / 2);
  g.dispose();
  return line;
}

function renderOverlays() {
  clearGroup(overlayGroup);
  const info = session.snapshot();
  if (!info.planned) return;
  const boxes = session.state;
  if (boxes.showStartBox && info.box) {
    overlayGroup.add(boxHelper(info.box, 0x38bdf8, 0.85));
  }
  if (boxes.showPieceBoxes) {
    info.pieces.forEach((piece, index) => {
      overlayGroup.add(boxHelper(piece.box, index === selectedPiece ? 0xfbbf24 : 0x10b981, index === selectedPiece ? 1 : 0.7));
    });
  }
  if (boxes.showChunkGrid) {
    for (const [cx, cz] of info.chunks) {
      const g = new THREE.BoxGeometry(16, 1, 16);
      const edges = new THREE.EdgesGeometry(g);
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.5 }));
      line.position.set(cx * 16 + 8, info.box ? info.box[1] : session.world.surface, cz * 16 + 8);
      overlayGroup.add(line);
      g.dispose();
    }
  }
}

function renderCandidates() {
  clearGroup(candidateGroup);
  if (!session.state.showCandidateGrid) return;
  placement = session.placementPreview({ radiusChunks: 128 });
  if (!placement.chunks.length) return;
  const geometry = new THREE.PlaneGeometry(3, 3);
  const material = new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geometry, material, placement.chunks.length);
  const matrix = new THREE.Matrix4();
  placement.chunks.forEach((chunk, index) => {
    matrix.makeTranslation(chunk.chunkX * 16 + 8, session.world.surface + 1.02, chunk.chunkZ * 16 + 8);
    mesh.setMatrixAt(index, matrix);
  });
  matrix.makeRotationX(-Math.PI / 2);
  const rotation = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  placement.chunks.forEach((chunk, index) => {
    const m = new THREE.Matrix4().makeTranslation(chunk.chunkX * 16 + 8, session.world.surface + 1.02, chunk.chunkZ * 16 + 8)
      .multiply(rotation);
    mesh.setMatrixAt(index, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  candidateGroup.add(mesh);
  $('candidate-info').textContent = `${placement.total} candidate chunk(s) for ${placement.set} in ±128 chunks (spacing ${placement.spacing}); showing the nearest ${placement.chunks.length}.`;
}

function renderPanels() {
  const info = session.snapshot();
  const entry = session.info;
  $('placement-info').textContent = describePlacement(entry);
  $('plan-info').textContent = info.planned
    ? [
      `structure: ${info.structureId}`,
      `set: ${info.set}`,
      `seed: ${info.seed}`,
      `origin chunk: ${info.chunk[0]}, ${info.chunk[1]}`,
      `biome: ${info.biome}`,
      `step: ${info.step}`,
      `terrain adaptation: ${info.terrainAdaptation}`,
      `start box: [${info.box.join(', ')}]`,
      `placement reference: [${info.reference.join(', ')}]`,
      `pieces: ${info.pieces.length}   chunks touched: ${info.chunkCount}`,
      `blocks realized: ${info.blocks}${info.airSkipped ? `   (${info.airSkipped} air cell(s) skipped)` : ''}`,
      // The window follows the plan, so say which window is in force AND what it refused: a structure deeper
      // than the default is the one case where the preview can be legitimately empty, and it must not be
      // silent about it. `ancient_city` sits near Y -63, which the default 40..120 window cannot hold at all.
      `preview Y window: ${info.yRange.minY}..${info.yRange.maxY}`
        + (info.yRange.minY < info.previewDefaultYRange[0] || info.yRange.maxY > info.previewDefaultYRange[1]
          ? `   (widened from ${info.previewDefaultYRange[0]}..${info.previewDefaultYRange[1]} to fit this structure)`
          : ''),
      ...(info.outsidePreview > 0 && info.blocks === 0
        ? [`NOTHING DRAWN: all ${info.outsidePreview} block(s) fall outside the preview window.`]
        : []),
      `plan hash: ${info.hash}`
    ].join('\n')
    : `no plan for ${session.state.structureId} at chunk ${session.state.chunkX}, ${session.state.chunkZ}.\nUse "Find nearest" — most structures are sparse, so a random chunk is usually empty.`;

  const table = $('piece-table');
  table.innerHTML = '';
  if (info.planned) {
    const head = document.createElement('tr');
    for (const label of ['#', 'piece', 'type', 'box', 'rot', 'depth', 'parent']) {
      const th = document.createElement('th');
      th.textContent = label;
      head.append(th);
    }
    table.append(head);
    info.pieces.forEach((piece) => {
      const row = document.createElement('tr');
      if (piece.index === selectedPiece) row.className = 'selected';
      for (const value of [
        piece.index,
        piece.pool || piece.template || piece.id,
        piece.type,
        `[${piece.box.join(',')}]`,
        piece.rotation,
        piece.depth,
        piece.parentIndex === null ? '—' : piece.parentIndex
      ]) {
        const td = document.createElement('td');
        td.textContent = String(value);
        row.append(td);
      }
      row.onclick = () => { selectedPiece = piece.index; renderOverlays(); renderPanels(); };
      table.append(row);
    });
  }

  // Legend: real block names and counts, because a coloured cube is only useful if you know what it is.
  const legend = $('legend');
  legend.innerHTML = '';
  const counts = new Map();
  for (const { id } of blockIndex) counts.set(id, (counts.get(id) || 0) + 1);
  for (const [id, count] of [...counts].sort((a, b) => b[1] - a[1])) {
    const row = document.createElement('div');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = `#${colourForBlock(id).getHexString()}`;
    row.append(swatch, document.createTextNode(`${blockLabel(id)} × ${count}`));
    legend.append(row);
  }
  if (counts.size === 0) legend.textContent = '—';
}

function refresh({ reflowCamera = false } = {}) {
  // Rendered on every refresh, which is the one path every action already takes, so a panel cannot show a
  // stale plan. A rendering failure must not break the page, hence the catch.
  //
  // The PREVIOUS summary is handed in so the panel can say what changed since the last plan: flipping seeds is
  // the point of this page, and "moved to chunk X" and "plan changed at the same chunk" are different answers
  // about the algorithm that a reader should not have to work out by diffing hashes.
  try {
    const rendered = renderStructurePanels(session, { $, previous: lastSummary });
    lastSummary = rendered.summary;
  } catch (error) { log('error rendering panels: ' + error.message); }
  renderBlocks();
  renderCandidates();
  renderOverlays();
  renderPanels();
  if (reflowCamera) {
    const info = session.snapshot();
    const centre = info.planned && info.box
      ? { x: (info.box[0] + info.box[3]) / 2, y: (info.box[1] + info.box[4]) / 2, z: (info.box[2] + info.box[5]) / 2 }
      : { x: session.state.chunkX * 16 + 8, y: session.world.surface, z: session.state.chunkZ * 16 + 8 };
    controls.target.set(centre.x, centre.y, centre.z);
    camera.position.set(centre.x + 34, centre.y + 26, centre.z + 34);
    camera.updateProjectionMatrix();
    ground.position.y = session.world.surface - 0.02;
    worldGrid.position.y = session.world.surface;
  }
}

// --- controls ------------------------------------------------------------------------------
/** The summary from the previous render, so the panel can say what a seed change actually changed. */
let lastSummary = null;

/** Plan the nearest instance at the current inputs, REALIZE it, then re-render.
 *
 * Realizing is part of the same step rather than a separate button, because otherwise the preview shows the
 * previous structure's blocks underneath the new plan's boxes -- which reads as "the village generated a
 * handful of blocks" when in fact nothing had been generated at all. */
function planNearestAndRefresh({ reflowCamera = true } = {}) {
  readInputs();
  const found = session.planNearest({ maxRadiusChunks: 512 });
  $('chunk-x').value = String(session.state.chunkX);
  $('chunk-z').value = String(session.state.chunkZ);
  session.realize();
  refresh({ reflowCamera });
  return found;
}

const readInputs = () => {
  session.setSeed($('seed').value);
  session.setChunk(Number($('chunk-x').value), Number($('chunk-z').value));
  session.setBiome($('biome').value);
  session.setSurface(Number($('surface').value));
};

// Changing the seed APPLIES it and finds the structure again, so flipping seeds is one interaction rather than
// a text edit followed by a button press. This is the interaction the Inspector exists for.
$('seed').onchange = () => {
  try {
    const seed = $('seed').value;
    session.setSeed(seed);
    log(`seed ${seed}`);
    planNearestAndRefresh();
  } catch (error) { log(`error: ${error.message}`); refresh(); }
};

// A seed to try when the reader has no particular one in mind. It is drawn from the clock because the point is
// to be UNPREDICTABLE; every draw that decides generation is still the engine's deterministic stream.
$('btn-random-seed').onclick = () => {
  const seed = String(Math.floor(Math.random() * 1e9));
  $('seed').value = seed;
  try {
    session.setSeed(seed);
    log(`random seed ${seed}`);
    planNearestAndRefresh();
  } catch (error) { log(`error: ${error.message}`); refresh(); }
};

$('structure').onchange = (event) => {
  session.setStructure(event.target.value);
  $('biome').value = session.world.biome;
  log(`selected ${event.target.value}`);
  // PLAN it, rather than only re-rendering: selecting another structure and leaving the previous structure's
  // plan on screen would make the panels describe something the picker no longer shows.
  try {
    planNearestAndRefresh();
    log(`selected ${event.target.value} and planned it`);
  } catch (error) {
    log(`selected ${event.target.value}, but it could not be planned here: ${error.message}`);
    refresh({ reflowCamera: true });
  }
};
$('btn-nearest').onclick = () => {
  try {
    const found = planNearestAndRefresh();
    if (found) log(`located at chunk ${found.chunk[0]}, ${found.chunk[1]}`);
  } catch (error) { log(`error: ${error.message}`); refresh(); }
};
$('btn-chunk').onclick = () => {
  try {
    readInputs();
    session.planChunk();
    refresh({ reflowCamera: true });
  } catch (error) { log(`error: ${error.message}`); refresh(); }
};
$('btn-realize').onclick = () => {
  const written = session.realize();
  log(`realized ${written} block(s)`);
  refresh();
};
$('btn-determinism').onclick = () => {
  try {
    readInputs();
    const check = session.determinismCheck();
    $('determinism').className = check.ok ? 'ok' : 'bad';
    $('determinism').textContent = check.ok
      ? `deterministic: ${check.reason}${check.hashA !== undefined ? ` (hash ${check.hashA})` : ''}`
      : `NOT DETERMINISTIC: ${check.reason}${check.hashA !== undefined ? ` (${check.hashA} vs ${check.hashB})` : ''}`;
    log(`determinism: ${check.ok ? 'ok' : 'MISMATCH'}`);
  } catch (error) { log(`error: ${error.message}`); }
};
$('btn-reset-view').onclick = () => refresh({ reflowCamera: true });
for (const id of ['show-chunks', 'show-pieces', 'show-start', 'show-candidates']) {
  $(id).onchange = (event) => {
    const key = { 'show-chunks': 'showChunkGrid', 'show-pieces': 'showPieceBoxes', 'show-start': 'showStartBox', 'show-candidates': 'showCandidateGrid' }[id];
    session.state[key] = event.target.checked;
    refresh();
  };
}

// Click a block to read its identity and block-entity data: the inspector's answer to "did the chest
// actually get a loot table", which a screenshot cannot show.
const raycaster = new THREE.Raycaster();
renderer.domElement.addEventListener('click', (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(pointer, camera);
  const meshes = blockGroup.children.filter((child) => child.isInstancedMesh);
  const hit = raycaster.intersectObjects(meshes, false)[0];
  if (!hit) { $('block-info').textContent = '—'; return; }
  const entry = blockIndex[hit.instanceId];
  if (!entry) { $('block-info').textContent = '—'; return; }
  const meta = session.world.getBlockMeta(entry.x, entry.y, entry.z);
  $('block-info').textContent = [
    `${blockLabel(entry.id)} (id ${entry.id})`,
    `at ${entry.x}, ${entry.y}, ${entry.z}`,
    meta ? `block entity: ${JSON.stringify(meta)}` : 'no block entity'
  ].join('\n');
});

// --- boot ----------------------------------------------------------------------------------
fillPicker();

// The initial page can hand off a structure and a seed in the query string, which is what makes a particular
// structure-and-seed combination LINKABLE: `/structure-inspector.html?structure=igloo&seed=12345`. An unknown
// structure id is ignored rather than fatal, so a stale link still opens a working page.
const bootParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
const requestedStructure = bootParams.get('structure');
if (requestedStructure) {
  // setStructure THROWS on an unknown id, so a stale link must be caught: "ignored rather than fatal" is only
  // true if the code says so, and a shared link outliving a registry rename is the likeliest way to hit this.
  try {
    session.setStructure(requestedStructure);
    $('structure').value = requestedStructure;
    $('biome').value = session.world.biome;
  } catch (error) {
    log(`ignored the structure in the link: ${error.message}`);
  }
}
const requestedSeed = bootParams.get('seed');
if (requestedSeed && requestedSeed.trim() !== '') {
  try { session.setSeed(requestedSeed); } catch (error) { log(`ignored the seed in the link: ${error.message}`); }
}

$('seed').value = String(session.state.seed);
$('chunk-x').value = String(session.state.chunkX);
$('chunk-z').value = String(session.state.chunkZ);
$('biome').value = session.world.biome;
$('surface').value = String(session.world.surface);
$('version-note').textContent = `target: Minecraft Java Edition 1.21.4 — preview range Y ${PREVIEW_MIN_Y}..${PREVIEW_MAX_Y}, no world generation`;

// Plan something immediately: an empty inspector reads as broken.
session.planNearest({ maxRadiusChunks: 256 });
session.realize();
refresh({ reflowCamera: true });

const resize = new ResizeObserver(() => {
  const w = $('view').clientWidth;
  const h = $('view').clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});
resize.observe($('view'));

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  controls.update(dt);
  renderer.render(scene, camera);
});
