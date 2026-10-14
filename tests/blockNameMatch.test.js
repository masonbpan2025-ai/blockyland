// Name matching between this game's block registry and a vanilla block list.
//
// This file exists because the mismatch it guards against is silent and was shipped: COBBLED_DEEPSLATE
// was absent from the registry, but scripts/parity-coverage.mjs aliased `cobbled_deepslate` to
// `cobblestone`, so the coverage figure counted the block as present. The base block was undefined,
// which also made deepslate smelt into cobblestone and left `BLOCKS.COBBLED_DEEPSLATE` reading
// undefined at two call sites.
//
// So the tests below pin three separate things:
//
//   1. Matching is not so loose that a missing block reads as present (the bug above).
//   2. Matching is not so tight that a state id, a split id or a spelling difference reads as a gap
//      (the reason the alias table exists at all).
//   3. The wiki list and the registry are genuinely comparable, so the gap figure means something.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import {
  normaliseBlockName,
  titleCaseKey,
  candidateNames,
  buildGameBlockIndex,
  resolveVanillaBlock,
  compareBlockLists,
  gameKeysNamedByVanilla,
  NAME_ALIASES,
} from '../src/blockNameMatch.js';
import {
  blastResistanceFor,
  blastResistanceThreshold,
  isDestroyedByExplosion,
  TNT_EXPLOSION_POWER,
  harvestDataFor,
} from '../src/blockHarvestData.js';

const FIXTURE = 'tests/fixtures/wiki-block-list.json';
const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const IN_SCOPE = ['item', 'technical', 'education'];
const EXCLUDED = ['removed', 'joke'];
const wikiInScope = [...new Set(IN_SCOPE.flatMap((s) => fixture.sections[s] ?? []))];
const wikiExcluded = [...new Set(EXCLUDED.flatMap((s) => fixture.sections[s] ?? []))];

// --- normalisation -----------------------------------------------------------

test('normalisation folds case, spaces, underscores and hyphens to one key', () => {
  const same = ['Oak Planks', 'oak_planks', 'OAK PLANKS', 'oak-planks', 'OakPlanks'];
  const folded = new Set(same.map(normaliseBlockName));
  assert.equal(folded.size, 1, `all spellings should fold together, got ${[...folded].join(', ')}`);
  assert.equal([...folded][0], 'oakplanks');
});

test('normalisation keeps state suffixes, because a suffix can be part of a real block name', () => {
  // `wall_sign` is a distinct vanilla block with its own wiki page, so folding it away would make an
  // unimplemented block look covered by its floor-standing sibling. The two names must stay distinct, and
  // nothing may fold the wall variant onto the floor-standing block.
  //
  // This test used to assert that `Oak Wall Sign` resolved to NOTHING, on the grounds that the game had no
  // wall signs at all. The wall-sign batch invalidated that premise, so it now asserts the stronger and
  // more useful thing: the wall sign resolves to the WALL SIGN, not to the standing one it shares a prefix
  // with. That is the confusion this test exists to catch, and it is now catchable with real blocks.
  assert.notEqual(normaliseBlockName('Oak Wall Sign'), normaliseBlockName('Oak Sign'));

  if ('OAK_WALL_SIGN' in BLOCKS) {
    const resolved = resolveVanillaBlock('Oak Wall Sign');
    assert.ok(resolved.includes('OAK_WALL_SIGN'),
      `the wall sign must resolve to OAK_WALL_SIGN, got ${resolved.join(', ') || 'nothing'}`);
    assert.deepEqual(resolved, ['OAK_WALL_SIGN'],
      'and it must resolve to ONLY the wall sign, never the standing sign as well');
  } else {
    assert.equal(resolveVanillaBlock('Oak Wall Sign').length, 0,
      'with no wall signs registered, this must resolve to nothing rather than to OAK_SIGN');
  }

  // The floor-standing sign is only asserted where the registry actually has signs: on an earlier
  // revision of this game it has none, and that is a missing family rather than a matcher failure.
  if ('OAK_SIGN' in BLOCKS) {
    assert.ok(resolveVanillaBlock('Oak Sign').includes('OAK_SIGN'),
      'where signs exist, the floor-standing sign must resolve to OAK_SIGN');
  }
});

