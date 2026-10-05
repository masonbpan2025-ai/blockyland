// Drops that live in the game's own code rather than in the loot data the Inspector reads.
//
// `mobLootData.js` is the pinned vanilla item-loot dump, and it is not the whole story. Four of this game's
// drop rules are not in it: the breeze's rod, a baby turtle's scute when it grows up, the tipped arrows a
// stray, a bogged and a parched leave behind, and the wither's nether star -- that last one because boss
// drops are special-cased and the dump has no `wither` entry at all. So six items were reported as having
// no source while the game hands every one of them out.
//
// The first five are **derived by calling the helpers**, not listed by hand: each probe below invokes the
// same exported function the mob's death path invokes and reads the item ids out of what it returns. A
// helper that stops returning its item takes the entry with it, and a test asserts the derived list against
// the expected set, so this file cannot drift away from the code it describes.
//
// The nether star is the exception and is declared by hand: its row lives in a table literal inside
// `mobs.js`, which pulls in Three and cannot be imported to be probed. `tests/interactionSources.test.js`
// runs a real `MobManager.getMobDeathDrops` over a wither instead, which proves it end to end.
import { breezeDrops } from './breezeBehavior.js';
import { turtleMaturationDrops } from './turtleBehavior.js';
import { variantBonusDrops } from './undeadVariants.js';

/** Run a drop helper and return the item ids it produced, in order. */
const idsFrom = (rows) => (rows ?? []).map((row) => row[0]).filter((id) => typeof id === 'string');

/** The stalest random there is: always 0, so a 50% roll always succeeds and the drop is always revealed. */
const ALWAYS = () => 0;

/**
 * The items this game drops through per-mob code, derived by exercising that code.
 *
 * @returns {{item: string, how: string, source: string}[]}
 */
export function codeDropSources() {
  const entries = [];
  const add = (ids, how, source) => {
    for (const item of ids) entries.push({ item, how, source });
  };

  add(idsFrom(breezeDrops({ type: 'breeze', lootingLevel: 0 })), 'Dropped by a breeze.', 'breezeBehavior.js breezeDrops');
  add(
    idsFrom(turtleMaturationDrops({ type: 'turtle', isBaby: true }, { matured: true })),
    'Left behind by a baby turtle as it grows up.',
    'turtleBehavior.js turtleMaturationDrops',
  );
  // Each variant needs its own credit flag: the helper returns nothing without a player or wolf kill, which
  // is vanilla's rule and the reason the mob is given `playerDamaged` here.
  add(
    idsFrom(variantBonusDrops({ type: 'stray', playerDamaged: true }, ALWAYS)),
    'Dropped by a stray that a player or a tamed wolf killed.',
    'undeadVariants.js variantBonusDrops',
  );
  add(
    idsFrom(variantBonusDrops({ type: 'bogged', playerDamaged: true }, ALWAYS)),
    'Dropped by a bogged that a player or a tamed wolf killed.',
    'undeadVariants.js variantBonusDrops',
  );
  add(
    idsFrom(variantBonusDrops({ type: 'parched', playerDamaged: true }, ALWAYS)),
    'Dropped by a parched that a player or a tamed wolf killed.',
    'undeadVariants.js variantBonusDrops',
  );

  // Declared, not probed: see the note at the top of the file.
  entries.push({
    item: 'nether_star',
    how: 'Dropped by the wither.',
    source: 'mobs.js base drop table (wither)',
  });

  return entries;
}
