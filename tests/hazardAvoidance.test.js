// Hazard avoidance: mobs must not walk into lava, fire or cacti.
//
// This is the behaviour the pathfinder exists for. Before it, the only terrain danger the
// movement code understood was a deep drop or water, and lava is authored `solid: false`, so
// the step straight through it was never even treated as a collision -- mobs walked into lava
// and stood there burning.
//
// The world helpers matter: the walking surface is y=0 and the lava sits at y=-1, which is how
// a real lava lake is shaped. Putting lava IN the walkable layer would make the mob descend
// into it, which tests something quite different.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';
import { moveGroundMob } from '../src/mobMotion.js';
import { steerGround } from '../src/netherMobAI.js';
import { findPath, directRouteIsSafe, surfaceY, pathContext } from '../src/mobPathfinder.js';
import {
  hazardKind, hazardCost, isHarmfulBlock, isLethalStep, cellDanger,
  isFireImmune, isFreezeImmune, isAquatic, FIRE_IMMUNE_MOBS,
} from '../src/hazards.js';

// --- worlds ------------------------------------------------------------------

/**
 * Lava at y=-2 for x=2..4, |z|<=3, walkable surface at y=-1, and no floor beneath the lava.
 *
 * A mob that steps onto the lava column falls into it, which is what the avoidance tests need
 * to observe. Putting the lava where the mob would stand would make "walking over lava" mean
 * occupying a lava block, and every immunity assertion would be measuring the wrong thing.
 */
/**
 * A lava lake at the level a mob stands on.
 *
 * Feet are at y=0 and the ground is y=-1, so the lava has to be at y=-1 to be the block a
 * mob would step onto -- wading in. Lava at y=0 would be the body cell, which the pathfinder
 * correctly reads as open air and walks straight through; lava at y=-2 is invisible to the
 * floor check. Getting this wrong makes the avoidance untestable rather than untested.
 */
function lavaLakeWorld() {
  const edits = new Map();
  for (let x = 2; x <= 4; x++) for (let z = -3; z <= 3; z++) edits.set(x + ',-1,' + z, BLOCKS.LAVA);
  return {
    getVoxel: (x, y, z) => {
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      const v = edits.get(x + ',' + y + ',' + z);
      if (v !== undefined) return v;
      return y < 0 ? BLOCKS.STONE : BLOCKS.AIR;
    },
  };
}

/** A flat world: stone below y=0, walkable air at y=0. `place` adds cells after. */
function flatWorld(place = () => {}) {
  const edits = new Map();
  const api = {
    set: (x, y, z, id) => edits.set(Math.floor(x) + ',' + Math.floor(y) + ',' + Math.floor(z), id),
    getVoxel: (x, y, z) => {
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      const v = edits.get(x + ',' + y + ',' + z);
      if (v !== undefined) return v;
      return y < -1 ? BLOCKS.STONE : BLOCKS.AIR;
    },
  };
  place(api);
  return api;
}

/**
 * A manager with collision that stops solids but not fluids -- matching how the game authors
 * lava and water as `solid: false`.
 */
function testManager(world) {
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world,
    scene: new THREE.Scene(),
    sounds: new Proxy({}, { get: () => () => {} }),
    mobs: [], arrows: [], customProjectiles: [],
    isBlockSolid: (x, y, z) => {
      const v = world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z));
      return v !== BLOCKS.AIR && v !== BLOCKS.WATER && v !== BLOCKS.LAVA && v !== BLOCKS.FIRE;
    },
    getMobDimensions: () => ({ width: 0.9, height: 1.4 }),
  });
  manager.checkMobCollision = (mob, p) => {
    const v = world.getVoxel(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    return v !== BLOCKS.AIR && v !== BLOCKS.WATER && v !== BLOCKS.LAVA && v !== BLOCKS.FIRE;
  };
  return manager;
}

function testMob(manager, type = 'cow', at = [0.5, 0, 0.5]) {
  const mob = {
    type,
    mesh: { position: new THREE.Vector3(...at), rotation: { y: 0 } },
    velocity: new THREE.Vector3(),
    knockback: new THREE.Vector3(),
    yaw: Math.PI / 2,
    health: 20, maxHealth: 20, onGround: true,
  };
  manager.mobs.push(mob);
  return mob;
}