test('a state suffix that is a real block of its own is never folded onto its sibling', () => {
  // Holds whatever the registry contains: for every wall variant that DOES exist, its folded name must
  // still differ from the bare name, so the two can never be confused for one another.
  for (const [key, value] of Object.entries(BLOCKS)) {
    if (typeof value !== 'number' || !key.includes('_WALL_')) continue;
    const base = key.replace(/_WALL_/, '_');
    if (!(base in BLOCKS)) continue;
    for (const name of candidateNames(key)) {
      const folded = normaliseBlockName(name);
      for (const bare of candidateNames(base)) {
        assert.notEqual(folded, normaliseBlockName(bare),
          `${key} folded to "${name}", which is also a name for ${base}; a wall variant must not collapse`);
      }
    }
  }
});

test('titleCaseKey turns a registry key into a display name', () => {
  assert.equal(titleCaseKey('OAK_PLANKS'), 'Oak Planks');
  assert.equal(titleCaseKey('COBBLED_DEEPSLATE'), 'Cobbled Deepslate');
});

// --- candidate generation ----------------------------------------------------

test('state suffixes collapse onto the one wiki page name', () => {
  // A door is four ids here and one wiki page there: 84 door ids collapse to 12 pages.
  const names = candidateNames('ACACIA_DOOR_TOP_OPEN');
  assert.ok(names.includes('Acacia Door'),
    `the wiki page name should be a candidate, got ${JSON.stringify(names)}`);
  assert.ok(names.includes('Acacia Door Top Open'),
    'the id own name should also be a candidate, most specific first');

  for (const key of ['BAMBOO_DOOR_TOP', 'SPRUCE_TRAPDOOR_OPEN', 'FARMLAND_MOIST']) {
    const collapsed = candidateNames(key).map(normaliseBlockName);
    assert.ok(collapsed.some((c) => c && !/(open|top|moist)$/.test(c)),
      `${key} should offer a state-collapsed candidate, got ${JSON.stringify(collapsed)}`);
  }
});

test('ids this game splits in two fold back onto the single vanilla name', () => {
  assert.ok(candidateNames('RED_BED_HEAD').includes('Red Bed'),
    'a bed head is the second half of one vanilla bed');
  assert.ok(candidateNames('RED_BED_FOOT').includes('Red Bed'), 'and so is the foot');
  assert.ok(candidateNames('WITHER_SKELETON_SKULL_BLOCK').includes('Wither Skeleton Skull'),
    'the skull block carries a trailing _block that vanilla does not use');
});

test('every candidate a key offers folds to a non-empty distinct set', () => {
  for (const key of Object.keys(BLOCKS)) {
    if (key === 'GRASS_BLOCK') continue;
    if (typeof BLOCKS[key] !== 'number') continue;
    const names = candidateNames(key);
    assert.ok(names.length > 0, `${key} offered no candidate name at all`);
    for (const n of names) {
      assert.ok(normaliseBlockName(n).length > 0, `${key} offered a candidate that folds to nothing: ${n}`);
    }
  }
});

// --- resolution --------------------------------------------------------------

test('a spelling difference resolves through the alias table', () => {
  // Each of these is the same block under a different name, and each was a phantom gap before.
  const cases = [
    ['Block of Lapis Lazuli', 'LAPIS_BLOCK'],
    ['Block of Raw Copper', 'RAW_COPPER_BLOCK'],
    ['Hay Bale', 'HAY_BLOCK'],
    ['Redstone Comparator', 'COMPARATOR'],
    ['Moist Farmland', 'FARMLAND_MOIST'],
    ['Lit Furnace', 'LIT_FURNACE'],
    ['Target', 'TARGET_BLOCK'],
  ];
  for (const [vanilla, key] of cases) {
    assert.ok(resolveVanillaBlock(vanilla).includes(key),
      `"${vanilla}" should resolve to ${key}, got ${JSON.stringify(resolveVanillaBlock(vanilla))}`);
  }
});

