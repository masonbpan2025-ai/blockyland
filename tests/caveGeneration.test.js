import test from 'node:test';
import assert from 'node:assert/strict';
import {World,CHUNK_HEIGHT} from '../src/world.js';
import {BLOCKS as B,BLOCK_DEFS} from '../src/blocks.js';
import {CAVE_KIND} from '../src/worldgen/caveTerrain.js';
import {MobSpawnManager} from '../src/spawning/mobSpawnManager.js';
import {biomeSpawnsFor} from '../src/spawning/biomeSpawnResolver.js';
import {blockEmission} from '../src/spawning/lightEngine.js';
import {createBlockGeometry} from '../src/blockGeometry.js';
import {WORLD_STRUCTURE_IDS} from '../src/worldStructures.js';
import {findSurfaceSpawn} from '../src/worldSpawn.js';

function bare(seed=4289,biome='plains'){const w=new World(seed,biome);w.structures=null;return w;}
function region(w,min=-1,max=1){for(let cx=min;cx<=max;cx++)for(let cz=min;cz<=max;cz++)w.getOrCreateChunk(cx,cz);return w;}
function counts(w){const result=new Map();for(const c of w.chunks.values())for(const id of c.voxels)result.set(id,(result.get(id)||0)+1);return result;}
const passable=id=>id===B.AIR||!!BLOCK_DEFS[id]?.plant||BLOCK_DEFS[id]?.solid===false&&![B.WATER,B.LAVA].includes(id);

test('ordinary new worlds physically contain roofed caves and natural surface entrances',()=>{
 const w=new World(4289,'all');region(w,0,2);let air=0,mouths=0,ores=0;
 const oreIds=new Set([B.COAL_ORE,B.IRON_ORE,B.GOLD_ORE,B.DIAMOND_ORE,B.REDSTONE_ORE]);
 for(let x=0;x<48;x++)for(let z=0;z<48;z++){const h=w.surfaceHeightAt(x,z);if(w.getVoxel(x,h,z)===B.AIR&&w.getVoxel(x,h-1,z)===B.AIR)mouths++;
 for(let y=4;y<h-4;y++){if(w.getVoxel(x,y,z)===B.AIR)air++;if(oreIds.has(w.getVoxel(x,y,z))&&[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>w.getVoxel(x+dx,y,z+dz)===B.AIR))ores++;}}
 assert.ok(air>1000,`only ${air} underground air cells`);assert.ok(mouths>5,`only ${mouths} entrances`);assert.ok(ores>20,'ores are exposed on cave walls');
});

test('a surface mouth connects to a two-block-high passage at least eight blocks underground',()=>{
 const w=region(bare(),-2,2),queue=[],seen=new Set();
 for(let x=-16;x<32;x++)for(let z=-16;z<32;z++){const h=w.surfaceHeightAt(x,z);if(w.getVoxel(x,h,z)===B.AIR&&w.getVoxel(x,h+1,z)===B.AIR)queue.push([x,h,z]);}
 assert.ok(queue.length>0,'surface openings exist');let reached=false;
 for(const p of queue)seen.add(p.join(','));
 for(let i=0;i<queue.length&&i<150000;i++){const [x,y,z]=queue[i];
 if(y<=w.surfaceHeightAt(x,z)-8){reached=true;break;}
 for(const [dx,dy,dz]of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,-1,0],[0,1,0]]){const a=x+dx,b=y+dy,c=z+dz,key=`${a},${b},${c}`;if(seen.has(key)||a< -30||a>46||c< -30||c>46||b<4||b>w.surfaceHeightAt(a,c)+1)continue;if(passable(w.getVoxel(a,b,c))&&passable(w.getVoxel(a,b+1,c))){seen.add(key);queue.push([a,b,c]);}}}
 assert.equal(reached,true,'entrances must not end in sealed bubbles');
});

test('cheese chambers, spaghetti, noodles, carver trunks and surface ramps all occur',()=>{
 const w=bare(),found=new Map();for(let x=-32;x<64;x+=2)for(let z=-32;z<64;z+=2){const c=w.caves.column(x,z);for(let y=4;y<=c.height;y++){const kind=w.caves.kindAt(x,y,z,c);for(const bit of Object.values(CAVE_KIND))if(kind&bit)found.set(bit,(found.get(bit)||0)+1);}}
 for(const [name,bit]of Object.entries(CAVE_KIND))assert.ok(found.get(bit)>5,`${name} not generated`);
});

