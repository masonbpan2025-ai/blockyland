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

console.log('Auditing mob head hierarchies across all debug mobs...\n');

const issues = [];

for (const type of DEBUG_MOBS) {
  try {
    const mob = manager.spawnMob(type, 0, 0, 0);
    if (!mob) {
      console.log(`[SKIP] ${type}: spawnMob returned null`);
      continue;
    }

    const hasHead = !!mob.head;
    if (!hasHead) {
      console.log(`[NO HEAD] ${type}: mob.head is undefined`);
      continue;
    }

    // Check if mob.head is an Object3D
    if (!mob.head.isObject3D) {
      issues.push({ type, issue: 'mob.head is not an Object3D' });
      continue;
    }

    // Check what children are inside mob.head
    const childNames = [];
    mob.head.traverse(c => {
      if (c !== mob.head) childNames.push(c.name || c.type);
    });

    // Check other named facial parts on mob that might be outside mob.head
    const faceParts = ['snout', 'muzzle', 'nose', 'ears', 'horns', 'eyes', 'neck', 'beard', 'tusks', 'jaw', 'gills', 'antlers', 'hat'];
    const unattached = [];

    for (const part of faceParts) {
      const val = mob[part];
      if (val) {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item?.isObject3D && !mob.head.getObjectById(item.id)) {
              unattached.push(`${part} (item in array)`);
            }
          }
        } else if (val.isObject3D && !mob.head.getObjectById(val.id)) {
          unattached.push(part);
        }
      }
    }

    // Also check if mob.neck exists and is NOT a parent or child of mob.head
    if (mob.neck && mob.neck.isObject3D) {
      const neckContainsHead = !!mob.neck.getObjectById(mob.head.id);
      const headContainsNeck = !!mob.head.getObjectById(mob.neck.id);
      if (!neckContainsHead && !headContainsNeck) {
        unattached.push('neck (separate from head)');
      }
    }

    if (unattached.length > 0) {
      issues.push({ type, unattached, headPos: mob.head.position.toArray(), parent: mob.head.parent?.type });
    }
  } catch (err) {
    console.error(`[ERROR] ${type}: ${err.message}`);
  }
}

console.log('\n--- AUDIT FINDINGS ---');
for (const item of issues) {
  console.log(`Mob: ${item.type}`);
  console.log(`  Unattached parts: ${item.unattached?.join(', ')}`);
  console.log(`  Issue: ${item.issue || 'Parts outside mob.head'}`);
}