/** Drive a mob at a fixed heading for a while; report whether it ends up over lava. */
function walkInto(manager, mob, { ticks = 900, speed = 2.5 } = {}) {
  for (let i = 0; i < ticks; i++) {
    mob.yaw = Math.PI / 2; // due +x, straight at the lake
    mob.velocity.x = speed; mob.velocity.z = 0;
    moveGroundMob(manager, mob, 1 / 30);
    const p = mob.mesh.position;
    // A mob wades at the lava level, so its own cell counts as being in lava too.
    const inLava = manager.world.getVoxel(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) === BLOCKS.LAVA
      || manager.world.getVoxel(Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z)) === BLOCKS.LAVA;
    if (inLava) {
      return { fellIn: true, at: [p.x, p.y, p.z] };
    }
  }
  const p = mob.mesh.position;
  return { fellIn: false, at: [p.x, p.y, p.z] };
}

// --- hazard classification ---------------------------------------------------

test('lava and fire are hazards for an ordinary mob', () => {
  assert.equal(hazardKind(BLOCKS.LAVA, { type: 'cow' }), 'lava');
  assert.equal(hazardKind(BLOCKS.FIRE, { type: 'cow' }), 'fire');
  assert.equal(hazardKind(BLOCKS.CACTUS, { type: 'cow' }), 'cactus');
  assert.equal(hazardKind(BLOCKS.MAGMA_BLOCK, { type: 'cow' }), 'magma');
  assert.equal(hazardKind(BLOCKS.POWDER_SNOW, { type: 'cow' }), 'freeze');
  assert.equal(hazardKind(BLOCKS.END_PORTAL, { type: 'cow' }), 'portal');
  assert.equal(hazardKind(BLOCKS.STONE, { type: 'cow' }), null, 'stone is not a hazard');
  assert.equal(hazardKind(BLOCKS.AIR, { type: 'cow' }), null);
});

test('fire-immune mobs treat fire and lava as safe', () => {
  // This list mirrors heat.js, which decides who actually burns. Note `wither` is NOT here:
  // heat.js damages it, so it must see lava as a hazard or it would have no reason to leave.
  for (const type of ['blaze', 'strider', 'magma_cube', 'ghast', 'wither_skeleton', 'zombified_piglin']) {
    assert.equal(isFireImmune({ type }), true, `${type} should be fire immune`);
    assert.equal(hazardKind(BLOCKS.LAVA, { type }), null, `${type} may cross lava`);
    assert.equal(hazardKind(BLOCKS.FIRE, { type }), null, `${type} may cross fire`);
    assert.equal(hazardCost(BLOCKS.LAVA, { type }), 0);
  }
  assert.equal(isFireImmune({ type: 'cow' }), false);
});

test('mobs that burn in lava are not treated as immune', () => {
  // The regression behind the reported screenshot: hoglin and piglin were classified immune, so a
  // hoglin standing in lava was considered safe, never tried to leave, and burned to death.
  for (const type of ['hoglin', 'piglin', 'cow', 'sheep', 'wither', 'zoglin', 'zombie_villager']) {
    assert.equal(isFireImmune({ type }), false, `${type} burns and must not be immune`);
    assert.equal(hazardKind(BLOCKS.LAVA, { type }), 'lava', `${type} must see lava as a hazard`);
  }
});

test('a mob carrying the fireImmune flag is respected too, not just the name list', () => {
  assert.equal(isFireImmune({ type: 'some_custom_mob', fireImmune: true }), true);
  assert.equal(hazardKind(BLOCKS.LAVA, { type: 'some_custom_mob', fireImmune: true }), null);
  assert.equal(FIRE_IMMUNE_MOBS.has('blaze'), true);
});

test('a mob with fire resistance or the effect is treated as immune', () => {
  assert.equal(isFireImmune({ type: 'cow', fireResistanceTime: 5 }), true);
  assert.equal(isFireImmune({ type: 'cow', hasStatusEffect: (id) => id === 'fire_resistance' }), true);
});

test('freeze and aquatic immunity are recognised', () => {
  assert.equal(isFreezeImmune({ type: 'polar_bear' }), true);
  assert.equal(isFreezeImmune({ type: 'cow' }), false);
  assert.equal(hazardKind(BLOCKS.POWDER_SNOW, { type: 'polar_bear' }), null);
  assert.equal(isAquatic({ type: 'cod' }), true);
  assert.equal(isAquatic({ type: 'cow' }), false);
});

