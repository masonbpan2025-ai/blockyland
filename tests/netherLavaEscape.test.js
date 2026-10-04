// Piglin and Hoglin must climb out of lava.
//
// Reported from a real Nether Wastes map: a hoglin stood in a lava lake and died there. The cause
// was that hazards.js listed hoglin and piglin as fire-immune, so a hoglin in lava was classified
// as "not in danger", never looked for a way out, and burned. heat.js -- the code that actually
// decides who burns -- has never included either of them.
//
// These use a REAL MobManager with a real game/player, so the whole AI chain runs. An earlier
// version of the avoidance tests used a prototype-only fixture and drove moveGroundMob directly,
// which is why they passed while the game did not.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';
import { isFireImmune, hazardKind } from '../src/hazards.js';

// Textures are not available under Node; spawnHoglin/spawnPiglin build materials from them.
THREE.TextureLoader.prototype.load = () => new THREE.Texture();

/**
 * A Nether Wastes world with a lava pool at the standing level.
 *
 * y=-1 is the ground and y=0 is where a mob's feet are, so lava at y=-1 is the surface a mob
 * walks on -- wading into it. That matches the reported map.
 */
function netherWastes(poolSize = 4) {
  const edits = new Map();
  for (let x = 0; x < poolSize; x++) {
    for (let z = 0; z < poolSize; z++) edits.set(x + ',-1,' + z, BLOCKS.LAVA);
  }
  return {
    dimension: 'nether',
    selectedBiome: 'nether_wastes',
    isNether: true,
    getVoxel: (x, y, z) => {
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      const v = edits.get(x + ',' + y + ',' + z);
      if (v !== undefined) return v;
      return y < 0 ? BLOCKS.STONE : BLOCKS.AIR;
    },
  };
}

function session(world, { playerAt = [40, 0, 40] } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const entities = {
    items: [], spawnDroppedItem() {}, spawnXpOrbs() {},
    spawnDeathParticles() {}, spawnBlockParticles() {},
  };
  const manager = new MobManager(scene, world, sounds, entities);
  const player = {
    position: new THREE.Vector3(...playerAt), velocity: new THREE.Vector3(),
    width: 0.6, height: 1.8, health: 100, gamemode: 'survival', yaw: 0,
    takeDamage() {}, hasStatusEffect: () => false, checkCollision: () => false,
  };
  const inventory = {
    armor: {}, hotbar: [], storage: [], active: null,
    getActiveItem: () => null, addItem: () => true,
    consumeActiveItem() {}, updateUI() {}, updateHotbar() {},
  };
  manager.game = {
    player, inventory, difficulty: 'normal',
    weather: { weatherType: 'clear' },
    mechanisms: { isFeatureEnabled: () => false },
  };
  return { manager, world, player, scene };
}

/** Drop a mob into the middle of the pool and run the real update loop. */
function dropInAndRun(kind, { poolSize = 4, ticks = 900 } = {}) {
  const world = netherWastes(poolSize);
  const { manager, player } = session(world);
  const mid = poolSize / 2;
  const mob = kind === 'hoglin' ? manager.spawnHoglin(mid, 0, mid)
    : kind === 'piglin' ? manager.spawnPiglin(mid, 0, mid)
      : manager.spawnMob(kind, mid, 0, mid);
  assert.ok(mob, `${kind} should spawn`);
  // Heat damage is neutered so the run measures escape, not survival. Disabling it by making the
  // mob fire-immune instead would also disable the escape response being tested.
  manager.damageMob = () => {};
  const start = mob.mesh.position.clone();

  let escapedAt = -1;
  for (let i = 0; i < ticks; i++) {
    manager.update(1 / 30, player);
    const p = mob.mesh.position;
    if (world.getVoxel(Math.floor(p.x), -1, Math.floor(p.z)) !== BLOCKS.LAVA) { escapedAt = i; break; }
  }
  const end = mob.mesh.position;
  return { escapedAt, start, end, mob, world, manager, moved: end.distanceTo(start) };
}

// --- the classification that caused the bug ----------------------------------

test('a hoglin takes heat damage, so lava is a hazard to it', () => {
  // The root cause. heat.js does not include hoglin in its immune list, so treating it as
  // fire-immune here meant a hoglin in lava saw nothing wrong and never moved.
  assert.equal(isFireImmune({ type: 'hoglin' }), false, 'a hoglin burns in lava');
  assert.equal(hazardKind(BLOCKS.LAVA, { type: 'hoglin' }), 'lava');
  assert.equal(hazardKind(BLOCKS.FIRE, { type: 'hoglin' }), 'fire');
});

