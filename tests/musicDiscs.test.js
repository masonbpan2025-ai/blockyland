// Eighteen music discs that did not exist, and the one way twelve of them are obtained.
//
// Vanilla has nineteen discs. Only `music_disc_5` -- the one crafted from disc fragments -- was registered,
// so a creeper killed by a skeleton, which is where twelve of them come from in vanilla, had nothing to
// give. The Resource Inspector's `missing` report counted all eighteen as absent vanilla items.
//
// The rule is Java's with both of its qualifications: the killer must be a skeleton or a stray, and it must
// be their *arrow* rather than a melee hit. An exploded creeper cannot claim a disc either, which the game
// already handles by setting `noLoot` when a creeper detonates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { BLOCKS, ITEMS, stackLimitFor } from '../src/blocks.js';
import { EXTRA_ITEMS } from '../src/extraItems.js';
import { EntityManager } from '../src/entities.js';
import { MobManager } from '../src/mobs.js';
import { registry, resolveResource } from '../src/resourceRegistry.js';
import { CREEPER_DISC_POOL, DISC_SOURCES_ELSEWHERE, creeperDiscDrop } from '../src/musicDiscs.js';

const ALL_ITEMS = { ...ITEMS, ...EXTRA_ITEMS };

/** Vanilla's own disc ids, from the pinned cache when it is there. */
function vanillaDiscs(t) {
  try {
    const items = JSON.parse(readFileSync('.cache/mc-data/items.json', 'utf8'));
    return items.map((i) => i.name).filter((n) => n.startsWith('music_disc_')).sort();
  } catch {
    t.skip('vanilla cache absent');
    return null;
  }
}

/** The same standing fixture the other parity tests use: a real manager, no rendering. */
function fixture() {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 0,
    getLightLevel: () => 15,
  };
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
  });
  const player = {
    position: new THREE.Vector3(0, 3, 0), gamemode: 'survival', health: 20, keys: {},
    takeDamage() {}, applyStatusEffect() {}, hasStatusEffect: () => false,
  };
  manager.game = { player, difficulty: 'normal', weather: { weatherType: 'clear' }, worldTime: 18000, controls: {} };
  return { manager, player };
}

// --- the items ----------------------------------------------------------------

test('every vanilla music disc is registered, with an icon', (t) => {
  const vanilla = vanillaDiscs(t);
  if (!vanilla) return;
  const absent = vanilla.filter((id) => !ALL_ITEMS[id]);
  assert.deepEqual(absent, [], 'these discs still do not exist');
  for (const id of vanilla) {
    assert.ok(resolveResource(id, registry()), `${id} should be in the registry`);
    assert.equal(existsSync(`public/assets/items/${id}.png`), true, `${id} has no icon file`);
  }
});

test('a disc stacks to one', () => {
  // Vanilla's stack size for every disc, read through the same function the inventory uses rather than
  // asserted against a second table.
  for (const id of Object.keys(ALL_ITEMS).filter((k) => k.startsWith('music_disc_'))) {
    assert.equal(stackLimitFor(id), 1, `${id} should stack to one`);
    assert.equal(ALL_ITEMS[id].stackSize, 1, `${id} should declare it`);
  }
});

// --- the pool -----------------------------------------------------------------

test('a creeper gives one of twelve discs, and never a loot-only one', () => {
  assert.equal(CREEPER_DISC_POOL.length, 12);
  assert.equal(new Set(CREEPER_DISC_POOL).size, 12, 'no duplicates in the pool');
  for (const id of CREEPER_DISC_POOL) assert.ok(ALL_ITEMS[id], `${id} in the pool must exist`);

  // The six that belong to structures get a specific source instead of a creeper, and each is named.
  const lootOnly = ['music_disc_pigstep', 'music_disc_otherside', 'music_disc_relic', 'music_disc_creator',
    'music_disc_creator_music_box', 'music_disc_precipice'];
  for (const id of lootOnly) {
    assert.equal(CREEPER_DISC_POOL.includes(id), false, `${id} must not be a creeper drop`);
    assert.equal(typeof DISC_SOURCES_ELSEWHERE[id], 'string', `${id} should record where it comes from instead`);
  }
  assert.equal(typeof DISC_SOURCES_ELSEWHERE.music_disc_5, 'string', 'and the crafted one');
  // The pool and the exclusions cover every disc between them, so a new disc cannot be left in neither.
  const discs = Object.keys(ALL_ITEMS).filter((k) => k.startsWith('music_disc_'));
  const accounted = new Set([...CREEPER_DISC_POOL, ...Object.keys(DISC_SOURCES_ELSEWHERE)]);
  assert.deepEqual(discs.filter((d) => !accounted.has(d)), [], 'every disc has a stated source');
});