test('an alias never reports a block that does not exist', () => {
  // The specific regression: `cobbled_deepslate` used to be aliased to `cobblestone` so that the
  // coverage figure counted it. An alias must resolve to a real registry entry or to nothing.
  //
  // The vocabulary is shared across revisions of this game, so an alias whose target was added later
  // legitimately points at something absent here. That is not a defect: `resolveVanillaBlock` returns
  // nothing for it, which is the honest answer. What must never happen is an alias resolving to a name
  // that is not a usable block id.
  for (const [folded, key] of Object.entries(NAME_ALIASES)) {
    const resolved = resolveVanillaBlock(folded);
    const present = Object.prototype.hasOwnProperty.call(BLOCKS, key) && typeof BLOCKS[key] === 'number';
    if (present) {
      assert.ok(resolved.includes(key),
        `alias "${folded}" points at the existing ${key} but resolved to ${JSON.stringify(resolved)}`);
    } else {
      assert.deepEqual(resolved, [],
        `alias "${folded}" points at the absent ${key}, so it must resolve to nothing`);
    }
  }

  // And the aliases whose targets are long-standing blocks must all resolve here.
  for (const [vanilla, key] of [
    ['Grass Block', 'GRASS'],
    ['Block of Coal', 'COAL_BLOCK'],
    ['Block of Quartz', 'QUARTZ_BLOCK'],
    ['Redstone Ore', 'REDSTONE_ORE'],
    ['Dirt Path', 'DIRT'],
  ]) {
    assert.ok(resolveVanillaBlock(vanilla).includes(key),
      `"${vanilla}" must resolve to ${key} on every revision`);
  }
});

test('no alias key is listed twice, which would silently drop one', () => {
  // A duplicate key in an object literal is legal JavaScript and keeps only the last value, so the
  // only way to catch one is to read the source. One was added and caught during this change.
  const source = readFileSync('src/blockNameMatch.js', 'utf8');
  const start = source.indexOf('export const NAME_ALIASES');
  const body = source.slice(start, source.indexOf('\n};', start));
  const keys = [...body.matchAll(/^\s{2}([a-z0-9_]+):/gm)].map((m) => m[1]);
  const seen = new Set();
  const dupes = keys.filter((k) => (seen.has(k) ? true : (seen.add(k), false)));
  assert.deepEqual(dupes, [], `duplicate alias keys: ${dupes.join(', ')}`);
  assert.equal(keys.length, Object.keys(NAME_ALIASES).length,
    'every alias in the source should survive into the object, so a duplicate is not hiding one');
});

test('resolution runs in both directions consistently', () => {
  const index = buildGameBlockIndex();
  for (const name of ['Cobbled Deepslate', 'Oak Planks', 'Red Bed', 'Block of Copper']) {
    const keys = resolveVanillaBlock(name, index);
    assert.ok(keys.length > 0, `${name} should resolve`);
    // Whatever it resolved to must also be reachable from the block-side query.
    const { named } = gameKeysNamedByVanilla([name]);
    for (const k of keys) {
      assert.ok(named.has(k), `${name} resolved to ${k}, but the block-side query did not name it`);
    }
  }
});

test('the block-side query does not let an alias shadow a real name', () => {
  // TARGET_BLOCK advertises "Target" as one of its own candidates, and the alias table maps the folded
  // "target" to it as well. Inverting the forward map made TARGET look unnamed; asking each key about
  // its own names is what keeps both correct.
  const { named } = gameKeysNamedByVanilla(['Target']);
  assert.ok(named.has('TARGET_BLOCK'),
    'the alias spelling Target should name TARGET_BLOCK');
  const withVine = gameKeysNamedByVanilla(['Vine']);
  assert.ok(withVine.named.has('VINE'), 'Vine should name VINE');
});

// --- the wiki list and the registry are comparable ---------------------------

test('the wiki fixture has the sections and scale the comparison assumes', () => {
  assert.ok(existsSync(FIXTURE));
  for (const s of [...IN_SCOPE, ...EXCLUDED]) {
    assert.ok(Array.isArray(fixture.sections[s]), `fixture is missing the "${s}" section`);
  }
  assert.ok(wikiInScope.length > 1000,
    `the in-scope wiki list looks truncated: ${wikiInScope.length} names`);
  assert.ok(wikiExcluded.length > 50,
    `the removed/joke list looks truncated: ${wikiExcluded.length} names`);
});

