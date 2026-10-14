// The Minecraft Wiki names things by display name ("Oak Planks", "Slimeball"); this game by block id or item id.
// One resolver, shared by the recipe audit and by the recipes the game adopts from the wiki, so both read a name
// the same way. No crafting or furnace imports here: crafting.js imports this.
import { BLOCK_DEFS, ITEMS } from './blocks.js';

/** Normalised display name: case, punctuation and a trailing "(3:00)"-style qualifier ignored. */
export const normName = (s) => String(s ?? '').toLowerCase().replace(/\s*\([^)]*\)\s*$/, '').replace(/[^a-z0-9]+/g, '');

/**
 * Names the wiki and this game spell differently for the same thing (wiki -> game). Each is the same block or
 * item under another name, not a substitute.
 */
export const NAME_ALIASES = {
  slimeball: 'slime ball',
  clay: 'clay block',
  blockofredstone: 'redstone block',
  redstonecomparator: 'comparator',
  redstonerepeater: 'repeater',
  blockofresin: 'resin block',
  // The water lingering potion and the base lingering potions, which this game names with the form first.
  lingeringwaterbottle: 'lingering potion',
  awkwardlingeringpotion: 'lingering awkward potion',
  thicklingeringpotion: 'lingering thick potion',
  mundanelingeringpotion: 'lingering mundane potion',
};

let byName = null;
/** The crafting-grid cell for a wiki display name -- an item, or a block by id -- or null when the game has none. */
export function cellForName(name) {
  if (!byName) {
    byName = new Map();
    // Items first, so a name both tables use resolves to what the inventory holds: a block item is held as its
    // block, which is how crafting.js reads a slot too.
    for (const [id, def] of Object.entries(ITEMS)) {
      const key = normName(def?.name);
      if (!key || byName.has(key)) continue;
      byName.set(key, typeof def.blockId === 'number' && def.isBlock ? { id: def.blockId, isBlock: true } : { id, isBlock: false });
    }
    const blocks = Object.entries(BLOCK_DEFS).map(([id, def]) => [Number(id), def]).sort((a, b) => a[0] - b[0]);
    for (const [id, def] of blocks) {
      const key = normName(def?.name);
      if (key && !byName.has(key)) byName.set(key, { id, isBlock: true });
    }
    for (const id of Object.keys(ITEMS)) if (!byName.has(normName(id))) byName.set(normName(id), { id, isBlock: false });
  }
  const key = normName(name);
  return byName.get(key) ?? (NAME_ALIASES[key] ? byName.get(normName(NAME_ALIASES[key])) : null) ?? null;
}

/** A display name for a cell or recipe result. */
export function cellLabel(cell) {
  if (!cell) return 'nothing';
  return cell.isBlock ? (BLOCK_DEFS[cell.id]?.name ?? `block ${cell.id}`) : (ITEMS[cell.id]?.name ?? String(cell.id));
}
