// Village element builders: turn a catalogue entry (villageCatalogue.js) into a structure template.
//
// Every element is built in the same local frame: x across, y up (y 0 is the ground the village sits on), z away from
// the street. The element's connector -- the jigsaw that joins it to a street -- is at z 0 facing north. A building
// stands behind a short front yard (the path stub, plus whatever its description puts "out front"), and a pen or a
// pond goes in a back yard behind it.
//
// PROVENANCE: clean-room. The wiki describes each building in a sentence; this code builds a building that matches
// the sentence (its beds, workstation, materials and named features) inside its type's block list. It does not
// reproduce vanilla's templates block for block, and the tests say exactly that.

import { STYLES, CROP_BLOCK, GOURD_FRUIT } from './villageStyles.js';
import { VILLAGE_BLUEPRINTS } from './villageBlueprintData.js';

export const STREET_SLOT = 'village/street';
export const HOUSE_SLOT = 'village/house';
export const STREET_POOL = 'village/streets';
export const HOUSE_POOL = 'village/houses';

const AIR = 'air';

/** The job (profession) of a job-site building, from its template name; used to pick its chest's loot table. */
export function jobOf(name) {
  const match = name.match(/(armorer|butcher|cartographer|fisher|fletcher|mason|shepherd|tannery|temple|tool_smith|weapon_?smith|library)/);
  if (!match) return null;
  return { tool_smith: 'toolsmith', weapon_smith: 'weaponsmith', fisher: 'fisherman' }[match[1]] ?? match[1];
}

/** A chest's loot table: a job building's own table, otherwise the village type's house table. */
export function lootTableFor(type, name) {
  const job = jobOf(name);
  if (job && job !== 'library') return `minecraft:chests/village/village_${job}`;
  return `minecraft:chests/village/village_${type}_house`;
}

// ---------------------------------------------------------------------------------------------------------------
// The canvas: a template under construction.

function createCanvas(style) {
  const palette = [{ Name: 'minecraft:air' }];
  const index = new Map([['minecraft:air', 0]]);
  const blocks = [];
  const at = new Map();
  const entities = [];
  let size = [0, 0, 0];
  const full = (name) => (name.includes(':') ? name : 'minecraft:' + name);
  const material = (name, props = null) => {
    const key = full(name) + (props ? JSON.stringify(props) : '');
    if (!index.has(key)) {
      index.set(key, palette.length);
      palette.push(props ? { Name: full(name), Properties: { ...props } } : { Name: full(name) });
    }
    return index.get(key);
  };
  const inside = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < size[0] && y < size[1] && z < size[2];
  const push = (x, y, z, state, nbt = null) => {
    if (!inside(x, y, z)) throw new Error(`village element: block ${x},${y},${z} outside its declared size ${size.join('x')}`);
    const key = `${x},${y},${z}`;
    const entry = { pos: [x, y, z], state, ...(nbt ? { nbt } : {}) };
    if (at.has(key)) blocks[at.get(key)] = entry; else { at.set(key, blocks.length); blocks.push(entry); }
  };
  const c = {
    style,
    get size() { return size; },
    declare(sx, sy, sz) { size = [sx, sy, sz]; },
    inside,
    set(x, y, z, name, props = null) { if (name) push(x, y, z, material(name, props)); },
    /** Set only if the cell is still empty (so a later decoration never overwrites a wall). */
    put(x, y, z, name, props = null) { const cur = c.get(x, y, z); if (name && (!cur || cur === 'air')) c.set(x, y, z, name, props); },
    get(x, y, z) {
      const i = at.get(`${x},${y},${z}`);
      if (i === undefined) return null;
      return palette[blocks[i].state].Name.replace('minecraft:', '');
    },
    fill(x0, y0, z0, x1, y1, z1, name, props = null) {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) c.set(x, y, z, name, props);
    },
    chest(x, y, z, lootTable, facing = 'south') {
      push(x, y, z, material('chest', { facing }), { id: 'minecraft:chest', LootTable: lootTable });
    },
    slot(x, y, z, name, pool, front, finalState = style.path) {
      const orientation = front + '_up';
      const state = material('jigsaw', { orientation });
      const nbt = { name, pool, orientation, joint: 'aligned', target: 'minecraft:empty', final_state: 'minecraft:' + finalState };
      push(x, y, z, state, nbt);
    },
    entity(type, x, y, z, extra = {}) { entities.push({ pos: [x, y, z], nbt: { type, ...extra } }); },
    result() { return { size, palette, blocks, entities }; }
  };
  return c;
}

const bedColour = (style, entry, i) => {
  const wanted = Array.isArray(entry.bed) ? entry.bed[i % entry.bed.length] : entry.bed;
  return wanted ?? style.beds[(i + nameHash(entry.name)) % style.beds.length];
};

/** A path tile: the village's path block, with a grass tile now and then on grassy village types (the wiki: paths are
 *  "comprised of dirt paths and grass"). Deterministic per position. */
function pathTile(style, x, z) {
  if (!style.pathGrass) return style.path;
  const mix = style.pathMix ?? [style.pathGrass];
  const h = (x * 7 + z * 13) % 11;
  return h === 0 ? mix[0] : h === 5 && mix[1] ? mix[1] : style.path;
}

