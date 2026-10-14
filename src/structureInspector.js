// Structure Inspector: the browser half.
//
// The page is deliberately dumb: every decision lives in `structureInspectorSession.js`, which the
// tests drive. This file only turns a plan into pixels -- the preview blocks, the start and piece
// boxes, the chunk grid, the structure-set candidate grid -- and shows the metadata beside them.
//
// Rendering: two views. "Textured" (the default) generates the structure in a real `World` and draws it with the
// game's own mesher and block atlas (see structureInspectorWorldView.js), and it is also what the walk-through and
// the seed gallery use. "Coloured cubes" is the fast flat preview: one cube per block with a legend, for judging a
// layout without waiting for terrain. The block *identity* is never approximated in either: the legend, the click
// readout and the telemetry report real block names and block-entity data.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { createStructureInspectorSession, inspectorStructures, PREVIEW_MIN_Y, PREVIEW_MAX_Y } from './structureInspectorSession.js';
import { renderStructurePanels } from './structureInspectorPanelsUi.js';
import { createVoxelGeometry, createVoxelMaterial, applyInstanceColours } from './structureInspectorGeometry.js';
import { fillInspectorSource, inspectorContent } from './mods/inspectorSelector.js';
import { runAuditAndRender, runAuditAllAndRender } from './structureInspectorAudit.js';
import { createWorldView, createWalkThrough, renderThumbnail, gallerySeeds } from './structureInspectorWorldView.js';
import { lootView, blockEntitiesView } from './structureInspectorWorld.js';
import { buildEvidence, evidenceName } from './structureInspectorEvidence.js';

