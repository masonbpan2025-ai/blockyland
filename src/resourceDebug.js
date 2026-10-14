// Resource Inspector page: the browser half of the block and item inspector.
//
// `src/resourceRegistry.js` and `src/resourceShowcase.js` do the work and are free of Three.js and of
// the DOM, so `node scripts/inspect-resource.mjs` reports exactly what this page reports. The page
// adds the two things a browser is better at: a real 3D preview built from the block's own geometry
// and the item's own icon, and a browsable list.
//
// The vanilla comparison needs `.cache/mc-data`, which is not part of the served bundle, so it is
// fetched opportunistically. When it is missing the vanilla-dependent checks report `unsupported`
// rather than a verdict, which is the same contract the CLI keeps.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { createBlockGeometry } from './blockGeometry.js';
import { TextureManager } from './textures.js';
import {
  danglingReferences,
  registry as buildRegistry,
  resourceReport,
  searchResources,
} from './resourceRegistry.js';
import { RESOURCE_CHECKS, ResourceShowcase, buildVanillaIndex } from './resourceShowcase.js';
import { inspectorSources } from './mods/inspectorScope.js';
import { fillInspectorSource } from './mods/inspectorSelector.js';
import { ResourceInspectionWorld, ResourceBehaviorShowcase } from './resourceBehaviorShowcase.js';

const $ = (id) => document.getElementById(id);

// Two pages share this script: item-debug.html and block-debug.html. Each one's <body> carries its kind in
// `data-kind`, which locks the list to that kind, so the Item Inspector cannot show blocks or the reverse.
// The query string is read once, at load, for `?resource=<key>` (the one the player was examining) and
// `?mod=<id>`.
const PAGE_KIND = document.body.dataset.kind || null;
const PAGE_PARAMS = new URLSearchParams(location.search);
const PAGE_RESOURCE = PAGE_PARAMS.get('resource');
let selectedMod = fillInspectorSource($('content-source'), PAGE_PARAMS.get('mod'));

/** Keep the address bar in step with the selection, so a reload or a shared link reopens the same resource. */
function syncUrl(resourceKey = null) {
  const params = new URLSearchParams();
  if (resourceKey) params.set('resource', resourceKey);
  if (selectedMod) params.set('mod', selectedMod);
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

// --- scene ------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color('#233044');
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
camera.position.set(2.2, 1.8, 3.2);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('view').append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.35, 0);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x708099, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(3, 6, 4);
scene.add(sun);
const grid = new THREE.GridHelper(12, 12, 0x66758b, 0x435269);
scene.add(grid);

const events = [];
function log(message) {
  events.unshift(message);
  events.length = Math.min(24, events.length);
  $('events').textContent = events.join('\n');
}

let vanilla = null;
let showcase = null;
let registry = null;
let selected = null;
let preview = null;
let previewVersion = 0;
let behaviorRun = null;
let inspectionWorld = null;
let displayedRevision = -1;
let displayedDrops = -1;
let dropPreview = null;

function disposePreview(group) {
  group?.removeFromParent();
  group?.traverse(child => {
    child.geometry?.dispose();
    if (child.userData.ownsMaterial) {
      child.material.map?.dispose();
      child.material.dispose();
    }
  });
}

function stopShowcase({ restore = true } = {}) {
  renderer.clippingPlanes = [];
  behaviorRun?.stop();
  inspectionWorld?.dispose();
  behaviorRun = null;
  inspectionWorld = null;
  disposePreview(dropPreview);
  dropPreview = null;
  $('showcase-stop').disabled = true;
  $('showcase').disabled = !selected;
  $('showcase-status').textContent = 'Stopped — press Run showcase to start again.';
  $('showcase-telemetry').textContent = '';
  if (restore) {
    camera.position.set(2.2, 1.8, 3.2);
    controls.target.set(0, 0.35, 0);
    showPreview(selected).catch(error => { $('error').textContent = error.message; });
  }
}