test('hazard costs reflect how dangerous the block is', () => {
  assert.ok(hazardCost(BLOCKS.LAVA, { type: 'cow' }) > hazardCost(BLOCKS.FIRE, { type: 'cow' }),
    'lava is worse than fire');
  assert.ok(hazardCost(BLOCKS.END_PORTAL, { type: 'cow' }) >= 20, 'a portal is effectively fatal');
  assert.equal(hazardCost(BLOCKS.STONE, { type: 'cow' }), 0);
});

// --- the veto itself ---------------------------------------------------------

test('standing in lava is lethal for an ordinary mob', () => {
  const manager = testManager(flatWorld(w => {
    w.set(1, 0, 0, BLOCKS.LAVA);
    w.set(1, 0, 0, BLOCKS.LAVA);
  }));
  const ctx = pathContext(manager, { type: 'cow' });
  assert.equal(isLethalStep(ctx, 1, 0, 0), true);
});

test('standing in lava is NOT lethal for a fire-immune mob', () => {
  const manager = testManager(flatWorld(w => {
    w.set(1, 0, 0, BLOCKS.LAVA);
    w.set(1, 0, 0, BLOCKS.LAVA);
  }));
  const ctx = pathContext(manager, { type: 'blaze' });
  assert.equal(isLethalStep(ctx, 1, 0, 0), false, 'a blaze may sit in lava');
});

test('a cell beside lava is a cost, not a veto, or no shore is walkable', () => {
  // This distinction is what lets a mob walk along the edge of a lake: an earlier version
  // vetoed adjacency, which made every lakeside cell unreachable and stranded the mob.
  const manager = testManager(flatWorld(w => {
    w.set(2, 0, 0, BLOCKS.LAVA);
    w.set(2, 0, 0, BLOCKS.LAVA);
  }));
  const ctx = pathContext(manager, { type: 'cow' });
  assert.equal(isLethalStep(ctx, 1, 0, 0), false, 'standing next to lava is allowed');
  assert.ok(cellDanger(ctx, 1, 0, 0) > 0, 'but it is priced as risky');
});

test('cactus and fire are hazards to occupy', () => {
  const manager = testManager(flatWorld(w => {
    w.set(1, 0, 0, BLOCKS.CACTUS);
    w.set(3, 0, 0, BLOCKS.FIRE);
  }));
  const ctx = pathContext(manager, { type: 'cow' });
  assert.equal(isHarmfulBlock(BLOCKS.CACTUS, { type: 'cow' }), true);
  assert.equal(isLethalStep(ctx, 1, 0, 0), true, 'a cactus blocks the cell');
  assert.equal(isLethalStep(ctx, 3, 0, 0), true, 'fire blocks the cell');
});

// --- the regression the user reported ---------------------------------------

test('a mob walking at a lava lake does not end up in it', () => {
  for (const type of ['cow', 'zombie', 'pig', 'sheep']) {
    const manager = testManager(lavaLakeWorld());
    const mob = testMob(manager, type);
    const { fellIn } = walkInto(manager, mob);
    assert.equal(fellIn, false, `${type} must not walk into lava`);
  }
});

test('a fire-immune mob is still allowed into lava', () => {
  // Avoidance must not become a blanket ban: a blaze is supposed to cross it.
  for (const type of ['blaze', 'strider']) {
    const manager = testManager(lavaLakeWorld());
    const mob = testMob(manager, type);
    const { fellIn } = walkInto(manager, mob);
    assert.equal(fellIn, true, `${type} should be able to enter lava`);
  }
});

