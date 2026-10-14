// Visual parity: how a block or item looks in the world, in the hand, on the ground and in the inventory, checked
// through the game's own renderers' inputs. The plan's visual gates (docs/block-item-audit-plan.md: V01 inventory,
// V02 held, V03 dropped, V04 placed) as automated cases; a look by eye is still the Inspector's views.
//
//   V-SHAPE    a block the wiki says light passes through ("transparent: Yes") must not be drawn as a full cube that
//              hides its neighbours' faces -- the cactus, cauldron and cake were, leaving holes beside them. Built
//              from `createBlockGeometry` (what the mesher draws) and `occludesWholeFace` (what it culls by).
//   V-TEXTURE  every texture a block's definition names exists (V04: no missing-texture faces).
//   V-ICON     an item's inventory icon exists (V01: no fallback sprite).
//   V-HELD     a block drawn as a crossed-plant in the world (a flower, a sapling) is held and dropped as a flat
//              sprite, not a cube (V02/V03; the plan's first batch, A001, was flowers held as cubes).
//
// File existence is injected (`assetExists`), so the browser Inspector can answer from what it has loaded and Node
// from the disk.
import { BLOCK_DEFS, ITEMS } from './blocks.js';
import { createBlockGeometry } from './blockGeometry.js';
import { occludesWholeFace } from './blockOcclusion.js';
import { wikiBlockFacts } from './resourceWikiAudit.js';
import * as THREE from 'three';
import { HeldItemRenderer } from './heldItem.js';
import { ItemVisuals } from './itemVisuals.js';

const WIKI = 'https://minecraft.wiki/w/';
const UNIT_UVS = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }), getUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };

/**
 * Light-transparent blocks that really are drawn as full opaque cubes, with the page's own words. Glowstone: "being
 * a transparent block, signals can pass from one block to another diagonally" -- transparent for redstone and
 * spawning, a full cube to look at.
 */
/**
 * Full cubes that let light through, by family: glass and stained glass, copper grates, the beacon, powder snow and
 * glowstone are whole blocks on their pages; air and the structure void are technical. Any OTHER block the wiki calls
 * transparent and this game draws as a full cube is a shape this game has not modelled (a ladder, a lantern).
 */
export const SEE_THROUGH_FULL_CUBES = /(Glass|Grate)$|^(Beacon|Powder Snow|Glowstone|Air|Cave Air|Void Air|Structure Void|Moving Piston)$/;

export const FULL_CUBE_DESPITE_TRANSPARENT = {
  Glowstone: 'Glowstone: "being a transparent block, signals can pass from one block to another diagonally" -- transparent for redstone, drawn as a full cube',
};

function verdict(id, label, expected, actual, ok, { source = null, note = null } = {}) {
  return { id, label, status: ok === null ? 'NA' : ok ? 'PASS' : 'FAIL', expected: String(expected), actual: String(actual), source, note };
}

/** What the mesher draws for a block: 'cube' (a full unit box), 'cross' (a crossed plant), or 'model'. */
export function drawnShape(blockId) {
  let geo;
  try { geo = createBlockGeometry(blockId, UNIT_UVS); } catch { return 'error'; }
  const count = geo.attributes.position.count;
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const full = b.min.x <= 0.001 && b.min.y <= 0.001 && b.min.z <= 0.001 && b.max.x >= 0.999 && b.max.y >= 0.999 && b.max.z >= 0.999;
  geo.dispose();
  if (count === 24 && full) return 'cube';
  if (count === 8 && BLOCK_DEFS[blockId]?.plant) return 'cross';
  return 'model';
}