/** A small stable hash of an element name, so per-building choices (which crop, which colour) vary by building. */
function nameHash(name = '') {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

// ---------------------------------------------------------------------------------------------------------------
// Lamp posts (one design per type; snowy has three).

function placeLamp(c, design, x, z, lanterns = 2) {
  const s = c.style;
  if (design === 'plains') {
    // "four torches atop a tall fence post ... the top block is stripped oak wood"
    c.fill(x, 1, z, x, 3, z, 'oak_fence');
    c.set(x, 4, z, 'stripped_oak_wood');
    const sides = [[1, 0, 'east'], [-1, 0, 'west'], [0, 1, 'south'], [0, -1, 'north']];
    for (const [dx, dz, facing] of sides) if (c.inside(x + dx, 4, z + dz)) c.set(x + dx, 4, z + dz, 'wall_torch', { facing });
  } else if (design === 'desert') {
    // "a torch atop a pillar of terracotta and two cut sandstone"
    c.set(x, 1, z, 'cut_sandstone'); c.set(x, 2, z, 'cut_sandstone'); c.set(x, 3, z, 'terracotta'); c.set(x, 4, z, 'torch');
  } else if (design === 'savanna') {
    // "a torch atop a fence post"
    c.set(x, 1, z, 'acacia_fence'); c.set(x, 2, z, 'torch');
  } else if (design === 'snowy') {
    // "a tall lamppost made of spruce fences with (one, two, four) hanging lanterns"
    c.fill(x, 1, z, x, 4, z, 'spruce_fence');
    const arms = [[1, 0], [-1, 0], [0, 1], [0, -1]].slice(0, lanterns);
    for (const [dx, dz] of arms) {
      if (!c.inside(x + dx, 4, z + dz)) continue;
      c.set(x + dx, 4, z + dz, 'spruce_fence');
      c.set(x + dx, 3, z + dz, 'lantern', { hanging: 'true' });
    }
  } else if (design === 'taiga') {
    // "a torch atop a cobblestone wall"
    c.set(x, 1, z, 'cobblestone_wall'); c.set(x, 2, z, 'torch');
  }
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Buildings.

const ROOM_SIZES = [[5, 5], [7, 5], [7, 7], [9, 7], [9, 9]];
const CHIMNEY_CAP = { cobblestone: 'cobblestone_wall', granite: 'granite_wall', diorite: 'diorite_wall' };

function interiorItems(style, entry) {
  const items = [];
  for (const block of entry.job ?? []) items.push(block);
  for (const block of entry.items ?? []) items.push(block);
  if (entry.kind === 'house' && style.furnace && !items.includes('furnace') && entry.beds >= 2) items.push('furnace');
  // A table (a fence post with a pressure plate on top) -- the wiki's houses have "some tables, some chairs" -- in
  // the types whose block list has a pressure plate.
  if (entry.kind === 'house' && style.pressurePlate && entry.beds >= 2) items.push('table');
  return items;
}

/**
 * A building. Returns false when the room is too small for its furniture, so the caller can try the next size.
 */
function tryBuilding(c, entry, w, d) {
  const s = c.style;
  // A forge is three blocks wide and stands to one side of the path, so it needs a building at least 7 wide.
  if (entry.forge && w < 7) return false;
  const lift = entry.stilts ? 2 : 0;
  const twoStorey = entry.stories === 2;
  const h = twoStorey ? 6 : 3;
  const front = [...(entry.front ?? [])];
  const frontNeeds = front.length + (entry.flowerbeds ?? 0) + (entry.forge ? 3 : 0) + (entry.armorStands?.length ?? 0)
    + (entry.veranda ? 0 : 0);
  const yard = Math.max(entry.stilts ? 3 : 2, 1 + Math.ceil(frontNeeds / Math.max(1, w - 1)));
  const back = entry.pen ? 5 : entry.pond ? 4 : entry.farmland ? 3 : 0;
  const roofH = s.roof === 'flat' || entry.igloo ? 1 : Math.floor((w - 1) / 2) + 1;
  const towerH = entry.tower || entry.towers ? 4 : 0;
  const height = lift + h + roofH + towerH + 2;
  c.declare(w, height, yard + d + back);
  const z0 = yard;
  const doorX = Math.floor(w / 2);
  const wallMat = entry.wall ?? s.wall;
  const cornerMat = entry.corner ?? s.corner;
  const floorY = lift;
  const top = lift + h;

  // The approach: a path from the connector to the door, clear overhead; stairs up to a building on stilts.
  for (let z = 0; z < yard; z++) { c.set(doorX, 0, z, pathTile(s, doorX, z)); c.fill(doorX, 1, z, doorX, 3 + lift, z, AIR); }
  if (lift) {
    c.set(doorX, 1, yard - 2, s.stairs, { facing: 'south', half: 'bottom' });
    c.set(doorX, 2, yard - 1, s.stairs, { facing: 'south', half: 'bottom' });
  }

  if (entry.igloo) return igloo(c, entry, w, d, z0, doorX);

  // Floor (a foundation rim round the floor), or the platform of a stilt house on log legs.
  for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
    const rim = x === 0 || x === w - 1 || z === 0 || z === d - 1;
    c.set(x, floorY, z0 + z, rim ? (lift ? s.planks : s.foundation) : (entry.glazed && !rim ? entry.glazed : s.floor));
  }
  if (lift) for (const [x, z] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]]) c.fill(x, 0, z0 + z, x, lift - 1, z0 + z, s.log);

  // Walls, or the open frame of an outdoor workshop.
  c.fill(1, floorY + 1, z0 + 1, w - 2, top, z0 + d - 2, AIR);
  const windows = [];
  for (let y = floorY + 1; y <= top; y++) {
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
      if (!(x === 0 || x === w - 1 || z === 0 || z === d - 1)) continue;
      const corner = (x === 0 || x === w - 1) && (z === 0 || z === d - 1);
      if (entry.outdoor) { c.set(x, y, z0 + z, corner ? cornerMat : AIR); continue; }
      const level = (y - floorY - 1) % 3; // 0 floor, 1 window row, 2 top
      const window = level === 1 && !corner && (
        ((x === 0 || x === w - 1) && (z === 2 || z === d - 3)) || (z === d - 1 && x === doorX) || (z === 0 && (x === 1 || x === w - 2) && w >= 5)
      );
      if (window) { windows.push([x, y, z0 + z]); c.set(x, y, z0 + z, windowBlock(s, entry, windows.length)); }
      else c.set(x, y, z0 + z, corner ? cornerMat : wallMat);
    }
  }
  if (twoStorey) {
    c.fill(1, floorY + 3, z0 + 1, w - 2, floorY + 3, z0 + d - 2, s.planks);
    c.set(w - 2, floorY + 3, z0 + d - 2, AIR);
    if (s.ladder) c.fill(w - 2, floorY + 1, z0 + d - 2, w - 2, floorY + 3, z0 + d - 2, 'ladder', { facing: 'north' });
  }

  // Doors: the front door, plus any extra doors the description gives it.
  const doorCells = [doorX];
  if (!entry.outdoor) {
    door(c, doorX, floorY + 1, z0);
    for (let k = 1; k < (entry.doors ?? 1); k++) {
      const x = k % 2 ? doorX - 2 * Math.ceil(k / 2) : doorX + 2 * Math.ceil(k / 2);
      if (x <= 0 || x >= w - 1) continue;
      door(c, x, floorY + 1, z0);
      doorCells.push(x);
    }
  }
  if (entry.overDoor) c.set(doorX, floorY + 3, z0, entry.overDoor);
  if (entry.wool && s.wool.length) for (let x = 1; x < w - 1; x++) if (!doorCells.includes(x)) c.set(x, top, z0, s.wool[x % s.wool.length]);

  // Roof.
  roof(c, entry, w, d, z0, top);
  if (entry.vigas) for (const x of [1, w - 2]) c.set(x, top, z0 - 1, s.fence);
  if (entry.tower) {
    const tx = doorX; const tz = z0 + d - 2;
    const mat = entry.towerMaterial ?? wallMat;
    const roofTop = top + roofH;
    c.fill(tx, top + 1, tz, tx, roofTop + 2, tz, mat);
    c.set(tx, roofTop + 3, tz, s.fence);
  }
  if (entry.towers) {
    for (const [x, z] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]].slice(0, entry.towers)) c.fill(x, top + 1, z0 + z, x, top + 2, z0 + z, cornerMat);
  }

  // Furniture: the chimney first (back-left corner), then beds, then everything else against the walls.
  const free = [];
  for (let z = 1; z <= d - 2; z++) for (let x = 1; x <= w - 2; x++) {
    if (doorCells.includes(x) && z === 1) continue;
    free.push([x, z]);
  }
  const take = (x, z) => { const i = free.findIndex(([fx, fz]) => fx === x && fz === z); if (i < 0) return false; free.splice(i, 1); return true; };
  const y1 = floorY + 1;
  if (entry.chimney) {
    const { base, material, footing, fire } = entry.chimney;
    if (!take(1, d - 2)) return false;
    c.set(1, y1, z0 + d - 2, base);
    let from = y1 + 1;
    if (fire) { c.set(1, y1 + 1, z0 + d - 2, fire); from = y1 + 2; }
    c.fill(1, from, z0 + d - 2, 1, top + roofH, z0 + d - 2, material);
    // Capped with the matching wall block where one exists (granite, diorite, cobblestone).
    c.set(1, top + roofH + 1, z0 + d - 2, CHIMNEY_CAP[material] ?? s.stoneWall);
    if (footing && take(2, d - 2)) c.set(2, y1, z0 + d - 2, footing);
    if (entry.chimney.stairs && take(1, d - 3)) c.set(1, y1, z0 + d - 3, entry.chimney.stairs, { facing: 'south', half: 'bottom' });
  }
  for (let i = 0; i < (entry.beds ?? 0); i++) {
    const spot = free.find(([x, z]) => free.some(([fx, fz]) => fx === x && fz === z + 1));
    if (!spot) return false;
    const [x, z] = spot;
    take(x, z); take(x, z + 1);
    const colour = bedColour(s, entry, i);
    c.set(x, y1, z0 + z, `${colour}_bed`, { facing: 'south', part: 'foot' });
    c.set(x, y1, z0 + z + 1, `${colour}_bed_head`, { facing: 'south', part: 'head' });
    c.entity('villager', x, y1, z0 + z);
  }
  const items = interiorItems(s, entry);
  const byWall = () => free.sort((a, b) => wallScore(b, w, d) - wallScore(a, w, d));
  byWall();
  for (const block of items) {
    const cell = free.shift();
    if (!cell) return false;
    const [x, z] = cell;
    if (block === 'chest') c.chest(x, y1, z0 + z, lootTableFor(s.type, entry.name), z <= d / 2 ? 'south' : 'north');
    else if (/_stairs$/.test(block)) c.set(x, y1, z0 + z, block, { facing: 'north', half: 'bottom' });
    else if (block === 'table') { c.set(x, y1, z0 + z, s.fence); c.set(x, y1 + 1, z0 + z, s.pressurePlate); }
    else c.set(x, y1, z0 + z, block);
  }
  for (const colour of entry.carpets ?? []) {
    const cell = free.shift();
    if (!cell) return false;
    c.set(cell[0], y1, z0 + cell[1], `${colour}_carpet`);
  }
  // A torch to see by on the back wall, unless this is an outdoor workshop.
  if (!entry.outdoor) c.put(doorX, y1 + 1, z0 + d - 2, 'wall_torch', { facing: 'north' });
  // A sign beside the door, where the type's block list has one (the taiga's spruce wall sign).
  if (s.sign && !entry.outdoor && doorX + 1 < w - 1) c.put(doorX + 1, y1 + 1, z0 - 1, s.sign, { facing: 'north' });
  // Pots in the windows (the desert's windows are open, so the pot stands in the opening).
  for (const pot of entry.windowPots ?? []) {
    const win = windows.shift();
    if (win) c.set(win[0], win[1], win[2], pot);
    else { const cell = free.shift(); if (cell) c.set(cell[0], y1, z0 + cell[1], pot); }
  }
  // Banners hang on the walls inside, a row above the floor.
  let banners = entry.banners ?? 0;
  for (let z = 1; z <= d - 2 && banners > 0; z++) {
    for (const x of [1, w - 2]) {
      if (banners > 0 && isEmpty(c, x, y1 + 1, z0 + z)) { c.set(x, y1 + 1, z0 + z, 'brown_wall_banner', { facing: x === 1 ? 'east' : 'west' }); banners--; }
    }
  }
  for (let x = 1; x <= w - 2 && banners > 0; x++) if (isEmpty(c, x, y1 + 1, z0 + d - 2)) { c.set(x, y1 + 1, z0 + d - 2, 'brown_wall_banner', { facing: 'north' }); banners--; }

  // Out front: pots, lanterns, hay, a forge, flowerbeds, armour stands -- in the yard either side of the path.
  const yardCells = [];
  for (let z = yard - 1; z >= 0; z--) for (let x = 0; x < w; x++) {
    if (x === doorX || (lift && x === doorX)) continue;
    yardCells.push([x, z]);
  }
  const yardTake = () => yardCells.shift();
  if (entry.forge) {
    const row = yard - 1;
    const x0 = 0;
    c.set(x0, 0, row, s.forgeFloor); c.set(x0, 1, row, s.forgeFloor);
    c.set(x0 + 1, 0, row, 'lava'); c.set(x0 + 1, 1, row, 'iron_bars');
    c.set(x0 + 2, 0, row, s.forgeFloor); c.set(x0 + 2, 1, row, s.forgeFloor);
    for (let i = yardCells.length - 1; i >= 0; i--) if (yardCells[i][1] === row && yardCells[i][0] >= x0 && yardCells[i][0] <= x0 + 2) yardCells.splice(i, 1);
  }
  for (const block of front) {
    const cell = yardTake();
    if (!cell) break;
    const [x, z] = cell;
    c.put(x, 0, z, s.ground);
    if (block === 'lantern') { c.set(x, 1, z, s.fence); c.set(x, 2, z, 'lantern'); }
    else if (block === 'cactus') { c.set(x, 0, z, 'sand'); c.set(x, 1, z, 'cactus'); }
    else if (/_trapdoor$/.test(block)) c.set(x, 1, z, block, { facing: 'north', half: 'bottom', open: 'true' });
    else if (block === 'stone_button') c.set(x, 1, z, block, { face: 'floor', facing: 'north' });
    else c.set(x, 1, z, block);
  }
  for (let i = 0; i < (entry.flowerbeds ?? 0); i++) {
    const cell = yardTake();
    if (!cell) break;
    const [x, z] = cell;
    c.set(x, 0, z, s.ground === 'sand' ? 'sand' : 'dirt');
    c.set(x, 1, z, s.ground === 'sand' ? 'sand' : 'grass_block');
    if (!entry.emptyFlowerbeds && s.flowers.length) c.set(x, 2, z, s.flowers[(i + nameHash(entry.name)) % s.flowers.length]);
  }
  for (const item of entry.armorStands ?? []) {
    const cell = yardTake();
    if (!cell) break;
    c.entity('armor_stand', cell[0], 1, cell[1], { equipment: [item] });
  }
  if (entry.veranda) {
    // A roofed porch across the front, on posts at its corners.
    for (const x of [0, w - 1]) for (let y = 1; y <= top; y++) c.put(x, y, z0 - 1, s.fence);
    for (let x = 0; x < w; x++) c.set(x, top + 1, z0 - 1, s.roofSlab, { type: 'bottom' });
  }

  // The back yard: a pen, a pond or a few patches of farmland.
  const zb = z0 + d;
  if (entry.pen) pen(c, 0, zb, w, back, entry.pen);
  if (entry.pond) pond(c, zb, w, back, entry.pond);
  if (entry.farmland) {
    for (let i = 0; i < entry.farmland; i++) {
      const x = 1 + 2 * i;
      if (x >= w - 1) break;
      c.set(x, 0, zb + 1, 'farmland_moist'); c.set(x, 1, zb + 1, CROP_BLOCK[s.crops[i % s.crops.length]]);
    }
    c.set(w - 1, 0, zb + 1, 'water');
  }

  c.slot(doorX, 0, 0, HOUSE_SLOT, null, 'north');
  return true;
}

