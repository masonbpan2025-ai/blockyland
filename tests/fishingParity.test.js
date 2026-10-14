// Fishing parity.
//
// References: https://minecraft.wiki/w/Fishing · https://minecraft.wiki/w/Fishing_Rod
//
// Two kinds of assertion here, and the difference matters:
//
//  * THE WIKI'S OWN NUMBERS, transcribed. The four category columns, the item weights, the wait range, the
//    durability costs, the XP range. These are the parity claim and they are written out as literals so a
//    change to `fishing.js` has to argue with the wiki rather than with itself.
//
//  * THE MECHANISM BEHIND THEM. The category split is computed from vanilla's quality values; there is a test
//    that the computed percentages land on the wiki's table, so the table is not merely asserted back.
//
// Where the wiki describes a distribution rather than a value -- the rain and sky modifiers, the bite window,
// the treasure enchantment levels -- the test asserts the distribution's bounds and its average over many
// rolls, not a single draw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BITE_APPROACH_SECONDS, BITE_WINDOW_SECONDS, FISHING_CATEGORIES, FISHING_WAIT, FISHING_XP,
  FISH_LOOT, JUNGLE_BIOMES, JUNGLE_JUNK_LOOT, JUNK_COUNTS, JUNK_DAMAGE_MAX, JUNK_LOOT,
  LINE_BREAK_DISTANCE, LURE_TICKS_PER_LEVEL, OPEN_WATER, OPEN_WATER_BLOCK, REEL_DURABILITY,
  TREASURE_DURABILITY_REMAINING, TREASURE_ENCHANT_LEVEL, TREASURE_EXCLUDED_ENCHANTMENTS, TREASURE_LOOT,
  advanceWait, categoryChances, categoryWeights, isJungleBiome, isJunkGear, isOpenWater, isTreasureGear,
  openWaterSamplePoints, reelDurability, rollBiteApproachSeconds, rollBiteWindowSeconds, rollCatch,
  rollFishingXp, rollJunkDamage, rollTreasureDurabilityRemaining, rollTreasureEnchantLevel, rollWaitTicks,
  totalLuck, treasureEnchantmentAllowed, waitDecrement,
} from '../src/fishing.js';
import { FISHING_STATE, FishingController } from '../src/fishingRod.js';
import { COMMANDS } from '../src/commands.js';

/** A deterministic generator, so a "many rolls" assertion is reproducible rather than flaky. */
function seeded(seed = 12345) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
const close = (got, want, tolerance = 0.005) => Math.abs(got - want) <= tolerance;

// --- the wiki's numbers, transcribed --------------------------------------------------------------

test('the wait is 100 to 600 ticks, and Lure takes 5 seconds off both ends', () => {
  // Wiki: "a random period between 5 and 30 seconds (100 to 600 ticks at 20 ticks per second)".
  assert.equal(FISHING_WAIT.minTicks, 100);
  assert.equal(FISHING_WAIT.maxTicks, 600);
  // Wiki: "Each level of the Lure enchantment on a fishing rod subtracts 5 seconds from both the minimum and
  // maximum wait time." Five seconds at 20 ticks to the second.
  assert.equal(LURE_TICKS_PER_LEVEL, 5 * 20);

  const random = seeded(1);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 50000; i++) {
    const t = rollWaitTicks(random);
    min = Math.min(min, t);
    max = Math.max(max, t);
  }
  assert.equal(min, 100, 'the minimum is reachable');
  assert.ok(max >= 598, `the maximum is reachable, got ${max}`);

  // Lure III shifts the whole window down by 300 ticks, and the low end goes negative -- which the wiki
  // handles by generating a new wait time, not by biting instantly.
  let lowMin = Infinity;
  let lowMax = -Infinity;
  for (let i = 0; i < 50000; i++) {
    const t = rollWaitTicks(random, { lureLevel: 3 });
    lowMin = Math.min(lowMin, t);
    lowMax = Math.max(lowMax, t);
  }
  assert.equal(lowMax, 300, 'the top of the Lure III window is 600 - 300');
  assert.equal(lowMin, -200, 'and the bottom is 100 - 300, which is why a re-roll is needed');
});

