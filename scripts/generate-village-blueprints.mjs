// node scripts/generate-village-blueprints.mjs
//
// Turns the wiki's village blueprints (docs/structure-audit/wiki/Village_Blueprints/, fetched by
// scripts/fetch-village-blueprints.mjs) into src/worldgen/generators/villageBlueprintData.js: one template per
// building, block for block, rotated so its front faces north (the village builder's convention), with its connector.
//
// The blueprints are top-down sprite grids (rows north to south, columns west to east, layer 1 the ground floor).
// What the wiki does NOT state, and how it is derived here (each rule checked against the data, see
// tests/villageBlueprints.test.js):
//   * `-rotN` turns a sprite N degrees clockwise from its base direction. The base differs by block: beds point east
//     (foot -> head; 67 of 67 beds agree), stairs north (they rise towards the solid side in every roof), chests and
//     furnace-like blocks face south, wall torches north.
//   * Doors, ladders, trapdoors, banners, buttons and fence gates are drawn without rotation, so their facing comes
//     from their neighbours (the open side, the wall they hang on).
//   * Jigsaw blocks are not drawn ("Jigsaw blocks are not included"), so the connector is placed where a street
//     meets the building: outside its lowest door (houses), its gate (pens), the middle of each side (meeting points)
//     or its front edge -- which the wiki's blueprint style guide puts at the bottom of the drawing.
import { writeFileSync } from 'node:fs';
import { loadAllBlueprints, cellsOf } from './villageBlueprintParse.mjs';
import { resolveCells, DIRS, CLOCKWISE, turn, GROUND } from './blueprintStates.mjs';

const TYPE_DIR = { Desert: 'desert', Plains: 'plains', Savanna: 'savanna', 'Snowy Tundra': 'snowy', Taiga: 'taiga' };
const NAME_OVERRIDES = {
  desert: { cartographer_1: 'desert_cartographer_house_1', shepherds_house_1: 'desert_shepherd_house_1' },
  plains: { temple_1: 'plains_temple_4', temple_2: 'plains_temple_3', tool_smith_house: 'plains_tool_smith_1', shepherds_house: 'plains_shepherds_house_1' },
  snowy: { tannery: 'snowy_tannery_1' }
};

/** "Shepherd_s House 1.txt" in Taiga -> taiga_shepherds_house_1 */
export function templateNameFor(type, file) {
  const base = file.replace(/\.txt$/, '').replace(/_s\b/g, 's').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return NAME_OVERRIDES[type]?.[base] ?? `${type}_${base}`;
}

