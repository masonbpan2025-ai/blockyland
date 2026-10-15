// How much durability an action costs, per the wiki's Durability page ("Tool & weapon durability"), Java Edition.
//
// Found by the wiki-tutorial play-test (Durability management: "Using a pickaxe, axe, shovel, or hoe to attack mobs
// consumes 2 durability points per hit"; "Using a sword to mine any block with non-zero hardness consumes 2"): the game
// charged 1 for every block broken, whatever the block or the tool, nothing at all for an attack, and 1 for every
// blocked hit on a shield.

const kind = (id) => {
  const s = String(id ?? '');
  if (/_(pickaxe|axe|shovel)$/.test(s)) return 'digger';
  if (/_hoe$/.test(s)) return 'hoe';
  if (/_sword$/.test(s) || s === 'mace') return 'sword';
  if (s === 'trident') return 'trident';
  if (s === 'shears') return 'shears';
  return 'other';
};

/**
 * Durability spent breaking a block. "Breaking a block that naturally breaks instantly counts as 0 uses": axes,
 * pickaxes, shovels and hoes 1 otherwise; swords, maces and tridents 2; shears 1 for any block but fire; fishing rods,
 * bows, flint and steel, brushes, shields and other items 0.
 */
export function blockBreakWear(itemId, hardness, { fire = false } = {}) {
  const instant = !(hardness > 0);
  switch (kind(itemId)) {
    case 'digger': case 'hoe': return instant ? 0 : 1;
    case 'sword': case 'trident': return instant ? 0 : 2;
    case 'shears': return fire ? 0 : 1;
    default: return 0;
  }
}

/** Durability spent hitting a mob: 2 for axes, pickaxes and shovels, 1 for a hoe (Java), a sword, mace or trident. */
export function attackWear(itemId) {
  switch (kind(itemId)) {
    case 'digger': return 2;
    case 'hoe': case 'sword': case 'trident': return 1;
    default: return 0;
  }
}

/** Shield: "When the shield blocks an attack dealing more than 3 HP, it takes damage equal to the strength of the
 * attack (rounded down) plus 1" -- and nothing for a weaker one. */
export function shieldWear(damage) {
  return damage > 3 ? Math.floor(damage) + 1 : 0;
}