test('noise pillars leave tall solid columns inside the cavern instead of a featureless hollow box',()=>{
 const w=region(bare(4289,'lush_caves'));let pillars=0,open=0;
 for(let x=-16;x<32;x++)for(let z=-16;z<32;z++){let solid=0;for(let y=15;y<28;y++){const id=w.getVoxel(x,y,z);if(id!==B.AIR&&BLOCK_DEFS[id]?.solid!==false&&!BLOCK_DEFS[id]?.plant)solid++;}if(solid>=10)pillars++;if(solid<=2)open++;}
 assert.ok(pillars>20);assert.ok(open>300);
});

for(const biome of ['plains','forest','desert','frozen_peaks','ocean'])test(`${biome}: cave tunnels reach the surface without a permanent six-block crust`,()=>{
 const w=bare(4319,biome);let mouths=0;
 // An area around three independently seeded regional entrances, generated
 // through the actual chunk API rather than by directly placing any cave blocks.
 for(const [gx,gz]of [[0,0],[-1,0],[0,-1]]){const exit=w.caves.region(gx,gz).entrance;const x=Math.floor(exit[0]),z=Math.floor(exit[2]);for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){const px=x+dx,pz=z+dz;w.getOrCreateChunk(Math.floor(px/16),Math.floor(pz/16));const id=w.getVoxel(px,w.surfaceHeightAt(px,pz),pz);if(id===B.AIR||id===B.WATER)mouths++;}}
 assert.ok(mouths>3,`${biome}: no generated cave entrance`);
});

test('aquifers have local water tables, deep lava and solid separation instead of flooding every cave',()=>{
 const w=region(bare(),-2,2),n=counts(w);assert.ok(n.get(B.WATER)>50);assert.ok(n.get(B.LAVA)>50);assert.ok(n.get(B.AIR)>n.get(B.WATER)*10);
 // The aquifers' own water is source water; what flows on from it into the caves below is settled before the chunk
 // appears (worldgen/settleWater.js), so only the sources hold the water table.
 const tables=new Set();for(let x=-32;x<48;x++)for(let z=-32;z<48;z++)for(let y=2;y<14;y++){const id=w.getVoxel(x,y,z);if(id===B.WATER){if(w.getWaterLevel(x,y,z)===0){tables.add(w.caves.column(x,z).waterTable);assert.ok(y>=6);}for(const [dx,dy,dz]of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]])assert.notEqual(w.getVoxel(x+dx,y+dy,z+dz),B.LAVA,'generated water touches lava');}}
 assert.ok(tables.size>1,'one global sea level is not an aquifer system');
});

test('Lush Caves preset has a roof, moss/clay pools, supported vines, blossoms and berry light',()=>{
 const w=region(bare(4289,'lush_caves')),n=counts(w);for(const id of [B.MOSS_BLOCK,B.CLAY,B.WATER,B.CAVE_VINES,B.CAVE_VINES_PLANT,B.SPORE_BLOSSOM])assert.ok(n.get(id)>5,`${BLOCK_DEFS[id].name} missing`);
 let berries=0;for(const [key,s]of w.structureOrientations)if(s.berries){const p=key.split(',').map(Number);assert.equal(blockEmission(s.id,w,...p),14);assert.ok(w.getVoxel(p[0],p[1]+1,p[2])!==B.AIR,'vines must hang from a vine or ceiling');berries++;}assert.ok(berries>10);
 let valid=0;for(let x=0;x<16;x++)for(let z=0;z<16;z++){const y=w.getHighestSolidY(x,z);if(y>0){assert.ok(y<34,'spawn floor must be under the cavern ceiling');assert.ok(w.getVoxel(x,w.surfaceHeightAt(x,z),z)!==B.AIR,'roof exists above cavern');valid++;}}assert.ok(valid>100);
});

test('Dripstone Caves generate both supported stalactites and stalagmites, not cube spikes',()=>{
 const w=region(bare(4289,'dripstone_caves')),n=counts(w);assert.ok(n.get(B.DRIPSTONE_BLOCK)>100);assert.ok(n.get(B.POINTED_DRIPSTONE)>100);
 const orientations=[...w.structureOrientations.values()].filter(s=>s.id===B.POINTED_DRIPSTONE);assert.ok(orientations.some(s=>s.verticalDirection==='up'));assert.ok(orientations.some(s=>s.verticalDirection==='down'));
 const tm={getFaceUVs:()=>({u0:0,v0:0,u1:1,v1:1})},up=createBlockGeometry(B.POINTED_DRIPSTONE,tm,{verticalDirection:'up'}),down=createBlockGeometry(B.POINTED_DRIPSTONE,tm,{verticalDirection:'down'});up.computeBoundingBox();assert.ok(up.boundingBox.max.x-up.boundingBox.min.x<.6);assert.notDeepEqual([...up.attributes.position.array],[...down.attributes.position.array]);up.dispose();down.dispose();
});

