// Sculk sensors as redstone components (Java Edition), driven by the redstone engine (redstone.js).
//
// Wiki (Sculk Sensor): "Sculk sensors detect vibrations in an 8 block spherical radius"; "a signal travels from the
// vibration source to the sensor at a speed of one block per game tick ... When the signal arrives, the sensor is
// activated for 30 game ticks. The sensor cannot detect any other vibrations while activated or while a signal is
// traveling to it"; "a cooldown period of 10 game ticks after being placed or after deactivating"; "redstone_strength
// = max(1, 15 - floor(15 / detection_range * distance))"; "Only the block below the sensor is strongly powered";
// "if the ray joining the cube centers of the sensor block and the vibration source passes through any wool blocks,
// the vibration is occluded"; "any adjacent block of amethyst re-emits a vibration of the same frequency"; while
// sneaking, a player's frequency 1-3 actions are not detected. A comparator reads the last vibration's frequency
// (Vibration). Calibrated sculk sensors listen 16 blocks out and stay active 10 game ticks.
// Before this, a sculk sensor was only a Warden alarm: it gave no redstone signal at all (Sculk redstone play-test).
import { BLOCKS as B, BLOCK_DEFS } from './blocks.js';

export const SCULK_SENSORS = new Set([B.SCULK_SENSOR, B.CALIBRATED_SCULK_SENSOR].filter((v) => v !== undefined));
// A redstone component that keeps its own block model (blockGeometry.js, mesher.js).
for (const id of SCULK_SENSORS) if (BLOCK_DEFS[id]) Object.assign(BLOCK_DEFS[id], { redstone: true, redstoneNativeModel: true });

/** Vibration frequencies (wiki, Vibration) for the events this game reports. */
export const VIBRATION = {
  step: 1, swim: 1, flap: 1, projectile_land: 2, hit_ground: 2, bounce: 2, splash: 2, item_interact_finish: 3,
  projectile_shoot: 3, instrument_play: 3, entity_action: 4, elytra_glide: 4, unequip: 4, entity_dismount: 5, equip: 5,
  entity_mount: 6, entity_interact: 6, shear: 6, entity_damage: 7, drink: 8, eat: 8, container_close: 9, block_close: 9,
  block_deactivate: 9, block_detach: 9, container_open: 10, block_open: 10, block_activate: 10, block_attach: 10,
  prime_fuse: 10, note_block_play: 10, block_change: 11, block_destroy: 12, fluid_pickup: 12, block_place: 13,
  fluid_place: 13, entity_place: 14, lightning_strike: 14, teleport: 14, entity_die: 15, explode: 15,
};

const TICKS = { range: 8, active: 30, cooldown: 10 };
const CALIBRATED = { range: 16, active: 10, cooldown: 10 };
const params = (id) => (id === B.CALIBRATED_SCULK_SENSOR ? CALIBRATED : TICKS);
/** Game ticks to the engine's redstone ticks (2 game ticks each), at least one. */
const rt = (gameTicks) => Math.max(1, Math.ceil(gameTicks / 2));

const OCCLUDERS = new Set(Object.entries(B).filter(([k]) => /_WOOL$|_CARPET$/.test(k) && k !== 'MOSS_CARPET' && k !== 'PALE_MOSS_CARPET').map(([, v]) => v));
export const isWool = (id) => OCCLUDERS.has(id);

/** Does wool lie on the ray between two block centres (the end blocks themselves excluded)? */
export function occluded(world, a, b) {
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 4);
  let last = '';
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = Math.floor(a[0] + 0.5 + (b[0] - a[0]) * t), y = Math.floor(a[1] + 0.5 + (b[1] - a[1]) * t), z = Math.floor(a[2] + 0.5 + (b[2] - a[2]) * t);
    const k = `${x},${y},${z}`; if (k === last) continue; last = k;
    if ((x === a[0] && y === a[1] && z === a[2]) || (x === b[0] && y === b[1] && z === b[2])) continue;
    if (OCCLUDERS.has(world.getVoxel(x, y, z))) return true;
  }
  return false;
}

/** Redstone strength for a vibration `distance` blocks from a sensor with this range. */
export const sensorStrength = (distance, range = 8) => Math.max(1, 15 - Math.floor((15 / range) * distance));

/** A sensor's state when it is placed: listening after its 10-tick cooldown. */
export function initSensor(engine, s) { s.cooldownUntil = engine.tickNumber + rt(TICKS.cooldown); s.output = 0; }

/**
 * A vibration at block (x, y, z): every sensor in range that is listening starts receiving it.
 * `frequency` is a number or a VIBRATION key; `sneaking` drops frequencies 1-3 from a sneaking player; `fromWool`
 * marks an event on or of wool (never detected).
 */
export function vibrate(engine, x, y, z, frequency, { sneaking = false, fromWool = false, resonance = false, except = null } = {}) {
  const f = typeof frequency === 'string' ? VIBRATION[frequency] : frequency;
  if (!f || fromWool || (sneaking && f <= 3)) return 0;
  const at = [Math.floor(x), Math.floor(y), Math.floor(z)];
  let heard = 0;
  for (const s of engine.states.values()) {
    if (!SCULK_SENSORS.has(s.id) || s === except) continue;
    const { range } = params(s.id);
    const distance = Math.hypot(s.p[0] - at[0], s.p[1] - at[1], s.p[2] - at[2]);
    if (distance > range) continue;
    if (s.arriveAt !== undefined || s.activeUntil !== undefined || (s.cooldownUntil ?? 0) > engine.tickNumber) continue;
    if (occluded(engine.world, s.p, at)) continue;
    s.arriveAt = engine.tickNumber + rt(Math.floor(distance));
    s.pendingPower = sensorStrength(distance, range); s.pendingFrequency = f; s.resonance = resonance;
    heard++;
  }
  return heard;
}

/** The engine's per-redstone-tick step for one sensor. */
export function tickSensor(engine, s) {
  if (s.arriveAt !== undefined && s.arriveAt <= engine.tickNumber) {
    delete s.arriveAt;
    s.output = s.pendingPower; s.frequency = s.pendingFrequency;
    s.activeUntil = engine.tickNumber + rt(params(s.id).active);
    // Amethyst next to it repeats what it heard.
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const q = [s.p[0] + dx, s.p[1] + dy, s.p[2] + dz];
      if (engine.world.getVoxel(...q) === B.AMETHYST_BLOCK) vibrate(engine, ...q, s.frequency, { resonance: true, except: s });
    }
  } else if (s.activeUntil !== undefined && s.activeUntil <= engine.tickNumber) {
    delete s.activeUntil; s.output = 0; s.cooldownUntil = engine.tickNumber + rt(params(s.id).cooldown);
  }
}

/** What a comparator reads from it: the frequency while active. */
export const sensorComparator = (s) => (s?.activeUntil !== undefined ? s.frequency ?? 0 : 0);
