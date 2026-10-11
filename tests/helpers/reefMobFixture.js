import * as THREE from 'three';
import { MobManager } from '../../src/mobs.js';
import { BLOCKS } from '../../src/blocks.js';
import { AnimalBehaviors } from '../../src/animalBehaviors.js';
import { HostileMobBehaviors } from '../../src/hostileMobBehaviors.js';

export function makeMob(type, x = 0, y = 20, z = 0, extra = {}) {
  const mesh = new THREE.Group();
  mesh.position.set(x, y, z);
  return { type, mesh, health: 10, velocity: new THREE.Vector3(),
    swimCycle: 0, timer: 0, targetPos: null, yaw: 0, pitch: 0,
    flopTimer: 0, hitCooldown: 0, ...extra };
}

export function makeManager(mobs = [], { voxel = () => BLOCKS.WATER, countDimensions = false } = {}) {
  const manager = Object.assign(Object.create(MobManager.prototype), {
    mobs, world: { getVoxel: voxel }, game: { difficulty: 'normal' },
    sounds: { playFall() {} }, scene: new THREE.Scene(), dimensionCalls: 0,
  });
  if (countDimensions) manager.getMobDimensions = type => {
    manager.dimensionCalls++;
    return MobManager.prototype.getMobDimensions.call(manager, type);
  };
  return manager;
}

export function reefFixture(count, { dense = false, aquaticOnly = false, countDimensions = false } = {}) {
  const types = aquaticOnly ? ['tropical_fish', 'pufferfish', 'dolphin']
    : ['tropical_fish', 'pufferfish', 'squid', 'dolphin'];
  const spacing = dense ? .31 : 1.8;
  const mobs = Array.from({ length: count }, (_, i) => makeMob(types[i % types.length],
    (i % 32) * spacing, 20 + (Math.floor(i / 32) % 3) * .17, Math.floor(i / 32) * spacing,
    { isBaby: !aquaticOnly && i % 17 === 0,
      ...(types[i % types.length] === 'pufferfish' ? { width: i % 3 === 0 ? .7 : .35, height: i % 3 === 0 ? .7 : .35 } : {}) }));
  return makeManager(mobs, { countDimensions });
}

export function snapshot(mobs) {
  return mobs.map(m => ({ position: m.mesh?.position.toArray(), velocity: m.velocity?.toArray(),
    target: m.targetPos?.toArray() ?? null, rotation: m.mesh?.rotation.toArray(),
    yaw: m.yaw, pitch: m.pitch, timer: m.timer, swimCycle: m.swimCycle,
    swimBlockedTime: m.swimBlockedTime, inWater: m.inWater, moistness: m.moistness,
    suffocationTimer: m.suffocationTimer, flopTimer: m.flopTimer, health: m.health,
    width: m.width, height: m.height, puffStage: m.puffStage, puffDamageCooldown: m.puffDamageCooldown }));
}

// Ordinary dispatcher, real model parts and all production update subsystems; no WebGL renderer.
export function realReefFixture(count) {
  const manager = makeManager([], { voxel: (x, y, z) => y < 12 || x === 12 && z % 9 === 0 ? BLOCKS.STONE
    : y <= 24 ? BLOCKS.WATER : BLOCKS.AIR });
  manager.world.getLightLevel = () => 12;
  manager.sounds = new Proxy({}, { get: () => () => {} });
  manager.textures = {};
  manager.arrows = []; manager.customProjectiles = [];
  manager.random = () => .5;
  const player = { type: 'player', gamemode: 'creative', health: 20,
    position: new THREE.Vector3(8, 26, 8), velocity: new THREE.Vector3(),
    isInWater: false, keys: {}, takeDamage() {}, applyStatusEffect() {},
    updateCameraAndModel() {}, inventory: { getActiveItem: () => null } };
  manager.game = { player, difficulty: 'normal', worldTime: 6000, controls: {},
    inventory: player.inventory, weather: { isRaining: () => false, weatherType: 'clear' },
    mechanisms: { isFeatureEnabled: () => false } };
  manager.animalBehaviors = new AnimalBehaviors(manager, manager.world, manager.sounds, null);
  manager.hostileBehaviors = new HostileMobBehaviors(manager, manager.world, manager.sounds, null);
  const types = ['tropical_fish', 'pufferfish', 'squid', 'dolphin'];
  withRandom(1234, () => {
    for (let i = 0; i < count; i++) manager.spawnMob(types[i % 4],
      (i % 32) * 1.8, 18 + Math.floor(i / 32) % 3, Math.floor(i / 32) * 1.8);
  });
  return manager;
}

// The shared update still uses Math.random. Restore it even if a parity assertion throws.
export function withRandom(seed, action) {
  const previous = Math.random;
  let state = seed >>> 0, calls = 0;
  Math.random = () => { calls++; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  try { return { value: action(), calls }; } finally { Math.random = previous; }
}