/** The visual cases for one block id. */
export function blockVisualCases(blockId, { assetExists = null, heldShape = null, droppedShape = null } = {}) {
  const def = BLOCK_DEFS[blockId];
  if (!def?.name || def.internal || def.liquid) return [];
  const wiki = wikiBlockFacts(blockId);
  const source = wiki?.page ? WIKI + encodeURIComponent(wiki.page.replace(/ /g, '_')) : null;
  const out = [];
  const shape = drawnShape(blockId);
  {
    const transparent = wiki?.transparent;
    const exception = FULL_CUBE_DESPITE_TRANSPARENT[def.name];
    const hides = shape === 'cube' && occludesWholeFace(def);
    const fullCubeOk = SEE_THROUGH_FULL_CUBES.test(def.name);
    // Light passes through it: drawn as a full cube only if it is one of the see-through full cubes, and then never
    // hiding its neighbours (glowstone, a whole opaque cube, aside).
    const ok = transparent === 'yes' ? (exception ? null : shape !== 'cube' || (fullCubeOk && !hides)) : null;
    out.push(verdict('V-SHAPE', 'Drawn with its own shape, not as a full cube, when light passes through it',
      transparent ? `transparent: ${transparent}${fullCubeOk ? ' (a full cube on its page)' : ''}` : 'no wiki answer',
      hides ? 'full cube, hides neighbours' : shape, ok, { source, note: exception ?? null }));
  }
  if (shape === 'cross' && heldShape) {
    const held = heldShape(blockId);
    out.push(verdict('V-HELD', 'A crossed plant is held as a flat sprite', 'flat sprite', held, held === 'flat sprite', { source }));
  }
  if (shape === 'cross' && droppedShape) {
    const dropped = droppedShape(blockId);
    out.push(verdict('V-DROPPED', 'A crossed plant drops as a flat sprite', 'flat sprite', dropped, dropped === 'flat sprite', { source }));
  }
  if (assetExists) {
    const textures = Object.values(def.textures ?? {}).filter((t) => typeof t === 'string');
    const missing = textures.filter((t) => !assetExists(`/assets/blocks/${t}`) && !assetExists(`/assets/${t}`));
    out.push(verdict('V-TEXTURE', 'Every texture the block names exists', 'all present', missing.length ? `missing ${missing.join(', ')}` : 'all present',
      textures.length ? missing.length === 0 : null, { source }));
  }
  return out;
}

/** The visual cases for one item id (its icon) and, for a block item, its held and dropped forms. */
export function itemVisualCases(id, { assetExists = null, heldShape = null, droppedShape = null } = {}) {
  const def = ITEMS[id];
  if (!def) return [];
  const out = [];
  if (assetExists && def.icon) {
    out.push(verdict('V-ICON', 'Inventory icon exists', def.icon, assetExists(def.icon) ? 'present' : 'missing', assetExists(def.icon)));
  }
  // An item that is not a block is held and dropped as its flat icon (V02/V03) -- not as a block, which is what a
  // wrong null check made of every one of them.
  if (!def.isBlock && typeof def.blockId !== 'number') {
    if (heldShape) {
      const held = heldShape(id, false);
      out.push(verdict('V-HELD', 'An item is held as its flat icon', 'flat sprite', held, held === 'flat sprite'));
    }
    if (droppedShape) {
      const dropped = droppedShape(id, false);
      out.push(verdict('V-DROPPED', 'An item drops as its flat icon', 'flat sprite', dropped, dropped === 'flat sprite'));
    }
  }
  return out;
}

let probes = null;
/**
 * The held and dropped forms, read from the real renderers (HeldItemRenderer, ItemVisuals) with plain materials: a
 * single flat plane is a 'flat sprite', a box or model is 'cube'.
 */
export function formProbes() {
  if (probes) return probes;
  const material = () => new THREE.MeshLambertMaterial();
  const textures = { ...UNIT_UVS, opaqueMaterial: material(), transparentMaterial: material(), lightMaterial: material(), waterMaterial: material() };
  const held = new HeldItemRenderer(new THREE.PerspectiveCamera(), textures);
  const visuals = new ItemVisuals(textures);
  const shapeOf = (object) => {
    const geos = [];
    object?.traverse?.((o) => { if (o.geometry) geos.push(o.geometry); });
    if (!geos.length && object?.geometry) geos.push(object.geometry);
    return geos.length && geos.every((g) => g.type === 'PlaneGeometry') ? 'flat sprite' : 'cube';
  };
  probes = {
    heldShape: (id, isBlock = true) => { held.setItem({ id, isBlock, count: 1 }); return shapeOf(held.currentMesh); },
    droppedShape: (id, isBlock = true) => shapeOf(visuals.create(id, isBlock, 0.6)),
  };
  return probes;
}

/** Every block and item. */
export function visualAudit(options = {}) {
  const rows = [];
  for (const [id, def] of Object.entries(BLOCK_DEFS)) {
    for (const c of blockVisualCases(Number(id), options)) rows.push({ subject: def.name, blockId: Number(id), ...c });
  }
  for (const id of Object.keys(ITEMS)) for (const c of itemVisualCases(id, options)) rows.push({ subject: id, ...c });
  const totals = rows.reduce((t, r) => ({ ...t, [r.status]: (t[r.status] ?? 0) + 1 }), { PASS: 0, FAIL: 0, NA: 0 });
  const byCase = {};
  for (const r of rows) { byCase[r.id] ??= { PASS: 0, FAIL: 0, NA: 0 }; byCase[r.id][r.status]++; }
  return { rows, totals, byCase, failures: rows.filter((r) => r.status === 'FAIL') };
}
