// The nine ruined portal designs the wiki does not draw (portal_4..10, giant_portal_2 and giant_portal_3).
//
// For each, the wiki's Ruined Portal page gives a one-line description and the /Structure page a materials table. Each
// design here is built to that description with EXACTLY that table's counts (tests/structureRuinedPortal.test.js
// checks every one), on the same frame as the drawn designs: y 0 is below the ground, y 1 is the ground layer (the
// drawings' layer 1), the portal stands from y 2. The shapes are ours; the counts are the wiki's.

import { cellsOf } from '../blueprintStructure.js';
import { BLUEPRINTS } from './blueprints/ruined_portal.js';

/** The materials tables, from the Ruined Portal page's "Consists of" column (Overworld). */
export const PORTAL_MATERIALS = {
  giant_portal_1: { netherrack: 263, stone_bricks: 63, stone_brick_slab: 38, obsidian: 31, stone_brick_stairs: 20, iron_bars: 18, lava: 11, chiseled_stone_bricks: 4, gold_block: 2, chest: 1 },
  giant_portal_2: { netherrack: 237, stone_bricks: 55, stone_brick_slab: 30, obsidian: 29, iron_bars: 22, lava: 19, stone_brick_stairs: 18, chiseled_stone_bricks: 6, gold_block: 2, chest: 1 },
  giant_portal_3: { netherrack: 324, stone_bricks: 51, stone_brick_slab: 40, lava: 33, obsidian: 25, iron_bars: 22, gold_block: 6, chiseled_stone_bricks: 6, stone_brick_stairs: 6, chest: 1 },
  portal_1: { netherrack: 55, obsidian: 11, stone_slab: 10, stone_bricks: 9, stone: 7, stone_brick_stairs: 6, chiseled_stone_bricks: 3, gold_block: 2, chest: 1, cracked_stone_bricks: 1, stone_brick_slab: 1 },
  portal_2: { netherrack: 115, lava: 26, stone_bricks: 19, stone_brick_slab: 14, obsidian: 11, smooth_stone_slab: 10, stone_brick_stairs: 4, gold_block: 2, iron_bars: 2, chest: 1, chiseled_stone_bricks: 1, mossy_stone_bricks: 1 },
  portal_3: { netherrack: 132, stone_bricks: 36, stone_brick_slab: 16, obsidian: 11, lava: 2, chest: 1 },
  portal_4: { netherrack: 130, stone_bricks: 36, stone_brick_slab: 16, obsidian: 11, lava: 3, gold_block: 1, chest: 1 },
  portal_5: { netherrack: 145, stone_bricks: 22, obsidian: 15, stone_brick_slab: 12, stone: 6, stone_slab: 5, gold_block: 3, mossy_stone_bricks: 2, chest: 1, cracked_stone_bricks: 1, lava: 1, stone_brick_stairs: 1 },
  portal_6: { netherrack: 41, obsidian: 16, stone_brick_slab: 4, stone_brick_stairs: 2, gold_block: 1, chest: 1 },
  portal_7: { netherrack: 92, lava: 21, obsidian: 12, stone_brick_slab: 3, gold_block: 2, chest: 1, stone_bricks: 1, stone_brick_stairs: 1 },
  portal_8: { netherrack: 144, lava: 26, obsidian: 17, stone_bricks: 14, stone_brick_stairs: 6, stone_brick_wall: 4, gold_block: 3, chiseled_stone_bricks: 2, chest: 1, stone_brick_slab: 1 },
  portal_9: { netherrack: 63, obsidian: 12, stone_brick_stairs: 11, gold_block: 2, chest: 1, magma_block: 1, stone_brick_slab: 1 },
  portal_10: { netherrack: 123, lava: 19, obsidian: 13, stone_bricks: 13, chiseled_stone_bricks: 3, iron_bars: 3, stone_brick_stairs: 3, gold_block: 2, chest: 1 }
};