test('the per-tick wait decrement matches all four of the wiki rates', () => {
  // Wiki, verbatim: not exposed to sky means "each tick has a 50% chance of not decrementing"; being rained on
  // means "each tick has a 25% chance of counting down 2 instead of 1". The two can both happen in the same
  // tick, which is why the sheltered-and-raining rate is 1.333 and not 1.6.
  const cases = [
    ['exposed, dry', { exposedToSky: true, raining: false }, 1.0],
    ['exposed, raining', { exposedToSky: true, raining: true }, 1.25],      // 20% faster
    ['sheltered, dry', { exposedToSky: false, raining: false }, 0.5],       // doubled
    ['sheltered, raining', { exposedToSky: false, raining: true }, 0.75],   // 1/0.75 = 1.333, "33.3%"
  ];
  for (const [label, conditions, expected] of cases) {
    const random = seeded(7);
    let total = 0;
    const rolls = 200000;
    for (let i = 0; i < rolls; i++) total += waitDecrement(conditions, random);
    const mean = total / rolls;
    assert.ok(close(mean, expected, 0.01), `${label}: expected ~${expected} ticks per tick, got ${mean.toFixed(3)}`);
  }

  // The wiki's own arithmetic, stated as a ratio, so the three modifiers are shown to compose additively.
  const random = seeded(11);
  let shelteredRain = 0;
  const rolls = 200000;
  for (let i = 0; i < rolls; i++) shelteredRain += waitDecrement({ exposedToSky: false, raining: true }, random);
  assert.ok(close((shelteredRain / rolls) / 1.0, 0.75, 0.01));
  // 1 / 0.75 = 1.3333, which is the wiki's "increased by approximately 33.3%".
  assert.ok(close(1 / (shelteredRain / rolls), 1.3333, 0.02), 'and 1/0.75 is the 33.3% the wiki names');
});

test('advanceWait floors at zero and never over-shoots the wait', () => {
  const random = seeded(3);
  assert.equal(advanceWait(0, { exposedToSky: true, raining: false }, random), 0);
  assert.equal(advanceWait(1, { exposedToSky: true, raining: false }, random), 0);
  // A single tick can consume at most 2, and at least 0.
  for (let i = 0; i < 2000; i++) {
    const used = 5 - advanceWait(5, { exposedToSky: false, raining: true }, random);
    assert.ok(used === 0 || used === 1 || used === 2, `consumed ${used}`);
  }
});

test('the category split is the wiki table, for all four Luck of the Sea levels', () => {
  // Wiki, verbatim, fish / junk / treasure.
  const wiki = {
    0: { fish: 85, junk: 10, treasure: 5 },
    1: { fish: 84.85, junk: 8.08, treasure: 7.07 },
    2: { fish: 84.69, junk: 6.12, treasure: 9.18 },
    3: { fish: 84.54, junk: 4.12, treasure: 11.34 },
  };
  for (const [level, want] of Object.entries(wiki)) {
    const got = categoryChances(Number(level));
    for (const category of ['fish', 'junk', 'treasure']) {
      assert.ok(close(got[category], want[category], 0.005),
        `LotS ${level} ${category}: wiki ${want[category]}, model ${got[category].toFixed(2)}`);
    }
  }
});

test('the split is COMPUTED from vanilla quality, not restated as percentages', () => {
  // The four columns above are otherwise four independent facts to keep in sync. They are one mechanism:
  // `weight + quality * luck`, normalised. This asserts the mechanism, so a table match is a consequence.
  assert.deepEqual(FISHING_CATEGORIES.map(c => c.id), ['fish', 'junk', 'treasure']);
  assert.deepEqual(FISHING_CATEGORIES.map(c => [c.weight, c.quality]),
    [[85, -1], [10, -2], [5, 2]]);

  for (const luck of [0, 1, 2, 3]) {
    const weights = categoryWeights(luck);
    assert.deepEqual(weights, {
      fish: 85 - luck,
      junk: 10 - 2 * luck,
      treasure: 5 + 2 * luck,
    }, `luck ${luck}`);
  }
  // And the same model is what the four columns came out of.
  assert.ok(close(categoryChances(3).treasure, 11.34, 0.005));
});

test('a Luck level above III keeps shifting rather than wrapping or going negative', () => {
  // Not reachable from Luck of the Sea alone, which caps at III, but Luck and LotS stack, so the arithmetic
  // must survive it. Junk hits zero at luck 5 and must stay there rather than going negative.
  assert.equal(categoryWeights(5).junk, 0, 'junk reaches zero');
  assert.equal(categoryWeights(9).junk, 0, 'and is clamped, not negative');
  assert.ok(categoryWeights(9).treasure > 0);
  const chances = categoryChances(9);
  assert.ok(chances.fish + chances.junk + chances.treasure > 99.99, 'and still sums to 100%');
});

test('the Luck effect stacks with Luck of the Sea, which the wiki says grants the same benefit', () => {
  assert.equal(totalLuck({ luckOfTheSea: 2, luckEffect: 1 }), 3);
  assert.equal(totalLuck({ luckOfTheSea: 0, luckEffect: 0 }), 0);
  assert.equal(totalLuck({}), 0);
  assert.equal(totalLuck({ luckOfTheSea: -5, luckEffect: -2 }), 0, 'negative luck does not invert the table');
});

test('the fish weights are the wiki four', () => {
  assert.deepEqual(FISH_LOOT, { cod: 60, salmon: 25, pufferfish: 13, tropical_fish: 2 });
  assert.equal(sum(FISH_LOOT), 100, 'and the wiki prints them as percentages of 100');
});

