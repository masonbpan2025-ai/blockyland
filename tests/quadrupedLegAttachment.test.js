import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';
import { EntityManager } from '../src/entities.js';
import { AnimalBehaviors } from '../src/animalBehaviors.js';
import { poseLlamaLegs } from '../src/llamaBehavior.js';
import { poseCamel } from '../src/camelBehavior.js';
import { poseFoxLegs } from '../src/foxBehavior.js';
import { poseFrog } from '../src/frogBehavior.js';
import { poseUndeadHorse } from '../src/undeadHorseBehavior.js';
import { poseSniffer } from '../src/snifferBehavior.js';
import { poseRabbitHop } from '../src/rabbitBehavior.js';

function fixture() {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 0,
    getLightLevel: () => 15,
    setVoxel() {}
  };
  const entities = new EntityManager(scene, world, sounds);
  entities.droppedItems = [];
  entities.spawnDroppedItem = (pos, itemType, isBlock = true, count = 1) => {
    entities.droppedItems.push({ itemType, isBlock, count });
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, random: () => 0.5, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const animalBehaviors = new AnimalBehaviors(manager, world, sounds, entities);
  manager.animalBehaviors = animalBehaviors;
  const player = {
    position: new THREE.Vector3(10, 1, 0), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 20, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; this.health -= n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  player.inventory = { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  manager.game = { player, difficulty: 'normal', worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player, scene };
}

/**
 * Returns an array of leg Object3D nodes for any given mob.
 */
function getLegNodes(mob) {
  if (Array.isArray(mob.legs)) {
    return mob.legs.map(l => (l?.isObject3D ? l : l?.mesh)).filter(Boolean);
  }
  if (mob.legFL && mob.legFR && mob.legBL && mob.legBR) {
    return [mob.legFL, mob.legFR, mob.legBL, mob.legBR];
  }
  // Check buildModel parts
  const mesh = mob.mesh;
  if (!mesh) return [];
  const found = [];
  mesh.traverse(obj => {
    if (obj.name && (obj.name.toLowerCase().includes('leg') || obj.name.toLowerCase().includes('foot')) && obj.name.includes(':pivot')) {
      found.push(obj);
    }
  });
  return found;
}

/**
 * Given a leg Object3D, calculate the top joint position in mob space.
 * In a properly anchored leg, the top face of the geometry sits at local y = 0
 * relative to the rotating pivot node, so rotating around X keeps the top joint at local (0, 0, 0).
 */
function getLegTopPointInParentSpace(legNode) {
  legNode.updateMatrix();
  const topLocal = new THREE.Vector3(0, 0, 0);
  topLocal.applyMatrix4(legNode.matrix);
  return topLocal;
}

test('llama legs remain firmly attached to body during walk cycle', () => {
  const { manager } = fixture();
  const llama = manager.spawnMob('llama', 0, 1, 0);
  assert.ok(llama && llama.legs && llama.legs.length === 4, 'llama spawned with 4 legs');

  // Verify hip joint height is at torso underside (0.875)
  for (const legInfo of llama.legs) {
    const legMesh = legInfo.mesh;
    assert.equal(legMesh.position.y, 0.875, 'llama leg pivot is anchored at torso underside y=0.875');
  }

  // Animate through full walk cycle using poseLlamaLegs
  const initialTops = llama.legs.map(l => getLegTopPointInParentSpace(l.mesh));
  for (let phase = 0; phase < Math.PI * 2; phase += 0.2) {
    poseLlamaLegs(llama, phase, true);
    for (let i = 0; i < llama.legs.length; i++) {
      const top = getLegTopPointInParentSpace(llama.legs[i].mesh);
      const drift = top.distanceTo(initialTops[i]);
      assert.ok(
        drift < 0.001,
        `llama leg ${i} top detached by ${drift.toFixed(4)} blocks at phase ${phase.toFixed(2)}`
      );
    }
  }
});

test('trader llama legs remain attached to body during walk cycle', () => {
  const { manager } = fixture();
  const llama = manager.spawnMob('trader_llama', 0, 1, 0);
  assert.ok(llama && llama.legs && llama.legs.length === 4, 'trader llama spawned with 4 legs');

  const initialTops = llama.legs.map(l => getLegTopPointInParentSpace(l.mesh));
  for (let phase = 0; phase < Math.PI * 2; phase += 0.2) {
    poseLlamaLegs(llama, phase, true);
    for (let i = 0; i < llama.legs.length; i++) {
      const top = getLegTopPointInParentSpace(llama.legs[i].mesh);
      const drift = top.distanceTo(initialTops[i]);
      assert.ok(drift < 0.001, `trader llama leg ${i} detached by ${drift}`);
    }
  }
});

const QUADRUPED_MOBS = [
  'pig',
  'cow',
  'sheep',
  'mooshroom',
  'creeper',
  'cat',
  'ocelot',
  'hoglin',
  'zoglin',
  'ravager',
  'armadillo',
  'camel',
  'camel_husk',
  'skeleton_horse',
  'zombie_horse',
  'horse',
  'donkey',
  'mule',
  'fox',
  'rabbit',
  'killer_bunny',
  'frog',
  'polar_bear',
  'panda',
  'wolf',
  'goat',
  'sniffer'
];

for (const mobType of QUADRUPED_MOBS) {
  test(`${mobType} legs do not detach from body when swinging during walking`, () => {
    const { manager } = fixture();
    const mob = manager.spawnMob(mobType, 0, 1, 0);
    assert.ok(mob, `${mobType} spawned`);

    const legs = getLegNodes(mob);
    assert.ok(legs.length >= 4, `${mobType} should have at least 4 legs (found ${legs.length})`);

    // Record rest pose top point of each leg
    legs.forEach(l => { l.rotation.x = 0; });
    const restTops = legs.map(l => getLegTopPointInParentSpace(l));

    // Test a full range of forward and backward leg swings (up to 0.6 radians)
    for (const angle of [-0.6, -0.4, -0.2, 0.2, 0.4, 0.6]) {
      legs.forEach(l => { l.rotation.x = angle; });
      for (let i = 0; i < legs.length; i++) {
        const swungTop = getLegTopPointInParentSpace(legs[i]);
        const drift = swungTop.distanceTo(restTops[i]);
        assert.ok(
          drift < 0.015,
          `${mobType} leg ${i} top detached from body by ${drift.toFixed(4)} blocks at angle ${angle}`
        );
      }
    }
  });
}

test('walking animation via manager.update does not detach quadruped legs', () => {
  const { manager, player } = fixture();
  const testTypes = ['llama', 'pig', 'cow', 'sheep', 'creeper', 'cat', 'hoglin', 'ravager', 'armadillo', 'camel', 'fox'];
  for (const type of testTypes) {
    const mob = manager.spawnMob(type, 0, 1, 0);
    const legs = getLegNodes(mob);
    const initialTops = legs.map(l => getLegTopPointInParentSpace(l));

    // Simulate forward movement
    mob.velocity.z = 2.0;
    for (let step = 0; step < 10; step++) {
      manager.update(0.05, player);
      for (let i = 0; i < legs.length; i++) {
        const top = getLegTopPointInParentSpace(legs[i]);
        const drift = top.distanceTo(initialTops[i]);
        assert.ok(
          drift < 0.015,
          `${type} leg ${i} detached by ${drift.toFixed(4)} blocks during movement update step ${step}`
        );
      }
    }
  }
});

test('special mob poses (camel sit, fox pounce crouch, sniffer sploot, rabbit hop, frog jump) keep legs anchored', () => {
  const { manager } = fixture();

  // Camel sit
  const camel = manager.spawnMob('camel', 0, 1, 0);
  camel.isSitting = true;
  poseCamel(camel, 1.0);
  const camelLegs = getLegNodes(camel);
  for (let i = 0; i < camelLegs.length; i++) {
    const top = getLegTopPointInParentSpace(camelLegs[i]);
    assert.equal(top.y, 1.3125, `camel leg ${i} top should remain at hip height 1.3125 when sitting`);
  }

  // Fox crouch
  const fox = manager.spawnMob('fox', 0, 1, 0);
  fox.pouncePhase = 'crouch';
  poseFoxLegs(fox, 1.0, true);
  const foxLegs = getLegNodes(fox);
  for (let i = 0; i < foxLegs.length; i++) {
    const top = getLegTopPointInParentSpace(foxLegs[i]);
    assert.equal(top.y, 0.24, `fox leg ${i} top should remain at hip height 0.24 when crouching`);
  }

  // Rabbit hop
  const rabbit = manager.spawnMob('rabbit', 0, 1, 0);
  poseRabbitHop(rabbit, Math.PI / 4, true);
  const rabbitLegs = getLegNodes(rabbit);
  assert.ok(rabbitLegs[0].position.y >= 0.14, 'rabbit front leg stays at or above rest hip height');
  assert.ok(rabbitLegs[2].position.y >= 0.135, 'rabbit hind leg stays at or above rest hip height');

  // Frog jump
  const frog = manager.spawnMob('frog', 0, 1, 0);
  frog.isFrogJumping = true;
  frog.onGround = false;
  poseFrog(frog, 1.0);
  const frogLegs = getLegNodes(frog);
  for (let i = 0; i < frogLegs.length; i++) {
    const top = getLegTopPointInParentSpace(frogLegs[i]);
    assert.equal(top.y, 0.20, `frog leg ${i} top should remain at hip height 0.20 when jumping`);
  }
});