test('a piglin takes heat damage, so lava is a hazard to it', () => {
  assert.equal(isFireImmune({ type: 'piglin' }), false, 'a piglin burns in lava');
  assert.equal(hazardKind(BLOCKS.LAVA, { type: 'piglin' }), 'lava');
});

test('a zombified piglin is genuinely immune and still is not asked to flee', () => {
  // The other half of the rule: mobs heat.js does protect must not be pushed out of lava.
  assert.equal(isFireImmune({ type: 'zombified_piglin' }), true);
  assert.equal(hazardKind(BLOCKS.LAVA, { type: 'zombified_piglin' }), null);
});

test('a blaze is genuinely immune and may sit in lava', () => {
  assert.equal(isFireImmune({ type: 'blaze' }), true);
  assert.equal(hazardKind(BLOCKS.LAVA, { type: 'blaze' }), null);
});

// --- the behaviour -----------------------------------------------------------

test('a hoglin dropped in a lava pool climbs out', () => {
  const r = dropInAndRun('hoglin');
  assert.ok(r.escapedAt >= 0,
    `hoglin should leave the lava, but ended at (${r.end.x.toFixed(1)}, ${r.end.z.toFixed(1)})`);
  assert.notEqual(r.world.getVoxel(Math.floor(r.end.x), -1, Math.floor(r.end.z)), BLOCKS.LAVA,
    'and end up on solid ground');
});

test('a piglin dropped in a lava pool climbs out', () => {
  const r = dropInAndRun('piglin');
  assert.ok(r.escapedAt >= 0,
    `piglin should leave the lava, but ended at (${r.end.x.toFixed(1)}, ${r.end.z.toFixed(1)})`);
  assert.notEqual(r.world.getVoxel(Math.floor(r.end.x), -1, Math.floor(r.end.z)), BLOCKS.LAVA,
    'and end up on solid ground');
});

test('both escape from a wide pool, not just a small one', () => {
  // The reported map had a lake, not a puddle. A 6x6 pool is several blocks in every direction.
  for (const kind of ['hoglin', 'piglin']) {
    const r = dropInAndRun(kind, { poolSize: 6 });
    assert.ok(r.escapedAt >= 0,
      `${kind} should leave a 6x6 pool, but ended at (${r.end.x.toFixed(1)}, ${r.end.z.toFixed(1)})`);
  }
});

test('a hoglin survives being dropped in lava, rather than dying in it', () => {
  // The reported symptom: it died in the lava. Real heat damage applies here, so this is the
  // end-to-end check that escaping happens fast enough to matter.
  const world = netherWastes(4);
  const { manager, player } = session(world);
  const mob = manager.spawnHoglin(2, 0, 2);
  const startHealth = mob.health;
  let died = false;
  for (let i = 0; i < 900; i++) {
    manager.update(1 / 30, player);
    if (!manager.mobs.includes(mob)) { died = true; break; }
    if (world.getVoxel(Math.floor(mob.mesh.position.x), -1, Math.floor(mob.mesh.position.z)) !== BLOCKS.LAVA) break;
  }
  assert.equal(died, false, 'a hoglin should get out of the lava before it dies');
  assert.ok(mob.health <= startHealth, 'and it should have taken some damage on the way');
});

test('the escape is visible in the snapshot the Mob Inspector reads', () => {
  // The Inspector shows session.snapshot(); these fields are what it renders and what a tester
  // watches to see the escape happening. They must move while the mob is climbing out.
  const world = netherWastes(4);
  const { manager, player } = session(world);
  const mob = manager.spawnHoglin(2, 0, 2);
  manager.damageMob = () => {};

  const samples = [];
  for (let i = 0; i < 200; i++) {
    manager.update(1 / 30, player);
    const p = mob.mesh.position;
    samples.push({ pos: [p.x, p.y, p.z], fleeing: Boolean(mob.fleeingHazard), overLava: world.getVoxel(Math.floor(p.x), -1, Math.floor(p.z)) === BLOCKS.LAVA });
    if (!samples[samples.length - 1].overLava) break;
  }

  assert.ok(samples.some(s => s.fleeing), 'the mob should be flagged as fleeing a hazard');
  const positions = samples.map(s => s.pos.join(','));
  assert.ok(new Set(positions).size > 1, 'its position should change, so the Inspector shows movement');
  assert.equal(samples[samples.length - 1].overLava, false, 'and it ends clear of the lava');
});