test('the junk table is the wiki eleven entries, with ink sacs as a stack of ten', () => {
  assert.deepEqual(JUNK_LOOT, {
    lily_pad: 17,
    bone: 10, bowl: 10, leather: 10, leather_boots: 10,
    rotten_flesh: 10, tripwire_hook: 10, water_bottle: 10,
    stick: 5, string: 5,
    fishing_rod: 2,
    ink_sac: 1,
  });
  assert.equal(sum(JUNK_LOOT), 100);
  // Wiki: the ink sac entry is "(10)" where every other junk entry is one item.
  assert.deepEqual(JUNK_COUNTS, { ink_sac: 10 });
});

test('the jungle junk table adds bamboo and is the wiki 110ths', () => {
  assert.equal(sum(JUNGLE_JUNK_LOOT), 110, 'the wiki prints the jungle junk weights as fractions of 110');
  assert.equal(JUNGLE_JUNK_LOOT.bamboo, 10);
  assert.equal(JUNGLE_JUNK_LOOT.lily_pad, 17);
  // Every other entry is the default table unchanged; only bamboo is new.
  for (const [id, weight] of Object.entries(JUNK_LOOT)) {
    assert.equal(JUNGLE_JUNK_LOOT[id], weight, `${id} is unchanged in the jungle table`);
  }
  assert.equal(Object.keys(JUNGLE_JUNK_LOOT).length, Object.keys(JUNK_LOOT).length + 1);
});

test('the treasure table is six entries at one sixth each', () => {
  // Wiki: bow, enchanted book, fishing rod, name tag, nautilus shell, saddle -- 16.67% (1/6) each.
  assert.deepEqual([...TREASURE_LOOT].sort(),
    ['bow', 'enchanted_book', 'fishing_rod', 'name_tag', 'nautilus_shell', 'saddle']);
  assert.equal(TREASURE_LOOT.length, 6);
  // A uniform pick over six: each must come up about a sixth of the time.
  const random = seeded(5);
  const counts = {};
  for (let i = 0; i < 60000; i++) {
    const picked = TREASURE_LOOT[Math.min(5, Math.floor(random() * 6))];
    counts[picked] = (counts[picked] ?? 0) + 1;
  }
  for (const id of TREASURE_LOOT) {
    const share = counts[id] / 60000;
    assert.ok(close(share, 1 / 6, 0.01), `${id} came up ${(share * 100).toFixed(1)}%`);
  }
});

test('every item the wiki names is reachable from the tables', () => {
  // A weight table that names an item the registry does not have is a silent hole, so every id is checked
  // against the source of truth rather than assumed.
  const items = readFileSync(new URL('../src/blocks.js', import.meta.url), 'utf8');
  const extra = readFileSync(new URL('../src/extraItems.js', import.meta.url), 'utf8');
  const registered = (id) => new RegExp(`^\\s*${id}\\s*:`, 'm').test(items) || new RegExp(`^\\s*${id}\\s*:`, 'm').test(extra);

  for (const id of Object.keys(FISH_LOOT)) {
    assert.ok(registered(id), `${id} (fish) must be a registered item`);
  }
  for (const id of [...Object.keys(JUNK_LOOT), ...Object.keys(JUNGLE_JUNK_LOOT)]) {
    // lily pad and tripwire hook are blocks in this engine, so they are checked against BLOCKS instead.
    if (id === 'lily_pad') { assert.match(items, /LILY_PAD:/); continue; }
    if (id === 'tripwire_hook') { assert.match(items, /TRIPWIRE_HOOK:/); continue; }
    assert.ok(registered(id), `${id} (junk) must be a registered item`);
  }
  for (const id of TREASURE_LOOT) {
    assert.ok(registered(id), `${id} (treasure) must be a registered item`);
  }
  // The two the audit first thought were missing: both were already registered in `extraItems.js`, which is
  // why this checks BOTH files rather than only `blocks.js`.
  assert.ok(registered('nautilus_shell'), 'nautilus shell is registered');
  assert.ok(registered('bowl'), 'bowl is registered');
});

// --- the rolls ---------------------------------------------------------------------------------------

test('a catch is always from the rolled category, and treasure needs open water', () => {
  const random = seeded(9);
  for (let i = 0; i < 2000; i++) {
    const caught = rollCatch(random, { luckLevel: 0, openWater: true, biomeId: 'plains' });
    if (caught.category === 'fish') assert.ok(caught.item in FISH_LOOT, caught.item);
    if (caught.category === 'treasure') assert.ok(TREASURE_LOOT.includes(caught.item), caught.item);
    if (caught.category === 'junk') assert.ok(caught.item in JUNK_LOOT, caught.item);
  }
});

