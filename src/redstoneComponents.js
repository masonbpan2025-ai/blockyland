// Which blocks are buttons and pressure plates, and how each behaves, from their wiki pages (Java Edition).
// The systems parity audit (src/systemsWikiAudit.js) found that only the legacy Stone Button and generic Pressure
// Plate took part in redstone: the 13 wooden and blackstone buttons and the 16 named pressure plates were
// decoration. Importing this marks them as redstone components (their own models still draw them) and gives
// redstone.js the numbers.
//
// Button: "A stone button stays on for 20 ticks (1 second), while a wooden button stays on for 30 ticks".
// Pressure Plate: a wooden plate is pressed by any entity, a stone one by mobs and players; "the light weighted
// pressure plate ... signal strength equal to the number of entities, up to 15"; the heavy one "1 for every 10
// entities, up to 15"; a pressed plate is rechecked after "10 game ticks for weighted pressure plates and 20 game
// ticks for other pressure plates".
// The engine ticks once per redstone tick (2 game ticks), so the durations below are in redstone ticks.
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

const isStoneLike = (name) => /^(Stone|Polished Blackstone) /.test(name);

/** Button block id -> how long it stays pressed, in redstone ticks. */
export const BUTTON_HOLD = new Map();
/** Pressure plate block id -> 'wood' | 'stone' | 'light' | 'heavy'. */
export const PLATE_KIND = new Map();

for (const [key, def] of Object.entries(BLOCK_DEFS)) {
  const id = Number(key);
  if (!def?.name) continue;
  if (def.button || id === BLOCKS.STONE_BUTTON) BUTTON_HOLD.set(id, isStoneLike(def.name) ? 10 : 15);
  else if (def.pressurePlate || id === BLOCKS.PRESSURE_PLATE) {
    PLATE_KIND.set(id, /Light Weighted/.test(def.name) ? 'light' : /Heavy Weighted/.test(def.name) ? 'heavy'
      : isStoneLike(def.name) || id === BLOCKS.PRESSURE_PLATE ? 'stone' : 'wood');
  }
}
for (const id of [...BUTTON_HOLD.keys(), ...PLATE_KIND.keys()]) BLOCK_DEFS[id].redstone = true;

/** How many redstone ticks a released plate keeps its signal: 20 game ticks, or 10 for a weighted plate. */
export const plateReleaseTicks = (kind) => (kind === 'light' || kind === 'heavy' ? 5 : 10);

/**
 * The signal a plate gives with these entities on it. `entities` are {isPlayer, isMob, isItem} descriptions; a
 * stone plate ignores items, the wooden plate counts anything.
 */
export function plateSignal(kind, entities) {
  const counted = kind === 'stone' ? entities.filter((e) => e.isPlayer || e.isMob) : entities;
  const n = counted.length;
  if (!n) return 0;
  if (kind === 'light') return Math.min(15, n);
  if (kind === 'heavy') return Math.min(15, Math.ceil(n / 10));
  return 15;
}

/**
 * Redstone torch burn-out: "when it is forced to turn off more than eight times in 60 game ticks" it goes out,
 * and "ignores attempts to change its state until the number of state changes in the last 60 game ticks drops to
 * fewer than eight". 60 game ticks are 30 redstone ticks.
 */
export const TORCH_BURNOUT = Object.freeze({ windowTicks: 30, maxTurnOffs: 8 });

/** Signal strength a comparator reads from a container: floor(1 + (fullness / slots) * 14), or 0 when empty. */
export function containerSignal(items, slots, stackLimit) {
  const stacks = items.filter((i) => i && i.count > 0);
  if (!stacks.length) return 0;
  const fullness = stacks.reduce((sum, i) => sum + i.count / stackLimit(i.id), 0);
  return Math.floor(1 + (fullness / slots) * 14);
}


/**
 * Daylight detector power (Java). Wiki (Daylight Detector): the output "depends on the time of day, the weather, the
 * detector's exposure to the sky, and the internal sky light level", and "is updated once every second (specifically,
 * whenever gametime is perfectly divisible by 20)". Java's rule: the internal sky light (sky light minus the sky's
 * darkening); inverted, 15 minus that; otherwise scaled by the cosine of the sun angle, pulled 20% toward noon or
 * midnight. Clear weather gives 0 from 13,670 to 22,330. The detector was 15 x sin(time) before, so an inverted one
 * gave 15 at midnight where Java's gives 11.
 */
export function sunAngle(dayTime) {
  const d0 = (((dayTime / 24000 - 0.25) % 1) + 1) % 1;
  const d1 = 0.5 - Math.cos(d0 * Math.PI) / 2;
  return ((d0 * 2 + d1) / 3) * Math.PI * 2;
}
/** Java's sky darkening: (int)(11 x the night fraction from the sun angle, lessened by rain and thunder by 5/16 each). */
export function javaSkyDarken(dayTime, rain = 0, thunder = 0) {
  const f = sunAngle(dayTime);
  let f1 = 1 - (Math.cos(f) * 2 + 0.5);
  f1 = 1 - Math.max(0, Math.min(1, f1));
  f1 *= 1 - (rain * 5) / 16; f1 *= 1 - (thunder * 5) / 16;
  return Math.floor((1 - f1) * 11);
}
export function daylightDetectorPower({ skyLight = 15, skyDarken = null, dayTime = 6000, inverted = false, rain = 0, thunder = 0 } = {}) {
  let i = skyLight - (skyDarken ?? javaSkyDarken(dayTime, rain, thunder));
  if (inverted) i = 15 - i;
  else if (i > 0) {
    let f = sunAngle(dayTime);
    const toward = f < Math.PI ? 0 : Math.PI * 2;
    f += (toward - f) * 0.2;
    i = Math.round(i * Math.cos(f));
  }
  return Math.max(0, Math.min(15, i));
}
