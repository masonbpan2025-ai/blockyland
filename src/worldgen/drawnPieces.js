// Piece structures assembled from the wiki's drawings (the Nether fortress, the End city): each drawing is a piece,
// its doorways are found in the drawing itself, and pieces join doorway to doorway.
//
// A doorway is a run of the drawing's outer edge, at least one block wide, that is open for two blocks above a solid
// floor. Placing a piece turns it so the doorway chosen as its entrance faces back the way the path came, and sets
// it so that doorway meets the exit it continues from.

import { cellsOf } from './blueprintStructure.js';
import { BlockBox } from './geometry.js';

const SIDES = ['north', 'east', 'south', 'west'];
const STEP = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' };

/** The doorways of a drawing: `[{ side, at, y, width }]` with `at` the doorway's middle along its side. */
export function findOpenings(data, cells = cellsOf(data), { minWidth = 1, maxWidth = 7 } = {}) {
  const [sx, sy, sz] = data.size;
  const filled = new Set(cells.filter((c) => c.name !== 'air').map((c) => `${c.x},${c.y},${c.z}`));
  const has = (x, y, z) => filled.has(`${x},${y},${z}`);
  const out = [];
  for (const side of SIDES) {
    const length = side === 'north' || side === 'south' ? sx : sz;
    const pos = (i) => (side === 'north' ? [i, 0] : side === 'south' ? [i, sz - 1] : side === 'west' ? [0, i] : [sx - 1, i]);
    const inward = { north: [0, 1], south: [0, -1], west: [1, 0], east: [-1, 0] }[side];
    const taken = new Set();
    for (let y = 1; y < sy - 1; y++) {
      let run = [];
      const flush = () => {
        if (run.length >= minWidth && run.length <= maxWidth && !run.some((i) => taken.has(i))) {
          run.forEach((i) => taken.add(i));
          out.push({ side, at: (run[0] + run[run.length - 1]) / 2, y, width: run.length });
        }
        run = [];
      };
      for (let i = 0; i <= length; i++) {
        if (i === length) { flush(); break; }
        const [x, z] = pos(i);
        const open = !has(x, y, z) && !has(x, y + 1, z);
        const floor = has(x, y - 1, z) || has(x + inward[0], y - 1, z + inward[1]);
        if (open && floor) run.push(i); else flush();
      }
    }
  }
  return out;
}

/** Turn a drawing `rotation` quarter turns clockwise: a cell's new position, and a side's new name. */
export function rotateCell(x, z, size, rotation) {
  const [sx, , sz] = size;
  switch (((rotation % 4) + 4) % 4) {
    case 0: return [x, z];
    case 1: return [sz - 1 - z, x];
    case 2: return [sx - 1 - x, sz - 1 - z];
    default: return [z, sx - 1 - x];
  }
}
export const rotateSide = (side, rotation) => SIDES[(SIDES.indexOf(side) + rotation) % 4];
const FACINGS = ['north', 'east', 'south', 'west'];
export const rotateFacing = (facing, rotation) => (FACINGS.includes(facing) ? FACINGS[(FACINGS.indexOf(facing) + rotation) % 4] : facing);

/**
 * A placed drawing: world cells and doorways for a given entrance doorway and the exit point it continues from
 * (`{ x, y, z, dir }`: the first block outside the exit, and the direction leaving it). Returns null if `entrance`
 * cannot face back along `dir`.
 */
export function placeDrawing(drawing, entranceIndex, exit) {
  const { data, cells, openings } = drawing;
  const entrance = openings[entranceIndex];
  // The entrance must face back toward where the path came from.
  const want = OPPOSITE[exit.dir];
  let rotation = 0;
  while (rotateSide(entrance.side, rotation) !== want) rotation++;
  const [rsx, rsz] = rotation % 2 ? [data.size[2], data.size[0]] : [data.size[0], data.size[2]];
  // The entrance doorway's middle, in the drawing then turned.
  const edge = (o) => {
    const [sx, , sz] = data.size;
    const a = Math.round(o.at);
    return o.side === 'north' ? [a, 0] : o.side === 'south' ? [a, sz - 1] : o.side === 'west' ? [0, a] : [sx - 1, a];
  };
  const [ex, ez] = rotateCell(...edge(entrance), data.size, rotation);
  // The entrance edge block sits on the exit point.
  const ox = exit.x - ex; const oz = exit.z - ez; const oy = exit.y - entrance.y;
  const placed = cells.map((c) => {
    const [x, z] = rotateCell(c.x, c.z, data.size, rotation);
    const props = c.props?.facing ? { ...c.props, facing: rotateFacing(c.props.facing, rotation) } : c.props;
    return { ...c, x: x + ox, y: c.y + oy, z: z + oz, props };
  });
  const exits = openings.map((o, i) => ({ o, i })).filter(({ i }) => i !== entranceIndex).map(({ o }) => {
    const side = rotateSide(o.side, rotation);
    const [x, z] = rotateCell(...edge(o), data.size, rotation);
    const [dx, dz] = STEP[side];
    return { x: x + ox + dx, y: o.y + oy, z: z + oz + dz, dir: side, width: o.width };
  });
  const box = new BlockBox(ox, oy, oz, ox + rsx - 1, oy + data.size[1] - 1, oz + rsz - 1);
  return { cells: placed, exits, box, rotation };
}

/** Prepare a drawing once: its cells and doorways. */
export function drawingPiece(data, edit = (c) => c, openingOptions = {}) {
  const cells = cellsOf(data).map(edit).filter(Boolean);
  return { data, cells, openings: findOpenings(data, cells, openingOptions) };
}
