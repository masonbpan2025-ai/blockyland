/**
 * Sheep colour rules, shared by the model, the interaction handlers and the tests.
 *
 * This lives outside `mobs.js` and `animalBehaviors.js` because both need it and
 * `mobs.js` already imports `animalBehaviors.js`. Keeping the colour tables here
 * means the wool block a sheep drops, the tint on its back and the colour a lamb
 * inherits all read from one definition.
 *
 * Reference: https://minecraft.wiki/w/Sheep
 */

/** The sixteen wool colours, in the wiki's data-value order (white = 0). */
export const SHEEP_COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'
];

/**
 * Tint applied to the wool layer. Java renders non-white wool 25% darker than the
 * matching dye; these are the full-strength dye colours, which is the same choice the
 * rest of the project makes for other tinted meshes.
 */
export const SHEEP_COLOR_HEX = {
  white: 0xe9ecef,
  orange: 0xf97316,
  magenta: 0xd946ef,
  light_blue: 0x38bdf8,
  yellow: 0xfacc15,
  lime: 0x84cc16,
  pink: 0xf472b6,
  gray: 0x4b5563,
  light_gray: 0x9ca3af,
  cyan: 0x06b6d4,
  purple: 0xa855f7,
  blue: 0x2563eb,
  brown: 0x78350f,
  green: 0x16a34a,
  red: 0xdc2626,
  black: 0x18181b
};

/**
 * Sheep breeding colour mixing, as the wiki's "Color mixing from sheep breeding" table.
 *
 * Only pairs that correspond to a real two-dye craft are listed; white acts as the
 * identity so `white + X` is `X`, which is why it needs no entries of its own. Pairs
 * that are absent cannot be combined, and a lamb of such parents takes one parent's
 * colour at random instead.
 */
const WOOL_MIXES = [
  ['gray', 'black', 'gray'],
  ['red', 'yellow', 'orange'],
  ['red', 'blue', 'purple'],
  ['red', 'white', 'pink'],
  ['yellow', 'green', 'lime'],
  ['blue', 'green', 'cyan'],
  ['blue', 'white', 'light_blue'],
  ['purple', 'pink', 'magenta'],
  ['gray', 'white', 'light_gray'],
  ['black', 'white', 'gray'],
  ['green', 'white', 'lime']
];

const MIX_TABLE = new Map();
for (const [a, b, result] of WOOL_MIXES) {
  MIX_TABLE.set(`${a}+${b}`, result);
  MIX_TABLE.set(`${b}+${a}`, result);
}

/** True when the two colours are a pair that two dye items could be crafted into. */
export function sheepColorsMix(a, b) {
  return MIX_TABLE.has(`${a}+${b}`);
}

/** The combined colour of two parents, or `null` when the pair cannot be combined. */
export function mixSheepColors(a, b) {
  return MIX_TABLE.get(`${a}+${b}`) ?? null;
}

/**
 * Resolve a lamb's colour from its parents.
 *
 * Wiki: if the parents' colours are compatible the lamb inherits the mixture, and
 * otherwise it takes one parent's colour chosen at random. `random` is injectable so
 * tests can pin the outcome instead of sampling it.
 */
export function inheritSheepColor(a, b, random = Math.random) {
  const mixed = mixSheepColors(a || 'white', b || 'white');
  if (mixed) return mixed;
  return random() < 0.5 ? (a || 'white') : (b || 'white');
}

/**
 * Paint a sheep's wool layer and show or hide it to match its sheared state.
 *
 * Every place that changes a sheep's colour or shears it routes through this one
 * function, so the mesh, the material tint and the `isSheared` flag cannot disagree.
 */
export function sheepApplyWool(mob) {
  const wool = mob?.woolMesh;
  if (!wool) return;
  wool.material?.color?.setHex(SHEEP_COLOR_HEX[mob.woolColor] ?? SHEEP_COLOR_HEX.white);
  wool.visible = !mob.isSheared;
}

/**
 * How many wool items a shearing yields.
 *
 * Wiki: 1–3, unaffected by Fortune or Looting.
 */
export function rollSheepWoolCount(random = Math.random) {
  return 1 + Math.floor(random() * 3);
}

/** True when the mob is a sheep whose wool layer is currently grown. */
export function sheepHasWool(mob) {
  return mob?.type === 'sheep' && !mob.isSheared;
}
