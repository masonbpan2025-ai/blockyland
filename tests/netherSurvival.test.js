import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World,Chunk } from '../src/world.js';
import { BLOCKS as B } from '../src/blocks.js';
import { netherOreAt } from '../src/netherTerrain.js';
import { NetherPlantSystem,canPlantNether } from '../src/netherPlants.js';
import { useRespawnAnchor,consumeAnchorRespawn,anchorCharges } from '../src/respawnAnchor.js';
import { capturePlayerState,applyPlayerState } from '../src/saveSchema.js';
import { blockEmission } from '../src/spawning/lightEngine.js';
import { netherWartRefusingPredicate,magmaCubePredicate,fortressOnlyPredicate } from '../src/spawning/mobSpawnPredicates.js';
import { findSurfaceSpawn } from '../src/worldSpawn.js';
import { recordingSpawner } from './helpers/presetGenerationFixture.js';
import { harvestDrops } from '../src/blockDrops.js';
import { RECIPES_2X2,RECIPES_3X3,findMatchingRecipe } from '../src/crafting.js';
import { returnFoodContainer } from '../src/foodContainers.js';
import { createBlockGeometry } from '../src/blockGeometry.js';

function terrain(seed=4289,biome='nether',radius=1) {
  const w=new World(seed,biome);w.rebuildStructures({enabledIds:[]});
  for(let x=-radius;x<=radius;x++)for(let z=-radius;z<=radius;z++)w.getOrCreateChunk(x,z);
  return w;
}
function count(w,id){let n=0;for(const c of w.chunks.values())for(const v of c.voxels)n+=v===id;return n;}
function farm() {
  const w=new World(1,'nether');w.chunks.clear();w.rebuildStructures({enabledIds:[]});
  for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++){w.chunks.set(w.chunkKey(x,z),new Chunk(x,z));w.light.initChunk(x,z);}
  for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++)w.setVoxel(x,2,z,B.NETHERRACK);
  w.getLightLevel=()=>0;const system=new NetherPlantSystem(w,{random:()=>0});return{w,system};
}
const stack=id=>id===null?null:{id,isBlock:typeof id==='number',count:1};
const craft=(ids,width=3,height=3)=>findMatchingRecipe(ids.map(stack),width,height,width===2?RECIPES_2X2:RECIPES_3X3);

test('fresh Nether preset has both mushroom foods, timber and safe spawn across seeds',()=>{
  for(const seed of [1,42,4289,20250401,8675309]) {
    const w=terrain(seed);
    assert.equal(w.dimension,'nether');assert.ok(count(w,B.BROWN_MUSHROOM)>0);assert.ok(count(w,B.RED_MUSHROOM)>0);
    assert.ok(count(w,B.CRIMSON_STEM)+count(w,B.WARPED_STEM)>0);
    assert.equal(count(w,B.RED_MUSHROOM_BLOCK)+count(w,B.BROWN_MUSHROOM_BLOCK),0,'ordinary mushrooms are plants, not cap cubes');
    const spawn=findSurfaceSpawn(w,{x:0,z:0,radius:16});assert.equal(spawn.found,true,`${seed}: ${spawn.reason}`);
    assert.ok(spawn.y<50);assert.equal(w.getVoxel(Math.floor(spawn.x),spawn.y,Math.floor(spawn.z)),B.AIR);
    assert.notEqual(w.getVoxel(Math.floor(spawn.x),spawn.y-1,Math.floor(spawn.z)),B.MAGMA_BLOCK);
  }
});

test('all five Nether biomes produce edible mushrooms and proper material identities',()=>{
  for(const biome of ['nether_wastes','soul_sand_valley','crimson_forest','warped_forest','basalt_deltas']) {
    const w=terrain(4289,biome);
    assert.ok(count(w,B.BROWN_MUSHROOM)>0&&count(w,B.RED_MUSHROOM)>0,biome);
    assert.ok(count(w,B.NETHER_GOLD_ORE)>0);assert.ok(count(w,B.NETHER_QUARTZ_ORE)>0);assert.ok(count(w,B.ANCIENT_DEBRIS)>0);
    assert.ok(count(w,B.BLACKSTONE)>0);assert.equal(count(w,B.COAL_ORE)+count(w,B.GOLD_ORE),0);
    if(biome==='crimson_forest')assert.ok(count(w,B.CRIMSON_FUNGUS)>0&&count(w,B.SHROOMLIGHT)>0);
    if(biome==='warped_forest')assert.ok(count(w,B.WARPED_FUNGUS)>0&&count(w,B.SHROOMLIGHT)>0);
    if(biome==='soul_sand_valley')assert.equal(count(w,B.SOUL_TORCH),0,'natural soul fire is not a manufactured torch');
  }
});

