// Eight ids that were two items for one vanilla item, and the two things that broke because of them.
//
// The Inspector's `shadows` report found six ids registered under a name vanilla does not use *while the
// vanilla id was also registered*: `wheat_seed`/`wheat_seeds`, `beetroot_seed`/`beetroot_seeds`,
// `melon_seed`/`melon_seeds`, `pumpkin_seed`/`pumpkin_seeds`, `slimeball`/`slime_ball`, `hay_bale`/`hay_block`.
// Two more were placeholders with no vanilla counterpart at all -- `seed` and `seeds`, both named "Wheat
// Seeds" with the wheat icon -- so a creative menu showed four of the same item.
//
// Two of the pairs were not cosmetic:
//
//   * `slime_ball` is what the loot table and five recipes use, while `FROG_BREEDING_FOOD`, the frog's
//     eating drop and the panda's sneeze drop all said `slimeball`. A frog could not eat the slimeball a
//     slime dropped, and they were different items in the inventory.
//   * `HORSE_FOODS` keyed its hay entry as `hay_bale`, and `horseFood` mapped `BLOCKS.HAY_BALE` -- which is
//     undefined, because the block is `HAY_BLOCK` -- so the mapping never fired and `HORSE_FOODS[578]` was
//     undefined. Feeding a horse a hay block did nothing, which is the best taming food in vanilla.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import { BREEDING_FOODS } from '../src/animalBehaviors.js';
import { PARROT_TAMING_FOODS } from '../src/parrotBehavior.js';
import { HORSE_FOODS, horseFood, canFeedHorse } from '../src/horseBehavior.js';
import { LLAMA_FOOD } from '../src/llamaBehavior.js';
import { FROG_BREEDING_FOOD, frogEatingDrops } from '../src/frogBehavior.js';
import { registry, resolveResource, shadowedVanillaIds } from '../src/resourceRegistry.js';

const GONE = [
  'wheat_seed', 'beetroot_seed', 'melon_seed', 'pumpkin_seed', 'slimeball', 'hay_bale', 'seed', 'seeds',
];

test('the duplicate ids are gone and the vanilla ones remain', () => {
  const reg = registry();
  for (const id of GONE) {
    assert.equal(ITEMS[id], undefined, `${id} should no longer be registered`);
    // `entries.has`, not `resolveResource`: the resolver also answers to a resource's display name, so
    // `slimeball` still resolves to `slime_ball` because that is what the survivor is called. What matters
    // is that nothing is *registered* under the removed id, which is what the game's own lookups use.
    assert.equal(reg.entries.has(id), false, `no entry may be keyed ${id}`);
  }
  for (const id of ['wheat_seeds', 'beetroot_seeds', 'melon_seeds', 'pumpkin_seeds', 'slime_ball', 'hay_block']) {
    assert.ok(ITEMS[id], `${id} is the vanilla id and must survive`);
    assert.ok(reg.entries.has(id), `${id} should be keyed in the registry`);
  }
  // One wheat-seed entry, not four: the display-name lookup is what makes `seed` ambiguous to a human too.
  const seeds = [...reg.entries.values()].filter((e) => e.name === 'Wheat Seeds');
  assert.equal(seeds.length, 1, `expected one Wheat Seeds entry, found ${seeds.length}`);
});

test('a slime gives the same slimeball a frog eats and breeds with', () => {
  // The two halves used to be different items.
  assert.equal(FROG_BREEDING_FOOD, 'slime_ball');
  const drops = frogEatingDrops({ type: 'frog', variant: 'temperate' }, { type: 'slime' });
  assert.deepEqual(drops, [['slime_ball', false, 1, 1]]);
  assert.ok(ITEMS.slime_ball, 'and the item exists');
  assert.ok(BREEDING_FOODS.frog.includes('slime_ball'), 'the shared breeding table agrees');
});

test('a horse can be fed a hay block', () => {
  // `BLOCKS.HAY_BALE` is undefined, so this comparison was never true for a block id and the hay entry in
  // HORSE_FOODS could not be reached at all.
  assert.equal(BLOCKS.HAY_BALE, undefined, 'the invented constant does not exist');
  assert.equal(typeof BLOCKS.HAY_BLOCK, 'number');
  assert.ok(HORSE_FOODS.hay_block, 'the table is keyed by the vanilla name');
  assert.equal(HORSE_FOODS.hay_bale, undefined);
  assert.deepEqual(horseFood(BLOCKS.HAY_BLOCK), HORSE_FOODS.hay_block);
  assert.deepEqual(horseFood('hay_block'), HORSE_FOODS.hay_block);
  const hungry = { type: 'horse', health: 5, maxHealth: 15 };
  assert.equal(canFeedHorse(hungry, BLOCKS.HAY_BLOCK), true, 'and a hungry horse accepts one');
});

test('a llama is fed by the vanilla hay block, once', () => {
  assert.ok(LLAMA_FOOD.hay_block, 'the vanilla key is there');
  assert.equal(LLAMA_FOOD.hay_bale, undefined, 'and the duplicate key is not');
});

test('no food table names an id that does not resolve', () => {
  // The class behind all of this: an id in a behaviour table that matches nothing. `torchflower_seed` and
  // `raw_fish` were two more, dead in the chicken list, the parrot list and the cat's taming check.
  const reg = registry();
  const bad = [];
  const visit = (label, value) => {
    if (typeof value === 'string') {
      // A block food is stored as its numeric id by some tables; only names are checked here.
      if (!resolveResource(value, reg)) bad.push(`${label} -> ${value}`);
      return;
    }
    if (Array.isArray(value)) value.forEach((v, i) => visit(`${label}[${i}]`, v));
  };
  for (const [mob, list] of Object.entries(BREEDING_FOODS)) visit(`BREEDING_FOODS.${mob}`, list);
  visit('PARROT_TAMING_FOODS', PARROT_TAMING_FOODS);
  for (const [key, value] of Object.entries(LLAMA_FOOD)) {
    if (!resolveResource(key, reg)) bad.push(`LLAMA_FOOD -> ${key}`);
    assert.ok(value && typeof value === 'object', `LLAMA_FOOD.${key} should describe a feeding`);
  }
  for (const key of Object.keys(HORSE_FOODS)) {
    if (!resolveResource(key, reg)) bad.push(`HORSE_FOODS -> ${key}`);
  }
  assert.deepEqual(bad, [], 'these behaviour tables name ids nothing answers to');
});

test('the shadowing report finds nothing in the real registry', (t) => {
  // Needs the pinned vanilla cache for the names to compare against; without it the report cannot run.
  let vanillaNames;
  try {
    const read = (f) => JSON.parse(readFileSync(`.cache/mc-data/${f}.json`, 'utf8'));
    vanillaNames = new Set([...read('items').map((i) => i.name), ...read('blocks').map((b) => b.name)]);
  } catch {
    t.skip('vanilla cache absent');
    return;
  }
  const found = shadowedVanillaIds(registry(), vanillaNames);
  assert.deepEqual(found, [], 'no id may shadow a vanilla spelling any more');
});