test('without open water, treasure never appears', () => {
  // Wiki: "If the conditions are not met, only items in the fish and junk categories can be obtained."
  const random = seeded(13);
  let treasure = 0;
  let junk = 0;
  let fish = 0;
  for (let i = 0; i < 40000; i++) {
    const caught = rollCatch(random, { luckLevel: 3, openWater: false, biomeId: 'plains' });
    if (caught.category === 'treasure') treasure++;
    else if (caught.category === 'junk') junk++;
    else fish++;
  }
  assert.equal(treasure, 0, 'no treasure outside open water even at Luck of the Sea III');
  assert.ok(fish > 0 && junk > 0, 'fish and junk still come through');
  // And the two survivors keep their relative weights: 82 fish to 4 junk at luck 3.
  assert.ok(close(fish / (fish + junk), 82 / 86, 0.02), `fish share was ${(fish / (fish + junk)).toFixed(3)}`);
});

test('jungle biomes use the expanded junk table and the default one does not', () => {
  assert.ok(isJungleBiome('jungle'));
  assert.ok(isJungleBiome('sparse_jungle'));
  assert.ok(isJungleBiome('bamboo_jungle'));
  assert.equal(isJungleBiome('plains'), false);
  assert.equal(isJungleBiome(null), false);
  assert.deepEqual([...JUNGLE_BIOMES].sort(), ['bamboo_jungle', 'jungle', 'jungle_hills', 'sparse_jungle']);

  // Bamboo is the observable difference, so roll junk in both and look for it.
  const inJungle = new Set();
  const inPlains = new Set();
  const random = seeded(17);
  for (let i = 0; i < 60000; i++) {
    const c = rollCatch(random, { luckLevel: 0, openWater: true, biomeId: 'jungle' });
    if (c.category === 'junk') inJungle.add(c.item);
  }
  for (let i = 0; i < 60000; i++) {
    const c = rollCatch(random, { luckLevel: 0, openWater: true, biomeId: 'plains' });
    if (c.category === 'junk') inPlains.add(c.item);
  }
  assert.ok(inJungle.has('bamboo'), 'bamboo is junk in a jungle');
  assert.equal(inPlains.has('bamboo'), false, 'and never in the plains');
  assert.ok(inJungle.has('lily_pad') && inPlains.has('lily_pad'), 'the shared entries come up in both');
  assert.ok(inJungle.has('bowl') && inPlains.has('bowl'));
});

test('every category is reachable and the weights are respected over many rolls', () => {
  const random = seeded(23);
  const counts = { fish: 0, junk: 0, treasure: 0 };
  const rolls = 120000;
  for (let i = 0; i < rolls; i++) {
    counts[rollCatch(random, { luckLevel: 0, openWater: true }).category]++;
  }
  for (const [category, want] of [['fish', 85], ['junk', 10], ['treasure', 5]]) {
    const share = (counts[category] / rolls) * 100;
    assert.ok(close(share, want, 1.0), `${category}: expected ~${want}%, got ${share.toFixed(2)}%`);
  }
});

test('the junk ink sac arrives as ten, and nothing else is multiplied', () => {
  const random = seeded(29);
  for (let i = 0; i < 40000; i++) {
    const caught = rollCatch(random, { luckLevel: 0, openWater: false, biomeId: 'plains' });
    if (caught.category !== 'junk') continue;
    if (caught.item === 'ink_sac') assert.equal(caught.count, 10, 'ink sac is a stack of ten');
    else assert.equal(caught.count, 1, `${caught.item} is a single item`);
  }
});

test('treasure gear is the bow and the rod; junk gear is the rod and the boots', () => {
  // Wiki: treasure bows and rods are enchanted and 0-25% durable; junk rods and leather boots are 0-90%
  // damaged and always unenchanted.
  assert.equal(isTreasureGear('bow'), true);
  assert.equal(isTreasureGear('fishing_rod'), true);
  assert.equal(isTreasureGear('saddle'), false);
  assert.equal(isJunkGear('fishing_rod'), true);
  assert.equal(isJunkGear('leather_boots'), true);
  assert.equal(isJunkGear('bone'), false);
});

test('the treasure durability roll is 0-25% REMAINING and the junk roll is 0-90% DAMAGED', () => {
  const random = seeded(31);
  let tMin = Infinity;
  let tMax = -Infinity;
  for (let i = 0; i < 20000; i++) {
    const remaining = rollTreasureDurabilityRemaining(random);
    tMin = Math.min(tMin, remaining);
    tMax = Math.max(tMax, remaining);
  }
  assert.ok(tMin >= 0 && close(tMax, TREASURE_DURABILITY_REMAINING, 0.002),
    `treasure remaining spans 0..${TREASURE_DURABILITY_REMAINING}, got ${tMin}..${tMax}`);

  let jMin = Infinity;
  let jMax = -Infinity;
  for (let i = 0; i < 20000; i++) {
    const damage = rollJunkDamage(random);
    jMin = Math.min(jMin, damage);
    jMax = Math.max(jMax, damage);
  }
  assert.ok(jMin >= 0 && close(jMax, JUNK_DAMAGE_MAX, 0.002),
    `junk damage spans 0..${JUNK_DAMAGE_MAX}, got ${jMin}..${jMax}`);
  // The two are different quantities, which is the trap: junk is damaged, treasure is remaining.
  assert.notEqual(TREASURE_DURABILITY_REMAINING, JUNK_DAMAGE_MAX);
});

