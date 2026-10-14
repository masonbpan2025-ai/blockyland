import test from 'node:test';
import assert from 'node:assert/strict';
import {World,Chunk,CHUNK_HEIGHT} from '../src/world.js';
import {BLOCKS,BLOCK_DEFS} from '../src/blocks.js';
import {getBiomeDef} from '../src/biomes.js';
import {mountainColumn} from '../src/worldgen/mountainTerrain.js';
import {TextureManager} from '../src/textures.js';
import {createBlockGeometry} from '../src/blockGeometry.js';

const biomes=['frozen_peaks','jagged_peaks','snowy_slopes','grove','stony_peaks'];
function world(seed,biome){const w=new World(seed,biome);w.structures=null;return w;}
for(const biome of biomes)test(`${biome}: summits vary by seed and never hit the height ceiling`,()=>{
  const a=world(4289,biome),b=world(9876,biome);let min=64,max=0,different=0;
  for(let x=-96;x<96;x+=3)for(let z=-96;z<96;z+=3){const h=a.getHeight(x,z,biome);min=Math.min(min,h);max=Math.max(max,h);assert.ok(h<CHUNK_HEIGHT-6);assert.ok(h>a.seaLevel);if(h!==b.getHeight(x,z,biome))different++;}
  assert.ok(max-min>=15,`${biome} has meaningful relief`);assert.ok(different>2000);
});

function samples(biome){const w=world(4289,biome),counts=new Map();let deepSnow=0;
 for(let cx=0;cx<4;cx++)for(let cz=0;cz<4;cz++){
  const c=w.getOrCreateChunk(cx,cz);
  for(let x=0;x<16;x++)for(let z=0;z<16;z++){
   const h=w.surfaceHeightAt(cx*16+x,cz*16+z,biome);for(let y=h-12;y<=h+1;y++){const id=c.getVoxel(x,y,z);counts.set(id,(counts.get(id)||0)+1);}
   if(c.getVoxel(x,h,z)===BLOCKS.SNOW&&c.getVoxel(x,h-2,z)===BLOCKS.SNOW)deepSnow++;
  }
 }return {w,counts,deepSnow};
}
test('Frozen Peaks contain deep packed-ice glaciers, snow cover and occasional ice, never powder snow',()=>{
 const {counts,deepSnow}=samples('frozen_peaks');assert.ok(counts.get(BLOCKS.PACKED_ICE)>10000);assert.ok(counts.get(BLOCKS.SNOW)>3000);assert.ok(counts.get(BLOCKS.ICE)>0);assert.ok(deepSnow>200);assert.ok(!counts.get(BLOCKS.POWDER_SNOW));
});
test('Jagged Peaks use rock and snow instead of the Frozen Peaks ice mantle',()=>{
 const {counts}=samples('jagged_peaks');assert.ok(counts.get(BLOCKS.SNOW)>1000);assert.ok(counts.get(BLOCKS.STONE)>1000);assert.ok(!counts.get(BLOCKS.PACKED_ICE));assert.ok(!counts.get(BLOCKS.POWDER_SNOW));
});
for(const biome of ['snowy_slopes','grove'])test(`${biome}: multiple snow layers and coherent powder-snow pockets`,()=>{
 const {counts,deepSnow,w}=samples(biome);assert.ok(deepSnow>1000);assert.ok(counts.get(BLOCKS.POWDER_SNOW)>100);assert.ok(!counts.get(BLOCKS.PACKED_ICE));
 let pairs=0,adjacent=0;
 for(let x=0;x<63;x++)for(let z=0;z<64;z++){
  const profile=mountainColumn(w,x,z,getBiomeDef(biome),w.surfaceHeightAt(x,z,biome));
  if(profile.powderDepth){pairs++;if(mountainColumn(w,x+1,z,getBiomeDef(biome),w.surfaceHeightAt(x+1,z,biome)).powderDepth)adjacent++;}
 }assert.ok(adjacent/pairs>.5,'powder snow makes contiguous bands, not per-block speckling');
});
test('warm Stony Peaks retain stone/calcite and do not receive the old global snowy cap',()=>{
 const {counts}=samples('stony_peaks');assert.ok(counts.get(BLOCKS.CALCITE)>0);assert.ok(!counts.get(BLOCKS.SNOW));assert.ok(!counts.get(BLOCKS.SNOW_LAYER));
});
test('north/east-facing steep Frozen Peaks expose packed ice beneath a snow mantle',()=>{
 const w=world(4289,'frozen_peaks');let cliffs=0;
 for(let x=-64;x<64;x++)for(let z=-64;z<64;z++){
  const c=mountainColumn(w,x,z,getBiomeDef('frozen_peaks'),w.surfaceHeightAt(x,z,'frozen_peaks'));
  if(!c.snowDepth){cliffs++;assert.ok([BLOCKS.PACKED_ICE,BLOCKS.ICE].includes(c.top));assert.ok(c.iceDepth>=7);}
 }assert.ok(cliffs>100);
});
test('border surface rules do not load chunks and generated terrain is order independent',()=>{
 const a=world(4321,'frozen_peaks'),b=world(4321,'frozen_peaks');mountainColumn(a,16,0,getBiomeDef('frozen_peaks'),a.surfaceHeightAt(16,0));assert.equal(a.chunks.size,0);
 a.getOrCreateChunk(-1,0);a.getOrCreateChunk(0,0);b.getOrCreateChunk(0,0);b.getOrCreateChunk(-1,0);
 for(const key of ['-1,0','0,0'])assert.deepEqual(a.chunks.get(key).voxels,b.chunks.get(key).voxels);
});
test('snow ledges render as one-eighth layers while ordinary carpets keep their old height',()=>{
 const tm={getFaceUVs:()=>({u0:0,v0:0,u1:1,v1:1})};const g=createBlockGeometry(BLOCKS.SNOW_LAYER,tm);g.computeBoundingBox();assert.equal(g.boundingBox.max.y-g.boundingBox.min.y,1/8);assert.equal(BLOCK_DEFS[BLOCKS.SNOW_LAYER].solid,false);g.dispose();
});