function isEmpty(c, x, y, z) {
  const cur = c.get(x, y, z);
  return !cur || cur === 'air';
}

function wallScore([x, z], w, d) {
  return (x === 1 || x === w - 2 ? 1 : 0) + (z === d - 2 ? 2 : 0);
}

function windowBlock(s, entry, n) {
  if (entry.windows === 'stained' && s.stainedWindows.length) return s.stainedWindows[n % s.stainedWindows.length];
  if (entry.windows === 'fence') return s.fence;
  return s.window ?? AIR;
}

function door(c, x, y, z) {
  const s = c.style;
  c.set(x, y, z, s.door, { facing: 'north', half: 'lower', hinge: 'left', open: 'false' });
  c.set(x, y + 1, z, s.door + '_top', { facing: 'north', half: 'upper', hinge: 'left', open: 'false' });
}

function roof(c, entry, w, d, z0, top) {
  const s = c.style;
  if (entry.outdoor && entry.logRoof) {
    // "a grindstone under a slanted roof of spruce logs"
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) c.set(x, top + 1 + (z < d / 2 ? 0 : 1), z0 + z, s.log);
    return;
  }
  if (s.roof === 'flat') {
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
      const rim = x === 0 || x === w - 1 || z === 0 || z === d - 1;
      c.set(x, top + 1, z0 + z, rim && entry.roofTrim ? entry.roofTrim : s.roofMaterial);
    }
    return;
  }
  // A gable: stairs (or, in the taiga, spruce logs) rising to a ridge, gable ends filled with the wall.
  for (let x = 0; x < w; x++) {
    const k = Math.min(x, w - 1 - x);
    const ridge = x === w - 1 - x;
    for (let z = 0; z < d; z++) {
      if (ridge || s.roof === 'logs') c.set(x, top + 1 + k, z0 + z, s.roof === 'logs' ? s.roofMaterial : s.roofMaterial);
      else c.set(x, top + 1 + k, z0 + z, s.stairs, { facing: x < w - 1 - x ? 'east' : 'west', half: 'bottom' });
    }
    for (let y = top + 1; y <= top + k; y++) { c.set(x, y, z0, entry.wall ?? s.wall); c.set(x, y, z0 + d - 1, entry.wall ?? s.wall); }
    if (entry.roofTrim) { c.set(x, top + 1 + k, z0, entry.roofTrim); c.set(x, top + 1 + k, z0 + d - 1, entry.roofTrim); }
  }
}