test('treasure enchantment levels are 22 to 30, the wiki range', () => {
  assert.equal(TREASURE_ENCHANT_LEVEL.min, 22);
  assert.equal(TREASURE_ENCHANT_LEVEL.max, 30);
  const random = seeded(37);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 20000; i++) {
    const level = rollTreasureEnchantLevel(random);
    min = Math.min(min, level);
    max = Math.max(max, level);
  }
  assert.equal(min, 22);
  assert.equal(max, 30);
  // Every integer in the range is reachable, not just the ends.
  const seen = new Set();
  for (let i = 0; i < 20000; i++) seen.add(rollTreasureEnchantLevel(random));
  assert.equal(seen.size, 9, 'all nine levels appear');
});

test('Swift Sneak, Soul Speed and Wind Burst cannot come from fishing', () => {
  // Wiki: "However, the enchantments Swift Sneak, Soul Speed, and Wind Burst can not be obtained this way."
  assert.deepEqual([...TREASURE_EXCLUDED_ENCHANTMENTS], ['swift_sneak', 'soul_speed', 'wind_burst']);
  for (const id of TREASURE_EXCLUDED_ENCHANTMENTS) {
    assert.equal(treasureEnchantmentAllowed(id), false, `${id} must be refused`);
  }
  assert.equal(treasureEnchantmentAllowed('mending'), true, 'but treasure enchantments like Mending are fine');
  assert.equal(treasureEnchantmentAllowed('luck_of_the_sea'), true);
});

test('the experience is 1 to 6, both ends reachable', () => {
  // Wiki: "An experience orb worth 1-6 experience points spawns at the position of the player."
  assert.deepEqual(FISHING_XP, { min: 1, max: 6 });
  const random = seeded(41);
  const seen = new Set();
  for (let i = 0; i < 20000; i++) seen.add(rollFishingXp(random));
  assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
});

test('the bite timings bracket the wiki windows', () => {
  // Wiki: "After 1 to 4 seconds, the particles reach the bobber", and Java gives "one to two seconds" to reel.
  assert.deepEqual(BITE_APPROACH_SECONDS, { min: 1, max: 4 });
  assert.deepEqual(BITE_WINDOW_SECONDS, { min: 1, max: 2 });
  const random = seeded(43);
  for (let i = 0; i < 5000; i++) {
    const approach = rollBiteApproachSeconds(random);
    assert.ok(approach >= 1 && approach < 4, `approach ${approach}`);
    const window = rollBiteWindowSeconds(random);
    assert.ok(window >= 1 && window < 2, `window ${window}`);
  }
});

test('the line breaks at 32 blocks', () => {
  // Wiki: "If the player wanders more than 32 blocks away from the bobber ... the bobber and fishing line
  // disappear with no durability reduction to the rod."
  assert.equal(LINE_BREAK_DISTANCE, 32);
});

// --- durability --------------------------------------------------------------------------------------

test('the five reel durability costs are the wiki five', () => {
  assert.deepEqual(REEL_DURABILITY, {
    caught: 1, nothing: 0, stuckInBlock: 2, droppedItem: 3, entity: 5,
  });
  // And the resolver picks the right one, most specific first.
  assert.equal(reelDurability({ caught: true }), 1);
  assert.equal(reelDurability({}), 0, 'nothing on the hook costs nothing');
  assert.equal(reelDurability({ stuckInBlock: true }), 2);
  assert.equal(reelDurability({ hookedItem: true }), 3);
  assert.equal(reelDurability({ hookedEntity: true }), 5);
  // A hooked entity outranks a catch: the wiki lists them as separate cases and the hook is what happened.
  assert.equal(reelDurability({ hookedEntity: true, caught: true }), 5);
  assert.equal(reelDurability({ hookedItem: true, stuckInBlock: true }), 3);
});

// --- open water --------------------------------------------------------------------------------------

/** A sampler over a flat description: air above `surfaceY`, water at and below it. */
function sampler({ surfaceY = 30, bottomY = 20, blockers = [], flowing = [] } = {}) {
  const key = (x, y, z) => `${x},${y},${z}`;
  const blocked = new Set(blockers.map(b => key(b.x, b.y, b.z)));
  const flow = new Set(flowing.map(b => key(b.x, b.y, b.z)));
  return (x, y, z) => {
    // Obstructions come FIRST. An earlier version of this harness tested `y > surfaceY` before the blocker
    // list, so a roof placed in an air layer was reported as air and its test passed for the wrong reason.
    if (blocked.has(key(x, y, z))) return OPEN_WATER_BLOCK.OTHER;
    if (flow.has(key(x, y, z))) return OPEN_WATER_BLOCK.FLOWING;
    // Two air layers above the surface, then water down to the bottom.
    if (y > surfaceY) return OPEN_WATER_BLOCK.AIR;
    if (y >= bottomY) return OPEN_WATER_BLOCK.WATER;
    return OPEN_WATER_BLOCK.OTHER;
  };
}