function convert(bp, type, templateName) {
  const { cells, at, nameAt, solidAt, width, depth, reachesEdge, doorOutward, unknown } = resolveCells(bp);
  // The ground layer and the front.
  const layers = [...new Set(cells.map((c) => c.layer))].sort((a, b) => a - b);
  const doors = cells.filter((c) => c.state.door && c.state.props.half === 'lower').sort((a, b) => a.layer - b.layer);
  let baseLayer;
  let front;
  let entry = null;
  const role = /meeting_point|fountain/.test(templateName) ? 'meeting' : /lamp/.test(templateName) ? 'lamp' : 'building';
  if (doors.length && role === 'building') {
    entry = doors[0];
    baseLayer = entry.layer - 1;
    front = entry.state.props.facing;
  } else {
    const groundShare = (layer) => {
      const inLayer = cells.filter((c) => c.layer === layer);
      return inLayer.length ? inLayer.filter((c) => GROUND.test(c.state.name ?? '')).length / inLayer.length : 0;
    };
    baseLayer = groundShare(layers[0]) >= 0.3 ? layers[0] : layers[0] - 1;
    const gate = cells.find((c) => /_fence_gate$/.test(c.state.name ?? ''));
    if (gate && role === 'building') {
      entry = gate;
      front = ['south', 'east', 'west', 'north'].find((d) => reachesEdge(gate.x, gate.z, gate.layer, d)) ?? 'south';
    } else front = 'south';
  }

  // Rotate so the front faces north. q = clockwise quarter turns.
  const q = { north: 0, east: 3, south: 2, west: 1 }[front];
  const W = q % 2 ? depth : width; const D = (q % 2 ? width : depth) + (role === 'meeting' ? 0 : 1);
  const place = (x, z) => {
    let px = x; let pz = z;
    for (let i = 0; i < q; i++) { const nx = (q % 2 ? D : W) - 1 - pz; pz = px; px = nx; }
    return [px, pz];
  };
  // A simpler exact transform per q (the loop above is kept readable by doing it explicitly instead):
  // One extra row in front (z 0) holds the connector, so it never lands on the building's own front step.
  const lead = role === 'meeting' ? 0 : 1;
  const rot = (x, z) => {
    if (q === 0) return [x, z + lead];
    if (q === 1) return [depth - 1 - z, x + lead];
    if (q === 2) return [width - 1 - x, depth - 1 - z + lead];
    return [z, width - 1 - x + lead];
  };
  void place;
  const turnProps = (props) => {
    if (!props) return props;
    const out = { ...props };
    if (out.facing && DIRS[out.facing]) out.facing = turn(out.facing, q);
    if (out.axis && out.axis !== 'y' && q % 2) out.axis = out.axis === 'x' ? 'z' : 'x';
    return out;
  };

  const minLayer = Math.min(layers[0], baseLayer);
  const palette = [];
  const paletteIndex = new Map();
  const index = (name, props) => {
    const key = name + JSON.stringify(props ?? {});
    if (!paletteIndex.has(key)) { paletteIndex.set(key, palette.length); palette.push(props ? { Name: 'minecraft:' + name, Properties: props } : { Name: 'minecraft:' + name }); }
    return paletteIndex.get(key);
  };
  const blocks = [];
  const entities = [];
  for (const c of cells) {
    const [x, z] = rot(c.x, c.z);
    const y = c.layer - minLayer;
    if (c.state.entity) { entities.push({ type: c.state.entity, pos: [x, y, z] }); continue; }
    const props = turnProps(c.state.props);
    blocks.push([x, y, z, index(c.state.name, props)]);
    if (c.state.bed && !c.state.bed.head) entities.push({ type: 'villager', pos: [x, y, z] });
  }

  // Connectors: one per side of a meeting point; otherwise one on the north edge in line with the entrance.
  const groundY = baseLayer - minLayer;
  const connectors = [];
  if (role === 'meeting') {
    connectors.push({ pos: [Math.floor(W / 2), groundY, 0], front: 'north' }, { pos: [Math.floor(W / 2), groundY, D - 1], front: 'south' },
      { pos: [0, groundY, Math.floor(D / 2)], front: 'west' }, { pos: [W - 1, groundY, Math.floor(D / 2)], front: 'east' });
  } else {
    const [ex] = entry ? rot(entry.x, entry.z) : [Math.floor(W / 2)];
    connectors.push({ pos: [ex, groundY, 0], front: 'north' });
  }
  // A path from the connector to the entrance, laid only where the drawing leaves the ground empty.
  const occupied = new Set(blocks.map(([x, y, z]) => `${x},${y},${z}`));
  if (role !== 'meeting') {
    const [cx] = connectors[0].pos;
    const stopZ = entry ? rot(entry.x, entry.z)[1] : 2;
    for (let z = 1; z < stopZ; z++) if (!occupied.has(`${cx},${groundY},${z}`) && !occupied.has(`${cx},${groundY + 1},${z}`)) blocks.push([cx, groundY, z, -1]);
  }
  const height = Math.max(...blocks.map(([, y]) => y), groundY) + 1;
  return { name: templateName, type, size: [W, height, D], groundY, palette, blocks, entities, connectors, front, unknown };
}

/** Compact encoding: blocks as "x,y,z,p;..." (p = palette index, -1 = the village's path block). */
function encode(t) {
  return {
    name: t.name, size: t.size, groundY: t.groundY, palette: t.palette, entities: t.entities, connectors: t.connectors,
    blocks: t.blocks.map((b) => b.join(',')).join(';')
  };
}

const all = loadAllBlueprints();
const out = {};
const problems = [];
for (const bp of all) {
  const type = TYPE_DIR[bp.type];
  const name = templateNameFor(type, bp.file);
  const t = convert(bp, type, name);
  if (t.unknown.length) problems.push(`${name}: unknown ${t.unknown.join(', ')}`);
  out[name] = encode(t);
}
writeFileSync('src/worldgen/generators/villageBlueprintData.js', `// GENERATED by scripts/generate-village-blueprints.mjs from the Minecraft Wiki's village blueprints
// (https://minecraft.wiki/w/Village/Structure/Blueprints, CC BY-NC-SA 3.0) -- do not edit by hand.
export const VILLAGE_BLUEPRINTS = ${JSON.stringify(out)};
`);
console.log(Object.keys(out).length, 'blueprints written');
if (problems.length) console.log(problems.join('\n'));