/** A small builder: cells keyed by position; `place` fills the first free candidates and fails loudly if short. */
class Design {
  constructor() { this.cells = new Map(); }
  key(x, y, z) { return `${x},${y},${z}`; }
  has(x, y, z) { return this.cells.has(this.key(x, y, z)); }
  put(x, y, z, name, props = null) {
    if (this.has(x, y, z)) return false;
    this.cells.set(this.key(x, y, z), { x, y, z, name, props });
    return true;
  }
  place(name, n, candidates, props = null) {
    let left = n;
    for (const [x, y, z, p] of candidates) {
      if (left === 0) break;
      if (this.put(x, y, z, name, p ?? (typeof props === 'function' ? props(x, y, z) : props))) left--;
    }
    if (left) throw new Error(`ruined portal design: ${left} ${name} had nowhere to go`);
  }
  /** Shift so every coordinate is >= 0 (keeping y), and report the size. */
  done() {
    const all = [...this.cells.values()];
    const minX = Math.min(...all.map((c) => c.x)); const minZ = Math.min(...all.map((c) => c.z));
    const cells = all.map((c) => ({ ...c, x: c.x - minX, z: c.z - minZ }));
    const size = [Math.max(...cells.map((c) => c.x)) + 1, Math.max(...cells.map((c) => c.y)) + 1, Math.max(...cells.map((c) => c.z)) + 1];
    return { cells, size };
  }
}

/** Every (x, z) within `r` of (cx, cz) at height y, nearest first (ties in a fixed order). */
function disc(y, cx, cz, r) {
  const out = [];
  for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
      const d = Math.hypot(x - cx, z - cz);
      if (d <= r) out.push([x, y, z, null, d]);
    }
  }
  return out.sort((a, b) => a[4] - b[4] || a[0] - b[0] || a[2] - b[2]);
}
const discs = (ys, cx, cz, r) => ys.flatMap((y) => disc(y, cx, cz, r));

/** A standing frame's cells (x along the frame, y up) in order: bottom, left side, top, right side. */
function frameCells(x0, y0, z, w, h, corners) {
  const out = [];
  for (let x = x0 + (corners ? 0 : 1); x <= x0 + w - (corners ? 1 : 2); x++) out.push([x, y0, z]);
  for (let y = y0 + 1; y <= y0 + h - 2; y++) out.push([x0, y, z]);
  if (corners) out.push([x0, y0 + h - 1, z]);
  for (let x = x0 + 1; x <= x0 + w - 2; x++) out.push([x, y0 + h - 1, z]);
  if (corners) out.push([x0 + w - 1, y0 + h - 1, z]);
  for (let y = y0 + h - 2; y >= y0 + 1; y--) out.push([x0 + w - 1, y, z]);
  return out;
}
const stair = (facing) => ({ facing, half: 'bottom' });
const slab = { type: 'bottom' };

/**
 * The generic shape: a frame on a stone-brick footing, steps and slabs round it, pillars at its sides, a lava pool,
 * gold and a chest in front, and netherrack under and round all of it. `pose` changes where the frame goes.
 */
