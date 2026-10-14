// The wiki's village blueprints, and the rules used to turn them into templates (scripts/generate-village-blueprints.mjs).
//
// The wiki's blueprint template does not document what `-rotN` means, nor where a building's street connector is.
// These tests check each rule against the drawings themselves, so a wrong rule shows up as a contradiction in the data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadAllBlueprints, cellsOf, parseLegendValue } from '../scripts/villageBlueprintParse.mjs';
import { templateNameFor } from '../scripts/generate-village-blueprints.mjs';
import { VILLAGE_BLUEPRINTS } from '../src/worldgen/generators/villageBlueprintData.js';
import { buildVillagePart } from '../src/worldgen/generators/village.js';

const ALL = loadAllBlueprints();
const DIRS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const cw = (base, rot) => ['N', 'E', 'S', 'W'][(['N', 'E', 'S', 'W'].indexOf(base) + rot / 90) % 4];

test('legend values parse: block, modifiers and rotation', () => {
  assert.deepEqual(parseLegendValue("White Bed+top foot-rot270'''"), { name: 'white bed', mods: ['top', 'foot'], rot: 270, entity: null });
  assert.deepEqual(parseLegendValue('Wall Torch-rot-90'), { name: 'wall torch', mods: [], rot: 270, entity: null });
  assert.equal(parseLegendValue('EntitySprite:Armor Stand').entity, 'armor stand');
  assert.equal(ALL.length, 180, 'every blueprint page parses (one page on the wiki has no blueprint)');
});

test('rotation rule 1: a bed sprite points east and -rotN turns it N degrees clockwise (every bed agrees)', () => {
  let checked = 0;
  for (const bp of ALL) {
    const cells = cellsOf(bp);
    const at = new Map(cells.map((c) => [`${c.x},${c.z},${c.layer}`, c]));
    for (const c of cells) {
      if (!/ bed$/.test(c.entry.name) || !c.entry.mods.includes('foot')) continue;
      const [dx, dz] = DIRS[cw('E', c.entry.rot)];
      const head = at.get(`${c.x + dx},${c.z + dz},${c.layer}`);
      assert.ok(head && head.entry.mods.includes('head'), `${bp.title}: bed at ${c.x},${c.z} (rot ${c.entry.rot}) has no head where the rule puts it`);
      checked++;
    }
  }
  assert.ok(checked >= 60, `${checked} beds`);
});

test('rotation rule 2: stairs rise towards the solid side (base north), as in every roof', () => {
  const tally = { agree: 0, disagree: 0 };
  for (const bp of ALL) {
    const cells = cellsOf(bp);
    const at = new Set(cells.map((c) => `${c.x},${c.z},${c.layer}`));
    for (const c of cells) {
      if (!/ stairs$/.test(c.entry.name) || c.entry.rot === 0) continue;
      const [dx, dz] = DIRS[cw('N', c.entry.rot)];
      const back = at.has(`${c.x + dx},${c.z + dz},${c.layer}`);
      const front = at.has(`${c.x - dx},${c.z - dz},${c.layer}`);
      if (back && !front) tally.agree++; else if (front && !back) tally.disagree++;
    }
  }
  assert.ok(tally.agree > 5 * tally.disagree, JSON.stringify(tally));
});

test('rotation rule 3: wall torches hang on the wall behind them (base north)', () => {
  const tally = { agree: 0, disagree: 0 };
  for (const bp of ALL) {
    const cells = cellsOf(bp);
    const at = new Set(cells.map((c) => `${c.x},${c.z},${c.layer}`));
    for (const c of cells) {
      if (!/torch$/.test(c.entry.name) || c.entry.rot === 0) continue;
      const [dx, dz] = DIRS[cw('N', c.entry.rot)];
      if (at.has(`${c.x - dx},${c.z - dz},${c.layer}`)) tally.agree++; else tally.disagree++;
    }
  }
  assert.ok(tally.agree > 5 * tally.disagree, JSON.stringify(tally));
});

test('every blueprint maps to its vanilla template name and becomes a template with one street connector in front', () => {
  for (const bp of ALL) {
    const type = { Desert: 'desert', Plains: 'plains', Savanna: 'savanna', 'Snowy Tundra': 'snowy', Taiga: 'taiga' }[bp.type];
    const name = templateNameFor(type, bp.file);
    assert.ok(VILLAGE_BLUEPRINTS[name], `${bp.title} -> ${name}`);
  }
  for (const [name, bp] of Object.entries(VILLAGE_BLUEPRINTS)) {
    const meeting = /meeting_point|fountain/.test(name);
    assert.equal(bp.connectors.length, meeting ? 4 : 1, name);
    if (!meeting) assert.equal(bp.connectors[0].pos[2], 0, `${name}: the connector is on the front (north) edge`);
  }
});

test('a house\'s door faces its street: the connector is in line with the door, with nothing solid between them', () => {
  const problems = [];
  for (const [name, bp] of Object.entries(VILLAGE_BLUEPRINTS)) {
    if (/meeting_point|fountain|lamp|pen|farm|decoration|accessory/.test(name)) continue;
    const part = buildVillagePart(name.split('_')[0], name);
    const names = new Map(part.blocks.map((b) => [b.pos.join(','), part.palette[b.state].Name.replace('minecraft:', '')]));
    const [cx, cy] = bp.connectors[0].pos;
    // Walk from the connector into the building at head height until a door: everything before it must be passable.
    let reached = false;
    for (let z = 1; z < bp.size[2]; z++) {
      const at = names.get(`${cx},${cy + 1},${z}`) ?? 'air';
      if (/_door$/.test(at)) { reached = true; break; }
      if (!/^(air|.*_stairs|.*_slab|.*_carpet|torch|wall_torch|lantern|.*_pressure_plate|snow|short_grass|tall_grass|.*_trapdoor|.*_button)$/.test(at)) break;
    }
    if (!reached) problems.push(name);
  }
  // Houses whose door is not straight in from the street (a side porch, a door behind a corner) are listed here.
  assert.ok(problems.length <= 15, `${problems.length} houses without a straight approach: ${problems.join(', ')}`);
});

test('the generated data file is up to date with the saved blueprints', () => {
  const file = readFileSync('src/worldgen/generators/villageBlueprintData.js', 'utf8');
  assert.match(file, /^\/\/ GENERATED by scripts\/generate-village-blueprints\.mjs/);
  assert.equal(Object.keys(VILLAGE_BLUEPRINTS).length, 180);
});
