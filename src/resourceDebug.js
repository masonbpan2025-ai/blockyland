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
import { BLOCK_DEFS } from './blocks.js';
import { createBlockGeometry } from './blockGeometry.js';
import { TextureManager } from './textures.js';
import {
  danglingReferences,
  registry as buildRegistry,
  resourceReport,
  searchResources,
} from './resourceRegistry.js';
import { RESOURCE_CHECKS, ResourceShowcase, buildVanillaIndex } from './resourceShowcase.js';

const $ = (id) => document.getElementById(id);

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

/**
 * Replace the preview with this resource's real appearance.
 *
 * A block renders through `createBlockGeometry`, the same function the hand and the world use, so a
 * missing texture or a broken shape shows up here rather than in game. An item renders as its icon
 * on a double-sided plane, which is how the dropped-item and hand renderers show it.
 */
async function showPreview(entry) {
  if (preview) {
    preview.removeFromParent();
    preview.traverse((child) => child.geometry?.dispose());
    preview = null;
  }
  if (!entry) return;
  const group = new THREE.Group();

  if (entry.blockId !== null && BLOCK_DEFS[entry.blockId]) {
    if (!texturesReady) {
      try {
        await textures.init();
        texturesReady = true;
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
    group.add(new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), material));
  } else {
    group.add(new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      new THREE.MeshBasicMaterial({ color: 0x9333ea, wireframe: true }),
    ));
  }

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
  selected = entry;
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
    history.replaceState(null, '', `?resource=${encodeURIComponent(entry.key)}`);
  } catch (error) {
    $('error').textContent = error.stack || error.message;
  }
}

function fillList() {
  const kind = $('kind').value || null;
  const rows = searchResources($('search').value, { kind, limit: 400, reg: registry });
  const select = $('resource');
  select.replaceChildren(...rows.map((entry) => {
    const option = document.createElement('option');
    option.value = entry.key;
    option.textContent = `${entry.name}  (${entry.kind === 'item' ? entry.id : `block ${entry.blockId}`})`;
    return option;
  }));
  $('count').textContent = `· ${rows.length}`;
  const wanted = new URLSearchParams(location.search).get('resource');
  const match = rows.find((entry) => entry.key === wanted) ?? rows.find((entry) => entry.key === selected?.key) ?? rows[0];
  if (match) {
    select.value = match.key;
    selectResource(match);
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
  registry = buildRegistry();
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
  $('kind').onchange = fillList;
  $('resource').onchange = () => {
    const entry = registry.entries.get($('resource').value);
    if (entry) selectResource(entry);
  };
  $('rerun').onclick = () => { if (selected) selectResource(selected); };
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

renderer.setAnimationLoop(() => {
  if (preview) preview.rotation.y += 0.006;
  controls.update();
  renderer.render(scene, camera);
});

boot().catch((error) => { $('error').textContent = error.stack || error.message; });
