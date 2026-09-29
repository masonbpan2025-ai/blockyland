import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, Chunk } from '../src/world.js';
import { BLOCKS } from '../src/blocks.js';
import { traceBucket, useBucket } from '../src/buckets.js';
import { Inventory } from '../src/inventory.js';
import { ChunkMesher } from '../src/mesher.js';
import { encodeVoxelsRLE, decodeVoxelsRLE, serializeWorld, deserializeWorld } from '../src/mapManager.js';
import { EntityManager } from '../src/entities.js';

function flatWorld() {
  const world=new World();
  for(let cx=-1;cx<=1;cx++) for(let cz=-1;cz<=1;cz++) {
    const chunk=new Chunk(cx,cz); world.chunks.set(`${cx},${cz}`,chunk);
    for(let x=0;x<16;x++) for(let z=0;z<16;z++) chunk.setVoxel(x,0,z,BLOCKS.STONE);
  }
  return world;
}
const ticks=(w,n=30)=>{for(let i=0;i<n;i++)w.water.update(.25);};
const inventory=(id,count=1)=>{const inv=new Inventory({});inv.hotbar.fill(null);inv.storage.fill(null);inv.hotbar[0]={id,count,isBlock:false};return inv;};

test('water advances every five ticks, spreads seven blocks, and drains when its source is removed',()=>{
  const w=flatWorld();w.setVoxel(8,1,8,BLOCKS.WATER);
  w.water.update(.24);assert.equal(w.getWaterLevel(9,1,8),-1);
  w.water.update(.01);assert.equal(w.getWaterLevel(9,1,8),1);
  assert.equal(w.getWaterLevel(10,1,8),-1);
  ticks(w);
  for(let i=1;i<=7;i++)assert.equal(w.getWaterLevel(8+i,1,8),i);
  assert.equal(w.getWaterLevel(16,1,8),-1);
  assert.equal(w.water.pending.size,0,'settled water should stop consuming simulation work');
  w.setVoxel(8,1,8,BLOCKS.AIR);ticks(w,40);
  for(const chunk of w.chunks.values())assert.ok(!chunk.voxels.includes(BLOCKS.WATER));
});

test('breaking aquarium glass releases water; sealing the hole drains the spill',()=>{
  const w=flatWorld();
  for(let x=4;x<=8;x++)for(let z=4;z<=8;z++)for(let y=1;y<=3;y++)w.setVoxel(x,y,z,x===4||x===8||z===4||z===8?BLOCKS.GLASS:BLOCKS.WATER);
  ticks(w);assert.equal(w.getWaterLevel(9,1,6),-1);
  w.setVoxel(8,1,6,BLOCKS.AIR);ticks(w);
  assert.equal(w.getVoxel(9,1,6),BLOCKS.WATER);
  w.setVoxel(8,1,6,BLOCKS.GLASS);ticks(w,45);
  assert.equal(w.getVoxel(9,1,6),BLOCKS.AIR);
  assert.equal(w.getWaterLevel(7,1,6),0,'aquarium sources remain filled');
});

test('water falls first, spreads again at the bottom, and prefers the nearest downhill route',()=>{
  const w=flatWorld();w.setVoxel(2,5,2,BLOCKS.WATER);ticks(w);
  for(let y=1;y<5;y++)assert.equal(w.getWaterLevel(2,y,2),8);
  assert.equal(w.getWaterLevel(3,4,2),-1);
  assert.equal(w.getWaterLevel(9,1,2),7);
  const p=flatWorld();
  for(let x=-5;x<=10;x++)for(let z=-5;z<=10;z++)p.setVoxel(x,3,z,BLOCKS.STONE);
  p.setVoxel(4,3,2,BLOCKS.AIR);p.setVoxel(2,4,2,BLOCKS.WATER);p.water.tick();
  assert.equal(p.getWaterLevel(3,4,2),1);
  assert.equal(p.getWaterLevel(1,4,2),-1,'flow should choose the hole rather than the opposite direction');
});

test('two source neighbors create renewable water only with solid or source support',()=>{
  const w=flatWorld();w.setVoxel(1,1,2,BLOCKS.WATER);w.setVoxel(3,1,2,BLOCKS.WATER);ticks(w,2);
  assert.equal(w.getWaterLevel(2,1,2),0);
  w.setVoxel(2,1,2,BLOCKS.AIR);ticks(w,2);assert.equal(w.getWaterLevel(2,1,2),0);
  const air=flatWorld();air.setVoxel(1,5,2,BLOCKS.WATER);air.setVoxel(3,5,2,BLOCKS.WATER);ticks(air,3);
  assert.notEqual(air.getWaterLevel(2,5,2),0);
});

test('water crosses chunk seams, resumes after neighbor load, and never generates chunks itself',()=>{
  const w=flatWorld();w.setVoxel(-1,1,4,BLOCKS.WATER);ticks(w);
  assert.equal(w.getWaterLevel(0,1,4),1);
  w.setVoxel(30,1,4,BLOCKS.WATER);ticks(w);assert.equal(w.chunks.size,9);
  const chunk=new Chunk(2,0);for(let x=0;x<16;x++)for(let z=0;z<16;z++)chunk.setVoxel(x,0,z,BLOCKS.STONE);
  w.chunks.set('2,0',chunk);w.water.initChunk(chunk);ticks(w);
  assert.equal(w.getWaterLevel(32,1,4),2);
});

