import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Chunk } from '../src/world.js';
import { BLOCKS, BLOCK_DEFS, WATER_PLANT_BLOCK_IDS } from '../src/blocks.js';
import { waterReplaceable } from '../src/waterSimulation.js';
import { ChunkMesher } from '../src/mesher.js';
import { applyPresetFixture } from './helpers/presetGenerationFixture.js';

const tex = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };
function emptyWorld() {
  const world = new World();
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) {
    world.chunks.set(`${cx},${cz}`, new Chunk(cx, cz));
  }
  return world;
}
const dispose = group => Object.values(group).forEach(g => g?.dispose());

test('every waterlogged sea plant survives fluid ticks without dirtying its chunk or dropping items', () => {
  const w = emptyWorld(), c = w.getChunk(0, 0);
  for (let x=1; x<=14; x++) for (let z=1; z<=14; z++) for(let y=0; y<=4; y++) {
    c.setVoxel(x,y,z, y===0 || x===1 || x===14 || z===1 || z===14 ? BLOCKS.STONE : BLOCKS.WATER);
  }
  const cells = [...WATER_PLANT_BLOCK_IDS].map((id, i) => [2 + i%11, 1 + Math.floor(i/121), 2 + Math.floor(i/11)%11, id]);
  for (const [x,y,z,id] of cells) {
    c.setVoxel(x,y,z,id);
    assert.equal(waterReplaceable(id), false);
    assert.equal(w.getWaterLevel(x,y,z), 0);
    w.water.notify(x,y,z);
  }
  c.dirty = false;
  let drops=0; w.water.onDisplace=()=>drops++;
  let changes=0;
  for (let i=0;i<20;i++) changes+=w.water.tick();
  assert.equal(changes,0);
  assert.equal(drops,0);
  assert.equal(c.dirty,false);
  for (const [x,y,z,id] of cells) assert.equal(w.getVoxel(x,y,z),id);
  assert.equal(w.water.pending.size,0);
});

test('Warm Ocean + Reef Life retains all generated sea plants after forty fluid ticks', t => {
  applyPresetFixture(t,'reef_life');
  const w=new World(12345,'warm_ocean'), plants=[];
  for(let cx=-2;cx<=2;cx++)for(let cz=-2;cz<=2;cz++) {
    const c=w.getOrCreateChunk(cx,cz);
    for(let i=0;i<c.voxels.length;i++) if(BLOCK_DEFS[c.voxels[i]]?.waterPlant) plants.push([c,i,c.voxels[i]]);
  }
  assert.ok(plants.length>2000,'exercise a densely populated reef');
  assert.equal(w.water.pending.size,0,'source oceans and air above their surface are already settled');
  for(let i=0;i<40;i++) w.water.tick();
  for(const [c,i,id] of plants) assert.equal(c.voxels[i],id);
  assert.equal(w.water.pending.size,0,'a settled reef must not keep scheduling fluid work');
});

test('waterlogged plants support renewable water, but dry plants remain replaceable',()=>{
  const w=emptyWorld();
  w.setVoxel(7,0,8,BLOCKS.STONE);w.setVoxel(8,0,8,BLOCKS.STONE);w.setVoxel(9,0,8,BLOCKS.STONE);
  w.setVoxel(7,1,8,BLOCKS.SEAGRASS);w.setVoxel(9,1,8,BLOCKS.SEA_PICKLE);
  w.water.tick();
  assert.equal(w.getWaterLevel(8,1,8),0);
  assert.equal(w.getVoxel(7,1,8),BLOCKS.SEAGRASS);
  assert.equal(w.getVoxel(9,1,8),BLOCKS.SEA_PICKLE);
  assert.ok(waterReplaceable(BLOCKS.DANDELION));
  w.setVoxel(3,1,3,BLOCKS.DANDELION);assert.equal(w.getWaterLevel(3,1,3),-1);
});

test('16-bit reef block IDs cull interior opaque faces, including negative chunk seams',()=>{
  for(const [x,otherX] of [[7,8],[-1,0],[15,16]]) {
    const w=emptyWorld();w.setVoxel(x,10,8,BLOCKS.TUBE_CORAL_BLOCK);w.setVoxel(otherX,10,8,BLOCKS.BRAIN_CORAL_BLOCK);
    const c=w.getChunk(Math.floor(x/16),0),g=new ChunkMesher(tex).meshChunk(c,w);
    assert.equal(g.opaqueGeo.index.count, x===7 ? 60 : 30,'only the exposed five faces per block');
    dispose(g);
  }
});

test('16-bit sea plants do not emit hidden water faces at interiors or chunk seams',()=>{
  for(const x of [7,-1,15]) {
    const w=emptyWorld();w.setVoxel(x,10,8,BLOCKS.WATER);w.setVoxel(x+1,10,8,BLOCKS.SEA_PICKLE);
    const g=new ChunkMesher(tex).meshChunk(w.getChunk(Math.floor(x/16),0),w);
    assert.equal(g.waterGeo.index.count,30);
    dispose(g);
  }
});

test('resumable meshing preserves 16-bit reef geometry and cached water corners',()=>{
  const w=new World(12345,'warm_ocean');
  for(let cx=-1;cx<=1;cx++)for(let cz=-1;cz<=1;cz++)w.getOrCreateChunk(cx,cz);
  const c=w.getChunk(0,0),mesher=new ChunkMesher(tex);
  const oneShot=mesher.meshChunk(c,w),iterator=mesher.beginChunkMesh(c,w);
  let step=iterator.next();while(!step.done)step=iterator.next();
  for(const name of Object.keys(oneShot)) {
    const a=oneShot[name],b=step.value[name];
    assert.equal(!!a,!!b,name);if(!a)continue;
    assert.deepEqual(b.index?.array,a.index?.array,name);
    for(const attr of Object.keys(a.attributes))assert.deepEqual(b.attributes[attr].array,a.attributes[attr].array,`${name}/${attr}`);
  }
  dispose(oneShot);dispose(step.value);
});
