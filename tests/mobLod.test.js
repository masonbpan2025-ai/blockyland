// Mob level of detail (src/mobLod.js): far mobs update less often, unseen mobs are not re-posed, and distant mobs are
// drawn without parts too small to see. Each must save work without changing what the player can tell.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mobStep, farMobSlots, needsFullRate, MobViewCheck, hideDistantMobDetails, FAR_MOB_DISTANCE } from '../src/mobLod.js';
import { restoreHidden } from '../src/entityVisibility.js';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';

const player = { position: new THREE.Vector3(0, 10, 0) };
const mobAt = (x, z, extra = {}) => ({ type: 'cow', health: 10, mesh: { position: new THREE.Vector3(x, 10, z) }, ...extra });

test('far mobs are spread evenly over the frames and keep all their simulated time', () => {
  const mobs = Array.from({ length: 60 }, (_, i) => mobAt(100 + i, 0));
  const dt = 1 / 60;
  const simulated = new Array(mobs.length).fill(0);
  const perFrame = [];
  for (let frame = 1; frame <= 240; frame++) {
    let ran = 0;
    mobs.forEach((mob, i) => { const step = mobStep(mob, dt, player.position, frame); if (step > 0) { ran++; simulated[i] += step; } assert.ok(step <= 0.1); });
    perFrame.push(ran);
  }
  const slots = farMobSlots(dt);
  assert.equal(slots, 5, 'about twelve updates a second at 60fps');
  for (const ran of perFrame.slice(10)) assert.ok(ran >= 10 && ran <= 14, `${ran} far mobs updated in one frame; expected about ${60 / slots}`);
  for (const total of simulated) assert.ok(Math.abs(total - 4) <= 0.1, `a far mob simulated ${total.toFixed(3)}s of 4s`);
});

test('one long frame does not make every far mob update on the same frame from then on', () => {
  // The first version let each far mob wait for its own time to build up. A single long frame (a hitch, a world
  // switch) pushed every one of them over the threshold together, and they stayed in step: no saving at all.
  const mobs = Array.from({ length: 40 }, (_, i) => mobAt(-200 - i, 50));
  let frame = 0;
  for (const mob of mobs) mobStep(mob, 0.1, player.position, ++frame);
  for (let f = 0; f < 30; f++) { frame++; for (const mob of mobs) mobStep(mob, 1 / 60, player.position, frame); }
  const counts = [];
  for (let f = 0; f < 10; f++) { frame++; counts.push(mobs.filter((mob) => mobStep(mob, 1 / 60, player.position, frame) > 0).length); }
  assert.ok(Math.max(...counts) <= 12, `at most ${Math.max(...counts)} of 40 in one frame`);
  assert.ok(Math.min(...counts) >= 4, 'and some every frame');
});

test('mobs near the player, and any that must be exact, update every frame', () => {
  const near = mobAt(FAR_MOB_DISTANCE - 2, 0);
  const exempt = [
    mobAt(90, 0, { hurtTime: 0.2 }), mobAt(90, 0, { rider: {} }), mobAt(90, 0, { vehicle: {} }), mobAt(90, 0, { health: 0 }),
    mobAt(90, 0, { leashHolder: {} }), mobAt(90, 0, { type: 'ghast' }), mobAt(90, 0, { type: 'ender_dragon' }), mobAt(90, 0, { target: { type: 'player' } }),
  ];
  for (const mob of exempt) assert.equal(needsFullRate(mob), true, JSON.stringify(Object.keys(mob)));
  for (let frame = 1; frame <= 30; frame++) {
    assert.equal(mobStep(near, 1 / 60, player.position, frame), 1 / 60);
    for (const mob of exempt) assert.ok(mobStep(mob, 1 / 60, player.position, frame) > 0);
  }
  // Walking up to a far mob hands it the time it had built up, rather than losing it.
  const far = mobAt(80, 0);
  let frame = 100;
  while (mobStep(far, 1 / 60, player.position, ++frame) > 0);
  const pending = far.lodPending;
  assert.ok(pending > 0);
  far.mesh.position.x = 5;
  assert.ok(Math.abs(mobStep(far, 1 / 60, player.position, ++frame) - (pending + 1 / 60)) < 1e-9);
});

function fixture() {
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR), setVoxel() {} };
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const entities = { droppedItems: [], xpOrbs: [], particles: [], scene, spawnDroppedItem() {}, spawnXpOrbs() {}, spawnBlockParticles() {}, spawnDeathParticles() {} };
  const manager = new MobManager(scene, world, sounds, entities);
  manager.isBlockSolid = (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE;
  return manager;
}