function renderInspectionWorld() {
  if (!inspectionWorld || inspectionWorld.revision === displayedRevision) return;
  disposePreview(preview);
  preview = new THREE.Group();
  const geometries = inspectionWorld.mesh(textures);
  const materials = { opaqueGeo: textures.opaqueMaterial, lightGeo: textures.lightMaterial,
    transparentGeo: textures.transparentMaterial, waterGeo: textures.waterMaterial };
  for (const [key, material] of Object.entries(materials)) {
    if (!geometries[key]) continue;
    preview.add(new THREE.Mesh(geometries[key], material));
  }
  preview.position.set(-8.5, -2, -8.5);
  scene.add(preview);
  grid.visible = false;
  displayedRevision = inspectionWorld.revision;
}

function renderInspectionDrops() {
  if (!inspectionWorld || inspectionWorld.drops.length === displayedDrops) return;
  disposePreview(dropPreview);
  dropPreview = new THREE.Group();
  inspectionWorld.drops.forEach((drop, index) => {
    // Real registry icon / geometry, rather than generic coloured cubes.
    const entry = [...registry.entries.values()].find(e => drop.isBlock ? e.blockId === drop.id : e.id === drop.id);
    let mesh;
    if (drop.isBlock) {
      const geometry = createBlockGeometry(drop.id, textures);
      geometry.translate(-0.5, -0.5, -0.5);
      mesh = new THREE.Mesh(geometry, textures.opaqueMaterial);
    } else if (entry?.icon) {
      const map = new THREE.TextureLoader().load(entry.icon);
      map.colorSpace = THREE.SRGBColorSpace;
      map.magFilter = map.minFilter = THREE.NearestFilter;
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide }));
      mesh.userData.ownsMaterial = true;
    }
    if (mesh) {
      mesh.scale.setScalar(0.4);
      mesh.position.set((index - 1) * 0.55, 0.5, 0.15);
      dropPreview.add(mesh);
    }
  });
  scene.add(dropPreview);
  displayedDrops = inspectionWorld.drops.length;
}

function showBehaviorProgress() {
  if (!behaviorRun) return;
  const results = behaviorRun.results;
  const failures = results.filter(r => ['not observed', 'error'].includes(r.status)).length;
  const skipped = results.filter(r => r.status === 'unsupported').length;
  const passed = results.length - failures - skipped;
  $('showcase-status').textContent = behaviorRun.running
    ? `${behaviorRun.index + 1}/${behaviorRun.steps.length} · ${behaviorRun.current.label}`
    : `Finished: ${passed} passed, ${failures} failed, ${skipped} unsupported / visual-only.`;
  $('showcase-results').textContent = results.map(r => `${r.status === 'observed' ? '[ok]' : r.status === 'unsupported' ? '[--]' : '[!!]'} ${r.label}${r.detail ? ` — ${r.detail}` : ''}`).join('\n');
  $('showcase-stop').disabled = !behaviorRun.running;
  $('showcase').disabled = behaviorRun.running;
  if (inspectionWorld && [BLOCKS.FURNACE, BLOCKS.LIT_FURNACE].includes(selected?.blockId)) {
    const f = inspectionWorld.furnaceManager.getFurnace(8, 2, 8);
    const stack = s => s ? `${s.count} × ${s.id}` : 'empty';
    $('showcase-telemetry').textContent = f
      ? `Input: ${stack(f.input)}\nFuel: ${stack(f.fuel)}\nOutput: ${stack(f.output)}\nCooking: ${Math.round(f.cookTime / f.cookDuration * 100)}% · burn ${f.burnTime.toFixed(1)}s\nLit: ${f.lit ? 'yes' : 'no'}`
      : inspectionWorld.world.getVoxel(8, 2, 8) === BLOCKS.AIR
        ? `Furnace broken\nDrops: ${inspectionWorld.drops.map(d => `${d.count} × ${d.id}`).join(', ')}`
        : 'Shell inspection: carpet beside and below; stone platform underneath.';
  }
}

