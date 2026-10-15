import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { World, Chunk } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { createBlockGeometry } from '../src/blockGeometry.js';
import { BlockLighting, configureSunShadows, followSun } from '../src/lighting.js';
import { ItemVisuals, getBlockDrop } from '../src/itemVisuals.js';
import { EntityManager } from '../src/entities.js';

const textures = {
  getFaceUVs: (id, face) => ({ u0: id / 100, u1: (id + 1) / 100, v0: face === 'top' ? .5 : 0, v1: face === 'top' ? .6 : .1 }),
  lightMaterial: new THREE.MeshLambertMaterial({ map: new THREE.Texture() }),
  opaqueMaterial: new THREE.MeshLambertMaterial({ map: new THREE.Texture() }),
};
const sounds = new Proxy({}, { get: () => () => {} });

test('all torch variants are centered, narrow, capped models with cropped texture UVs', () => {
  for (const id of [BLOCKS.TORCH, BLOCKS.REDSTONE_TORCH, BLOCKS.SOUL_TORCH]) {
    const geo = createBlockGeometry(id, textures); geo.computeBoundingBox();
    assert.deepEqual(geo.boundingBox.min.toArray(), [7/16, 0, 7/16]);
    assert.deepEqual(geo.boundingBox.max.toArray(), [9/16, 10/16, 9/16]);
    const u = geo.attributes.uv;
    assert.ok(u.getX(0) > id / 100 && u.getX(0) < (id + 1) / 100);
    assert.equal(geo.attributes.emission.count, geo.attributes.position.count);
    geo.dispose();
  }
});

test('mesher registers every emitting block and removal clears its light', () => {
  const world = new World(); const chunk = new Chunk(0, 0); world.chunks.set('0,0', chunk);
  const mesher = new ChunkMesher(textures), scene = new THREE.Scene(), lights = new BlockLighting(scene, 2);
  for (const [id, def] of Object.entries(BLOCK_DEFS).filter(([, def]) => def.light)) {
    world.setVoxel(4, 4, 4, Number(id));
    // Lamps and copper bulbs emit only while lit, so they are lit for the check.
    if(Number(id)===BLOCKS.REDSTONE_LAMP||def.redstoneBulb)world.redstone.state([4,4,4]).on=true;
    const geometries = mesher.meshChunk(chunk, world), geo = geometries.lightGeo;
    assert.equal(geo.userData.sources[0].level, def.light);
    lights.setChunk(0, 0, geo.userData.sources); lights.update(.2, new THREE.Vector3(5, 5, 5));
    assert.ok(lights.lights[0].intensity > 0); assert.ok(lights.lights[0].castShadow);
    for (const value of Object.values(geometries)) value?.dispose();
  }
  world.setVoxel(4, 4, 4, BLOCKS.AIR);
  assert.equal(mesher.meshChunk(chunk, world).lightGeo, null);
  lights.setChunk(0, 0, []); lights.update(0, new THREE.Vector3());
  assert.equal(lights.lights[0].intensity, 0); lights.dispose();
});

test('sun shadow camera follows the player without changing the light direction', () => {
  const scene = new THREE.Scene(), sun = new THREE.DirectionalLight();
  const direction = new THREE.Vector3(1, 2, 1).normalize();
  configureSunShadows(sun, scene); followSun(sun, direction, new THREE.Vector3(500, 30, -500));
  assert.ok(sun.position.clone().sub(sun.target.position).normalize().distanceTo(direction) < 1e-8);
  assert.ok(sun.target.position.distanceTo(new THREE.Vector3(500, 30, -500)) < .05);
});

