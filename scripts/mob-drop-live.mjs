// Does the LIVE mob drop table match vanilla? Measured with real mobs.
//
// This is the harness that section 4.2.1 of docs/survival-parity-rules.md said was needed, and the third
// attempt at measuring this. The first two were invalid:
//
//   1. Calling `getMobDeathDrops` with a stub mob and an empty `this`. It delegates to about twenty
//      per-mob helpers that read live mob state, so a stub produces nothing for any mob handled that way
//      and the result was 21 phantom gaps.
//   2. Scanning the source text for each mob type. The regex wanted `type: [[` where the real rows read
//      `blaze: mob.playerDamaged ? [['blaze_rod', ...]] : []`, and the helper-based mobs name no type at
//      all, so it reported 22 mobs missing including several that are present.
//
// This one spawns mobs through the ordinary dispatcher, using the fixture that
// tests/mobUpdateSmoke.test.js established, so every per-mob helper runs against a real mob.
//
// The roll is forced with `random = () => 0`, which passes every chance check. That matters: an earlier
// run used `() => 0.5` and reported the phantom as dropping nothing, when `phantomDrops` rolls
// `random() < 0.5` and 0.5 does not pass. A harness that reports a conditional drop as absent is
// measuring its own dice.
//
// Run: node scripts/mob-drop-live.mjs
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';

const CACHE = '.cache/mc-data/entityLoot.json';
export const LOOT_CACHE_PRESENT = existsSync(CACHE);

/** The mobDropFixture from tests/mobUpdateSmoke.test.js, reduced to what a drop roll needs. */
export function makeDropFixture() {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 0,
    getLightLevel: () => 15,
    setVoxel() {},
  };
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, random: () => 0,
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
  });
  const player = {
    position: new THREE.Vector3(3, 1, 3), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 20, keys: {}, onGround: true, isInWater: false,
    statusEffects: {}, yaw: 0, pitch: 0,
    takeDamage() {}, applyStatusEffect() {}, hasStatusEffect: () => false,
    updateCameraAndModel() {}, update() {},
  };
  const inventory = {
    active: null, hotbar: [], storage: [], armor: {},
    getActiveItem: () => null, consumeActiveItem() {}, addItem: () => true,
    updateUI() {}, updateHotbar() {},
  };
  player.inventory = inventory;
  manager.game = {
    player, inventory, difficulty: 'normal', worldTime: 6000, controls: {},
    weather: { weatherType: 'clear', isRaining: () => false },
    mechanisms: { isFeatureEnabled: () => false }, ui: null,
  };
  return { manager };
}

/**
 * The item names the live table produces for a mob, spawning it for real.
 *
 * @param {object} manager
 * @param {string} mobType
 * @param {() => number} [random]
 */
export function liveItemsFor(manager, mobType, random = () => 0) {
  let mob;
  try {
    mob = manager.spawnMob(mobType, 0, 1, 0);
  } catch (e) {
    return { error: 'spawn: ' + e.message };
  }
  if (!mob) return { error: 'spawn returned nothing' };
  // `spawnMob` falls back to a VILLAGER for any type it does not know -- its `default:` branch ends in
  // `return this.spawnVillager(...)`. So spawning by name and reading the mob measures a villager for any
  // mob that does not exist, and the first version of this harness reported five unported mobs as "missing
  // a drop" because of it. The substitution is detected here and reported as its own category, because a
  // missing mob and a missing drop are different findings with different fixes.
  if (mob.type !== mobType) {
    return { substituted: mob.type, names: new Set() };
  }
  // The state the per-mob helpers branch on. Every one of these is a flag vanilla conditions its drops
  // on, so leaving them unset measures the "killed by something other than the player" case for every
  // mob -- which is the first invalid attempt wearing a different hat.
  mob.playerDamaged = true;
  mob.wolfKilled = false;
  mob.isBaby = false;
  if (mobType === 'slime' || mobType === 'magma_cube') mob.slimeSize = 1;
  if (mobType === 'sheep') { mob.woolColor = 'white'; mob.isSheared = false; }
  try {
    const rows = manager.getMobDeathDrops(mob, random);
    const names = new Set();
    for (const [id] of rows) {
      if (typeof id === 'number') {
        const key = Object.keys(BLOCKS).find(k => BLOCKS[k] === id);
        names.add(key ? key.toLowerCase() : String(id));
      } else names.add(id);
    }
    return { names, rows };
  } catch (e) {
    return { error: 'drops: ' + e.message };
  }
}