test('snowy spruce retains its full canopy, with thin snow only above exposed leaves',()=>{
 const w=world(4289,'grove'),bare=new Chunk(0,0),snowy=new Chunk(0,0);
 w.generateSpruceTree(bare,8,10,8,false,false);w.generateSpruceTree(snowy,8,10,8,false,true);
 let layers=0;
 for(let x=0;x<16;x++)for(let z=0;z<16;z++)for(let y=0;y<64;y++){
  const a=bare.getVoxel(x,y,z),b=snowy.getVoxel(x,y,z);
  if(a===BLOCKS.SPRUCE_LEAVES||a===BLOCKS.SPRUCE_LOG)assert.equal(b,a,'snow never displaces future leaves or trunk');
  if(b===BLOCKS.SNOW_LAYER){layers++;assert.equal(snowy.getVoxel(x,y-1,z),BLOCKS.SPRUCE_LEAVES);}
 }assert.ok(layers>10);
});
test('atlas coordinates sample texel centres, preventing dark tile-edge seams',async t=>{
 const previous=globalThis.Image;t.after(()=>{if(previous)globalThis.Image=previous;else delete globalThis.Image;});
 globalThis.Image=class{set src(v){this.width=this.height=16;this.onload();}};
 const manager=Object.assign(Object.create(TextureManager.prototype),{nextCol:3,nextRow:2,tileSize:16,atlasGridSize:32,tileCoords:{},ctx:{drawImage(){}}});
 await manager.loadAndPlaceTile('snow.png');const uv=manager.tileCoords['snow.png'];
 assert.equal(uv.u0,(3*16+.5)/512);assert.equal(uv.u1,(4*16-.5)/512);assert.equal(uv.v0,1-(3*16-.5)/512);assert.equal(uv.v1,1-(2*16+.5)/512);
});


test('mixed-biome cold mountains include snowy slopes and wooded groves below their peaks',()=>{
 const w=Object.assign(Object.create(World.prototype),{selectedBiome:'all',dimension:'overworld',biomeNoise:{noise2D:()=>-.25},detailNoise:{noise2D:()=>0},noise:{noise2D:()=>.6}});
 assert.equal(w.getBiome(0,0),'frozen_peaks');w.noise.noise2D=()=>.4;assert.equal(w.getBiome(0,0),'snowy_slopes');w.noise.noise2D=()=>.3;assert.equal(w.getBiome(0,0),'grove');w.noise.noise2D=()=>.1;assert.equal(w.getBiome(0,0),'taiga');
});