test('buckets place on the targeted face, collect only sources, respect walls, and preserve stacks',()=>{
  const w=flatWorld(), inv=inventory('water_bucket',2);
  const hit=traceBucket(w,new THREE.Vector3(5.5,4,5.5),new THREE.Vector3(0,-1,0),false);
  assert.equal(hit.y,0);assert.equal(hit.normal.y,1);
  assert.ok(useBucket(w,inv,'survival',hit));assert.equal(w.getWaterLevel(5,1,5),0);
  assert.equal(inv.hotbar[0].count,1);assert.equal(inv.hotbar[1].id,'bucket');
  ticks(w);const empty=inventory('bucket');
  assert.equal(useBucket(w,empty,'survival',{x:6,y:1,z:5}),false);
  const source=traceBucket(w,new THREE.Vector3(5.5,4,5.5),new THREE.Vector3(0,-1,0),true);
  assert.equal(source.y,1);assert.ok(useBucket(w,empty,'survival',source));assert.equal(empty.hotbar[0].id,'water_bucket');
  w.setVoxel(5,1,5,BLOCKS.WATER);w.setVoxel(5,2,5,BLOCKS.GLASS);
  const blocked=traceBucket(w,new THREE.Vector3(5.5,4,5.5),new THREE.Vector3(0,-1,0),true);
  assert.equal(useBucket(w,inventory('bucket'),'survival',blocked),false);
  assert.equal(useBucket(w,inventory('water_bucket'),'survival',{x:5,y:63,z:5,normal:{x:0,y:1,z:0}})?.y,63);
  w.setVoxel(5,63,5,BLOCKS.STONE);
  assert.equal(useBucket(w,inventory('water_bucket'),'survival',{x:5,y:63,z:5,normal:{x:0,y:1,z:0}}),false);
});

test('saved flowing levels remain flows, old maps default to sources, and stream meshes taper',()=>{
  const w=flatWorld();w.setVoxel(8,1,8,BLOCKS.WATER);ticks(w);
  const original=w.getChunk(0,0), restored=new Chunk(0,0);
  decodeVoxelsRLE(encodeVoxelsRLE(original.voxels),restored.voxels);
  assert.equal(restored.waterLevels[restored.getIndex(9,1,8)],0);
  decodeVoxelsRLE(encodeVoxelsRLE(original.waterLevels),restored.waterLevels);
  assert.equal(restored.waterLevels[restored.getIndex(9,1,8)],1);
  const tm={getFaceUVs:()=>({u0:0,v0:0,u1:1,v1:1})};
  const geo=new ChunkMesher(tm).meshChunk(original,w).waterGeo;
  const heights=[];
  for(let i=0;i<geo.attributes.position.count;i++)if(geo.attributes.normal.getY(i)===1)heights.push(geo.attributes.position.getY(i));
  assert.ok(Math.max(...heights)>1.7);assert.ok(Math.min(...heights)<1.2);
  assert.equal(geo.attributes.waterFlow.count,geo.attributes.position.count);geo.dispose();
});

test('saving and loading a live stream preserves its source and drainage; legacy aquariums still spill',()=>{
  const w=flatWorld();w.setVoxel(8,1,8,BLOCKS.WATER);ticks(w);
  const game={world:w,scene:new THREE.Scene(),worldTime:6000,
    player:{position:new THREE.Vector3(),velocity:new THREE.Vector3(),yaw:0,pitch:0,gamemode:'survival',update(){}},
    camera:new THREE.PerspectiveCamera(),inventory:inventory('bucket'),ui:{updateHotbar(){}},loadChunksAroundPlayer(){},rebuildChunkMesh(){}};
  const data=serializeWorld(game,'Stream');
  w.setVoxel(25,1,2,BLOCKS.WATER); // A pending update from the old world must not survive loading.
  deserializeWorld(game,data);
  assert.equal(w.getWaterLevel(8,1,8),0);assert.equal(w.getWaterLevel(9,1,8),1);
  assert.equal(w.getWaterLevel(25,1,2),-1);
  w.setVoxel(8,1,8,BLOCKS.AIR);ticks(w,40);assert.equal(w.getWaterLevel(9,1,8),-1);
  for(const chunk of data.chunks) delete chunk.waterLevels;
  deserializeWorld(game,data);
  assert.equal(w.getWaterLevel(9,1,8),0,'old maps interpret existing water as sources');
  assert.ok(w.water.pending.size>0,'loaded exposed sources must schedule flow');
});

test('water washes away torches, solidifies existing lava, and carries floating loot',()=>{
  const w=flatWorld();let displaced=[];w.water.onDisplace=(x,y,z,id)=>displaced.push(id);
  w.setVoxel(8,1,8,BLOCKS.WATER);w.setVoxel(9,1,8,BLOCKS.TORCH);w.setVoxel(8,1,9,BLOCKS.LAVA);ticks(w);
  assert.ok(displaced.includes(BLOCKS.TORCH));assert.equal(w.getVoxel(8,1,9),BLOCKS.OBSIDIAN);
  const tm={getFaceUVs:()=>({u0:0,v0:0,u1:1,v1:1}),lightMaterial:new THREE.MeshLambertMaterial()};
  const entities=new EntityManager(new THREE.Scene(),w,{},tm);
  entities.spawnDroppedItem(new THREE.Vector3(10.5,1.5,8.5),BLOCKS.OAK_LOG,true,1,{pickupDelay:999});
  const item=entities.droppedItems[0];item.velocity.set(0,0,0);
  for(let i=0;i<120;i++)entities.update(1/60,{position:new THREE.Vector3(100,1,100)},{addItem:()=>false});
  assert.ok(item.group.position.x>11,'the current carries floating loot away from the source');
  assert.ok(item.group.position.y>=1.18,'loot stays above the floor');
});