/** Vanilla's item names for an entity. */
export function vanillaItems(entity) {
  const names = new Set();
  for (const d of entity.drops || []) {
    if (d && typeof d === 'object' && d.item) names.add(String(d.item).replace(/^minecraft:/, ''));
  }
  return names;
}

/** Vanilla's chance-1 item names, the subset with a comparable expectation. */
export function vanillaGuaranteed(entity) {
  const names = new Set();
  for (const d of entity.drops || []) {
    if (!d || typeof d !== 'object' || !d.item) continue;
    const chance = typeof d.dropChance === 'number' ? d.dropChance : 1;
    if (chance === 1) names.add(String(d.item).replace(/^minecraft:/, ''));
  }
  return names;
}

/**
 * Compare every entity vanilla gives drops to.
 *
 * @returns {{compared:number, errors:Array, missing:Array, surplus:Array}|null}
 */
export function compareLiveDrops() {
  if (!LOOT_CACHE_PRESENT) return null;
  const loot = JSON.parse(readFileSync(CACHE, 'utf8'));
  const manager = makeDropFixture().manager;
  const entities = loot.filter(e => (e.drops || []).some(d => d && d.item));
  const result = { compared: 0, errors: [], missing: [], surplus: [], notSpawnable: [] };
  for (const e of entities) {
    const live = liveItemsFor(manager, e.entity);
    if (live.error) { result.errors.push({ entity: e.entity, error: live.error }); continue; }
    if (live.substituted) {
      // The mob does not exist and the dispatcher handed back a villager. Reported as its own category:
      // the drop table is not at fault and adding a row for it would do nothing.
      result.notSpawnable.push({ entity: e.entity, substituted: live.substituted });
      continue;
    }
    result.compared++;
    const absent = [...vanillaGuaranteed(e)].filter(n => !live.names.has(n));
    if (absent.length) result.missing.push({ entity: e.entity, absent, live: [...live.names] });
    const extra = [...live.names].filter(n => !vanillaItems(e).has(n));
    if (extra.length) result.surplus.push({ entity: e.entity, extra });
  }
  return result;
}

const invokedDirectly = process.argv[1]?.endsWith('mob-drop-live.mjs');
if (invokedDirectly) {
  if (!LOOT_CACHE_PRESENT) {
    console.error('vanilla loot cache missing; run scripts/generate-mc-data.mjs first');
    process.exit(1);
  }
  const r = compareLiveDrops();
  console.log('=== LIVE MOB DROPS vs VANILLA ===');
  console.log('vanilla entities with drops       : ' + (r.compared + r.errors.length + r.notSpawnable.length));
  console.log('measured with real mobs           : ' + r.compared);
  console.log('the mob does not exist at all     : ' + r.notSpawnable.length);
  console.log('spawn or drop errors              : ' + r.errors.length);
  console.log('missing a GUARANTEED vanilla drop : ' + r.missing.length);
  console.log('with an item vanilla does not list: ' + r.surplus.length);
  for (const e of r.errors) console.log('  ERROR ' + e.entity + ': ' + e.error);
  if (r.notSpawnable.length) {
    console.log('\n=== these mobs are not in the game; spawnMob returns a '
      + r.notSpawnable[0].substituted + ' ===');
    for (const n of r.notSpawnable) console.log('  ' + n.entity);
    console.log('  (a drop row for any of these would do nothing, so they are not drop gaps)');
  }
  if (r.missing.length) {
    console.log('\n=== vanilla guarantees an item the live table does not produce ===');
    for (const m of r.missing) {
      console.log('  ' + m.entity.padEnd(18) + 'absent: ' + m.absent.join(', '));
      console.log('  ' + ''.padEnd(18) + 'live  : ' + (m.live.join(', ') || '(nothing)'));
    }
  }
  if (r.surplus.length) {
    console.log('\n=== an item vanilla does not list, usually a name or a variant ===');
    for (const s of r.surplus) console.log('  ' + s.entity.padEnd(18) + s.extra.join(', '));
  }
}