test('mixed worlds have underground biome volumes and the real spawner uses their Y coordinate',()=>{
 const w=bare(4289,'all'),found=new Map();for(let x=-128;x<=128;x+=8)for(let z=-128;z<=128;z+=8){const b=w.getBiomeAt(x,7,z);if(!found.has(b))found.set(b,[x,7,z]);assert.equal(w.getBiomeAt(x,63,z),w.getBiome(x,z));}
 for(const b of ['lush_caves','dripstone_caves','deep_dark'])assert.ok(found.has(b),`${b} absent from ordinary mixed worlds`);
 const manager=Object.create(MobSpawnManager.prototype);manager.game={world:w};const p=found.get('deep_dark');assert.equal(manager.biomeAt(...p),'deep_dark');assert.deepEqual(biomeSpawnsFor(manager.biomeAt(...p),'monster'),[],'deep dark must not naturally spawn ordinary hostile mobs');
 for(let x=-128;x<=128;x+=8)for(let z=-128;z<=128;z+=8)if(/ocean/.test(w.getBiome(x,z)))assert.notEqual(w.getBiomeAt(x,7,z),'deep_dark');
});

test('Deep Dark preset is roofed and has sculk patches and sensors, not an exposed sculk plain',()=>{
 const w=region(bare(4289,'deep_dark')),n=counts(w);for(const id of [B.DEEPSLATE,B.SCULK,B.SCULK_SENSOR,B.SCULK_SHRIEKER,B.SCULK_CATALYST])assert.ok(n.get(id)>0,`${BLOCK_DEFS[id].name} absent`);
 assert.ok(w.getHighestSolidY(8,8)<w.surfaceHeightAt(8,8)-10);
});

test('bedrock survives carving; all Nether presets gain lower/ceiling tunnels and no End island is carved',()=>{
 for(const biome of ['plains','nether_wastes','crimson_forest','warped_forest','soul_sand_valley','basalt_deltas']){const w=region(bare(4289,biome),0,1);let cavities=0;for(let x=0;x<32;x++)for(let z=0;z<32;z++){assert.equal(w.getVoxel(x,0,z),B.BEDROCK);if(w.dimension==='nether'){assert.equal(w.getVoxel(x,CHUNK_HEIGHT-1,z),B.BEDROCK);for(let y=55;y<62;y++)if(w.getVoxel(x,y,z)===B.AIR)cavities++;}}if(w.dimension==='nether')assert.ok(cavities>10);}
 const end=bare(4289,'the_end');end.caves.cellAt=()=>{throw new Error('End must not use Overworld cave carving');};end.getOrCreateChunk(0,0);
});

test('caves cross chunk boundaries and generation is deterministic in either chunk order',()=>{
 const a=bare(4289),b=bare(4289);for(const p of [[-1,0],[0,0],[1,0]])a.getOrCreateChunk(...p);for(const p of [[1,0],[0,0],[-1,0]])b.getOrCreateChunk(...p);
 for(const key of ['-1,0','0,0','1,0'])assert.deepEqual(a.chunks.get(key).voxels,b.chunks.get(key).voxels);
 let openings=0;for(let z=0;z<16;z++)for(let y=4;y<18;y++)if(a.getVoxel(15,y,z)===B.AIR&&a.getVoxel(16,y,z)===B.AIR)openings++;assert.ok(openings>10,'chunk boundary sealed the cave');
 const old=a.chunks.get('0,0').voxels.slice();a.reseed(9891,'plains');a.structures=null;assert.notDeepEqual(a.getOrCreateChunk(0,0).voxels,old);a.reseed(4289,'plains');a.structures=null;assert.deepEqual(a.getOrCreateChunk(0,0).voxels,old);
});

test('structure solidAtGen agrees with actual carved terrain without loading any chunks',()=>{
 const a=bare(),b=region(bare());let cavities=0;for(let x=0;x<24;x+=2)for(let z=0;z<24;z+=2)for(let y=2;y<24;y++){const id=b.getVoxel(x,y,z);if([B.AIR,B.WATER,B.LAVA].includes(id)){assert.equal(a.solidAtGen(x,y,z),false);cavities++;}else if(!BLOCK_DEFS[id]?.plant&&BLOCK_DEFS[id]?.solid!==false)assert.equal(a.solidAtGen(x,y,z),true);}
 assert.ok(cavities>100);assert.equal(a.chunks.size,0);
});