async function startShowcase() {
  if (!selected) return;
  stopShowcase({ restore: false });
  const entry = selected;
  const version = previewVersion;
  $('showcase').disabled = true;
  try {
    if (entry.blockId !== null && !texturesReady) await ensureTextures();
    if (entry !== selected || version !== previewVersion) return;
    showcase.run(entry);
    showChecks();
    displayedRevision = displayedDrops = -1;
    if (entry.blockId !== null) inspectionWorld = new ResourceInspectionWorld(entry.blockId, { scene });
    behaviorRun = new ResourceBehaviorShowcase({ entry, checks: showcase.results, session: inspectionWorld, textures,
      onStep(step) {
        // The support platform would otherwise block a camera below the block.
        // Clip only the supporting context from the rendered underside view;
        // ray assertions still inspect the complete world mesh and its culling.
        renderer.clippingPlanes = step.view?.id === 'bottom' && inspectionWorld
          ? [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.25)] : [];
        if (step.view) {
          const [x, y, z] = step.view.direction;
          controls.target.set(0, 0.5, 0);
          // Tiny offset avoids an up-vector singularity when looking straight down.
          camera.position.set(x * 4.5 + 0.02, y * 4.5 + 0.5, z * 4.5 + 0.02);
          camera.lookAt(controls.target);
        } else if (step.enter) {
          controls.target.set(0, 0.5, 0);
          camera.position.set(2.2, 2, 3.2);
          camera.lookAt(controls.target);
        }
      },
    });
    renderInspectionWorld();
    showBehaviorProgress();
    log(`Showcase started: ${entry.name}. Registry checks and six views${inspectionWorld && [BLOCKS.FURNACE, BLOCKS.LIT_FURNACE].includes(entry.blockId) ? '; real furnace simulation' : '; no specialized behavior simulation for this resource'}.`);
  } catch (error) {
    $('error').textContent = error.stack || error.message;
    stopShowcase();
  }
}

// A small automation hook for the same scenarios the visible button drives.
window.resourceInspector = {
  get run() { return behaviorRun; },
  get session() { return inspectionWorld; },
  get ready() { return !!selected && (selected.blockId === null || texturesReady); },
};

/** Load the pinned vanilla snapshot if the dev server exposes it; absence is not an error. */
async function loadVanilla() {
  const read = async (name) => {
    try {
      const response = await fetch(`/.cache/mc-data/${name}`);
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  };
  const items = await read('items.json');
  if (!items) {
    log('Vanilla cache not served; vanilla-dependent checks report unsupported.');
    return null;
  }
  const index = buildVanillaIndex({
    items,
    recipes: (await read('recipes.json')) ?? {},
    foods: (await read('foods.json')) ?? [],
    blocks: (await read('blocks.json')) ?? [],
  });
  log(`Vanilla cache loaded: ${items.length} items.`);
  return index;
}

// --- preview ----------------------------------------------------------------
const textures = new TextureManager();
let texturesReady = false;
let textureLoad = null;
async function ensureTextures() {
  textureLoad ||= textures.init().then(() => { texturesReady = true; });
  try { await textureLoad; } catch (error) { textureLoad = null; throw error; }
}

/**
 * Replace the preview with this resource's real appearance.
 *
 * A block renders through `createBlockGeometry`, the same function the hand and the world use, so a
 * missing texture or a broken shape shows up here rather than in game. An item renders as its icon
 * on a double-sided plane, which is how the dropped-item and hand renderers show it.
 */
async function showPreview(entry) {
  const version = ++previewVersion;
  if (preview) {
    disposePreview(preview);
    preview = null;
  }
  if (!entry) return;
  const group = new THREE.Group();

  if (entry.blockId !== null && BLOCK_DEFS[entry.blockId]) {
    if (!texturesReady) {
      try {
        await ensureTextures();
      } catch (error) {
        log(`Texture atlas failed: ${error.message}`);
      }
    }
    if (texturesReady) {
      const geometry = createBlockGeometry(entry.blockId, textures);
      geometry.translate(-0.5, -0.5, -0.5);
      if (BLOCK_DEFS[entry.blockId].shape === 'torch') geometry.translate(0, 0.5, 0);
      const material = BLOCK_DEFS[entry.blockId].light ? textures.lightMaterial : textures.opaqueMaterial;
      group.add(new THREE.Mesh(geometry, material));
    }
  } else if (entry.icon) {
    const texture = new THREE.TextureLoader().load(entry.icon);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, alphaTest: 0.05 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), material);
    mesh.userData.ownsMaterial = true;
    group.add(mesh);
  } else {
    group.add(new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      new THREE.MeshBasicMaterial({ color: 0x9333ea, wireframe: true }),
    ));
  }

  if (version !== previewVersion) { group.traverse(child => child.geometry?.dispose()); return; }
  preview = group;
  scene.add(group);
  grid.visible = entry.blockId !== null;
}