/** A snowy igloo house: a dome of snow blocks, packed ice or blue ice, two blocks high inside. */
function igloo(c, entry, w, d, z0, doorX) {
  const s = c.style;
  const mats = entry.igloo;
  const mat = (x, y, z) => mats[(x * 3 + y * 5 + z * 7) % mats.length];
  const rounded = (x, z) => (x === 0 || x === w - 1) && (z === 0 || z === d - 1);
  for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
    if (rounded(x, z)) continue;
    c.set(x, 0, z0 + z, x === 0 || x === w - 1 || z === 0 || z === d - 1 ? mat(x, 0, z) : 'snow_block');
  }
  c.fill(1, 1, z0 + 1, w - 2, 2, z0 + d - 2, AIR);
  for (let y = 1; y <= 2; y++) for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
    if (rounded(x, z)) continue;
    if (x === 0 || x === w - 1 || z === 0 || z === d - 1) c.set(x, y, z0 + z, mat(x, y, z));
  }
  for (let x = 1; x < w - 1; x++) for (let z = 1; z < d - 1; z++) c.set(x, 3, z0 + z, mat(x, 3, z));
  for (let x = 2; x < w - 2; x++) for (let z = 2; z < d - 2; z++) c.set(x, 4, z0 + z, mat(x, 4, z));
  door(c, doorX, 1, z0);
  const free = [];
  for (let z = 1; z <= d - 2; z++) for (let x = 1; x <= w - 2; x++) if (!(x === doorX && z === 1)) free.push([x, z]);
  const take = (x, z) => { const i = free.findIndex(([fx, fz]) => fx === x && fz === z); if (i >= 0) free.splice(i, 1); };
  for (let i = 0; i < (entry.beds ?? 0); i++) {
    const spot = free.find(([x, z]) => free.some(([fx, fz]) => fx === x && fz === z + 1));
    if (!spot) return false;
    const [x, z] = spot; take(x, z); take(x, z + 1);
    const colour = bedColour(s, entry, i);
    c.set(x, 1, z0 + z, `${colour}_bed`, { facing: 'south', part: 'foot' });
    c.set(x, 1, z0 + z + 1, `${colour}_bed_head`, { facing: 'south', part: 'head' });
    c.entity('villager', x, 1, z0 + z);
  }
  for (const block of [...(entry.job ?? []), ...(entry.items ?? [])]) {
    const cell = free.pop();
    if (!cell) return false;
    if (block === 'chest') c.chest(cell[0], 1, z0 + cell[1], lootTableFor(s.type, entry.name));
    else c.set(cell[0], 1, z0 + cell[1], block);
  }
  if (free.length) { const [x, z] = free.pop(); c.set(x, 1, z0 + z, 'torch'); }
  if (entry.pen) pen(c, 0, z0 + d, w, 5, entry.pen);
  c.slot(doorX, 0, 0, HOUSE_SLOT, null, 'north');
  return true;
}

/** A fenced pen in a w x depth area starting at (x0, z0), with its animals, hay and water. */
function pen(c, x0, z0, w, depth, opts = {}) {
  const s = c.style;
  for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + depth; z++) {
    c.set(x, 0, z, s.ground);
    const edge = x === x0 || x === x0 + w - 1 || z === z0 + depth - 1;
    if (edge) c.set(x, 1, z, s.fence); else c.set(x, 1, z, AIR);
  }
  if (s.plants) s.plants.forEach((plant, k) => c.put(x0 + 1 + k, 1, z0 + depth - 2, plant));
  let i = 0;
  for (const animal of opts.animals ?? []) { c.entity(animal, x0 + 1 + (i % (w - 2)), 1, z0 + 1 + Math.floor(i / (w - 2))); i++; }
  for (let k = 0; k < (opts.hay ?? 0) && s.hay; k++) c.set(x0 + w - 2 - k, 1, z0 + depth - 2, 'hay_block');
  if (opts.wateringHole) c.set(x0 + 1, 0, z0 + depth - 2, 'water');
}

/** A pond behind a fisher's cottage: water, barrels round it, an optional dock and pillars. */
function pond(c, z0, w, depth, opts = {}) {
  const s = c.style;
  for (let x = 1; x < w - 1; x++) for (let z = z0; z < z0 + depth - 1; z++) c.set(x, 0, z, 'water');
  for (let x = 0; x < w; x++) c.set(x, 0, z0 + depth - 1, s.foundation);
  for (let z = z0; z < z0 + depth; z++) { c.set(0, 0, z, s.foundation); c.set(w - 1, 0, z, s.foundation); }
  for (let k = 0; k < (opts.barrels ?? 0); k++) c.set(k % 2 ? w - 1 : 0, 1, z0 + Math.floor(k / 2), 'barrel');
  if (opts.dock) for (let z = z0; z < z0 + depth - 1; z++) c.set(Math.floor(w / 2), 1, z, s.slab, { type: 'bottom' });
  if (opts.pillars) for (const [x, z] of [[0, z0], [w - 1, z0], [0, z0 + depth - 1], [w - 1, z0 + depth - 1]]) c.fill(x, 1, z, x, 2, z, s.corner);
}