function portalDesign(m, { w, h, corners = false, pose = 'standing', fallen = 0, lavaAt = [-3, -3], radius }) {
  const d = new Design();
  const cz = 0; const x0 = 0; const cx = x0 + (w - 1) / 2;
  const base = pose === 'sunk' ? 1 : 2;
  const standing = pose === 'flat' ? 0 : m.obsidian - fallen;
  const frame = frameCells(x0, base, cz, w, h, corners);
  if (standing > frame.length) throw new Error('frame too small');
  // The frame, or what is left of it.
  if (pose === 'flat') {
    // Fallen backward: the whole frame lies on its back behind the footing, on the lava.
    d.place('obsidian', m.obsidian, frameCells(x0, 1 + 0, 0, w, h, corners).map(([x, y]) => [x, 1, cz + 1 + (y - 1)]));
  } else {
    d.place('obsidian', standing, frame);
    // The fallen part lies on the ground in front of the frame, as if it toppled forward.
    d.place('obsidian', fallen, [...Array(h + 4)].flatMap((_, i) => [[x0 + 1, 2, cz - 2 - i], [x0 + 2, 2, cz - 2 - i], [x0 + 3, 2, cz - 2 - i]]));
  }
  // Footing: stone bricks under the frame and pillars at its sides; chiseled caps; bars on the pillars.
  const under = [];
  for (let x = x0 - 1; x <= x0 + w; x++) for (const z of [cz, cz + 1, cz - 1]) under.push([x, 1, z]);
  const pillars = [];
  for (let y = 2; y < 2 + h; y++) for (const x of [x0 - 1, x0 + w]) pillars.push([x, y, cz]);
  const blocks = ['stone_bricks', 'stone', 'mossy_stone_bricks', 'cracked_stone_bricks'];
  for (const name of blocks) if (m[name]) d.place(name, m[name], [...under, ...pillars, ...disc(2, cx, cz, radius)]);
  const tops = [];
  for (const x of [x0 - 1, x0 + w]) for (let y = 2 + h; y >= 2; y--) if (!d.has(x, y, cz) && d.has(x, y - 1, cz)) tops.push([x, y, cz]);
  if (m.chiseled_stone_bricks) d.place('chiseled_stone_bricks', m.chiseled_stone_bricks, [...tops, ...disc(2, cx, cz + 1, radius)]);
  if (m.iron_bars) {
    const bars = [];
    for (const x of [x0 - 1, x0 + w, x0 - 3, x0 + w + 2]) for (let y = 2; y < 2 + h + 4; y++) bars.push([x, y, cz + (Math.abs(x - cx) > w / 2 + 1 ? 2 : 0)]);
    d.place('iron_bars', m.iron_bars, bars.filter(([x, y, z]) => y === 2 || d.has(x, y - 1, z) || bars.some(([bx, by, bz]) => bx === x && by === y - 1 && bz === z)));
  }
  if (m.stone_brick_wall) d.place('stone_brick_wall', m.stone_brick_wall, [[x0 - 2, 2, cz - 1], [x0 + w + 1, 2, cz - 1], [x0 - 2, 2, cz + 1], [x0 + w + 1, 2, cz + 1], ...disc(2, cx, cz, radius)]);
  // Steps up to the frame from the front and back, then slabs further out.
  const steps = [];
  for (let x = x0 - 1; x <= x0 + w; x++) { steps.push([x, 2, cz - 1, stair('south')]); steps.push([x, 2, cz + 1, stair('north')]); }
  for (const name of ['stone_brick_stairs']) if (m[name]) d.place(name, m[name], [...steps, ...disc(2, cx, cz, radius).map(([x, y, z]) => [x, y, z, stair(z < cz ? 'south' : 'north')])]);
  for (const name of ['stone_brick_slab', 'stone_slab', 'smooth_stone_slab']) if (m[name]) d.place(name, m[name], disc(2, cx, cz, radius).filter(([x, , z]) => d.has(x, 1, z) || true), slab);
  // Gold and the chest by the frame's foot.
  if (m.gold_block) d.place('gold_block', m.gold_block, [[x0 + 1, 2, cz - 1], [x0 + w - 2, 2, cz + 1], [x0 + 2, 2, cz + 1], ...disc(2, cx, cz, radius)]);
  d.place('chest', 1, [[x0 + w - 2, 2, cz - 1], ...disc(2, cx, cz - 1, radius)], { facing: 'north' });
  // The lava pool (on the ground layer) and the netherrack: the rest of the ground, then the layer under it.
  const [lx, lz] = lavaAt;
  if (m.lava) d.place('lava', m.lava, pose === 'flat' ? disc(1, cx, cz + 2 + h / 2, radius) : disc(1, cx + lx, cz + lz, radius));
  if (m.magma_block) d.place('magma_block', m.magma_block, disc(1, cx, cz, radius));
  d.place('netherrack', m.netherrack, [...disc(1, cx, cz, radius), ...disc(0, cx, cz, radius), ...disc(-1, cx, cz, radius)]);
  return d.done();
}