test('Nether features and ore distribution reproduce across chunk generation order',()=>{
  const a=new World(23,'crimson_forest'),b=new World(23,'crimson_forest');
  a.rebuildStructures({enabledIds:[]});b.rebuildStructures({enabledIds:[]});
  const positions=[[0,0],[1,0],[-1,0],[0,1]];
  for(const p of positions)a.getOrCreateChunk(...p);for(const p of [...positions].reverse())b.getOrCreateChunk(...p);
  for(const p of positions)assert.deepEqual(a.getChunk(...p).voxels,b.getChunk(...p).voxels);
  let different=false;for(let x=0;x<16;x++)for(let y=4;y<20;y++)if(netherOreAt(23,x,y,5)!==netherOreAt(24,x,y,5))different=true;
  assert.equal(different,true);
});

test('bare-hands mushrooms, Nether timber and blackstone provide a real crafting route to stew and tools',()=>{
  for(const id of [B.BROWN_MUSHROOM,B.RED_MUSHROOM])assert.ok(harvestDrops(id).some(d=>d.id===id));
  for(const stem of [B.CRIMSON_STEM,B.WARPED_STEM]) {
    assert.ok(harvestDrops(stem).length);
    const planks=craft([stem],2,2);assert.equal(planks.count,4);
    assert.equal(craft([planks.id,planks.id,planks.id,planks.id],2,2).id,B.CRAFTING_TABLE);
    assert.equal(craft([planks.id,null,planks.id],2,2).id,'stick');
  }
  assert.equal(craft([B.CRIMSON_PLANKS,null,B.CRIMSON_PLANKS,null,B.CRIMSON_PLANKS,null,null,null,null]).id,'bowl');
  assert.equal(craft([B.RED_MUSHROOM,B.BROWN_MUSHROOM,'bowl'],2,2).id,'mushroom_stew');
  assert.equal(craft([B.BLACKSTONE,B.BLACKSTONE,B.BLACKSTONE,null,'stick',null,null,'stick',null]).id,'stone_pickaxe');
  assert.equal(craft([B.BLACKSTONE,B.BLACKSTONE,B.BLACKSTONE,B.BLACKSTONE,null,B.BLACKSTONE,B.BLACKSTONE,B.BLACKSTONE,B.BLACKSTONE]).id,B.FURNACE);
});

test('stew returns its bowl including the full-inventory drop path',()=>{
  for(const full of [false,true]) {
    const game={player:{position:new THREE.Vector3()},inventory:{addItem(id){this.returned=id;return !full;}},entities:{spawnDroppedItem(pos,id){this.returned=id;}}};
    returnFoodContainer(game,'mushroom_stew');assert.equal(full?game.entities.returned:game.inventory.returned,'bowl');
  }
});

test('Hoglins and Magma Cubes spawn in bright habitats; Piglins and Blazes accept at most light 11',()=>{
  const base={blockBelow:B.NETHERRACK,blockAt:B.AIR,dimension:'nether',skyLight:0,skyDarken:0,random:{nextInt:()=>0}};
  assert.equal(netherWartRefusingPredicate({...base,type:'hoglin',blockLight:15}),true);
  assert.equal(netherWartRefusingPredicate({...base,type:'hoglin',blockBelow:B.NETHER_WART_BLOCK,blockLight:0}),false);
  assert.equal(magmaCubePredicate({...base,type:'magma_cube',blockLight:15}),true);
  for(const type of ['piglin','zombified_piglin']) {assert.equal(netherWartRefusingPredicate({...base,type,blockLight:11}),true);assert.equal(netherWartRefusingPredicate({...base,type,blockLight:12}),false);}
  assert.equal(fortressOnlyPredicate({...base,type:'blaze',structureId:'fortress',blockLight:11}),true);
  assert.equal(fortressOnlyPredicate({...base,type:'blaze',structureId:'bastion_remnant',blockLight:0}),false);
});