/** Build a building from its catalogue entry, trying room sizes from small to large until its furniture fits. */
function buildBuilding(type, entry) {
  const style = STYLES[type];
  let sizes = ROOM_SIZES;
  if (entry.igloo) sizes = entry.beds >= 2 ? [[7, 7], [9, 7]] : [[5, 5], [7, 5], [7, 7]];
  if (entry.beds >= 4) sizes = [[9, 7], [9, 9]];
  for (const [w, d] of sizes) {
    const c = createCanvas(style);
    if (tryBuilding(c, entry, w, d)) return c.result();
  }
  throw new Error(`village: ${entry.name} does not fit in any room size`);
}

// ---------------------------------------------------------------------------------------------------------------
// Farms, pens, decorations, lamps, streets, the street end and the meeting points.

function buildFarm(type, entry) {
  const s = STYLES[type];
  const c = createCanvas(s);
  const patches = entry.patches;
  const w = patches * 4 + 1;
  const d = 9;
  c.declare(w, 4, d + 1);
  const cx = Math.floor(w / 2);
  c.set(cx, 0, 0, pathTile(s, cx, 0));
  const border = entry.border ?? (type === 'desert' ? 'smooth_sandstone' : s.log);
  const crops = entry.melonOnly ? ['melon_stem'] : entry.pumpkinOnly ? ['pumpkin_stem'] : s.crops;
  for (let x = 0; x < w; x++) for (let z = 1; z <= d; z++) {
    const edge = x === 0 || x === w - 1 || z === 1 || z === d;
    c.fill(x, 1, z, x, 3, z, AIR);
    if (edge) { c.set(x, 0, z, border, border.endsWith('_log') ? { axis: x === 0 || x === w - 1 ? 'z' : 'x' } : null); continue; }
    const channel = (x % 4) === 0;
    if (channel) { c.set(x, 0, z, entry.walkway ? s.path : 'water'); continue; }
    const patch = Math.floor(x / 4);
    const crop = crops[(patch + nameHash(entry.name)) % crops.length];
    c.set(x, 0, z, entry.grassPaths && (x + z) % 7 === 0 ? s.path : 'farmland_moist');
    if (c.get(x, 0, z) === 'farmland_moist') {
      const fruit = GOURD_FRUIT[crop];
      // A gourd row: the stem, with its fruit beside it where this village type has the fruit at all.
      const fruitAllowed = fruit && !(type === 'desert');
      c.set(x, 1, z, fruitAllowed && x % 4 === 2 ? fruit : CROP_BLOCK[crop]);
    }
  }
  // Every patch is watered: a farm without a channel (one patch, or a walkway down the middle) gets a water source
  // in the middle of each patch instead.
  if (patches === 1 || entry.walkway) for (let p = 0; p < patches; p++) { c.set(p * 4 + 2, 0, 5, 'water'); c.set(p * 4 + 2, 1, 5, AIR); }
  for (let k = 0; k < entry.composters; k++) c.set(k ? w - 1 : 0, 1, k ? d : 1, 'composter');
  if (entry.trapdoorRing && s.trapdoor) for (const [dx, dz] of [[1, 0], [0, 1]]) c.set(dx, 1, 1 + dz, s.trapdoor, { facing: 'north', half: 'bottom', open: 'true' });
  for (let k = 0; k < (entry.hay ?? 0) && s.hay; k++) c.set(1 + k, 1, d, 'hay_block');
  if (entry.trough) { c.set(w - 2, 1, d, entry.trough); }
  if (entry.pumpkins) for (let x = 1; x < w - 1; x += 2) c.set(x, 1, d, x === 1 && s.jackOLantern ? 'jack_o_lantern' : 'pumpkin');
  for (let k = 0; k < (entry.torchPillars ?? 0); k++) { const x = k ? w - 1 : 0; c.set(x, 1, d, 'cobblestone_wall'); c.set(x, 2, d, 'torch'); }
  if (entry.lantern) { c.set(w - 1, 1, Math.ceil(d / 2), s.fence); c.set(w - 1, 2, Math.ceil(d / 2), 'lantern'); }
  c.slot(cx, 0, 0, HOUSE_SLOT, null, 'north');
  return c.result();
}

function buildPen(type, entry) {
  const s = STYLES[type];
  const c = createCanvas(s);
  const w = 7; const d = 7;
  c.declare(w, 5, d + 1);
  c.set(3, 0, 0, pathTile(s, 3, 0));
  for (let x = 0; x < w; x++) for (let z = 1; z <= d; z++) {
    c.set(x, 0, z, s.ground);
    c.fill(x, 2, z, x, 4, z, AIR);
    const edge = x === 0 || x === w - 1 || z === 1 || z === d;
    c.set(x, 1, z, edge ? s.fence : AIR);
  }
  c.set(3, 1, 1, s.gate, { facing: 'north', open: 'false' });
  // A torch on a corner post of the pen.
  c.set(0, 2, d, 'torch');
  if (entry.arch) { c.set(2, 2, 1, s.fence); c.set(4, 2, 1, s.fence); c.fill(2, 3, 1, 4, 3, 1, s.slab, { type: 'bottom' }); }
  if (s.plants) s.plants.forEach((plant, k) => c.put(5, 1, 2 + k, plant));
  if (entry.tree && s.leaves) {
    c.fill(1, 1, d - 1, 1, 3, d - 1, s.log);
    for (const [dx, dz] of [[0, 0], [1, 0], [0, -1], [1, -1]]) c.set(1 + dx, 4, d - 1 + dz, s.leaves);
  }
  for (let k = 0; k < (entry.hay ?? 0) && s.hay; k++) c.set(w - 2, 1, 2 + k, 'hay_block');
  if (entry.trough) {
    c.set(2, 0, d - 1, 'water');
    if (entry.trough !== 'water') c.set(3, 1, d - 1, entry.trough, /_stairs$/.test(entry.trough) ? { facing: 'south', half: 'bottom' } : /_trapdoor$/.test(entry.trough) ? { facing: 'north', half: 'bottom', open: 'true' } : null);
  }
  if (entry.wateringHole) c.set(4, 0, d - 2, 'water');
  if (entry.snowPile) { c.set(5, 1, d - 1, 'snow_block'); c.set(5, 1, d - 2, 'snow_block'); }
  if (entry.shelter || entry.stable) {
    const len = entry.shelter === 'small' ? 2 : 5;
    for (const [x, z] of [[1, d - 1], [len, d - 1]]) c.set(x, 2, z, s.fence);
    for (let x = 1; x <= len; x++) c.set(x, 3, d - 1, s.roofSlab, { type: 'bottom' });
    if (entry.wall) for (let x = 1; x <= len; x++) c.set(x, 2, d, entry.wall);
  }
  const animals = entry.animals ?? defaultAnimals(entry.name);
  animals.forEach((animal, i) => c.entity(animal, 2 + (i % 3), 1, 3 + Math.floor(i / 3)));
  c.slot(3, 0, 0, HOUSE_SLOT, null, 'north');
  return c.result();
}

