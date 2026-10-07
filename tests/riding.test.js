import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
import { MobManager } from '../src/mobs.js';
import { Player } from '../src/player.js';

function ridingFixture() {
  const world = {
    getVoxel(x, y, z) {
      return y < 1 ? BLOCKS.STONE : BLOCKS.AIR;
    }
  };
  const sounds = new Proxy({}, { get: () => () => {} });
  const scene = new THREE.Scene();
  const entities = { spawnParticleBurst() {}, spawnDroppedItem() {}, spawnXpOrbs() {} };
  const manager = new MobManager(scene, world, sounds, entities);
  const player = {
    position: new THREE.Vector3(100, 1, 100),
    velocity: new THREE.Vector3(),
    keys: { KeyW: true },
    gamemode: 'survival',
    inventory: { getActiveItem: () => null },
    camera: { getWorldDirection: direction => direction.set(0, 0, -1) },
    takeDamage() {}
  };
  return { manager, player };
}

test('all rideable mobs accept WASD input and move without jitter', () => {
  const { manager, player } = ridingFixture();
  const mounts = [
    // Wiki: a horse or donkey is only steerable once it is both tamed and saddled; an unsaddled one stands
    // where it is while the rider sits on it. The equines therefore need the saddle as well as the taming,
    // which the pig and the strider have always needed.
    ['horse', mob => { mob.isTamed = true; mob.isSaddled = true; }],
    ['donkey', mob => { mob.isTamed = true; mob.isSaddled = true; }],
    ['pig', mob => { mob.isSaddled = true; }],
    ['strider', mob => { mob.isSaddled = true; }]
  ];

  // Each mount gets its own stretch of ground. They used to share the origin, so the previous mount was
  // still standing there and could block the next one: the strider failed "should respond to W while ridden"
  // in roughly one run in five, always because it had nowhere to go rather than because steering was broken.
  const groundFor = index => [index * 40, 1, index * 40];

  for (const [index, [type, prepare]] of mounts.entries()) {
    const [spawnX, spawnY, spawnZ] = groundFor(index);
    const mob = manager.spawnMob(type, spawnX, spawnY, spawnZ);
    prepare(mob);
    // Wiki: a strider is the one mount that needs a warped fungus on a stick in the rider's hand before it
    // will go anywhere, so the fixture hands it one for that mount only.
    player.inventory.getActiveItem = () => (type === 'strider' ? { id: 'warped_fungus_on_a_stick' } : null);
    manager.animalBehaviors.mountMob(mob, player);
    const start = mob.mesh.position.clone();
    for (let i = 0; i < 20; i++) manager.update(1 / 60, player);

    assert.ok(mob.mesh.position.distanceTo(start) > 0.25, `${type} should respond to W while ridden`);
    assert.ok(Number.isFinite(mob.mesh.position.x) && Number.isFinite(mob.mesh.position.z), `${type} position stays finite`);
    assert.equal(mob.rider, player, `${type} keeps the rider attached`);
    assert.ok(Math.abs(player.position.x - mob.mesh.position.x) < 0.001, `${type} rider x follows mount`);
    assert.ok(Math.abs(player.position.z - mob.mesh.position.z) < 0.001, `${type} rider z follows mount`);
    manager.animalBehaviors.dismount(player);
    assert.equal(player.ridingMob, null, `${type} can be dismounted`);
  }
});

test('rider input is read from the player keyboard when no explicit controls object is supplied', () => {
  const { manager, player } = ridingFixture();
  const horse = manager.spawnHorse(0, 1, 0);
  horse.isTamed = true;
  // Saddled too: updateMountSteering stops an unsaddled equine dead (wiki: taming lets you ride, the saddle
  // lets you steer), so without this the keyboard fallback under test is never reached.
  horse.isSaddled = true;
  manager.animalBehaviors.mountMob(horse, player);
  manager.animalBehaviors.updateMountSteering(1 / 60, player, {});
  assert.ok(horse.velocity.z < -1, 'KeyW should drive a mounted horse forward');

  player.keys = { KeyS: true };
  manager.animalBehaviors.updateMountSteering(1 / 60, player, {});
  assert.ok(horse.velocity.z > 1, 'KeyS should reverse a mounted horse');
});

test('mounted player physics does not compete with mount physics', () => {
  const camera = new THREE.PerspectiveCamera();
  const world = { getVoxel: () => BLOCKS.AIR };
  const sounds = new Proxy({}, { get: () => () => {} });
  const player = new Player(camera, null, world, sounds);
  player.position.set(4, 12, 4);
  player.ridingMob = { type: 'horse' };
  player.keys = { KeyW: true };
  player.update(0.1);

  assert.equal(player.position.y, 12, 'mounted player is not pulled down by gravity');
  assert.equal(player.velocity.length(), 0, 'mount owns rider velocity');
});