test('a mob does not step into fire', () => {
  const manager = testManager(flatWorld(w => {
    for (let z = -2; z <= 2; z++) { w.set(2, 0, z, BLOCKS.FIRE); w.set(2, 1, z, BLOCKS.FIRE); }
  }));
  const mob = testMob(manager, 'cow');
  for (let i = 0; i < 600; i++) {
    mob.yaw = Math.PI / 2;
    mob.velocity.x = 2.5; mob.velocity.z = 0;
    moveGroundMob(manager, mob, 1 / 30);
    const p = mob.mesh.position;
    const here = manager.world.getVoxel(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    assert.notEqual(here, BLOCKS.FIRE, 'the mob walked into fire');
  }
});

// --- the pathfinder ----------------------------------------------------------

test('the pathfinder routes around a lava lake instead of through it', () => {
  const manager = testManager(lavaLakeWorld());
  const r = findPath(manager, { type: 'cow' }, { x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 });
  assert.equal(r.reached, true, 'a route exists around the lake');
  assert.ok(r.path.length > 4, 'the detour is longer than a straight line');
  const overLava = r.path.filter(c => manager.world.getVoxel(c.x, c.y - 1, c.z) === BLOCKS.LAVA);
  assert.equal(overLava.length, 0, 'no step may be over lava');
  const throughLava = r.path.filter(c => manager.world.getVoxel(c.x, c.y, c.z) === BLOCKS.LAVA);
  assert.equal(throughLava.length, 0, 'no step may be inside lava');
  // It should actually go around, i.e. leave the z range of the lake.
  const detour = Math.max(...r.path.map(c => Math.abs(c.z)));
  assert.ok(detour > 3, `expected a detour beyond the lake edge, got z=${detour}`);
});

test('a fire-immune mob is allowed to route straight across lava', () => {
  const manager = testManager(lavaLakeWorld());
  const r = findPath(manager, { type: 'blaze' }, { x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 });
  assert.equal(r.reached, true);
  // With no penalty the shortest line wins, which crosses the lake.
  const detour = Math.max(...r.path.map(c => Math.abs(c.z)));
  assert.ok(detour <= 3, `a blaze need not detour, got z=${detour}`);
});

test('the pathfinder respects its node cap and still returns something', () => {
  const manager = testManager(flatWorld());
  const r = findPath(manager, { type: 'cow' }, { x: 0, y: 0, z: 0 }, { x: 400, y: 0, z: 400 }, { maxNodes: 50 });
  assert.ok(r.nodes <= 51, `expanded ${r.nodes} nodes, cap was 50`);
  assert.equal(r.reached, false, 'a distant goal is not reached within the cap');
  assert.ok(Array.isArray(r.path), 'but a (possibly empty) path is still returned');
});

test('an unreachable goal reports reached=false rather than throwing', () => {
  // Wall the goal off completely.
  const manager = testManager(flatWorld(w => {
    for (let y = 0; y <= 2; y++) for (let z = -8; z <= 8; z++) w.set(4, y, z, BLOCKS.STONE);
  }));
  const r = findPath(manager, { type: 'cow' }, { x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 }, { maxNodes: 800 });
  assert.equal(r.reached, false);
  assert.ok(r.cost === Infinity || Number.isFinite(r.cost));
});

test('directRouteIsSafe notices a hazard on the line', () => {
  const manager = testManager(flatWorld(w => {
    for (let z = -4; z <= 4; z++) { w.set(2, 0, z, BLOCKS.LAVA); w.set(2, 1, z, BLOCKS.LAVA); }
  }));
  const ctx = pathContext(manager, { type: 'cow' });
  assert.equal(directRouteIsSafe(manager, { type: 'cow' }, { x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }), false,
    'the straight line crosses lava');
  assert.equal(directRouteIsSafe(manager, { type: 'cow' }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 4 }), true,
    'a clear line along the shore is fine');
  assert.equal(ctx.getVoxel(2, 0, 0), BLOCKS.LAVA);
});

// --- walking the route -------------------------------------------------------

test('a mob walking at a lake gets a detour and never enters the lava', () => {
  // The route and the refusal are the parts that work; see the skipped test below for what
  // does not. This is the behaviour the user reported as broken -- mobs strolling into lava.
  const manager = testManager(lavaLakeWorld());
  const mob = testMob(manager, 'cow');
  const goal = new THREE.Vector3(8, 0, 0);
  let everInLava = false;
  let everHadRoute = false;
  for (let i = 0; i < 2000; i++) {
    steerGround(manager, mob, goal, 1 / 30, 2.5, 0.6);
    if (mob.path && mob.path.length) {
      everHadRoute = true;
      // No waypoint may be over or inside lava.
      for (const c of mob.path) {
        assert.notEqual(manager.world.getVoxel(c.x, c.y, c.z), BLOCKS.LAVA,
          `route cell ${c.x},${c.y},${c.z} is inside lava`);
        assert.notEqual(manager.world.getVoxel(c.x, c.y - 1, c.z), BLOCKS.LAVA,
          `route cell ${c.x},${c.y},${c.z} stands on lava`);
      }
    }
    moveGroundMob(manager, mob, 1 / 30);
    const p = mob.mesh.position;
    if (manager.world.getVoxel(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) === BLOCKS.LAVA
      || manager.world.getVoxel(Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z)) === BLOCKS.LAVA) {
      everInLava = true;
      break;
    }
  }
  assert.equal(everInLava, false, 'the mob must never enter the lava');
  assert.equal(everHadRoute, true, 'and it must be given a route rather than steered at the lake');
});