/** Pen animals by pen, so every village has its share: cows, sheep, pigs and horses (the wiki's livestock). */
function defaultAnimals(name) {
  const kinds = [['cow', 'cow'], ['sheep', 'sheep'], ['pig', 'pig'], ['horse', 'horse']];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return kinds[hash % kinds.length];
}

function buildDecor(type, entry) {
  const s = STYLES[type];
  const c = createCanvas(s);
  c.declare(5, 4, 5);
  c.set(2, 0, 0, pathTile(s, 2, 0));
  c.fill(0, 1, 1, 4, 3, 4, AIR);
  for (let x = 0; x < 5; x++) for (let z = 1; z < 5; z++) c.set(x, 0, z, s.ground);
  switch (entry.design) {
    case 'flowerbed':
      // "A flowerbed made of oak trapdoors with three flowers."
      for (let x = 1; x <= 3; x++) { c.set(x, 1, 2, s.flowers[x % s.flowers.length]); c.set(x, 1, 1, s.trapdoor, { facing: 'north', half: 'bottom', open: 'true' }); c.set(x, 1, 3, s.trapdoor, { facing: 'south', half: 'bottom', open: 'true' }); }
      c.set(0, 1, 2, s.trapdoor, { facing: 'west', half: 'bottom', open: 'true' });
      c.set(4, 1, 2, s.trapdoor, { facing: 'east', half: 'bottom', open: 'true' });
      break;
    case 'trapdoor_trough':
      // "A water trough made of open spruce trapdoors."
      for (let x = 1; x <= 3; x++) { c.set(x, 0, 2, 'water'); c.set(x, 1, 1, s.trapdoor, { facing: 'north', half: 'bottom', open: 'true' }); c.set(x, 1, 3, s.trapdoor, { facing: 'south', half: 'bottom', open: 'true' }); }
      break;
    case 'cobble_stairs': {
      c.set(2, 1, 2, 'cobblestone');
      const around = [[2, 1, 'south'], [1, 2, 'east'], [3, 2, 'west'], [2, 3, 'north']].slice(0, entry.stairs);
      for (const [x, z, facing] of around) c.set(x, 1, z, 'cobblestone_stairs', { facing, half: 'bottom' });
      if (entry.wall) c.set(2, 2, 2, 'cobblestone_wall');
      break;
    }
    case 'campfire': c.set(2, 1, 2, 'campfire'); break;
    case 'campfire_hay':
      // "A campfire atop a hay bale surrounded by spruce trapdoors."
      c.set(2, 1, 2, 'hay_block'); c.set(2, 2, 2, 'campfire');
      for (const [x, z, facing] of [[2, 1, 'north'], [1, 2, 'west'], [3, 2, 'east'], [2, 3, 'south']]) c.set(x, 1, z, s.trapdoor, { facing, half: 'top', open: 'false' });
      break;
    case 'hay_pile':
      for (const [x, z] of [[1, 2], [2, 2], [2, 3]]) c.set(x, 1, z, 'hay_block');
      c.set(2, 2, 2, 'hay_block');
      break;
    case 'melon_patch':
      for (let x = 1; x <= 3; x++) { c.set(x, 0, 2, 'farmland_moist'); c.set(x, 1, 2, 'melon_stem'); c.set(x, 1, 3, 'melon'); }
      break;
    case 'pumpkin_patch':
      for (let x = 1; x <= 3; x++) { c.set(x, 0, 2, 'farmland_moist'); c.set(x, 1, 2, 'pumpkin_stem'); c.set(x, 1, 3, 'pumpkin'); }
      break;
    case 'snow_patch':
      for (let x = 0; x < 5; x++) for (let z = 1; z < 5; z++) { c.set(x, 0, z, 'snow_block'); if ((x + z) % 2) c.set(x, 1, z, 'snow'); }
      break;
    case 'ice_patch':
      for (let x = 0; x < 5; x++) for (let z = 1; z < 5; z++) c.set(x, 0, z, (x + z) % 3 ? 'packed_ice' : 'blue_ice');
      break;
    default: throw new Error('unknown decoration ' + entry.design);
  }
  c.slot(2, 0, 0, HOUSE_SLOT, null, 'north');
  return c.result();
}

function buildLamp(type, lamp) {
  const s = STYLES[type];
  const c = createCanvas(s);
  c.declare(3, 6, 4);
  c.set(1, 0, 0, pathTile(s, 1, 0));
  c.fill(0, 1, 1, 2, 5, 3, AIR);
  c.set(1, 0, 2, s.ground);
  placeLamp(c, lamp.design, 1, 2, lamp.lanterns);
  c.slot(1, 0, 0, HOUSE_SLOT, null, 'north');
  return c.result();
}

function buildStreet(type) {
  const s = STYLES[type];
  const c = createCanvas(s);
  c.declare(3, 4, 9);
  for (let x = 0; x < 3; x++) for (let z = 0; z < 9; z++) c.set(x, 0, z, pathTile(s, x, z));
  c.fill(0, 1, 0, 2, 3, 8, AIR);
  c.slot(1, 0, 0, STREET_SLOT, STREET_POOL, 'north');
  c.slot(1, 0, 8, STREET_SLOT, STREET_POOL, 'south');
  c.slot(0, 0, 4, HOUSE_SLOT, HOUSE_POOL, 'west');
  c.slot(2, 0, 4, HOUSE_SLOT, HOUSE_POOL, 'east');
  return c.result();
}

function buildTerminus(type) {
  const s = STYLES[type];
  const c = createCanvas(s);
  c.declare(3, 6, 5);
  for (let x = 0; x < 3; x++) for (let z = 0; z < 4; z++) c.set(x, 0, z, pathTile(s, x, z));
  c.fill(0, 1, 0, 2, 5, 4, AIR);
  c.set(1, 0, 4, s.ground);
  placeLamp(c, CATALOGUE_LAMP[type].design, 1, 3, CATALOGUE_LAMP[type].lanterns);
  c.slot(1, 0, 0, STREET_SLOT, null, 'north');
  return c.result();
}

// The meeting point (town centre): 11 x 11, a street leaving each side, a bell, and the design the wiki describes.
export const MEETING_SIZE = 11;
export const MEETING_GOLEM = [9, 1, 1];
export const MEETING_CAMEL = [8, 1, 8];
export const MEETING_CAT_SPOTS = [[1, 1], [1, 9], [9, 9], [2, 1], [1, 2]];

