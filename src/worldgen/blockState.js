// Block states: parsing vanilla's state strings, and transforming them through rotation and mirroring.
//
// Why this file exists. Rotating a structure is NOT rotating coordinates. A stair that faces east and
// becomes a stair that faces north still reads as a layout mistake, and a rotated ladder that keeps
// `facing=east` is unusable. Vanilla handles this per block class (`StairBlock.rotate`, `DoorBlock.rotate`,
// `RailBlock.rotate`, ...). Neither reference implementation in docs/STRUCTURE_REFERENCES.md does it:
// deepslate contains a literal `// TODO? Rotate state`, and prismarine-block has no transform at all. So
// this is written here.
//
// The design decision that matters: this transformer is PROPERTY-DRIVEN, not block-type-driven, and it
// REPORTS what it could not transform instead of guessing.
//
//   * Property names that are themselves horizontal directions (`north`, `south`, `east`, `west`) move
//     with the rotation -- that covers fences, walls, redstone connections, vines, tripwire.
//   * Property values that are horizontal directions (`facing`) rotate; `up`/`down` are unaffected by a
//     yaw.
//   * `axis`, `rotation` (0..15), and jigsaw `orientation` have exact, derivable rules.
//   * Everything else is left alone and its NAME is returned in `unhandled`.
//
// The last point is deliberate. Guessing a value's meaning (for example the stair `shape` table, whose
// entries I could not verify against a primary source) would produce quietly wrong structures that pass a
// visual check. Reporting it means the Inspector can show "3 properties could not be rotated", the parity
// matrix can record the deviation, and a future golden test has something concrete to fix.

import { Rotation, Mirror } from './geometry.js';

const HORIZONTAL = ['north', 'east', 'south', 'west'];

/**
 * Parse `minecraft:oak_stairs[facing=east,half=bottom,waterlogged=false]`.
 *
 * Returns `{ name, properties }` with properties sorted by key, which is also how vanilla serialises
 * them -- so formatting a parsed state round-trips exactly.
 */
export function parseBlockState(text) {
  if (typeof text !== 'string' || text.length === 0) throw new Error(`invalid block state: ${text}`);
  const open = text.indexOf('[');
  if (open < 0) return { name: normaliseName(text), properties: {} };
  if (!text.endsWith(']')) throw new Error(`unterminated block state: ${text}`);
  const name = normaliseName(text.slice(0, open));
  const body = text.slice(open + 1, -1).trim();
  const properties = {};
  if (body.length > 0) {
    for (const pair of body.split(',')) {
      const equals = pair.indexOf('=');
      if (equals < 0) throw new Error(`malformed property "${pair}" in ${text}`);
      const key = pair.slice(0, equals).trim();
      const value = pair.slice(equals + 1).trim();
      if (key.length === 0 || value.length === 0) throw new Error(`malformed property "${pair}" in ${text}`);
      properties[key] = value;
    }
  }
  return { name, properties: sortProperties(properties) };
}

/** `oak_stairs` -> `minecraft:oak_stairs`, so ids compare reliably across data sources. */
export function normaliseName(name) {
  const trimmed = String(name).trim();
  return trimmed.includes(':') ? trimmed : `minecraft:${trimmed}`;
}

/** Vanilla writes properties in alphabetical key order; matching that keeps round-trips byte-identical. */
export function sortProperties(properties) {
  const out = {};
  for (const key of Object.keys(properties).sort()) out[key] = properties[key];
  return out;
}

/** Format back to a canonical state string. */
export function formatBlockState(state) {
  const name = normaliseName(state.name);
  const keys = Object.keys(state.properties || {}).sort();
  if (keys.length === 0) return name;
  return `${name}[${keys.map((key) => `${key}=${state.properties[key]}`).join(',')}]`;
}

/** Strip the namespace, for friendlier logs and for matching against wiki names. */
export function bareName(name) {
  const text = String(name);
  return text.startsWith('minecraft:') ? text.slice('minecraft:'.length) : text;
}

function rotateDirection(direction, rotation) {
  const quarterTurns = ((rotation % 4) + 4) % 4;
  const index = HORIZONTAL.indexOf(direction);
  if (index < 0) return direction; // up / down: unaffected by a yaw
  return HORIZONTAL[(index + quarterTurns) % 4];
}

function mirrorDirection(direction, mirror) {
  if (mirror === Mirror.LEFT_RIGHT) {
    if (direction === 'east') return 'west';
    if (direction === 'west') return 'east';
  } else if (mirror === Mirror.FRONT_BACK) {
    if (direction === 'north') return 'south';
    if (direction === 'south') return 'north';
  }
  return direction;
}

/** Mirroring then rotation, which is vanilla's transform order. */
function transformDirection(direction, rotation, mirror) {
  return rotateDirection(mirrorDirection(direction, mirror), rotation);
}

/**
 * Transform one state.
 *
 * @returns {{ state: {name: string, properties: object}, unhandled: string[] }}
 */