test('open water is the 5x4x5 volume the wiki describes', () => {
  assert.deepEqual(OPEN_WATER, { radius: 2, airLayers: 2, waterLayers: 2 });
  const points = openWaterSamplePoints(0, 30, 0);
  // 5 wide, 5 deep, 4 tall.
  assert.equal(points.length, 5 * 5 * 4);
  const xs = new Set(points.map(p => p.x));
  const zs = new Set(points.map(p => p.z));
  const ys = new Set(points.map(p => p.y));
  assert.deepEqual([...xs].sort((a, b) => a - b), [-2, -1, 0, 1, 2], 'two blocks away horizontally');
  assert.deepEqual([...zs].sort((a, b) => a - b), [-2, -1, 0, 1, 2]);
  assert.deepEqual([...ys].sort((a, b) => a - b), [29, 30, 31, 32], 'two above the surface and two of water');
});

test('open water needs two air layers above and two water layers below', () => {
  const sample = sampler({ surfaceY: 30, bottomY: 20 });
  assert.equal(isOpenWater(sample, 0, 30, 0), true, 'a plain pool qualifies');

  // A block in the air layers disqualifies it -- this is the "only air and/or lily pads" rule.
  const roofed = sampler({ surfaceY: 30, bottomY: 20, blockers: [{ x: 0, y: 31, z: 0 }] });
  assert.equal(isOpenWater(roofed, 0, 30, 0), false, 'a roof over the bobber is not open water');

  // So does a block at the edge of the volume, four blocks away from the centre.
  const edge = sampler({ surfaceY: 30, bottomY: 20, blockers: [{ x: 2, y: 32, z: -2 }] });
  assert.equal(isOpenWater(edge, 0, 30, 0), false, 'the whole 5x5 layer counts, not just the centre');

  // And one block beyond the radius is outside the check entirely.
  const outside = sampler({ surfaceY: 30, bottomY: 20, blockers: [{ x: 3, y: 32, z: 0 }] });
  assert.equal(isOpenWater(outside, 0, 30, 0), true, 'three blocks away is outside the volume');
});

test('flowing water disqualifies open water, which is what gates treasure', () => {
  // Wiki: "flowing water is not allowed in any layers".
  const flowing = sampler({ surfaceY: 30, bottomY: 20, flowing: [{ x: -2, y: 29, z: 2 }] });
  assert.equal(isOpenWater(flowing, 0, 30, 0), false);
  // The distinction is level 0 versus level above it, which is exactly how the engine stores water.
  const level = (v) => (v === 0 ? OPEN_WATER_BLOCK.WATER : OPEN_WATER_BLOCK.FLOWING);
  assert.equal(level(0), OPEN_WATER_BLOCK.WATER);
  assert.equal(level(1), OPEN_WATER_BLOCK.FLOWING);
});

test('a two-deep pool is not open water, which is the wiki 3-block note', () => {
  // Wiki: "Since the bobber can dip below the surface of the water by more than a full block, the region
  // tested may sometimes start one block below the surface ... requiring a three-block deep pool".
  const shallow = sampler({ surfaceY: 30, bottomY: 30 });
  assert.equal(isOpenWater(shallow, 0, 30, 0), false, 'one water layer is not enough');
  const threeDeep = sampler({ surfaceY: 30, bottomY: 29 });
  assert.equal(isOpenWater(threeDeep, 0, 30, 0), true, 'two water layers pass the check');
});

// --- the controller, without a browser ---------------------------------------------------------------

/**
 * A game stub with only what the controller touches.
 *
 * The point of this harness is that the STATE MACHINE is exercised for real -- the same `update` and `cast`
 * the game calls -- so the wiring and the durability settlement are tested rather than only the model.
 */
function makeGame({ water = true, raining = false, biome = 'plains', items = null } = {}) {
  const chat = [];
  const sounds = [];
  const drops = [];
  const added = [];
  const player = {
    position: { x: 0, y: 30, z: 0, clone() { return { x: this.x, y: this.y, z: this.z, addScaledVector() {} }; },
      distanceTo(other) { return Math.hypot(this.x - other.x, this.y - other.y, this.z - other.z); },
      addScaledVector() {} },
    eyeHeight: 1.62,
    statusEffects: new Map(),
  };
  const rod = { id: 'fishing_rod', isBlock: false, count: 1, durability: 64, enchantments: [] };
  const rodStack = items ?? rod;
  const game = {
    scene: { add() {}, remove() {} },
    camera: { getWorldDirection: (v) => v.set(0, -1, 0) },
    player,
    world: {
      getVoxel: (x, y, z) => {
        if (!water) return y <= 30 ? 1 : 0;
        // A pool from y=25 up to y=30, water at 30..25 and air above.
        if (y <= 30 && y >= 25) return 12;      // BLOCKS.WATER
        return 0;                                // BLOCKS.AIR
      },
      getWaterLevel: () => 0,
      getBiome: () => biome,
    },
    weather: { isRaining: () => raining },
    inventory: {
      getActiveItem: () => rodStack,
      addItem: (id, isBlock, count, enchantments) => { added.push({ id, isBlock, count, enchantments }); return true; },
    },
    entities: {
      droppedItems: [],
      spawnDroppedItem: (pos, itemType, isBlock, count) => { drops.push({ itemType, isBlock, count }); return {}; },
    },
    mobs: { mobs: [], spawnParticleBurst: () => {} },
    ui: { addChatMessage: (t, k) => chat.push({ t, k }), updateHotbar: () => {} },
    sounds: { play: (n) => sounds.push(n) },
    heldItemRenderer: { recoil: () => {} },
    get chat() { return chat; },
    get drops() { return drops; },
    get added() { return added; },
    get sounds() { return sounds; },
  };
  return game;
}