function buildMeeting(type, entry) {
  const s = STYLES[type];
  const c = createCanvas(s);
  const n = MEETING_SIZE; const m = 5;
  c.declare(n, 9, n);
  for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) c.set(x, 0, z, pathTile(s, x, z));
  c.fill(0, 1, 0, n - 1, 8, n - 1, AIR);
  const bell = (x, y, z, attachment = 'floor') => c.set(x, y, z, 'bell', { attachment, facing: 'north' });
  const post = (x, z, mat, height = 1) => c.fill(x, 1, z, x, height, z, mat);
  const well = (x0, z0, mat, roofed, hanging, roofSlab = null) => {
    for (let x = x0; x < x0 + 3; x++) for (let z = z0; z < z0 + 3; z++) {
      const centre = x === x0 + 1 && z === z0 + 1;
      c.set(x, 0, z, centre ? 'water' : mat);
      if (!centre) c.set(x, 1, z, mat);
    }
    if (roofed) {
      for (const [x, z] of [[x0, z0], [x0 + 2, z0], [x0, z0 + 2], [x0 + 2, z0 + 2]]) c.fill(x, 2, z, x, 3, z, s.fence);
      c.fill(x0, 4, z0, x0 + 2, 4, z0 + 2, roofSlab ?? s.slab, { type: 'bottom' });
      if (hanging) bell(x0 + 1, 3, z0 + 1, 'ceiling');
    }
  };
  switch (entry.design) {
    case 'fountain': {
      // A basin round water; the plains fountain has its water atop a pillar in the middle.
      for (let x = m - 2; x <= m + 2; x++) for (let z = m - 2; z <= m + 2; z++) {
        const ring = Math.abs(x - m) === 2 || Math.abs(z - m) === 2;
        c.set(x, 0, z, ring ? (entry.trim ?? entry.material) : 'water');
        if (ring) c.set(x, 1, z, entry.material);
      }
      if (entry.pillar) { c.fill(m, 0, m, m, 2, m, entry.material); c.set(m, 3, m, 'water'); }
      for (let i = 0; i < (entry.bells ?? 1); i++) { const x = i ? 1 : n - 2; post(x, m, entry.trim ?? s.log); bell(x, 2, m); }
      for (let i = 0; i < (entry.torchPillars ?? 0); i++) { const z = i ? n - 2 : 1; c.set(m, 1, z, entry.trim); c.set(m, 2, z, 'torch'); }
      for (let i = 0; i < (entry.banners ?? 0); i++) { const [x, z] = [[m - 2, m - 3], [m + 2, m - 3], [m - 2, m + 3], [m + 2, m + 3]][i % 4]; c.set(x, 1, z, entry.material); c.set(x, 2, z, 'brown_wall_banner', { facing: 'north' }); }
      break;
    }
    case 'well': {
      well(m - 1, m - 1, entry.material, true, entry.hangingBell, entry.roofSlab);
      if (!entry.hangingBell) { post(n - 3, m, s.log); bell(n - 3, 2, m); }
      if (entry.trim) for (let x = m - 2; x <= m + 2; x++) { c.set(x, 0, m - 2, entry.trim); c.set(x, 0, m + 2, entry.trim); }
      break;
    }
    case 'twin_wells':
      well(1, m - 1, entry.material, false);
      well(n - 4, m - 1, entry.material, false);
      for (const [x, z] of [[m - 1, m - 1], [m + 1, m - 1], [m - 1, m + 1], [m + 1, m + 1]]) c.fill(x, 1, z, x, 3, z, s.fence);
      c.fill(m - 1, 4, m - 1, m + 1, 4, m + 1, s.slab, { type: 'bottom' });
      bell(m, 3, m, 'ceiling');
      break;
    case 'plus_well': {
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) c.set(m + dx, 0, m + dz, 'water');
      for (let x = m - 2; x <= m + 2; x++) for (let z = m - 2; z <= m + 2; z++) {
        if (c.get(x, 0, z) === 'water') continue;
        if (Math.abs(x - m) + Math.abs(z - m) <= 3) { c.set(x, 0, z, entry.material); c.set(x, 1, z, entry.material); }
      }
      for (const [x, z] of [[m - 2, m - 2], [m + 2, m - 2], [m - 2, m + 2], [m + 2, m + 2]]) c.fill(x, 1, z, x, 3, z, s.fence);
      c.fill(m - 2, 4, m - 2, m + 2, 4, m + 2, s.slab, { type: 'bottom' });
      bell(m, 3, m, 'ceiling');
      break;
    }
    case 'stalls': {
      // Market stalls: four posts and a cloth roof each (wool, glazed terracotta, or slabs hung with banners).
      const xs = entry.stalls === 2 ? [1, n - 4] : [1, m - 1, n - 4];
      xs.forEach((x0, k) => {
        const z0 = 2;
        for (const [x, z] of [[x0, z0], [x0 + 2, z0], [x0, z0 + 2], [x0 + 2, z0 + 2]]) c.fill(x, 1, z, x, 2, z, s.fence);
        for (let x = x0; x <= x0 + 2; x++) for (let z = z0; z <= z0 + 2; z++) {
          const cloth = Array.isArray(entry.cloth) ? entry.cloth[(x + z) % entry.cloth.length] : entry.cloth;
          c.set(x, 3, z, cloth ?? s.slab, cloth ? null : { type: 'bottom' });
        }
        if (entry.banners) { c.set(x0 + 1, 2, z0 - 1 + 0, 'brown_wall_banner', { facing: 'north' }); c.set(x0 + 1, 2, z0 + 3, 'brown_wall_banner', { facing: 'south' }); }
        if (entry.hangingBell && k === 1) bell(x0 + 1, 2, z0 + 1, 'ceiling');
      });
      if (!entry.hangingBell) {
        if (entry.bellOn) { c.set(m, 1, n - 3, entry.bellOn); bell(m, 2, n - 3); } else bell(m, 1, n - 3);
      }
      if (entry.scatter) for (const [x, z] of [[4, 7], [6, 8], [3, 9], [7, 6]]) c.set(x, 0, z, entry.scatter);
      if (entry.smallWell) { c.set(2, 0, n - 3, 'water'); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.set(2 + dx, 1, n - 3 + dz, s.foundation); }
      if (entry.torchPillar) { c.set(n - 2, 1, n - 3, s.corner); c.set(n - 2, 2, n - 3, 'torch'); }
      (entry.front ?? []).forEach((block, i) => c.set(3 + i, 1, n - 2, block));
      break;
    }
    case 'tree': {
      // "An oak tree with cobblestone around the base and two arches with bells."
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) c.set(m + dx, 1, m + dz, entry.base);
      c.fill(m, 1, m, m, 4, m, s.log);
      for (let x = m - 2; x <= m + 2; x++) for (let z = m - 2; z <= m + 2; z++) if (!(x === m && z === m)) c.set(x, 5, z, s.leaves);
      c.set(m, 5, m, s.log); c.set(m, 6, m, s.leaves);
      for (const x of [1, n - 2]) { c.fill(x, 1, m - 1, x, 3, m - 1, s.log); c.fill(x, 1, m + 1, x, 3, m + 1, s.log); c.fill(x, 4, m - 1, x, 4, m + 1, s.planks); bell(x, 3, m, 'ceiling'); }
      break;
    }
    case 'icicle': {
      // A packed-ice icicle, tall or small; the small one stands on spruce stairs. The bell is on packed ice nearby.
      const base = entry.onStairs ? 2 : 1;
      if (entry.onStairs) for (const [dx, dz, facing] of [[1, 0, 'west'], [-1, 0, 'east'], [0, 1, 'north'], [0, -1, 'south']]) c.set(m + dx, 1, m + dz, 'spruce_stairs', { facing, half: 'bottom' });
      if (entry.onStairs) c.set(m, 1, m, 'packed_ice');
      c.fill(m, base, m, m, base + entry.height - 1, m, 'packed_ice');
      if (entry.height > 3) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.fill(m + dx, base, m + dz, m + dx, base + 1, m + dz, 'packed_ice');
      c.set(n - 3, 1, m, entry.bellOn ?? 'packed_ice'); bell(n - 3, 2, m);
      break;
    }
    case 'lantern_shrine': {
      for (const [x, z] of [[m - 1, m - 1], [m + 1, m - 1], [m - 1, m + 1], [m + 1, m + 1]]) c.fill(x, 1, z, x, 3, z, s.fence);
      c.fill(m - 1, 4, m - 1, m + 1, 4, m + 1, s.slab, { type: 'bottom' });
      for (const [x, z] of [[m, m - 1], [m, m + 1], [m - 1, m], [m + 1, m]].slice(0, entry.lanterns)) c.set(x, 3, z, 'lantern', { hanging: 'true' });
      bell(m, 3, m, 'ceiling');
      break;
    }
    case 'path_square':
      bell(m, 1, m);
      break;
    default: throw new Error('unknown meeting point design ' + entry.design);
  }
  // What the description puts beside it (the desert fountain's potted cactus); the stalls place their own.
  if (entry.design !== 'stalls') (entry.front ?? []).forEach((block, i) => c.put(3 + i, 1, n - 2, block));
  c.slot(m, 0, 0, STREET_SLOT, STREET_POOL, 'north');
  c.slot(m, 0, n - 1, STREET_SLOT, STREET_POOL, 'south');
  c.slot(0, 0, m, STREET_SLOT, STREET_POOL, 'west');
  c.slot(n - 1, 0, m, STREET_SLOT, STREET_POOL, 'east');
  c.entity('iron_golem', ...MEETING_GOLEM);
  if (type === 'desert') c.entity('camel', ...MEETING_CAMEL);
  return c.result();
}

