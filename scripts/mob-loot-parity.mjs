// Mob drop parity as a permanent measurement, not a scratch probe.
//
// Compares this game's MOB_LOOT against vanilla's entity loot tables on three axes -- drop chance, stack
// count and the player-kill condition -- and reports the three separately, because a single "mob drops
// match" figure would hide which axis regressed.
//
// Run: node scripts/mob-loot-parity.mjs
import { readFileSync, existsSync } from 'node:fs';
import { MOB_LOOT, rollLoot } from '../src/mobLootData.js';

const CACHE = '.cache/mc-data/entityLoot.json';
export const LOOT_CACHE_PRESENT = existsSync(CACHE);

/** Vanilla drop entries for an entity, normalised to this game's vocabulary. */
export function vanillaEntries(entity) {
  const out = [];
  for (const d of entity.drops || []) {
    if (!d || typeof d !== 'object' || d.item === undefined) continue;
    const range = Array.isArray(d.stackSizeRange) ? d.stackSizeRange : null;
    out.push({
      item: String(d.item).replace(/^minecraft:/, ''),
      chance: typeof d.dropChance === 'number' ? d.dropChance : 1,
      min: range ? range[0] : 1,
      max: range ? range[1] : 1,
      playerKill: !!d.playerKill,
    });
  }
  return out;
}

/** This game's entry for one item on one mob, in the same shape as vanillaEntries. */
export function mineEntry(mob, item) {
  for (const [name, chance, count, flags] of MOB_LOOT[mob] || []) {
    if (String(name) !== item) continue;
    let min = 1, max = 1;
    if (typeof count === 'number') { min = count; max = count; }
    else if (typeof count === 'string' && count.includes('-')) {
      const [lo, hi] = count.split('-').map(Number);
      min = lo; max = hi;
    }
    return {
      chance: chance === undefined || chance === null ? 1 : chance,
      min, max,
      playerKill: flags === 'playerKill',
    };
  }
  return null;
}

/**
 * Compare every drop entry vanilla publishes for an entity this game also has.
 *
 * Note on the field order, because it cost a round: MOB_LOOT entries are
 * `[item, chance, count, flags]`. A first attempt read field 2 as a MINIMUM stack size and reported 36
 * mismatches, all of which were the chance field compared against itself. What exposed it was the
 * coincidence of two independent comparisons returning identically-sized lists with identically-matching
 * values.
 */
export function compareMobLoot() {
  if (!LOOT_CACHE_PRESENT) return null;
  const loot = JSON.parse(readFileSync(CACHE, 'utf8'));
  const result = { compared: 0, chanceDiff: [], countDiff: [], flagDiff: [], entities: 0 };
  for (const entity of loot) {
    const entries = vanillaEntries(entity);
    if (!entries.length) continue;
    result.entities++;
    for (const v of entries) {
      const mine = mineEntry(entity.entity, v.item);
      if (!mine) continue;
      result.compared++;
      if (Math.abs(mine.chance - v.chance) > 1e-6) {
        result.chanceDiff.push({ entity: entity.entity, item: v.item, vanilla: v.chance, mine: mine.chance });
      }
      if (mine.min !== v.min || mine.max !== v.max) {
        result.countDiff.push({ entity: entity.entity, item: v.item, vanilla: [v.min, v.max], mine: [mine.min, mine.max] });
      }
      if (mine.playerKill !== v.playerKill) {
        result.flagDiff.push({ entity: entity.entity, item: v.item, vanilla: v.playerKill, mine: mine.playerKill });
      }
    }
  }
  return result;
}

const invokedDirectly = process.argv[1]?.endsWith('mob-loot-parity.mjs');
if (invokedDirectly) {
  if (!LOOT_CACHE_PRESENT) {
    console.error('vanilla loot cache missing; run scripts/generate-mc-data.mjs first');
    process.exit(1);
  }
  const r = compareMobLoot();
  console.log('=== MOB DROP PARITY ===');
  console.log('vanilla entities with drops : ' + r.entities);
  console.log('drop entries compared       : ' + r.compared);
  console.log('drop-chance differences     : ' + r.chanceDiff.length);
  console.log('stack-count differences     : ' + r.countDiff.length);
  console.log('playerKill-flag differences : ' + r.flagDiff.length);
  for (const [label, list] of [['chance', r.chanceDiff], ['count', r.countDiff], ['flag', r.flagDiff]]) {
    if (!list.length) continue;
    console.log('\n=== ' + label + ' differs ===');
    for (const d of list.slice(0, 20)) {
      console.log('  ' + d.entity.padEnd(18) + d.item.padEnd(22)
        + 'vanilla ' + JSON.stringify(d.vanilla) + '   mine ' + JSON.stringify(d.mine));
    }
  }
  // A behavioural check, with a random that always passes the chance roll so the playerKill gate is the
  // only thing deciding the outcome. A fixed 0.5 would skip every rare drop in both cases and prove
  // nothing -- which is what the first version of this check did.
  const noKill = rollLoot('zombie', () => 0, { playerKill: false }).map(d => d.item);
  const withKill = rollLoot('zombie', () => 0, { playerKill: true }).map(d => d.item);
  console.log('\nbehavioural check on zombie, all chance rolls passing:');
  console.log('  without a player kill: ' + noKill.join(', '));
  console.log('  with a player kill   : ' + withKill.join(', '));
}