test('every in-scope wiki name either matches a block or is a genuine absence', () => {
  // The point of the fixture test: the comparison must classify the WHOLE list, with no name silently
  // dropped by a parsing failure. A name that vanishes from both buckets is the failure mode.
  const { covered, missing, byVanillaName } = compareBlockLists(wikiInScope);
  assert.equal(covered.length + missing.length, wikiInScope.length,
    'every wiki name must land in exactly one bucket');
  assert.equal(byVanillaName.size, wikiInScope.length);
  for (const name of wikiInScope) {
    assert.ok(byVanillaName.has(name), `${name} was not classified at all`);
  }
  // A floor, not a target: if matching broke, most of the list would look missing.
  assert.ok(covered.length > 700,
    `only ${covered.length} wiki names matched; the matcher looks broken rather than the game incomplete`);
  // Since the post-1.21.4 content landed, every Java block is present: what is left (67 in October 2026) is the
  // Bedrock and Education Edition blocks -- Allow, Deny, Border, hardened glass, the chemistry blocks, coloured
  // torches -- which this Java game leaves out. The floor still catches a matcher that matches everything.
  assert.ok(missing.length > 50,
    `only ${missing.length} wiki names are missing; that is implausibly low and suggests over-matching`);
});

test('the registry-side query names nearly every block the wiki lists', () => {
  const { named, unnamed } = gameKeysNamedByVanilla(wikiInScope);
  const total = named.size + unnamed.length;
  // Relative rather than absolute, because the registry grows: this must hold on any revision.
  assert.ok(named.size / total > 0.95,
    `only ${named.size} of ${total} registry keys were named by the wiki list`);
  // The residue should be states and split ids of named blocks, never whole families. Anything with no
  // definition at all would mean a registry key that names nothing.
  for (const key of unnamed) {
    assert.ok(BLOCK_DEFS[BLOCKS[key]],
      `${key} is named by no wiki page and has no definition either`);
  }
});

test('the removed and joke sections stay out of the parity gap', () => {
  // They are excluded on purpose, so they must not leak into the in-scope list.
  const overlap = wikiInScope.filter((n) => wikiExcluded.includes(n));
  assert.ok(overlap.length < 20,
    `removed/joke names leaked into the in-scope list: ${overlap.slice(0, 10).join(', ')}`);
  const { covered } = compareBlockLists(wikiInScope);
  const { covered: excludedCovered } = compareBlockLists(wikiExcluded);
  assert.ok(covered.length > excludedCovered.length,
    'the in-scope list should be far better covered than the deliberately-excluded sections');
});

// --- the missing block that motivated this work ------------------------------

test('COBBLED_DEEPSLATE exists, and everything that referenced it resolves', () => {
  assert.equal(typeof BLOCKS.COBBLED_DEEPSLATE, 'number',
    'BLOCKS.COBBLED_DEEPSLATE must be a real id; it read undefined before this change');
  const def = BLOCK_DEFS[BLOCKS.COBBLED_DEEPSLATE];
  assert.ok(def, 'it must have a definition');
  assert.equal(def.name, 'Cobbled Deepslate');

  // The three places that referenced it while it did not exist.
  assert.equal(BLOCK_DEFS[BLOCKS.DEEPSLATE].drop, BLOCKS.COBBLED_DEEPSLATE,
    'deepslate drops cobbled deepslate, not cobblestone');
  const harvest = harvestDataFor(BLOCKS.COBBLED_DEEPSLATE);
  assert.ok(harvest, 'the generated harvest table should resolve it');
  assert.equal(harvest.tool, 'pickaxe');
  assert.equal(harvest.requiresTool, true);

  // Its variants must still resolve too, and none of them may collide with its id.
  for (const key of ['COBBLED_DEEPSLATE_SLAB', 'COBBLED_DEEPSLATE_STAIRS', 'COBBLED_DEEPSLATE_WALL']) {
    assert.equal(typeof BLOCKS[key], 'number', `${key} should exist`);
    assert.notEqual(BLOCKS[key], BLOCKS.COBBLED_DEEPSLATE, `${key} must not share the base id`);
  }
});