// --- facts panel ------------------------------------------------------------
function factsText(report) {
  if (!report) return '';
  const lines = [];
  lines.push(`key         ${report.key}`);
  lines.push(`kind        ${report.kind}${report.blockId !== null ? `  block ${report.blockId}` : ''}`);
  if (report.blockName) lines.push(`block name  ${report.blockName}`);
  if (report.blockAliases.length > 1) lines.push(`aliases     ${report.blockAliases.join(', ')}`);
  lines.push(`type        ${report.type ?? '-'}`);
  lines.push(`stack       declared ${report.stackSizeDeclared ?? '-'}  applied ${report.stackSizeApplied}`);
  if (report.durabilityMax !== null) lines.push(`durability  ${report.durabilityMax}`);
  if (report.tool) lines.push(`tool        ${report.tool.tool} / ${report.tool.tier ?? 'no tier'}`);
  if (report.enchantCategory) lines.push(`enchants    ${report.enchantCategory}`);
  if (report.food) lines.push(`food        ${report.food.hunger} hunger / ${report.food.saturation} saturation`);
  if (report.harvest) {
    lines.push(`hardness    ${report.harvest.hardness}  tool ${report.harvest.tool ?? '-'}`
      + `  tier ${report.harvest.tier ?? '-'}${report.harvest.requiresTool ? '  requires tool' : ''}`);
    lines.push(`drops       ${(report.harvest.drops ?? []).join(', ') || '(none)'}`);
  }
  const s = report.sources;
  lines.push(`from        craft ${s.crafting.length}  smelt ${s.smelting.length}  brew ${s.brewing.length}`
    + `  loot ${s.mobLoot.length}  block ${s.blockDrops.length}`);
  const u = report.usedAs;
  lines.push(`used as     ingredient ${u.craftingIngredient}  smelted ${u.smeltedInto}  brewed ${u.brewingIngredient}`);
  if (s.mobLoot.length) lines.push(`loot from   ${s.mobLoot.join(', ')}`);
  return lines.join('\n');
}

// --- checks -----------------------------------------------------------------
function showChecks() {
  if (!showcase || !showcase.results.length) return;
  const group = $('group').value;
  const results = group ? showcase.results.filter((r) => r.group === group) : showcase.results;
  const scored = results.filter((r) => r.status !== 'unsupported');
  const passed = scored.filter((r) => r.status === 'observed').length;
  const failed = scored.filter((r) => r.status === 'not observed').length;
  const errors = scored.filter((r) => r.status === 'error').length;
  const skipped = results.length - scored.length;

  const status = $('check-status');
  status.className = errors || failed ? 'fail' : 'pass';
  status.textContent = `${passed}/${scored.length} applicable checks passed`
    + (failed ? ` - ${failed} not observed` : '')
    + (errors ? ` - ${errors} errored` : '')
    + (skipped ? ` - ${skipped} unsupported` : '');

  $('checks').textContent = results.map((r) => {
    const icon = r.status === 'observed' ? '[ok] ' : r.status === 'unsupported' ? '[--] ' : r.status === 'error' ? '[!!] ' : '[ x] ';
    return icon + r.id.padEnd(22) + (r.detail ? ' ' + r.detail : '');
  }).join('\n');
}

function selectResource(entry) {
  stopShowcase({ restore: false });
  camera.position.set(2.2, 1.8, 3.2);
  controls.target.set(0, 0.35, 0);
  $('rerun').disabled = false;
  selected = entry;
  $('showcase').disabled = false;
  $('showcase-status').textContent = 'Idle — run checks and six views. Furnace adds smelting, fuel, collection and breaking scenarios.';
  $('showcase-results').textContent = '';
  $('error').textContent = '';
  try {
    const report = resourceReport(entry, registry);
    $('facts').textContent = factsText(report);
    $('badge').textContent = `${report.name} · ${report.kind}${report.blockId !== null ? ` · block ${report.blockId}` : ''}`;
    $('wiki-open').onclick = () => {
      const page = report.name.replace(/ /g, '_');
      window.open(`https://minecraft.wiki/w/${encodeURIComponent(page)}`, '_blank', 'noopener');
    };
    showcase.run(entry);
    showChecks();
    showPreview(entry).catch((error) => { $('error').textContent = error.stack || error.message; });
    syncUrl(entry.key);
  } catch (error) {
    $('error').textContent = error.stack || error.message;
  }
}