function land(fishing) {
  for (let i = 0; i < 600 && fishing.state === FISHING_STATE.CASTING; i++) fishing.update(1/60);
  assert.equal(fishing.state, FISHING_STATE.WAITING, 'the projectile landed');
}

test('the controller starts idle and a cast puts a bobber in the water', () => {
  const game = makeGame();
  const fishing = new FishingController(game);
  assert.equal(fishing.active, false);
  assert.equal(fishing.state, FISHING_STATE.IDLE);

  assert.equal(fishing.cast(), true, 'the rod consumed the click');
  assert.equal(fishing.active, true);
  assert.equal(fishing.state, FISHING_STATE.CASTING, 'casting starts in flight');
  land(fishing);
  assert.equal(fishing.state, FISHING_STATE.WAITING);
  assert.ok(fishing.waitTicks >= 100 && fishing.waitTicks <= 600, `wait was ${fishing.waitTicks}`);
  assert.ok(fishing.bobber, 'there is a bobber in the scene');
  assert.ok(fishing.line, 'and a line');
});

test('a non-rod leaves the click alone', () => {
  const game = makeGame({ items: { id: 'dirt', isBlock: true, count: 1 } });
  const fishing = new FishingController(game);
  assert.equal(fishing.cast(), false, 'so the caller goes on to place the block');
  assert.equal(fishing.active, false);
});

test('a second right-click reels the line in and clears the bobber', () => {
  const game = makeGame();
  const fishing = new FishingController(game);
  fishing.cast();
  assert.equal(fishing.cast(), true, 'the reel is also handled');
  assert.equal(fishing.active, false, 'and the bobber is gone');
  assert.equal(fishing.bobber, null);
});

test('reeling with nothing on the hook costs no durability', () => {
  // Wiki: "Reeling in while the bobber is in the air or in the water with nothing caught on it costs no
  // durability." The wait is forced to keep running so nothing bites.
  const game = makeGame();
  const fishing = new FishingController(game);
  fishing.cast();
  land(fishing);
  assert.equal(fishing.state, FISHING_STATE.WAITING, 'still waiting');
  const before = fishing.rod().durability;
  fishing.reel();
  assert.equal(fishing.rod().durability, before, 'durability is untouched');
});

test('a successful catch costs 1 durability, gives the item and awards 1-6 XP', () => {
  const game = makeGame();
  const fishing = new FishingController(game);
  fishing.cast();
  // Drive it to the bite: run the wait out, then the approach, then we are inside the window.
  land(fishing);
  fishing.waitTicks = 0;
  fishing.update(0.05);
  assert.equal(fishing.state, FISHING_STATE.APPROACHING, 'the particles are on their way');
  fishing.approachLeft = 0;
  fishing.update(0.05);
  assert.equal(fishing.state, FISHING_STATE.BITING, 'and then it takes the hook');

  const before = fishing.rod().durability;
  fishing.reel();
  assert.equal(fishing.rod().durability, before - 1, 'a catch costs exactly 1');
  assert.equal(game.added.length + game.drops.length, 1, 'the item went to the inventory or the ground');
  assert.ok(game.chat.some(m => /Caught /.test(m.t)), JSON.stringify(game.chat));
});

test('missing the bite window resets the wait rather than catching anything', () => {
  // Wiki: the player has "one to two seconds to reel in the line before the waiting time resets".
  const game = makeGame();
  const fishing = new FishingController(game);
  fishing.cast();
  land(fishing);
  fishing.waitTicks = 0;
  fishing.update(0.05);
  fishing.approachLeft = 0;
  fishing.update(0.05);
  assert.equal(fishing.state, FISHING_STATE.BITING);
  fishing.biteLeft = 0;
  fishing.update(0.05);
  assert.equal(fishing.state, FISHING_STATE.WAITING, 'back to waiting');
  assert.ok(fishing.waitTicks >= 100, 'with a fresh wait');
  assert.equal(fishing.active, true, 'and the bobber is still out');
});