const CATALOGUE_LAMP = {};

// ---------------------------------------------------------------------------------------------------------------
// Blueprint builds: the wiki's own layer-by-layer drawing of the building (villageBlueprintData.js), block for block.

/** Whether a building is built from the wiki's blueprint (every vanilla building but one; our own decorations are not). */
export const hasBlueprint = (name) => Boolean(VILLAGE_BLUEPRINTS[name]);

const PEN_ANIMALS = ['cow', 'sheep', 'pig', 'horse'];

function buildFromBlueprint(type, entry, bp) {
  const s = STYLES[type];
  const c = createCanvas(s);
  c.declare(...bp.size);
  const g = bp.groundY;
  for (const record of bp.blocks.split(';')) {
    const [x, y, z, p] = record.split(',').map(Number);
    if (p < 0) { c.set(x, y, z, pathTile(s, x, z)); continue; }
    const state = bp.palette[p];
    // The blueprints draw every field as wheat; a village's fields grow the type's crops (see villageStyles.js).
    if (state.Name === 'minecraft:wheat_stage_7') { c.set(x, y, z, CROP_BLOCK[s.crops[(x * 3 + z * 7 + nameHash(entry.name)) % s.crops.length]]); continue; }
    if (state.Name === 'minecraft:chest') c.chest(x, y, z, lootTableFor(type, entry.name), state.Properties?.facing ?? 'south');
    else c.set(x, y, z, state.Name, state.Properties ?? null);
  }
  const [w, , d] = bp.size;
  const empty = (x, y, z) => { const cur = c.get(x, y, z); return !cur || cur === 'air'; };
  const ground = (x, z) => { const cur = c.get(x, g, z); return cur && /grass_block|sand|dirt|snow_block|gravel|path/.test(cur); };
  // A cell an animal or a golem can stand on: open ground with two free blocks above it.
  const standable = (x, z) => ground(x, z) && empty(x, g + 1, z) && empty(x, g + 2, z);
  /** Is this cell closed in by fences on all four sides within a few blocks (inside a pen)? */
  const fenced = (x, z) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => {
    for (let k = 1; k <= 8; k++) {
      const cur = c.get(x + dx * k, g + 1, z + dz * k);
      if (cur && cur !== 'air') return true;
      if (x + dx * k < 0 || z + dz * k < 0 || x + dx * k >= w || z + dz * k >= d) return false;
    }
    return false;
  });

  let armour = [...(entry.armorStands ?? [])];
  for (const e of bp.entities) {
    if (e.type === 'armor_stand') c.entity('armor_stand', ...e.pos, { equipment: [armour.shift() ?? 'iron_helmet'] });
    else c.entity(e.type, ...e.pos);
  }
  // Animals: the pen's livestock, or the shepherd's two sheep, on the fenced ground of the drawing.
  const animals = entry.kind === 'pen' ? (entry.animals ?? defaultAnimals(entry.name)) : (entry.pen?.animals ?? []);
  if (animals.length) {
    const spots = [];
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) if (standable(x, z) && fenced(x, z)) spots.push([x, z]);
    animals.forEach((animal, i) => { const spot = spots[Math.floor((i * spots.length) / animals.length)]; if (spot) c.entity(animal, spot[0], g + 1, spot[1]); });
  }

  const role = entry.role;
  if (role === 'meeting') {
    // The golem (and the desert camel) stand on open ground near the middle.
    const spots = [];
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) if (empty(x, g + 1, z) && empty(x, g + 2, z)) spots.push([x, z, Math.abs(x - w / 2) + Math.abs(z - d / 2)]);
    spots.sort((a, b) => a[2] - b[2]);
    const free = spots.filter(([x, z]) => x > 0 && z > 0 && x < w - 1 && z < d - 1);
    c.entity('iron_golem', free[0]?.[0] ?? 1, g + 1, free[0]?.[1] ?? 1);
    if (type === 'desert') c.entity('camel', free[3]?.[0] ?? 2, g + 1, free[3]?.[1] ?? 2);
    for (const k of bp.connectors) c.slot(k.pos[0], k.pos[1], k.pos[2], STREET_SLOT, STREET_POOL, k.front);
  } else {
    const k = bp.connectors[0];
    c.slot(k.pos[0], k.pos[1], k.pos[2], HOUSE_SLOT, null, 'north');
  }
  return c.result();
}

/**
 * Build any village element. `role` is one of meeting, street, terminus, lamp, building (a catalogue entry from
 * the houses pool: house, job, farm, pen or decor).
 */
export function buildVillageElement(type, entry, catalogue) {
  if (!CATALOGUE_LAMP[type]) CATALOGUE_LAMP[type] = catalogue[type].lamp;
  if (entry.name && VILLAGE_BLUEPRINTS[entry.name] && !entry.procedural) return buildFromBlueprint(type, entry, VILLAGE_BLUEPRINTS[entry.name]);
  switch (entry.role) {
    case 'meeting': return buildMeeting(type, entry);
    case 'street': return buildStreet(type);
    case 'terminus': return buildTerminus(type);
    case 'lamp': return buildLamp(type, entry);
    default:
      if (entry.kind === 'farm') return buildFarm(type, entry);
      if (entry.kind === 'pen') return buildPen(type, entry);
      if (entry.kind === 'decor') return buildDecor(type, entry);
      return buildBuilding(type, entry);
  }
}