test('real natural spawning populates all five Nether biomes without demo mobs',t=>{
  for(const [biome,expected]of [['crimson_forest','hoglin'],['warped_forest','enderman'],['basalt_deltas','magma_cube'],['nether_wastes','zombified_piglin'],['soul_sand_valley','skeleton']]) {
    const w=terrain(4289,biome,2),f=recordingSpawner(w);f.game.player.gamemode='survival';f.game.player.position.y=w.getHeight(8,8,biome)+1;
    f.manager.naturalSpawner.budgetMs=Infinity;
    for(let i=0;i<600;i++)f.manager.update(.05);
    const counts={};for(const mob of f.mobs.mobs)counts[mob.type]=(counts[mob.type]??0)+1;
    assert.ok(counts[expected]>=3,`${biome}: ${JSON.stringify(counts)}`);
    assert.ok(f.mobs.mobs.every(m=>m.naturalSpawn));if(biome==='warped_forest')assert.ok(!counts.hoglin&&!counts.piglin&&!counts.blaze);
    t.diagnostic(`${biome}: ${JSON.stringify(counts)}`);
  }
});

test('mushroom survival respects light, nylium and local spread density; spread gives renewable food',()=>{
  const {w,system}=farm();w.setVoxel(0,3,0,B.BROWN_MUSHROOM);
  assert.equal(canPlantNether(w,0,3,0,B.BROWN_MUSHROOM),true);
  w.getLightLevel=()=>15;assert.equal(canPlantNether(w,0,3,0,B.BROWN_MUSHROOM),false);
  w.setVoxel(0,2,0,B.CRIMSON_NYLIUM);assert.equal(canPlantNether(w,0,3,0,B.BROWN_MUSHROOM),true);
  w.getLightLevel=()=>0;system.random=(()=>{let n=0;return()=>++n%4===1?0:0.99;})();
  system.tickPlant(0,3,0);assert.ok(count(w,B.BROWN_MUSHROOM)>=2);
  for(let x=-2;x<=2;x++)w.setVoxel(x,3,0,B.BROWN_MUSHROOM);
  const before=count(w,B.BROWN_MUSHROOM);system.random=()=>0;system.tickPlant(0,3,0);assert.equal(count(w,B.BROWN_MUSHROOM),before);
});

test('fungus bone meal grows renewable wood only on matching nylium and refuses blocked room',()=>{
  for(const [fungus,soil,stem]of [[B.CRIMSON_FUNGUS,B.CRIMSON_NYLIUM,B.CRIMSON_STEM],[B.WARPED_FUNGUS,B.WARPED_NYLIUM,B.WARPED_STEM]]) {
    const {w,system}=farm();w.setVoxel(0,3,0,fungus);assert.equal(system.boneMeal(0,3,0),false);
    w.setVoxel(0,2,0,soil);w.setVoxel(0,4,0,B.STONE);assert.equal(system.boneMeal(0,3,0),true);assert.equal(w.getVoxel(0,4,0),B.STONE);
    w.setVoxel(0,4,0,B.AIR);assert.equal(system.boneMeal(0,3,0),true);assert.equal(w.getVoxel(0,3,0),stem);
    assert.ok(count(w,B.SHROOMLIGHT)>0);
  }
});

test('mushroom spreading never generates an unloaded neighbouring chunk',()=>{
  const placed=[];
  const w={dimension:'nether',getChunk:(cx,cz)=>cx===0&&cz===0?{}:null,
    getVoxel:(x,y,z)=>y===2?B.NETHERRACK:x===15&&y===3&&z===8?B.BROWN_MUSHROOM:B.AIR,
    getLightLevel:()=>0,setVoxel:(...cell)=>placed.push(cell)};
  const values=[0,...Array.from({length:5},()=>[.99,.5,.5,.5]).flat()];
  const system=new NetherPlantSystem(w,{random:()=>values.shift()??.5});
  system.tickPlant(15,3,8);
  assert.deepEqual(placed,[]);
});

test('Nether wart grows on soul sand without water or light, does not accept bone meal, and saves its age',()=>{
  const {w,system}=farm();w.setVoxel(0,2,0,B.SOUL_SAND);w.setVoxel(0,3,0,B.NETHER_WART);system.register(0,3,0);
  assert.equal(system.boneMeal(0,3,0),false);
  for(let i=0;i<3;i++)system.tickPlant(0,3,0);assert.equal(system.age(0,3,0),3);
  assert.equal(harvestDrops(B.NETHER_WART,{age:0})[0].count,1);assert.ok(harvestDrops(B.NETHER_WART,{age:3})[0].count>=2);
  const saved=w.serializeOrientations();w.structureOrientations.clear();w.restoreOrientations(saved);assert.equal(system.age(0,3,0),3);
  const textures={getFaceUVs:()=>({u0:0,v0:0,u1:1,v1:1})};
  const small=createBlockGeometry(B.NETHER_WART,textures,{plantAge:0}),large=createBlockGeometry(B.NETHER_WART,textures,{plantAge:3});
  small.computeBoundingBox();large.computeBoundingBox();assert.ok(large.boundingBox.max.y>small.boundingBox.max.y);
});