test('the new id does not collide with any other block', () => {
  // The generator allocates max(ids)+1 and the hand-written ranges are separate, so this is the guard
  // that a hand-added id does not silently overwrite a generated or hand-written block.
  //
  // Not every shared id is a bug: the registry also carries a shorter alias for the same block
  // (RED_BED and RED_BED_FOOT, WHEAT and WHEAT_STAGE_7), which is legitimate. What must never happen
  // is two ids that name unrelated blocks, so the assertion is that sharing an id implies sharing a
  // name prefix.
  const byId = new Map();
  const unrelated = [];
  for (const [key, id] of Object.entries(BLOCKS)) {
    if (key === 'GRASS_BLOCK' || typeof id !== 'number') continue;
    if (!byId.has(id)) { byId.set(id, key); continue; }
    const other = byId.get(id);
    const shorter = key.length <= other.length ? key : other;
    const longer = shorter === key ? other : key;
    if (!longer.startsWith(shorter)) unrelated.push(`${id}: ${other} and ${key}`);
  }
  assert.deepEqual(unrelated, [],
    `ids shared by unrelated blocks:\n  ${unrelated.join('\n  ')}`);

  // And the specific new block must be alone on its id.
  const sharers = Object.entries(BLOCKS)
    .filter(([k, id]) => id === BLOCKS.COBBLED_DEEPSLATE && k !== 'COBBLED_DEEPSLATE')
    .map(([k]) => k);
  assert.deepEqual(sharers, [], `COBBLED_DEEPSLATE shares its id with ${sharers.join(', ')}`);
});

// --- blast resistance --------------------------------------------------------

test('blast resistance is read from the harvest data, which is what made it dead data', () => {
  assert.equal(blastResistanceFor(BLOCKS.STONE), 6, 'stone is 6 in the generated data');
  assert.equal(blastResistanceFor(BLOCKS.OBSIDIAN), 1200);
  assert.equal(blastResistanceFor(BLOCKS.COBBLED_DEEPSLATE), 6);
  // Bedrock carries no resistance entry, which is the signal for "unbreakable" rather than "soft".
  assert.equal(blastResistanceFor(BLOCKS.BEDROCK), null);
});

test('vanilla blast rules: TNT leaves dirt and sand, and does not touch stone or obsidian', () => {
  const always = () => 0;   // the rim of the blast
  const centre = () => 0.999; // the exact centre (the roll must still pass)

  // Soft blocks break from any distance.
  for (const key of ['DIRT', 'SAND', 'GRAVEL', 'GRASS', 'OAK_PLANKS']) {
    const id = BLOCKS[key];
    assert.equal(isDestroyedByExplosion(id, TNT_EXPLOSION_POWER, always), true,
      `${key} should be destroyed even at the rim of a TNT blast`);
  }

  // Resistance 6 is above the strongest threshold (4 * 1.3 = 5.2), so these survive at any distance.
  for (const key of ['STONE', 'COBBLESTONE', 'COBBLED_DEEPSLATE', 'IRON_BLOCK', 'DEEPSLATE']) {
    assert.equal(isDestroyedByExplosion(BLOCKS[key], TNT_EXPLOSION_POWER, centre), false,
      `${key} (resistance 6) must survive a TNT blast, which is what real TNT does`);
  }

  // Far above the threshold: immune to everything in this game.
  for (const key of ['OBSIDIAN', 'ANVIL', 'ENCHANTING_TABLE', 'RESPAWN_ANCHOR']) {
    assert.equal(isDestroyedByExplosion(BLOCKS[key], TNT_EXPLOSION_POWER, centre), false,
      `${key} must be explosion-proof`);
  }

  // Bedrock has no resistance entry at all and must never break.
  assert.equal(isDestroyedByExplosion(BLOCKS.BEDROCK, TNT_EXPLOSION_POWER, always), false,
    'bedrock must be immune, which is what the null resistance means');
  assert.equal(isDestroyedByExplosion(BLOCKS.AIR, TNT_EXPLOSION_POWER, always), false,
    'air is not a block to destroy');
});

test('the threshold is derived from the explosion power, not hardcoded', () => {
  assert.equal(blastResistanceThreshold(4), 4 * 1.3);
  // A stronger explosion reaches further: 6 is destroyed by power 10 (threshold 13) but not by power 4.
  assert.equal(isDestroyedByExplosion(BLOCKS.STONE, 4, () => 0.999), false);
  assert.equal(isDestroyedByExplosion(BLOCKS.STONE, 10, () => 0.999), true,
    'a stronger blast should break stone');
  // And obsidian survives even that.
  assert.equal(isDestroyedByExplosion(BLOCKS.OBSIDIAN, 10, () => 0.999), false);
});

test('the resistance path degrades predictably for a block with no data', () => {
  // An unknown id must not become breakable just because the table has no entry for it.
  assert.equal(isDestroyedByExplosion(99999, TNT_EXPLOSION_POWER, () => 0), false);
  assert.equal(blastResistanceFor(99999), null);
});