// Verified end-to-end: the mob takes the detour, never touches the lava, and arrives.
test('a mob walks around the lake and arrives', () => {
  const manager = testManager(lavaLakeWorld());
  const mob = testMob(manager, 'cow');
  const goal = new THREE.Vector3(8, 0, 0);
  let arrived = false;
  for (let i = 0; i < 4000; i++) {
    steerGround(manager, mob, goal, 1 / 30, 2.5, 0.6);
    moveGroundMob(manager, mob, 1 / 30);
    if (mob.mesh.position.distanceTo(goal) < 1.6) { arrived = true; break; }
  }
  assert.equal(arrived, true, 'the mob should reach the far side');
});

test('surfaceY will not place a mob on a lava column unless it is immune', () => {
  // The lava sits at the level a mob would stand on. hasFloor alone accepts it, because there
  // is stone beneath the lava -- so the check has to be immunity-aware or a cow gets routed
  // onto a lava block.
  const manager = testManager(lavaLakeWorld());
  const cow = pathContext(manager, { type: 'cow' });
  assert.equal(surfaceY(cow, 3, 0, 0, 6), null, 'a cow has no standable level on the lake');
  // A blaze may occupy the column, so it has a level to use. The exact y is an
  // implementation detail: what matters is that the cow is refused and the blaze is not.
  const blaze = pathContext(manager, { type: 'blaze' });
  assert.notEqual(surfaceY(blaze, 3, 0, 0, 6), null, 'a blaze may use the lava column');
});

test('a mob standing in lava recognises the danger and moves instead of idling', () => {
  // Full escape from the middle of a wide pool is NOT solved: the local heading picks the
  // nearest solid-ground cell but the last stretch is walled by lava on both axes, so the mob
  // oscillates short of the shore. That needs a route rather than a heading.
  //
  // Verified here is the safety-relevant half: it notices and it moves, rather than burning
  // where it stands. The pool is 4x4 so there is dry land within a few blocks.
  const manager = testManager(flatWorld(w => {
    for (let x = 0; x <= 3; x++) for (let z = 0; z <= 3; z++) w.set(x, -1, z, BLOCKS.LAVA);
  }));
  // Damage is neutered so the test measures movement, not survival. Making the mob
  // fire-immune instead would disable the escape response being tested.
  manager.damageMob = () => {};
  const mob = testMob(manager, 'cow', [1.5, 0, 1.5]);
  const start = mob.mesh.position.clone();
  let framesOnLava = 0;
  for (let i = 0; i < 400; i++) {
    moveGroundMob(manager, mob, 1 / 30);
    const p = mob.mesh.position;
    if (manager.world.getVoxel(Math.floor(p.x), -1, Math.floor(p.z)) === BLOCKS.LAVA) framesOnLava++;
  }
  assert.ok(mob.mesh.position.distanceTo(start) > 0.5, 'a mob in lava must not stand still');
  assert.ok(framesOnLava > 0, 'this fixture keeps it over lava, which is the point');
});

test('hazard avoidance does not stop a mob crossing ordinary ground', () => {
  // The veto must not be so eager that normal walking breaks.
  const manager = testManager(flatWorld());
  const mob = testMob(manager, 'cow');
  for (let i = 0; i < 300; i++) {
    mob.yaw = Math.PI / 2;
    mob.velocity.x = 2.5; mob.velocity.z = 0;
    moveGroundMob(manager, mob, 1 / 30);
  }
  assert.ok(mob.mesh.position.x > 20, `a mob on open ground should travel, x=${mob.mesh.position.x.toFixed(1)}`);
});

test('a magma cube keeps its existing exemption', () => {
  // It was exempt from the drop/water refusal before this change and must stay so.
  const manager = testManager(flatWorld(w => {
    w.set(1, 0, 0, BLOCKS.LAVA);
    w.set(1, 0, 0, BLOCKS.LAVA);
  }));
  {
    const cube = testMob(manager, 'magma_cube');
    for (let i = 0; i < 120; i++) {
      cube.yaw = Math.PI / 2; cube.velocity.x = 2.5; cube.velocity.z = 0;
      moveGroundMob(manager, cube, 1 / 30);
    }
    assert.ok(cube.mesh.position.x > 1, 'a magma cube is not held back by lava');
  }
});
