// Decorating a room the player is in: where on its walls things go.
//
// The perception scan (agentPerception.js) finds the room and lists every wall face at eye level. This turns
// that list into placements, so a plan can say "hang paintings in current_room" and get a sensible result
// without the model computing coordinates: paintings centred in evenly spaced slots along each wall, never over
// a window, a door or furniture, sized to the room, and each one a different canvas where the wall allows.
import { PAINTING_BY_ID, chooseVariant } from './paintings.js';
import { isDecoratableWall } from './agentPerception.js';

const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' };
const SIZE_CAPS = { small: [2, 1], medium: [2, 2], large: [4, 4], any: [4, 4] };

/** Contiguous runs of free eye-level wall, per wall side. */
export function wallRuns(room, sides = null) {
  const wanted = sides?.length ? new Set(sides) : null;
  const groups = new Map();
  for (const f of room.faces || []) {
    if (!f.decoratable || f.height !== 1) continue;
    if (wanted && !wanted.has(f.side)) continue;
    const along = f.side === 'north' || f.side === 'south' ? 'x' : 'z';
    const plane = along === 'x' ? f.wall.z : f.wall.x;
    const key = `${f.side}|${plane}|${f.y}`;
    if (!groups.has(key)) groups.set(key, { side: f.side, along, plane, y: f.y, faces: [] });
    groups.get(key).faces.push(f);
  }
  const runs = [];
  for (const group of groups.values()) {
    const sorted = group.faces.sort((a, b) => a[group.along] - b[group.along]);
    let current = [];
    for (const f of sorted) {
      if (current.length && f[group.along] !== current.at(-1)[group.along] + 1) {
        runs.push({ ...group, faces: current });
        current = [];
      }
      current.push(f);
    }
    if (current.length) runs.push({ ...group, faces: current });
  }
  return runs.sort((a, b) => b.faces.length - a.faces.length);
}

/** Split `total` across runs by length, at most one painting per two blocks of wall. */
function allocate(runs, total) {
  const length = runs.reduce((s, r) => s + r.faces.length, 0);
  if (!length) return runs.map(() => 0);
  const raw = runs.map(r => total * r.faces.length / length);
  const counts = raw.map((n, i) => Math.min(Math.floor(n), Math.ceil(runs[i].faces.length / 2)));
  let left = total - counts.reduce((s, n) => s + n, 0);
  const order = raw.map((n, i) => [n - Math.floor(n), i]).sort((a, b) => b[0] - a[0]);
  for (let pass = 0; left > 0 && pass < 4; pass++) {
    for (const [, i] of order) {
      if (left <= 0) break;
      if (counts[i] < Math.ceil(runs[i].faces.length / 2)) { counts[i]++; left--; }
    }
  }
  return counts;
}

/** How many paintings a room's walls take when the player does not say. */
export function defaultPaintingCount(runs) {
  const length = runs.reduce((s, r) => s + r.faces.length, 0);
  return Math.max(runs.length ? 1 : 0, Math.min(12, Math.round(length / 4)));
}

/**
 * Hang paintings on a room's walls.
 *
 * @param {import('./paintings.js').PaintingManager} manager
 * @param {object} room   an `analyzeEnclosure` result
 * @param {{sides?:string[], count?:number, size?:'small'|'medium'|'large'|'any', variants?:string[], random?:()=>number}} [options]
 * @returns {{placed:object[], skipped:number, runs:number}}
 */
export function hangPaintingsInRoom(manager, room, { sides = null, count = null, size = 'any', variants = [], random = Math.random } = {}) {
  const runs = wallRuns(room, sides);
  const total = Math.max(0, Math.min(32, count ?? defaultPaintingCount(runs)));
  const counts = allocate(runs, total);
  const [capW, capH] = SIZE_CAPS[size] || SIZE_CAPS.any;
  // Leave a block of wall above a painting in a tall room, but never refuse to hang one in a low room.
  const maxHeight = Math.max(1, Math.min(capH, (room.ceilingHeight || 3) - 1));
  const avoid = new Set((manager.paintingsIn?.(room.bounds) || []).map(p => p.variantId));
  const requested = (variants || []).filter(id => PAINTING_BY_ID[id]);
  const placed = [];
  let skipped = 0;
  // Vanilla lets a painting hang on glass. A decorator should not: a wall surface counts only when it is a real
  // wall, with no window, door or furniture behind any part of the canvas.
  const world = manager.world;
  const supportOk = (anchor, facing, w, h) => {
    const n = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[facing];
    // The counter-clockwise side, which is where even widths grow (paintings.js).
    const side = { north: [-1, 0], west: [0, 1], south: [1, 0], east: [0, -1] }[facing];
    for (let j = -Math.floor((h - 1) / 2); j <= Math.floor(h / 2); j++) {
      for (let i = -Math.floor((w - 1) / 2); i <= Math.floor(w / 2); i++) {
        const x = anchor.x + side[0] * i - n[0], z = anchor.z + side[1] * i - n[1];
        if (!isDecoratableWall(world.getVoxel(x, anchor.y + j, z))) return false;
      }
    }
    return true;
  };

  runs.forEach((run, r) => {
    const k = counts[r];
    if (!k) return;
    const L = run.faces.length;
    const slot = L / k;
    const maxWidth = Math.max(1, Math.min(capW, slot >= 3 ? Math.floor(slot) - 1 : Math.floor(slot)));
    const facing = OPPOSITE[run.side];
    for (let i = 0; i < k; i++) {
      const centre = Math.min(L - 1, Math.floor((i + 0.5) * slot));
      let best = null;
      for (const offset of [0, -1, 1]) {
        const face = run.faces[centre + offset];
        if (!face) continue;
        const anchor = { x: face.x, y: face.y, z: face.z };
        const options = { random, maxWidth, maxHeight, avoid, occupied: key => manager.isOccupied(key) };
        let variant = null;
        if (requested.length) {
          const wantedId = requested[placed.length % requested.length];
          const fixed = chooseVariant(world, anchor, facing, { ...options, variant: wantedId });
          if (fixed && supportOk(anchor, facing, fixed.width, fixed.height)) variant = fixed;
        }
        if (!variant) {
          // Try the largest canvas first and step down until one sits on plain wall.
          for (let h = maxHeight; h >= 1 && !variant; h--) {
            for (let w = maxWidth; w >= 1 && !variant; w--) {
              const pick = chooseVariant(world, anchor, facing, { ...options, maxWidth: w, maxHeight: h });
              if (pick && supportOk(anchor, facing, pick.width, pick.height)) variant = pick;
            }
          }
        }
        if (variant && (!best || variant.width * variant.height > best.variant.width * best.variant.height)) best = { anchor, variant };
      }
      if (!best) { skipped++; continue; }
      const painting = manager.place(best.anchor, facing, { variant: best.variant.id, silent: placed.length > 0 });
      if (painting) {
        placed.push(painting);
        avoid.add(painting.variantId);
      } else {
        skipped++;
      }
    }
  });
  return { placed, skipped, runs: runs.length, target: total };
}