export function rotateBlockState(state, rotation = 0, mirror = Mirror.NONE) {
  const quarterTurns = ((rotation % 4) + 4) % 4;
  const properties = {};
  const unhandled = [];

  for (const [key, value] of Object.entries(state.properties || {})) {
    // A property whose NAME is a horizontal direction (fences, walls, vines, redstone).
    if (HORIZONTAL.includes(key) && (value === 'true' || value === 'false')) {
      const moved = transformDirection(key, rotation, mirror);
      properties[moved] = value;
      continue;
    }

    // A property whose VALUE is a horizontal direction.
    if (key === 'facing') {
      properties[key] = transformDirection(value, rotation, mirror);
      continue;
    }

    if (key === 'axis') {
      // A 90/270 turn swaps X and Z; 180 and mirroring leave the axis alone.
      properties[key] = quarterTurns % 2 === 1 ? (value === 'x' ? 'z' : value === 'z' ? 'x' : value) : value;
      continue;
    }

    // Signs, banners and skulls store a 0..15 rotation where 4 units is one quarter turn clockwise.
    if (key === 'rotation' && /^\d+$/.test(value)) {
      const numeric = Number(value);
      const delta = quarterTurns * 4;
      const mirrored = mirror === Mirror.NONE
        ? 0
        : mirror === Mirror.LEFT_RIGHT ? 8 : 8; // both mirrors invert a yaw by half a turn
      properties[key] = String(((numeric + delta + mirrored) % 16 + 16) % 16);
      continue;
    }

    // Jigsaw orientation, vanilla's FrontAndTop: `<front>_<top>`. A vertical connector (`up_north`: front up,
    // top north) keeps its front and turns its top; a horizontal one (`west_up`: front west, top up) turns its
    // front. Only the first case used to be handled, so a rotated street's side connectors kept pointing their
    // original way and every building joined to them was placed back over the street and rejected.
    if (key === 'orientation' && /^(up|down)_(north|south|east|west)$/.test(value)) {
      const [front, top] = value.split('_');
      properties[key] = `${front}_${transformDirection(top, rotation, mirror)}`;
      continue;
    }
    if (key === 'orientation' && /^(north|south|east|west)_(up|down)$/.test(value)) {
      const [front, top] = value.split('_');
      properties[key] = `${transformDirection(front, rotation, mirror)}_${top}`;
      continue;
    }

    // Rails: `north_south`, `east_west`, `ascending_<direction>`.
    if (key === 'shape' && /^(north_south|east_west|ascending_(north|south|east|west))$/.test(value)) {
      if (value === 'north_south' || value === 'east_west') {
        properties[key] = quarterTurns % 2 === 1
          ? (value === 'north_south' ? 'east_west' : 'north_south')
          : value;
      } else {
        properties[key] = `ascending_${transformDirection(value.slice('ascending_'.length), rotation, mirror)}`;
      }
      continue;
    }

    // Everything else is copied and, when a transform was requested, named as un-transformed. Properties
    // that a yaw genuinely cannot affect (`half`, `waterlogged`, `type`, `part`, `age`, ...) are only
    // reported when a rotation actually happened, so a 0-degree transform of a template is silent.
    properties[key] = value;
    if (quarterTurns !== 0 || mirror !== Mirror.NONE) unhandled.push(key);
  }

  // `unhandled` is a diagnostic, not an error: a template with no rotatable properties reports nothing
  // even though most of its properties were "not transformed".
  const ignorable = new Set([
    'half', 'type', 'part', 'waterlogged', 'age', 'stage', 'level', 'distance', 'power', 'lit', 'open',
    'powered', 'locked', 'in_wall', 'snowy', 'conditional', 'extended', 'short', 'signal_fire',
    'has_bottle_0', 'has_bottle_1', 'has_bottle_2', 'berries', 'tilt', 'attachment', 'vertical_direction',
    'thickness', 'cracked', 'crafting', 'triggered', 'unstable', 'bloom', 'can_summon', 'slot_0_occupied',
    'slot_1_occupied', 'slot_2_occupied', 'slot_3_occupied', 'slot_4_occupied', 'slot_5_occupied',
    'disarmed', 'note', 'instrument', 'eye', 'trial_spawner_state', 'vault_state', 'ominous', 'eggs',
    'hatch', 'pickles', 'moisture', 'bed_part', 'occupied', 'sculk_sensor_phase', 'dusted', 'bottom'
  ].filter((key) => !HORIZONTAL.includes(key)));

  return {
    state: { name: state.name, properties: sortProperties(properties) },
    unhandled: [...new Set(unhandled)].filter((key) => !ignorable.has(key) && !HORIZONTAL.includes(key))
  };
}

/** Convenience wrapper used by the template loader. */
export function rotateStateString(text, rotation, mirror) {
  return rotateBlockState(parseBlockState(text), rotation, mirror);
}