test('charged respawn anchor binds, consumes one charge at a safe respawn and persists through save data',()=>{
  const {w}=farm();w.setVoxel(0,3,0,B.RESPAWN_ANCHOR);
  const player={world:w,position:new THREE.Vector3(3,3,0),gamemode:'survival'},inv={getActiveItem:()=>({id:B.GLOWSTONE,isBlock:true}),consumeActiveItem(){this.used=(this.used??0)+1;}};
  const g={world:w,player,inventory:inv};w.game=g;
  for(let i=0;i<4;i++)assert.equal(useRespawnAnchor(g,0,3,0),true);assert.equal(anchorCharges(w,0,3,0),4);assert.equal(inv.used,4);
  inv.getActiveItem=()=>null;useRespawnAnchor(g,0,3,0);assert.equal(player.anchorSpawn.dimension,'nether');
  const saved=capturePlayerState(player),restored={};applyPlayerState(restored,saved);assert.deepEqual(restored.anchorSpawn,player.anchorSpawn);
  assert.ok(consumeAnchorRespawn(player));assert.equal(anchorCharges(w,0,3,0),3);
  const data=w.serializeOrientations();w.structureOrientations.clear();w.restoreOrientations(data);assert.equal(anchorCharges(w,0,3,0),3);
  player.anchorSpawn.dimension='overworld';assert.equal(consumeAnchorRespawn(player),null);
  assert.equal(blockEmission(B.RESPAWN_ANCHOR,w,0,3,0),12);
});

test('charged anchors explode outside Nether, and obstructed anchors retain their charge',()=>{
  const {w}=farm();w.setVoxel(0,3,0,B.RESPAWN_ANCHOR);w.structureOrientations.set('0,3,0',{x:0,y:3,z:0,id:B.RESPAWN_ANCHOR,anchorCharges:1});
  const player={world:w,position:new THREE.Vector3(),anchorSpawn:{x:0,y:3,z:0,dimension:'nether'}},g={world:w,player,inventory:{getActiveItem:()=>null},bedManager:{explode(){g.exploded=true;}}};
  for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)if(x||z)for(let y=2;y<=5;y++)w.setVoxel(x,y,z,B.STONE);
  assert.equal(consumeAnchorRespawn(player),null);assert.equal(anchorCharges(w,0,3,0),1);
  w.dimension='overworld';useRespawnAnchor(g,0,3,0);assert.equal(g.exploded,true);
});

test('opaque Nether emitters actually light their neighbours',()=>{
  const {w}=farm();w.setVoxel(0,3,0,B.SHROOMLIGHT);w.light.relightAll();
  assert.equal(w.getBlockLight(0,3,0),15);assert.ok(w.getBlockLight(1,3,0)>=14);
});

test('default Nether structures appear in real chunks with loot, wart, residents and typed spawners',()=>{
  const w=new World(20250401,'nether_wastes');
  for(const id of ['fortress','bastion_remnant','ruined_portal_nether'])assert.ok(w.structures.enabledIds.includes(id));
  for(const id of ['fortress','bastion_remnant']) {
    const found=w.structures.engine.locate(id,0,0,{maxRadiusChunks:128});assert.ok(found,id);
    const c=w.getOrCreateChunk(...found.chunk);assert.ok(c.voxels.some(v=>[B.NETHER_BRICKS,B.BLACKSTONE,B.POLISHED_BLACKSTONE_BRICKS].includes(v)));
    const start=found.start;
    // Generate the chunks with block entities too, without generating an entire map.
    const needed=new Set();
    w.structures.engine.realize(start,(x,y,z,block,meta)=>{if(meta?.lootTable||meta?.spawner||block===B.NETHER_WART)needed.add(`${Math.floor(x/16)},${Math.floor(z/16)}`);return true;});
    for(const key of needed)w.getOrCreateChunk(...key.split(',').map(Number));
  }
  assert.ok(w.structures.stats.structures>0);
  assert.ok(w.structures.loot.length>0,'generated chests carry loot tables');
  assert.ok(w.spawners().some(s=>s.mob==='blaze'),'a real fortress includes Blaze spawners');
  assert.ok(count(w,B.NETHER_WART)>0,'real generated wart farms');
  assert.ok(w.structures.spawns.some(s=>['piglin','piglin_brute','hoglin'].includes(s.type)),'real bastion residents');
});