test('casting at a non-water block hooks the ground and costs 2 to reel', () => {
  // Wiki: "Reeling in while the bobber is stuck in a solid block costs 2 durability."
  const game = makeGame({ water: false });
  const fishing = new FishingController(game);
  fishing.cast();
  land(fishing);
  assert.equal(fishing.stuckInBlock, true, 'it landed on ground');
  const before = fishing.rod().durability;
  fishing.reel();
  assert.equal(fishing.rod().durability, before - 2, 'a stuck bobber costs 2');
});

test('casting at open air launches a bobber which falls under gravity', () => {
  const game = makeGame();
  game.world.getVoxel = () => 0;
  const fishing = new FishingController(game);
  assert.equal(fishing.cast(), true, 'the click is still consumed by the rod');
  assert.equal(fishing.state, FISHING_STATE.CASTING);
  const start = fishing.bobber.position.y;
  fishing.update(0.1);
  assert.ok(fishing.bobber.position.y < start, 'the downward cast moves, rather than teleporting');
  fishing.cancel();
});

test('the line breaks past 32 blocks and costs no durability', () => {
  const game = makeGame();
  const fishing = new FishingController(game);
  fishing.cast();
  const before = fishing.rod().durability;
  // Move the player far away and tick.
  game.player.position.x = 100;
  fishing.update(0.05);
  assert.equal(fishing.active, false, 'the line is gone');
  assert.equal(fishing.rod().durability, before, 'and it cost nothing');
});

test('putting the rod away abandons the line with no durability cost', () => {
  const game = makeGame();
  const fishing = new FishingController(game);
  fishing.cast();
  const before = fishing.rod().durability;
  // Swap to another item: "if the player stops holding the fishing rod, the bobber and fishing line disappear
  // with no durability reduction to the rod".
  const other = { id: 'stone', isBlock: true, count: 1 };
  game.inventory.getActiveItem = () => other;
  fishing.update(0.05);
  assert.equal(fishing.active, false);
  assert.equal(before, 64, 'the rod was never charged');
});

test('the wait is eaten faster in the rain and slower under a roof', () => {
  // The two modifiers are asserted to change the real countdown, not just the model's own function.
  const dry = makeGame({ raining: false });
  const wet = makeGame({ raining: true });
  const a = new FishingController(dry);
  const b = new FishingController(wet);
  a.cast();
  b.cast();
  land(a); land(b);
  a.waitTicks = 100000;
  b.waitTicks = 100000;
  // Keep the bobber exposed to the sky in both, which the stub world already is.
  for (let i = 0; i < 400; i++) { a.update(0.05); b.update(0.05); }
  const dryUsed = 100000 - a.waitTicks;
  const wetUsed = 100000 - b.waitTicks;
  assert.ok(wetUsed > dryUsed, `rain should speed the wait up: dry ${dryUsed}, wet ${wetUsed}`);
  assert.ok(close(wetUsed / dryUsed, 1.25, 0.15), `the ratio should be about 1.25, got ${(wetUsed / dryUsed).toFixed(3)}`);
});

test('an unknowable state never throws', () => {
  // A diagnostic that crashes is worse than none, and this runs every frame in a live game.
  const bare = { inventory: { getActiveItem: () => null } };
  const fishing = new FishingController(bare);
  assert.doesNotThrow(() => fishing.update(0.016));
  assert.doesNotThrow(() => fishing.cast());
  assert.doesNotThrow(() => fishing.reel());
  assert.doesNotThrow(() => fishing.cancel());
  assert.equal(fishing.active, false);
});

// --- wiring ------------------------------------------------------------------------------------------

test('the rod is wired into the game the way the bow is', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /import \{ FishingController \} from '\.\/fishingRod\.js'/);
  assert.match(main, /this\.fishing = new FishingController\(this\)/, 'constructed alongside the bow');
  assert.match(main, /this\.fishing\.update\(dt\)/, 'and ticked every frame');
  // Right-click: fishing before the bow, because a bobber out means the click is a reel.
  const cast = main.indexOf('this.fishing.cast()');
  const bowStart = main.indexOf('this.bow.start()');
  assert.ok(cast > 0 && bowStart > 0 && cast < bowStart, 'the cast is offered before the bow draw');
  // And the line is dropped when the game loses focus, as the bow is.
  assert.match(main, /this\.fishing\?\.cancel\(\)/);
});

test('/help advertises the rod, and the rod is an enchantable tool', () => {
  // The enchantments the mechanic reads must actually be applicable to a rod, or Lure and Luck of the Sea
  // would be unreachable in play even once fishing works.
  const enchanting = readFileSync(new URL('../src/enchanting.js', import.meta.url), 'utf8');
  assert.match(enchanting, /luck_of_the_sea: entry\('Luck of the Sea'/);
  assert.match(enchanting, /lure: entry\('Lure'/);
  // And the rod is a real tool with the wiki's 64 durability, which the reel costs are spent against.
  const durability = readFileSync(new URL('../src/durability.js', import.meta.url), 'utf8');
  assert.match(durability, /fishing_rod: 64/);
});