test('block drop resolution preserves logs, converts grass to dirt, and excludes undroppable blocks', () => {
  // `count` is part of the rule now: a clay block gives four clay balls and a redstone ore four or five dust.
  // The sea lantern line changed too -- it used to drop itself, and vanilla gives two or three prismarine
  // crystals -- which is one of the nine wrong drops `block-drop-parity` found.
  assert.deepEqual(getBlockDrop(BLOCKS.OAK_LOG), { id: BLOCKS.OAK_LOG, isBlock: true, count: 1 });
  assert.deepEqual(getBlockDrop(BLOCKS.GRASS), { id: BLOCKS.DIRT, isBlock: true, count: 1 });

  // THE SEA LANTERN IS A RANGE, NOT A NUMBER, and this line used to assert exactly 2. The drop is rolled at
  // 2 or 3, so the assertion failed roughly half the time depending on the draw -- a FLAKY test rather than
  // a broken rule, and one that could be misattributed to any unrelated change that happened to run it. The
  // rule is now asserted as the range it actually is.
  const lantern = getBlockDrop(BLOCKS.SEA_LANTERN);
  assert.equal(lantern.id, 'prismarine_crystals', 'a sea lantern drops crystals, not itself');
  assert.equal(lantern.isBlock, false, 'and they are an item');
  assert.ok(lantern.count === 2 || lantern.count === 3,
    `a sea lantern drops two or three crystals, got ${lantern.count}`);

  assert.deepEqual(getBlockDrop(BLOCKS.DIAMOND_ORE), { id: 'diamond', isBlock: false, count: 1 });
  assert.equal(getBlockDrop(BLOCKS.GLASS), null); assert.equal(getBlockDrop(BLOCKS.WATER), null);
});

test('wood and dirt pickups use distinct atlas tiles; collecting one preserves shared resources', () => {
  const visuals = new ItemVisuals(textures);
  const log = visuals.create(BLOCKS.OAK_LOG, true), dirt = visuals.create(BLOCKS.DIRT, true);
  assert.notEqual(log.geometry.attributes.uv.getX(0), dirt.geometry.attributes.uv.getX(0));
  assert.equal(log.material.map, textures.lightMaterial.map);
  let disposed = false; log.material.map.addEventListener('dispose', () => disposed = true);
  visuals.release(log); assert.equal(disposed, false);
  visuals.release(dirt); visuals.dispose(); assert.equal(disposed, false);
});

test('loot settles visibly above the floor and cannot travel through a wall', () => {
  const world = { getVoxel: (x,y,z) => y < 1 || x >= 2 ? BLOCKS.STONE : BLOCKS.AIR };
  const entities = new EntityManager(new THREE.Scene(), world, sounds, textures);
  entities.spawnDroppedItem(new THREE.Vector3(.5, 2, .5), BLOCKS.OAK_LOG);
  const item = entities.droppedItems[0]; item.velocity.set(12, 0, 0);
  const player = { position: new THREE.Vector3(100,1,100) };
  for(let i=0;i<180;i++) entities.update(1/60, player, {addItem:()=>false});
  assert.ok(item.group.position.x < 1.83); assert.ok(Math.abs(item.group.position.y - 1.18) < .001);
  assert.ok(item.group.children[0].position.y >= 0);
});

test('TNT detonates once with flash, smoke and sparks, then releases temporary effects', () => {
  const voxels = new Map([['0,0,0', BLOCKS.DIRT]]);
  const world = { getVoxel: (x,y,z)=>voxels.get(`${x},${y},${z}`) || 0, setVoxel:(x,y,z,id)=>voxels.set(`${x},${y},${z}`,id) };
  const entities = new EntityManager(new THREE.Scene(), world, sounds, textures);
  let detonations=0;
  entities.spawnPrimedTNT(new THREE.Vector3(0,1,0),()=>detonations++);
  entities.tntEntities[0].timer=.01;
  const player={position:new THREE.Vector3(100,1,100), takeDamage() {}};
  entities.update(.02,player,{addItem:()=>false});
  assert.equal(detonations,1); assert.equal(entities.tntEntities.length,0);
  assert.ok(entities.particles.some(p=>p.smoke)); assert.ok(entities.particles.some(p=>p.blast)); assert.ok(entities.particles.some(p=>p.spark));
  assert.equal(world.getVoxel(0,0,0),BLOCKS.AIR);
  for(let i=0;i<180;i++) entities.update(1/60,player,{addItem:()=>false});
  assert.equal(detonations,1); assert.equal(entities.particles.length,0); assert.equal(entities.blastLight.intensity,0);
});