test('the mob manager updates far mobs less often, and near ones every frame, only when switched on', () => {
  const run = (throttle) => {
    const manager = fixture();
    manager.farMobThrottle = throttle;
    const near = manager.spawnMob('cow', 4, 1, 0);
    const far = Array.from({ length: 10 }, (_, i) => manager.spawnMob('cow', 60 + i * 2, 1, 0));
    const calls = new Map();
    const original = manager.updateMobTypeBehavior;
    manager.updateMobTypeBehavior = function (mob, ...rest) { calls.set(mob, (calls.get(mob) ?? 0) + 1); return original.call(this, mob, ...rest); };
    const p = { position: new THREE.Vector3(0, 1, 0), velocity: new THREE.Vector3(), takeDamage() {} };
    for (let frame = 0; frame < 60; frame++) manager.update(1 / 60, p);
    return { near: calls.get(near), far: far.reduce((sum, mob) => sum + (calls.get(mob) ?? 0), 0) };
  };
  const off = run(false), on = run(true);
  assert.equal(off.near, 60);
  assert.equal(on.near, 60, 'the near cow is not throttled');
  assert.equal(off.far, 600, 'off by default: every mob every call, as before');
  assert.ok(on.far <= 600 * 0.3, `far cows updated ${on.far} times in 60 frames, against ${off.far}`);
  assert.ok(on.far >= 600 * 0.15, 'but they are still updated');
});

test('mobs out of the camera\'s view are not re-posed', () => {
  const manager = fixture();
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 500);
  camera.position.set(0, 2, 0);
  camera.lookAt(0, 2, -10); // looking along -z
  manager.game = { camera, scene: { fog: null } };
  manager.unseenAnimationSkip = true;
  const front = manager.spawnMob('cow', 0, 1, -8);
  const behind = manager.spawnMob('cow', 0, 1, 8);
  const posed = new Set();
  const original = manager.updateMobAnimation;
  manager.updateMobAnimation = function (mob, ...rest) { posed.add(mob); return original.call(this, mob, ...rest); };
  const view = new MobViewCheck().update(camera, null, null);
  assert.equal(view.sees(front), true);
  assert.equal(view.sees(behind), false);
  for (let i = 0; i < 5; i++) manager.update(1 / 60, { position: new THREE.Vector3(0, 1, 0), velocity: new THREE.Vector3(), takeDamage() {} });
  // A cow's gait is posed by the quadruped pass rather than updateMobAnimation, so check the common gate instead of
  // a particular animation: nothing behind the camera went through updateMobAnimation.
  assert.equal(posed.has(behind), false);
});

test('a distant mob is drawn without its smallest parts; its largest part, and near mobs, stay whole', () => {
  const box = (w, h, d) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
  const makeMob = (z) => {
    const root = new THREE.Group();
    const body = box(0.9, 1.2, 1.4); const eye = box(0.06, 0.06, 0.02); const head = box(0.5, 0.5, 0.5);
    root.add(body, eye, head);
    root.position.set(0, 1, z);
    return { mesh: root, body, eye, head };
  };
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 500);
  camera.position.set(0, 2, 0);
  const near = makeMob(-10), far = makeMob(-60), veryFar = makeMob(-400);
  const game = { mobs: { mobs: [near, far, veryFar] }, camera, renderer: { getDrawingBufferSize: (v) => v.set(1600, 900) } };
  const hidden = hideDistantMobDetails(game);
  assert.equal(near.eye.visible, true, 'within the detail distance nothing is dropped');
  assert.equal(far.eye.visible, false, 'an eye of 0.06 blocks at 60 blocks is under 2.5 pixels');
  assert.equal(far.head.visible, true);
  assert.equal(veryFar.body.visible, true, 'the largest part is always drawn, however far');
  assert.equal(veryFar.head.visible, false);
  restoreHidden(hidden);
  for (const mob of [near, far, veryFar]) for (const part of [mob.body, mob.eye, mob.head]) assert.equal(part.visible, true, 'every flag is put back');
  // A part the game itself hid stays hidden and is not "restored" afterwards.
  far.head.visible = false;
  restoreHidden(hideDistantMobDetails(game));
  assert.equal(far.head.visible, false);
  // A model that gains a part (armour) is measured again.
  far.head.visible = true;
  far.mesh.add(box(0.03, 0.03, 0.03));
  const again = hideDistantMobDetails(game);
  assert.equal(far.mesh.userData.lodParts.parts.length, 4);
  restoreHidden(again);
});
