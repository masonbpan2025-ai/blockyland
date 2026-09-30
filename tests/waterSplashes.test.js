import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
import { WaterSplashes, waterEntry } from '../src/waterSplashes.js';
const world = { getVoxel: (x,y,z) => x >= 0 && x < 4 && z >= 0 && z < 4 && y >= 0 && y <= 2 ? BLOCKS.WATER : BLOCKS.AIR };
const v=(x,y,z=1)=>new THREE.Vector3(x,y,z);
test('water entry detects fast falls and shoreline entry, not swimming or teleports',()=>{
 assert.equal(waterEntry(world,v(1,5),v(1,1)).y,2+8/9);
 assert.equal(waterEntry(world,v(-.1,2.5),v(.1,2.5)).y,2+8/9);
 assert.equal(waterEntry(world,v(1,1.5),v(1,1)),null);
 assert.equal(waterEntry(world,v(1,20),v(1,1)),null);
 assert.equal(waterEntry(world,null,v(1,1)),null);
 assert.equal(waterEntry(world,v(1,1),v(1,4)),null);
});
test('entry produces bounded droplets and ripples that expire without repeating underwater',()=>{
 const scene=new THREE.Scene(),effects=new WaterSplashes(scene,world);
 effects.update(.05,v(1,3.1));effects.update(.05,v(1,2.7));
 assert.ok(effects.mesh.count>0);assert.ok(effects.rings.some(r=>r.mesh.visible));
 for(let i=0;i<40;i++)effects.update(.05,v(1,1));
 assert.equal(effects.mesh.count,0);assert.ok(effects.rings.every(r=>!r.mesh.visible));
 for(let i=0;i<50;i++)effects.splash(v(1,2.89),20);
 effects.update(.01,v(1,1));assert.ok(effects.mesh.count<=128);
 effects.dispose();assert.equal(scene.children.length,0);
});
