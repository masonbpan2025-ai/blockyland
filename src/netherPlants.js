import { BLOCKS as B, BLOCK_DEFS } from './blocks.js';

const mushrooms=new Set([B.RED_MUSHROOM,B.BROWN_MUSHROOM]);
const fungi=new Set([B.CRIMSON_FUNGUS,B.WARPED_FUNGUS]);
const specialSoils=new Set([B.CRIMSON_NYLIUM,B.WARPED_NYLIUM,B.MYCELIUM,B.PODZOL]);
const dirtSoils=new Set([B.GRASS,B.DIRT,B.COARSE_DIRT,B.ROOTED_DIRT,B.MYCELIUM,B.PODZOL,B.MOSS_BLOCK,B.FARMLAND,B.FARMLAND_MOIST]);
export const netherWartHeight=age=>[0.3125,0.5,0.625,0.875][Math.max(0,Math.min(3,age??3))];
export const isNetherFarmPlant=id=>mushrooms.has(id)||fungi.has(id)||id===B.NETHER_WART;
export function netherPlantSupport(below,id) {
  const def=BLOCK_DEFS[below];
  if(id===B.NETHER_WART)return below===B.SOUL_SAND;
  if(id===B.WEEPING_VINES)return below===B.WEEPING_VINES||!!def&&def.solid!==false;
  if(id===B.TWISTING_VINES&&below===B.TWISTING_VINES)return true;
  if(mushrooms.has(id))return specialSoils.has(below)||!!def && def.solid!==false && !def.transparent && !def.plant;
  if(fungi.has(id)||[B.CRIMSON_ROOTS,B.WARPED_ROOTS,B.NETHER_SPROUTS,B.TWISTING_VINES].includes(id))return dirtSoils.has(below)||specialSoils.has(below)||below===B.SOUL_SOIL;
  return null;
}
export function canPlantNether(world,x,y,z,id) {
  const below=world.getVoxel(x,y-1,z);
  if(netherPlantSupport(below,id)!==true)return false;
  return !mushrooms.has(id)||specialSoils.has(below)||(world.getLightLevel?.(x,y,z)??0)<13;
}