test('cave plant and dripstone orientation/berry state survives save and restore',()=>{
 const w=region(bare(4289,'lush_caves'),0,0),saved=w.serializeOrientations();assert.ok(saved.some(s=>s.berries));w.structureOrientations.clear();w.restoreOrientations(saved);assert.deepEqual(w.serializeOrientations(),saved);
 const d=region(bare(4289,'dripstone_caves'),0,0),state=d.serializeOrientations();assert.ok(state.some(s=>s.verticalDirection==='down'));d.structureOrientations.clear();d.restoreOrientations(state);assert.deepEqual(d.serializeOrientations(),state);
});

test('flat and authored maps stay uncarved, and cave-associated features are enabled normally',()=>{
 const flat=bare();flat.isFlatWorld=true;const c=flat.getOrCreateChunk(0,0);for(let x=0;x<16;x++)for(let z=0;z<16;z++){assert.equal(c.getVoxel(x,4,z),B.GRASS);assert.equal(c.getVoxel(x,3,z),B.DIRT);}
 const authored=bare();authored.generationMode='authored';assert.ok(authored.getOrCreateChunk(0,0).voxels.every(id=>id===B.AIR));
 for(const biome of ['lush_caves','nether']){const map=bare(4289,biome);map.generationMode='authored';map.getOrCreateChunk(0,0).setVoxel(0,58,0,B.STONE);assert.equal(map.getHighestSolidY(0,0),58,'authored floors must not use cave-preset spawn rules');}
 for(const id of ['monster_room','amethyst_geode','mineshaft','mineshaft_mesa','ancient_city'])assert.ok(WORLD_STRUCTURE_IDS.includes(id));
});

test('Create New World cave presets have a safe interior spawn and dimension switches keep separate cave profiles',()=>{
 for(const biome of ['lush_caves','dripstone_caves','deep_dark']){const w=region(bare(4289,biome),0,1),spawn=findSurfaceSpawn(w,{x:8,z:8,radius:12});assert.equal(spawn.found,true,biome);assert.ok(spawn.y<34,`${biome}: spawned on the roof at ${spawn.y}`);assert.equal(w.getVoxel(Math.floor(spawn.x),spawn.y,Math.floor(spawn.z)),B.AIR);}
 const a=bare(4289,'all');a.getOrCreateChunk(0,0);a.switchDimension('nether');a.structures=null;const got=a.getOrCreateChunk(0,0),b=bare(4289,'nether');assert.deepEqual(got.voxels,b.getOrCreateChunk(0,0).voxels,'Overworld cave cache leaked into the Nether');
});

test('cave-associated features actually write blocks through the default world pipeline',()=>{
 for(const [id,biome]of [['amethyst_geode','plains'],['mineshaft','plains'],['monster_room','plains'],['ancient_city','deep_dark']]){
   const w=new World(4289,biome),without=bare(4289,biome),found=w.structures.engine.locate(id,0,0,{maxRadiusChunks:32});assert.ok(found,`${id}: no default generation candidate`);
   const chunk=w.getOrCreateChunk(...found.chunk),plain=without.getOrCreateChunk(...found.chunk);let changed=0;for(let i=0;i<chunk.voxels.length;i++)if(chunk.voxels[i]!==plain.voxels[i])changed++;
   assert.ok(changed>20,`${id}: default generation wrote no visible feature blocks`);assert.ok(w.structures.stats.structures>0);
 }
});

test('generated glow berries propagate real block light and plain vines emit none',()=>{
 const w=region(bare(4289,'lush_caves'));const s=[...w.structureOrientations.values()].find(s=>s.berries&&s.x>=0&&s.z>=0&&s.x<16&&s.z<16);assert.ok(s);
 w.light.relightChunk(0,0);assert.equal(w.getBlockLight(s.x,s.y,s.z),14);
 const plain=[...w.structureOrientations.values()].find(s=>s.berries===false);assert.ok(plain);assert.equal(blockEmission(plain.id,w,plain.x,plain.y,plain.z),0);
});

test('mixed-world mineshaft gating consults the underground biome and excludes deep dark',()=>{
 const w=new World(4289,'plains'),found=w.structures.engine.locate('mineshaft',0,0,{maxRadiusChunks:32});assert.ok(found);
 assert.ok(w.structures.engine.planChunkAll(...found.chunk).some(s=>s.structureId==='mineshaft'));
 w.getBiomeAt=()=> 'deep_dark';w.rebuildStructures();
 assert.ok(!w.structures.engine.planChunkAll(...found.chunk).some(s=>s.structureId==='mineshaft'));
});