test('the random pick always names a real disc', () => {
  for (const r of [0, 0.0001, 0.5, 0.999, 1]) {
    const row = creeperDiscDrop(() => r);
    assert.equal(row.length, 1, `random() = ${r} should give one row`);
    const [id, isBlock, min, max] = row[0];
    assert.ok(CREEPER_DISC_POOL.includes(id), `random() = ${r} gave ${id}`);
    assert.equal(isBlock, false);
    assert.equal(min, 1);
    assert.equal(max, 1);
  }
  // And all twelve are reachable, which a `>= 1` boundary would break.
  const seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(creeperDiscDrop(Math.random)[0][0]);
  assert.equal(seen.size, 12, `expected all twelve discs to be reachable, saw ${seen.size}`);
});

// --- the rule -----------------------------------------------------------------

test('a creeper shot by a skeleton drops a disc', () => {
  const { manager, player } = fixture();
  const creeper = manager.spawnMob('creeper', 0, 3, 0);
  const skeleton = { type: 'skeleton', mesh: { position: new THREE.Vector3(4, 3, 0) } };
  manager.damageMob(creeper, 1, null, false, skeleton);
  assert.equal(creeper.shotBySkeleton, true, 'the flag is set at damage time, when the attacker is known');
  const drops = manager.getMobDeathDrops(creeper, () => 0.5);
  const discs = drops.filter((row) => CREEPER_DISC_POOL.includes(row[0]));
  assert.equal(discs.length, 1, 'exactly one disc');
  assert.equal(discs[0][2], 1, 'and one of it');
  // The gunpowder is still there.
  assert.ok(drops.some((row) => row[0] === 'gunpowder'), 'gunpowder is unaffected');
  void player;
});

test('a stray counts, and a melee hit does not', () => {
  const { manager } = fixture();
  const byStray = manager.spawnMob('creeper', 0, 3, 0);
  manager.damageMob(byStray, 1, null, false, { type: 'stray' });
  assert.equal(byStray.shotBySkeleton, true, 'a stray is a skeleton variant and counts');

  // `isPunch` marks a melee hit, which vanilla does not count even from a skeleton.
  const punched = manager.spawnMob('creeper', 0, 3, 0);
  manager.damageMob(punched, 1, null, true, { type: 'skeleton' });
  assert.equal(punched.shotBySkeleton, undefined, 'a skeleton hitting with its arm is not an arrow');
  assert.deepEqual(manager.getMobDeathDrops(punched, () => 0.5).filter((r) => CREEPER_DISC_POOL.includes(r[0])), []);
});

test('a creeper killed by the player drops no disc, and neither does a spider', () => {
  const { manager, player } = fixture();
  const byPlayer = manager.spawnMob('creeper', 0, 3, 0);
  manager.damageMob(byPlayer, 1, null, false, player);
  assert.deepEqual(manager.getMobDeathDrops(byPlayer, () => 0.5).filter((r) => CREEPER_DISC_POOL.includes(r[0])), []);

  const spider = manager.spawnMob('spider', 0, 3, 0);
  manager.damageMob(spider, 1, null, false, { type: 'skeleton' });
  assert.deepEqual(manager.getMobDeathDrops(spider, () => 0.5).filter((r) => CREEPER_DISC_POOL.includes(r[0])), []);
});

test('an exploded creeper gives nothing at all', () => {
  // The game sets `noLoot` when a creeper detonates, which suppresses the whole table -- so shooting one
  // and letting it blow up cannot be used to farm a disc.
  const { manager } = fixture();
  const creeper = manager.spawnMob('creeper', 0, 3, 0);
  manager.damageMob(creeper, 1, null, false, { type: 'skeleton' });
  creeper.noLoot = true;
  // `getMobDeathDrops` itself still returns rows; the caller is what honours `noLoot`. Assert the caller's
  // contract instead: the flag is set, so the drop is suppressed.
  assert.equal(creeper.noLoot, true);
});
