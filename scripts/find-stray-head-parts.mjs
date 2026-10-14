import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { DEBUG_MOBS } from '../src/mobDebugSession.js';

const scene = new THREE.Scene();
const world = {
  getVoxel: () => 0,
  getHeightAt: () => 0,
  getBiome: () => 'plains',
  dimension: 'overworld'
};
const sounds = new Proxy({}, { get: () => () => {} });
const entities = {
  spawnDroppedItem: () => {},
  spawnXpOrbs: () => {},
  spawnDeathParticles: () => {}
};

const manager = new MobManager(scene, world, sounds, entities);

console.log('Testing each mob with head rotation to find parts left behind...\n');

for (const type of DEBUG_MOBS) {
  try {
    const mob = manager.spawnMob(type, 0, 0, 0);
    if (!mob || !mob.head) continue;

    // Record initial world positions of all meshes
    mob.mesh.updateMatrixWorld(true);
    const initialPositions = new Map();
    mob.mesh.traverse(obj => {
      if (obj.isMesh) {
        const wp = new THREE.Vector3();
        obj.getWorldPosition(wp);
        initialPositions.set(obj, wp);
      }
    });

    // Check which meshes are inside head
    const insideHead = new Set();
    mob.head.traverse(obj => insideHead.add(obj));

    // Also find meshes that are near the head in Z and Y (within head bounding box region)
    const headWp = new THREE.Vector3();
    mob.head.getWorldPosition(headWp);

    // Now turn head by 45 degrees
    mob.head.rotation.y += Math.PI / 4;
    mob.mesh.updateMatrixWorld(true);

    // Check if any meshes in group near head did NOT move, or if any facial features stayed still
    const suspiciousStrayParts = [];
    mob.mesh.traverse(obj => {
      if (obj.isMesh && !insideHead.has(obj)) {
        const p0 = initialPositions.get(obj);
        if (p0) {
          // If it's near the head (distance < 1.0 from head position) and didn't move
          const distToHead = p0.distanceTo(headWp);
          // Ignore body/torso/legs which are below or behind
          if (distToHead < 0.9 && p0.y >= headWp.y - 0.4 && p0.z >= headWp.z - 0.4) {
            suspiciousStrayParts.push({
              name: obj.name || 'unnamed',
              pos: [p0.x.toFixed(2), p0.y.toFixed(2), p0.z.toFixed(2)],
              geo: obj.geometry?.parameters
            });
          }
        }
      }
    });

    if (suspiciousStrayParts.length > 0) {
      console.log(`[SUSPICIOUS STRAY PARTS] ${type}:`);
      for (const s of suspiciousStrayParts) {
        console.log(`   - Mesh at ${s.pos.join(',')} geo=${JSON.stringify(s.geo)}`);
      }
    }
  } catch (err) {
    console.log(`[ERR] ${type}: ${err.message}`);
  }
}