const $ = (id) => document.getElementById(id);
let selectedMod = fillInspectorSource($('content-source'), new URLSearchParams(location.search).get('mod'));

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
  for (const entry of inspectorContent('structure', inspectorStructures(), selectedMod).content) {
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
  if (selectedMod) {
    clearGroup(blockGroup); clearGroup(overlayGroup); clearGroup(candidateGroup);
    blockIndex = []; selectedPiece = null;
    for (const id of ['piece-table', 'legend', 'block-info', 'placement-info', 'candidate-info', 'plan-summary', 'seed-diff', 'piece-graph', 'adaptation-info']) $(id).replaceChildren();
    $('plan-info').textContent = 'This mod does not register any inspectable structures.';
    return;
  }
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
  syncTextured({ reflowCamera });
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

// --- textured world view, walk-through, gallery, evidence --------------------------------------------
const worldView = createWorldView({ scene });
const walk = createWalkThrough({ renderer, scene, view: worldView, onChange: renderWalkHud });
const SKY = new THREE.Color('#9bc4f0');
const SPACE = new THREE.Color('#1d2634');
let texturedKey = null;
let buildToken = 0;
let lastAuditResult = null;
const worldOverlay = new THREE.Group();
scene.add(worldOverlay);

const texturedWanted = () => $('view-mode').value === 'textured' && !selectedMod;

function setStatus(text) {
  const el = $('view-status');
  el.textContent = text;
  el.style.display = text ? 'block' : 'none';
}

/** Boxes of the generated start, in the real world's coordinates. */
function renderWorldOverlay(built) {
  clearGroup(worldOverlay);
  if (!built) return;
  if (session.state.showStartBox) worldOverlay.add(boxHelper([built.box.minX, built.box.minY, built.box.minZ, built.box.maxX, built.box.maxY, built.box.maxZ], 0x38bdf8, 0.85));
  if (session.state.showPieceBoxes) {
    for (const piece of built.pieces) worldOverlay.add(boxHelper(piece, 0x10b981, 0.7));
  }
}

function renderWorldPanels(built) {
  const loot = $('loot-info');
  const rows = $('entity-rows');
  loot.replaceChildren();
  rows.replaceChildren();
  if (!built) {
    loot.textContent = 'build the textured view';
    rows.textContent = 'build the textured view';
    return;
  }
  const lootData = lootView(built);
  if (!lootData.chests.length) {
    loot.textContent = 'this structure created no chests';
  } else {
    const head = document.createElement('div');
    head.textContent = `${lootData.chests.length} chest(s), ${lootData.empty} empty`;
    loot.append(head);
    for (const item of lootData.totals) {
      const line = document.createElement('div');
      line.textContent = `${item.name} × ${item.count}`;
      loot.append(line);
    }
    lootData.chests.forEach((chest) => {
      const line = document.createElement('div');
      line.className = 'muted';
      line.textContent = `chest ${chest.pos.join(',')}: ${chest.items.map((i) => `${i.name}×${i.count}`).join(', ') || 'empty'}`;
      loot.append(line);
    });
  }
  const entities = blockEntitiesView(built);
  const summary = document.createElement('div');
  summary.textContent = Object.entries(entities.counts).map(([kind, n]) => `${kind} × ${n}`).join(', ') || 'none';
  const table = document.createElement('table');
  for (const row of entities.rows.slice(0, 120)) {
    const tr = document.createElement('tr');
    for (const text of [row.kind, row.pos.join(','), row.detail]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    tr.onclick = () => { if (walk.active) walk.teleport(row.pos[0] + 0.5, row.pos[1], row.pos[2] + 2.5, 0, 0); };
    table.append(tr);
  }
  rows.append(summary, table);
}

/** Show or hide the cube preview and the real-terrain scenery according to the view mode. */
function applyViewMode() {
  const textured = texturedWanted();
  blockGroup.visible = !textured;
  overlayGroup.visible = !textured;
  candidateGroup.visible = !textured;
  ground.visible = !textured;
  worldGrid.visible = !textured;
  worldOverlay.visible = textured;
  worldView.group.visible = textured && Boolean(worldView.built);
  scene.background = textured ? SKY : SPACE;
}

/** Build the textured world for the current structure and seed when it changed. Never throws into the page. */
async function syncTextured({ reflowCamera = false, force = false } = {}) {
  applyViewMode();
  if (!texturedWanted()) return null;
  const structureId = session.state.structureId;
  const info = session.info;
  if (!info || info.implemented === false) { setStatus('no generator for this structure yet'); return null; }
  const key = `${structureId}|${session.state.seed}`;
  if (!force && key === texturedKey && worldView.built) return worldView.built;
  const token = ++buildToken;
  setStatus(`generating ${structureId} at seed ${session.state.seed}...`);
  try {
    const built = await worldView.show({ structureId, seed: session.state.seed });
    if (token !== buildToken) return null;
    texturedKey = key;
    renderWorldOverlay(built);
    renderWorldPanels(built);
    applyViewMode();
    // Rebuilt while walking: the walker still points at the old world, so put it at the new structure.
    if (walk.active) walk.rebind();
    setStatus(`${structureId}, seed ${built.seed}, chunk ${built.found.chunk.join(',')}, ${built.found.biome} biome (${built.biomeMode} world); ${worldView.mobStatus}`);
    if (reflowCamera || force) {
      const { box } = built;
      const cx = (box.minX + box.maxX) / 2; const cy = (box.minY + box.maxY) / 2; const cz = (box.minZ + box.maxZ) / 2;
      const radius = Math.max(box.maxX - box.minX, box.maxZ - box.minZ, 14) * 1.5;
      controls.target.set(cx, cy, cz);
      camera.position.set(cx + radius * 0.6, cy + radius * 0.85, cz + radius * 0.7);
      camera.far = 1500;
      camera.updateProjectionMatrix();
    }
    return built;
  } catch (error) {
    if (token === buildToken) { setStatus(`could not build: ${error.message}`); log(`textured view failed: ${error.message}`); }
    return null;
  }
}

function renderWalkHud(hud) {
  const el = $('walk-hud');
  const showing = Boolean(hud);
  el.style.display = showing ? 'block' : 'none';
  $('walk-help').style.display = showing ? 'block' : 'none';
  $('crosshair').style.display = showing ? 'block' : 'none';
  if (!showing) return;
  el.textContent = [
    `position ${hud.position}   facing ${hud.facing}${hud.flying ? '   FLYING' : ''}`,
    `looking at ${hud.looking}${hud.door ? '   [E] open/close door' : ''}`,
    hud.nearestMob ? `nearest mob: ${hud.nearestMob}` : 'no mobs requested'
  ].join('\n');
}

$('view-mode').onchange = () => { applyViewMode(); refresh({ reflowCamera: true }); };

$('btn-walk').onclick = async () => {
  if (walk.active) { walk.stop(); return; }
  $('view-mode').value = 'textured';
  const built = await syncTextured({ reflowCamera: false, force: !worldView.built });
  if (!built) { log('walk-through needs the textured view to build first'); return; }
  walk.start();
  $('btn-walk').textContent = 'Stop walking (Esc)';
};
// The walk-through ends from several places (Esc, the button), so the button label follows the state.
setInterval(() => { if (!walk.active && $('btn-walk').textContent !== 'Walk through it') $('btn-walk').textContent = 'Walk through it'; }, 250);

$('btn-gallery').onclick = async () => {
  const gallery = $('gallery');
  const count = Math.max(2, Math.min(12, Number($('gallery-count').value) || 6));
  const seeds = gallerySeeds(session.state.seed, count);
  const structureId = session.state.structureId;
  gallery.replaceChildren();
  for (const seed of seeds) {
    const figure = document.createElement('figure');
    figure.innerHTML = '<div class="muted" style="padding:20px">generating...</div>';
    gallery.append(figure);
    const shot = await renderThumbnail({ structureId, seed });
    figure.replaceChildren();
    if (shot.found) {
      const img = document.createElement('img');
      img.src = shot.url;
      const caption = document.createElement('figcaption');
      caption.textContent = `seed ${shot.seed}  chunk ${shot.chunk.join(',')}`;
      figure.append(img, caption);
      figure.onclick = () => { $('seed').value = shot.seed; $('seed').onchange(); };
    } else {
      figure.textContent = `seed ${shot.seed}: ${shot.error ?? 'not found'}`;
    }
  }
};

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

$('btn-evidence').onclick = async () => {
  readInputs();
  const built = await syncTextured({ force: !worldView.built });
  if (!built) { log('evidence needs the textured view'); return; }
  let audit = lastAuditResult;
  try { audit = await runAuditAndRender(session, $, $('audit-mode').value) ?? audit; } catch (error) { log(`audit failed: ${error.message}`); }
  const name = evidenceName(built);
  download(`${name}.json`, new Blob([JSON.stringify(buildEvidence(built, audit, { view: 'textured' }), null, 2)], { type: 'application/json' }));
  renderer.render(scene, walk.active ? walk.camera : camera);
  renderer.domElement.toBlob((blob) => { if (blob) download(`${name}.png`, blob); }, 'image/png');
  log(`exported ${name}.json and ${name}.png: move them to docs/structure-audit/evidence/${built.structureId}/`);
};

// For tests and for driving the page from a browser tool.
window.structureInspector = { session, worldView, walk, syncTextured, applyViewMode };

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

// Regenerate: build the structure again from the seed in the box (change the seed, press this). It is the one button
// that always redoes everything: the plan, the cube preview and the textured world.
$('btn-regenerate').onclick = async () => {
  try {
    const seed = $('seed').value;
    session.setSeed(seed);
    log(`regenerating at seed ${seed}`);
    planNearestAndRefresh();
    await syncTextured({ force: true, reflowCamera: true });
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
$('btn-reset-view').onclick = () => refresh({ reflowCamera: true });

// The audit: the wiki's facts for the selected structure, checked against what the game would generate.
$('btn-audit').onclick = async () => { readInputs(); lastAuditResult = await runAuditAndRender(session, $, $('audit-mode').value) ?? lastAuditResult; };
$('btn-audit-all').onclick = () => { readInputs(); runAuditAllAndRender(session, $, $('audit-mode').value); };
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
$('content-source').onchange = () => {
  selectedMod = $('content-source').value || null;
  fillPicker();
  const empty = !$('structure').options.length;
  for (const control of document.querySelectorAll('#controls button, #controls input, #controls select')) {
    if (control.id !== 'content-source') control.disabled = empty;
  }
  if (empty) {
    refresh();
    log('No structures in selected mod');
  } else {
    session.planNearest({maxRadiusChunks: 256}); session.realize(); refresh({reflowCamera: true});
  }
};

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
if (selectedMod) $('content-source').onchange();

const resize = new ResizeObserver(() => {
  const w = $('view').clientWidth;
  const h = $('view').clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  walk.camera.aspect = w / h;
  walk.camera.updateProjectionMatrix();
});
resize.observe($('view'));

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  controls.update(dt);
  worldView.tickMobs(dt, walk.active ? walk.camera.position : controls.target);
  renderer.render(scene, walk.active ? walk.camera : camera);
});