// Random-tick probabilities are retained rather than turning food into a fast
// regeneration bonus. Indexing avoids scanning every loaded voxel each frame.
export class NetherPlantSystem {
  constructor(world,{random=()=>Math.random(),changed=()=>{},drop=()=>{}}={}) {
    this.world=world;this.random=random;this.changed=changed;this.drop=drop;this.plants=new Map();this.scanned=new WeakSet();this.timer=0;
  }
  key(x,y,z){return `${this.world.dimension}:${x},${y},${z}`;}
  register(x,y,z){const id=this.world.getVoxel(x,y,z);if(isNetherFarmPlant(id)){this.plants.set(this.key(x,y,z),{x,y,z,dimension:this.world.dimension});if(id===B.NETHER_WART&&!this.world.structureOrientations?.has(`${x},${y},${z}`))this.setAge(x,y,z,0);}}
  discover(){
    // At most one previously unseen chunk per update; initial map loading must
    // not cause a whole-world plant scan on the rendering thread.
    for(const chunk of this.world.chunks?.values()??[]) {
      if(this.scanned.has(chunk))continue;
      this.scanned.add(chunk);
      for(let i=0;i<chunk.voxels.length;i++)if(isNetherFarmPlant(chunk.voxels[i])) {
        const x=i%16,y=Math.floor(i/256),z=Math.floor(i/16)%16;
        this.register(chunk.cx*16+x,y,chunk.cz*16+z);
      }
      break;
    }
  }
  age(x,y,z){return this.world.structureOrientations?.get(`${x},${y},${z}`)?.plantAge??0;}
  setAge(x,y,z,age){
    this.world.structureOrientations??=new Map();
    const key=`${x},${y},${z}`;
    this.world.structureOrientations.set(key,{x,y,z,id:B.NETHER_WART,plantAge:age});this.changed(x,y,z);
  }
  tickPlant(x,y,z) {
    const id=this.world.getVoxel(x,y,z);
    if(!isNetherFarmPlant(id))return;
    if(!canPlantNether(this.world,x,y,z,id)) {this.world.setVoxel(x,y,z,B.AIR);this.drop(x,y,z,id,1);this.changed(x,y,z);return;}
    if(id===B.NETHER_WART) {if(this.age(x,y,z)<3&&this.random()<0.1)this.setAge(x,y,z,this.age(x,y,z)+1);return;}
    if(!mushrooms.has(id)||this.random()>=0.04)return;
    let count=0;
    for(let dx=-4;dx<=4;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-4;dz<=4;dz++)if(this.world.getVoxel(x+dx,y+dy,z+dz)===id && ++count>=5)return;
    // Walk several nearby trials, matching the local, multi-step spread rule.
    let p={x,y,z};
    for(let i=0;i<5;i++) {
      const next={x:p.x+Math.floor(this.random()*3)-1,y:p.y+Math.floor(this.random()*2)-Math.floor(this.random()*2),z:p.z+Math.floor(this.random()*3)-1};
      const loaded=!this.world.getChunk||this.world.getChunk(Math.floor(next.x/16),Math.floor(next.z/16));
      if(loaded&&this.world.getVoxel(next.x,next.y,next.z)===B.AIR&&canPlantNether(this.world,next.x,next.y,next.z,id))p=next;
    }
    if(this.world.getVoxel(p.x,p.y,p.z)===B.AIR) {this.world.setVoxel(p.x,p.y,p.z,id);this.register(p.x,p.y,p.z);this.changed(p.x,p.y,p.z);}
  }
  update(dt,player) {
    this.discover();this.timer+=dt;if(this.timer<1)return;const elapsed=this.timer;this.timer=0;
    const chance=1-Math.pow(1-3/4096,20*elapsed);
    for(const [key,p]of this.plants) {
      if(p.dimension!==this.world.dimension)continue;
      if(this.world.getChunk && !this.world.getChunk(Math.floor(p.x/16),Math.floor(p.z/16)))continue;
      if(player && Math.hypot(p.x-player.x,p.z-player.z)>128)continue;
      if(!isNetherFarmPlant(this.world.getVoxel(p.x,p.y,p.z))) {this.plants.delete(key);continue;}
      if(this.random()<chance)this.tickPlant(p.x,p.y,p.z);
    }
  }
  boneMeal(x,y,z) {
    const id=this.world.getVoxel(x,y,z);
    if(!mushrooms.has(id)&&!fungi.has(id)&&![B.CRIMSON_NYLIUM,B.WARPED_NYLIUM].includes(id))return false;
    if(id===B.CRIMSON_NYLIUM||id===B.WARPED_NYLIUM) {
      for(let i=0;i<18;i++) {
        const px=x+Math.floor(this.random()*5)-2,pz=z+Math.floor(this.random()*5)-2;
        if(this.world.getVoxel(px,y,pz)!==id||this.world.getVoxel(px,y+1,pz)!==B.AIR)continue;
        const plant=this.random()<0.25?(id===B.CRIMSON_NYLIUM?B.CRIMSON_FUNGUS:B.WARPED_FUNGUS):(id===B.CRIMSON_NYLIUM?B.CRIMSON_ROOTS:B.WARPED_ROOTS);
        this.world.setVoxel(px,y+1,pz,plant);this.register(px,y+1,pz);this.changed(px,y+1,pz);
      }
      return true;
    }
    const soil=this.world.getVoxel(x,y-1,z);
    if(fungi.has(id)&&soil!==(id===B.CRIMSON_FUNGUS?B.CRIMSON_NYLIUM:B.WARPED_NYLIUM))return false;
    if(mushrooms.has(id)&&!dirtSoils.has(soil))return false;
    if(this.random()>=0.4)return true; // attempted growth still consumes fertilizer
    const height=4+Math.floor(this.random()*4),top=y+height;
    const cells=[];
    for(let dy=0;dy<height;dy++)cells.push([x,y+dy,z,fungi.has(id)?(id===B.CRIMSON_FUNGUS?B.CRIMSON_STEM:B.WARPED_STEM):B.MUSHROOM_STEM]);
    const cap=fungi.has(id)?(id===B.CRIMSON_FUNGUS?B.NETHER_WART_BLOCK:B.WARPED_WART_BLOCK):(id===B.RED_MUSHROOM?B.RED_MUSHROOM_BLOCK:B.BROWN_MUSHROOM_BLOCK);
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)if(Math.abs(dx)!==2||Math.abs(dz)!==2) {
      cells.push([x+dx,top,z+dz,cap]);
      if(fungi.has(id)&&this.random()<0.15)cells.push([x+dx,top-1,z+dz,B.SHROOMLIGHT]);
    }
    if(cells.some(([px,py,pz])=>py>=63||(this.world.getChunk&&!this.world.getChunk(Math.floor(px/16),Math.floor(pz/16)))||!(px===x&&py===y&&pz===z)&&this.world.getVoxel(px,py,pz)!==B.AIR&&!BLOCK_DEFS[this.world.getVoxel(px,py,pz)]?.plant))return true;
    for(const [px,py,pz,block]of cells){this.world.setVoxel(px,py,pz,block);this.changed(px,py,pz);}return true;
  }
}