/** portal_4: the drawn portal_3 (trimmed to portal_3's own table) with one more lava and a gold block. */
function portal4() {
  const cells = cellsOf(BLUEPRINTS.ruined_portal_3).map((c) => ({ ...c }));
  // The drawing has one netherrack and two slabs more than portal_3's table: drop the top layer-3 slab ends and a
  // ground-layer corner.
  const drop = (name, n, pick) => { for (let i = 0; i < n; i++) { const c = pick(cells.filter((o) => o.name === name)); cells.splice(cells.indexOf(c), 1); } };
  drop('stone_brick_slab', 2, (list) => list.sort((a, b) => b.y - a.y || a.x - b.x)[0]);
  drop('netherrack', 1, (list) => list.sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z)[0]);
  const ground = cells.filter((c) => c.name === 'netherrack' && c.y === 1).sort((a, b) => a.x - b.x || a.z - b.z);
  ground[0].name = 'lava';
  ground[ground.length - 1].name = 'block_of_gold';
  return { cells: cells, size: BLUEPRINTS.ruined_portal_3.size };
}

export const DESIGNED_PORTALS = {
  portal_4: portal4,
  // "A small portal, where the top of the portal has fallen over."
  portal_5: () => portalDesign(PORTAL_MATERIALS.portal_5, { w: 4, h: 5, fallen: 7, radius: 6, lavaAt: [3, 3] }),
  // "A 5x5 portal, where the top center block is misplaced."
  portal_6: () => {
    const out = portalDesign(PORTAL_MATERIALS.portal_6, { w: 5, h: 5, corners: true, radius: 4 });
    // The full 5x5 ring is 16 obsidian; its top centre is knocked one block forward, out of the frame.
    const obsidian = out.cells.filter((c) => c.name === 'obsidian');
    const top = Math.max(...obsidian.map((c) => c.y));
    const row = obsidian.filter((c) => c.y === top).sort((a, b) => a.x - b.x);
    const centre = row[Math.floor(row.length / 2)];
    if (!out.cells.some((c) => c.x === centre.x && c.y === centre.y && c.z === centre.z - 1)) centre.z -= 1;
    return out;
  },
  // "An incomplete portal submerged in lava."
  portal_7: () => portalDesign(PORTAL_MATERIALS.portal_7, { w: 4, h: 5, corners: true, pose: 'sunk', radius: 6, lavaAt: [0, 0] }),
  // "An incomplete portal at the top of a staircase. The top has fallen into lava."
  portal_8: () => portalDesign(PORTAL_MATERIALS.portal_8, { w: 4, h: 5, corners: true, fallen: 5, radius: 7, lavaAt: [0, -4] }),
  // "A small incomplete portal."
  portal_9: () => portalDesign(PORTAL_MATERIALS.portal_9, { w: 4, h: 5, corners: true, radius: 5 }),
  // "An incomplete portal that has fallen backward into lava."
  portal_10: () => portalDesign(PORTAL_MATERIALS.portal_10, { w: 4, h: 5, corners: true, pose: 'flat', radius: 7 }),
  // "A large incomplete portal."
  giant_portal_2: () => portalDesign(PORTAL_MATERIALS.giant_portal_2, { w: 9, h: 12, corners: true, radius: 10, lavaAt: [-4, 3] }),
  // "A large incomplete portal, with the most gold blocks. Obsidian is randomly spread through the ruined portal."
  giant_portal_3: () => portalDesign(PORTAL_MATERIALS.giant_portal_3, { w: 9, h: 12, corners: true, fallen: 9, radius: 11, lavaAt: [4, 3] })
};
