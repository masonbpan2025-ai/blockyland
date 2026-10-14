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

console.log('=== DETAILED MOB HEAD AUDIT ===\n');

for (const type of DEBUG_MOBS) {
  try {
    const mob = manager.spawnMob(type, 0, 0, 0);
    if (!mob || !mob.head) continue;

    // List all meshes inside mob.mesh that are NOT inside mob.head
    const unparentedHeadParts = [];
    mob.mesh.traverse(obj => {
      if (obj === mob.mesh || obj === mob.head) return;
      // Is obj a descendant of mob.head?
      let p = obj.parent;
      let insideHead = false;
      while (p) {
        if (p === mob.head) { insideHead = true; break; }
        p = p.parent;
      }
      if (!insideHead) {
        // Check if the name or properties indicate it should be part of head
        const name = (obj.name || '').toLowerCase();
        if (name === type || obj === mob.mesh) return;
        const keywords = ['head', 'neck', 'snout', 'muzzle', 'nose', 'ear', 'horn', 'eye', 'jaw', 'beard', 'tusk', 'beak', 'gills', 'crest'];
        for (const kw of keywords) {
          if (name.includes(kw)) {
            unparentedHeadParts.push(`${kw}: "${obj.name || obj.type}" at [${obj.position.toArray().map(n => n.toFixed(2))}]`);
            break;
          }
        }
      }
    });

    // Check specific fields on mob
    const fieldKeywords = ['snout', 'muzzle', 'nose', 'ears', 'horns', 'eyes', 'neck', 'beard', 'tusks', 'jaw', 'gills', 'crest', 'carpetNeck'];
    for (const f of fieldKeywords) {
      const val = mob[f];
      if (val) {
        const checkObj = (o) => {
          if (o && o.isObject3D) {
            if (o === mob.head) return; // neck and head can be the same articulated assembly
            let p = o.parent;
            let insideHead = false;
            while (p) {
              if (p === mob.head) { insideHead = true; break; }
              p = p.parent;
            }
            if (!insideHead) {
              unparentedHeadParts.push(`field mob.${f} not inside mob.head`);
            }
          }
        };
        if (Array.isArray(val)) val.forEach(checkObj);
        else checkObj(val);
      }
    }

    if (unparentedHeadParts.length > 0) {
      console.log(`[ISSUE] ${type}:`);
      for (const p of Array.from(new Set(unparentedHeadParts))) {
        console.log(`    - ${p}`);
      }
    } else {
      console.log(`[OK] ${type}`);
    }
  } catch (err) {
    console.log(`[ERR] ${type}: ${err.message}`);
  }
}