function fillList() {
  const rows = searchResources($('search').value, { kind: PAGE_KIND, limit: 400, reg: registry });
  const select = $('resource');
  select.replaceChildren(...rows.map((entry) => {
    const option = document.createElement('option');
    option.value = entry.key;
    option.textContent = `${entry.name}  (${entry.kind === 'item' ? entry.id : `block ${entry.blockId}`})`;
    return option;
  }));
  $('count').textContent = `· ${rows.length}`;
  const wanted = PAGE_RESOURCE;
  const match = rows.find((entry) => entry.key === wanted) ?? rows.find((entry) => entry.key === selected?.key) ?? rows[0];
  if (match) {
    select.value = match.key;
    selectResource(match);
  } else {
    stopShowcase({ restore: false });
    selected = null;
    showcase.results = [];
    $('facts').textContent = '';
    $('checks').textContent = '';
    $('check-status').textContent = 'No checks to run';
    $('badge').textContent = 'No resources in this scope';
    $('rerun').disabled = true;
    $('showcase').disabled = true;
    showPreview(null);
    syncUrl();
  }
}

function showDangling() {
  const problems = danglingReferences(registry);
  const byId = new Map();
  for (const p of problems) {
    const key = String(p.id);
    if (!byId.has(key)) byId.set(key, { detail: p.detail, from: [] });
    byId.get(key).from.push(p.from);
  }
  $('dangling').textContent = problems.length === 0
    ? 'None - every id named by game data resolves.'
    : [...byId].map(([id, info]) => `${id}\n   ${info.detail}\n   ${info.from.length} reference(s): ${info.from.slice(0, 3).join(', ')}${info.from.length > 3 ? ' …' : ''}`).join('\n');
}

// --- boot -------------------------------------------------------------------
async function boot() {
  registry = buildRegistry({fresh: true, ...inspectorSources({modId: selectedMod})});
  vanilla = await loadVanilla();
  showcase = new ResourceShowcase({
    registry,
    vanilla,
    assetExists: (icon) => Boolean(icon),
    mobTypes: null,
    durabilityHas: null,
  });
  // The group list comes from the check list itself, so a new group cannot be forgotten here.
  $('group').replaceChildren(
    new Option('All groups', ''),
    ...[...new Set(RESOURCE_CHECKS.map((check) => check.group))].map((group) => new Option(group, group)),
  );
  log(`Registry: ${registry.stats.items} items, ${registry.stats.blocksOnly} blocks with no item form, ${registry.stats.recipes} recipes.`);
  fillList();
  showDangling();
  $('search').oninput = fillList;
  $('content-source').onchange = () => {
    selectedMod = $('content-source').value || null;
    registry = buildRegistry({fresh: true, ...inspectorSources({modId: selectedMod})});
    showcase.registry = registry;
    selected = null;
    fillList(); showDangling();
  };
  $('resource').onchange = () => {
    const entry = registry.entries.get($('resource').value);
    if (entry) selectResource(entry);
  };
  $('rerun').onclick = () => { if (selected) selectResource(selected); };
  $('showcase').onclick = startShowcase;
  $('showcase-stop').onclick = () => stopShowcase();
  $('group').onchange = showChecks;
}

const resize = new ResizeObserver(() => {
  const w = $('view').clientWidth;
  const h = $('view').clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});
resize.observe($('view'));

let lastFrame = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (behaviorRun?.running) {
    behaviorRun.update(dt);
    renderInspectionWorld();
    renderInspectionDrops();
    showBehaviorProgress();
  }
  if (texturesReady) textures.update(dt);
  controls.update();
  renderer.render(scene, camera);
});

boot().catch((error) => { $('error').textContent = error.stack || error.message; });
