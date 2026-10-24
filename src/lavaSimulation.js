import { BLOCKS } from './blocks.js';
import { exposedToRain } from './weatherRules.js';
import { WaterSimulation, waterReplaceable, chunkScanIsLocal } from './waterSimulation.js';
const SIDES=[[1,0],[-1,0],[0,1],[0,-1]];
const NEIGHBORS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const key=(x,y,z)=>`${x},${y},${z}`;
export const LAVA_TICK=1.5;
const fuels=new Set([BLOCKS.OAK_LOG,BLOCKS.OAK_PLANKS,BLOCKS.OAK_LEAVES,BLOCKS.BOOKSHELF,BLOCKS.TNT,BLOCKS.WHITE_WOOL,BLOCKS.RED_WOOL,BLOCKS.BLUE_WOOL,BLOCKS.YELLOW_WOOL,BLOCKS.GREEN_WOOL,BLOCKS.BLACK_WOOL]);
export const isFlammable=id=>fuels.has(id);

export class LavaSimulation extends WaterSimulation {
  constructor(world,random=Math.random){super(world);this.random=random;this.lavaCells=new Map();this.fires=new Map();this.fireTime=0;this.cursor=0;}
  reset(){super.reset();this.lavaCells.clear();this.fires.clear();this.fireTime=0;}
  level(x,y,z){return this.world.getLavaLevel(x,y,z);}
  passable(x,y,z){const id=this.world.getVoxel(x,y,z);return this.loaded(x,y,z)&&(id===BLOCKS.LAVA||id===BLOCKS.FIRE||(id!==BLOCKS.WATER&&waterReplaceable(id)));}
  notify(x,y,z,topology=false){
    super.notify(x,y,z,topology);
    const id=this.world.getVoxel(x,y,z),k=key(x,y,z);
    if(id===BLOCKS.LAVA)this.lavaCells.set(k,[x,y,z]);else this.lavaCells.delete(k);
    if(id===BLOCKS.FIRE){if(!this.fires.has(k))this.fires.set(k,{x,y,z,age:0});}else this.fires.delete(k);
  }
  /**
   * Whether ticking this lava cell, or a neighbour on its account, can change anything: it is flowing lava, it touches
   * water (obsidian, cobblestone, or stone under it), or a side or the cell below is open for it to flow into.
   */
  #mayChange(x,y,z){
    if(this.level(x,y,z)>0)return true;
    for(const [dx,dy,dz]of NEIGHBORS)if(this.world.getVoxel(x+dx,y+dy,z+dz)===BLOCKS.WATER)return true;
    for(const [dx,dy,dz]of NEIGHBORS)if(dy!==1&&this.passable(x+dx,y+dy,z+dz)&&this.level(x+dx,y+dy,z+dz)<0)return true;
    return false;
  }
  initChunk(chunk){
    // Read the chunk's arrays where the world would give the same answer: the same cells, in the same order.
    if(chunkScanIsLocal(this.world,chunk)){
      const vox=chunk.voxels,L=BLOCKS.LAVA,F=BLOCKS.FIRE,bx=chunk.cx*16,bz=chunk.cz*16;
      // `notify` inlined: the cell and its six neighbours queued in the same order, but a neighbour inside this chunk
      // is known to be loaded, so only one outside it asks the world (a chunk of lava lakes made ~700 such lookups).
      const pending=this.pending;
      const wake=(x,y,z,lx,lz)=>{if(lx<0||lx>15||lz<0||lz>15){this.enqueue(x,y,z);return;}if(y>=0&&y<64)pending.add(key(x,y,z));};
      for(let i=0;i<vox.length;i++){
        const id=vox[i];if(id!==L&&id!==F)continue;
        const lx=i&15,lz=(i>>4)&15,y=i>>8,x=bx+lx,z=bz+lz;
        // Lava at rest is recorded but not queued, as `wakeChunk` does for water: a source with no water beside it
        // and nowhere to flow (beside or below) is left as it is by a tick, and so are its neighbours. Queuing every
        // lava cell put ~110 a chunk in the queue; a world's first 121 chunks queued 41,000 cells, which took the
        // lava 25 ticks (half a minute) to get through, for 101 changes, all from the 0.2% that could move.
        if(id===L&&!this.#mayChange(x,y,z)){const k=key(x,y,z);this.lavaCells.set(k,[x,y,z]);this.fires.delete(k);continue;}
        wake(x,y,z,lx,lz);wake(x+1,y,z,lx+1,lz);wake(x-1,y,z,lx-1,lz);wake(x,y+1,z,lx,lz);wake(x,y-1,z,lx,lz);wake(x,y,z+1,lx,lz+1);wake(x,y,z-1,lx,lz-1);
        const k=key(x,y,z);
        if(id===L){this.lavaCells.set(k,[x,y,z]);this.fires.delete(k);}
        else{this.lavaCells.delete(k);if(!this.fires.has(k))this.fires.set(k,{x,y,z,age:0});}
      }
      const sides=[[-1,0],[1,0],[0,-1],[0,1]].map(([dx,dz])=>this.world.getChunk(chunk.cx+dx,chunk.cz+dz)??null);
      const lava=(n,lx,y,lz)=>!!n&&n.voxels[(y*16+lz)*16+lx]===L;
      for(let y=0;y<64;y++)for(let i=0;i<16;i++){
        if(lava(sides[0],15,y,i)&&this.#mayChange(bx-1,y,bz+i))this.notify(bx-1,y,bz+i);
        if(lava(sides[1],0,y,i)&&this.#mayChange(bx+16,y,bz+i))this.notify(bx+16,y,bz+i);
        if(lava(sides[2],i,y,15)&&this.#mayChange(bx+i,y,bz-1))this.notify(bx+i,y,bz-1);
        if(lava(sides[3],i,y,0)&&this.#mayChange(bx+i,y,bz+16))this.notify(bx+i,y,bz+16);
      }
      return;
    }
    for(let y=0;y<64;y++)for(let z=0;z<16;z++)for(let x=0;x<16;x++){
      const id=chunk.getVoxel(x,y,z);
      if(id===BLOCKS.LAVA||id===BLOCKS.FIRE)this.notify(chunk.cx*16+x,y,chunk.cz*16+z);
    }
    for(let y=0;y<64;y++)for(let i=0;i<16;i++)for(const [x,z]of [[chunk.cx*16-1,chunk.cz*16+i],[chunk.cx*16+16,chunk.cz*16+i],[chunk.cx*16+i,chunk.cz*16-1],[chunk.cx*16+i,chunk.cz*16+16]])if(this.level(x,y,z)>=0)this.notify(x,y,z);
  }
  desired(x,y,z){
    if(!this.passable(x,y,z))return -1;
    if(this.level(x,y,z)===0)return 0;
    if(this.level(x,y+1,z)>=0)return 8;
    let best=8;
    for(const [dx,dz]of SIDES){const nx=x+dx,nz=z+dz,level=this.level(nx,y,nz);
      if(level<0||this.canFall(nx,y,nz))continue;
      if(!this.directions(nx,y,nz).some(([sx,sz])=>sx===-dx&&sz===-dz))continue;
      best=Math.min(best,(level===8?0:level)+2);
    }
    return best<=6?best:-1;
  }
  tick(budget=2048){
    this.routes.clear();const changes=[],batch=[];
    for(const id of this.pending){this.pending.delete(id);batch.push(id.split(',').map(Number));if(batch.length>=budget)break;}
    for(const [x,y,z]of batch){
      const id=this.world.getVoxel(x,y,z);
      if(id===BLOCKS.WATER&&this.level(x,y+1,z)>=0){changes.push([x,y,z,BLOCKS.STONE,0]);continue;}
      if(id===BLOCKS.LAVA&&this.touchesWater(x,y,z)){changes.push([x,y,z,this.level(x,y,z)===0?BLOCKS.OBSIDIAN:BLOCKS.COBBLESTONE,0]);continue;}
      if(!this.passable(x,y,z))continue;
      const level=this.desired(x,y,z);
      if(level!==this.level(x,y,z))changes.push([x,y,z,level<0?BLOCKS.AIR:BLOCKS.LAVA,Math.max(0,level)]);
    }
    for(const [x,y,z,id,level]of changes)this.world.setVoxel(x,y,z,id,level,true);
    return changes.length;
  }
  touchesWater(x,y,z){return [[1,0,0],[-1,0,0],[0,1,0],[0,0,1],[0,0,-1]].some(([dx,dy,dz])=>this.world.getVoxel(x+dx,y+dy,z+dz)===BLOCKS.WATER);}
  ignite(x,y,z){
    if(this.fires.size>=1024||!this.loaded(x,y,z)||this.world.getVoxel(x,y,z)!==BLOCKS.AIR)return false;
    if(!NEIGHBORS.some(([dx,dy,dz])=>isFlammable(this.world.getVoxel(x+dx,y+dy,z+dz))))return false;
    this.world.setVoxel(x,y,z,BLOCKS.FIRE);return true;
  }
  updateFire(dt){
    if(this.world.game?.gamerules?.doFireTick===false)return;
    this.fireTime+=dt;if(this.fireTime<1)return;this.fireTime-=1;
    const cells=[...this.lavaCells.values()];
    for(let i=0;i<Math.min(128,cells.length);i++){
      const [x,y,z]=cells[(this.cursor+i)%cells.length];
      // Lava cannot start a fire through a sealed stone/glass cover.
      if(this.world.getVoxel(x,y+1,z)!==BLOCKS.AIR)continue;
      if(this.random()>.3)continue;
      const dy=this.random()<.5?1:2,radius=dy;
      const dx=Math.floor(this.random()*(radius*2+1))-radius,dz=Math.floor(this.random()*(radius*2+1))-radius;
      const midway=this.world.getVoxel(x+Math.sign(dx),y+1,z+Math.sign(dz));
      if(dy===1||midway===BLOCKS.AIR)this.ignite(x+dx,y+dy,z+dz);
    }
    this.cursor=(this.cursor+128)%Math.max(1,cells.length);
    for(const fire of [...this.fires.values()]){
      const {x,y,z}=fire;fire.age++;
      let fuel=false;
      for(const [dx,dy,dz]of NEIGHBORS){
        const px=x+dx,py=y+dy,pz=z+dz,id=this.world.getVoxel(px,py,pz);
        if(!isFlammable(id))continue;fuel=true;
        if(this.random()<.15){
          this.world.setVoxel(px,py,pz,BLOCKS.AIR);
          if(id===BLOCKS.TNT)this.onIgniteTNT?.(px,py,pz);
          else this.ignite(px,py,pz);
        }
      }
      for(const [dx,dy,dz]of NEIGHBORS)if(this.random()<.12)this.ignite(x+dx,y+dy,z+dz);
      const eternal = this.world.getVoxel(x, y - 1, z) === BLOCKS.NETHERRACK || this.world.getVoxel(x, y - 1, z) === BLOCKS.MAGMA_BLOCK;
      if (!eternal && exposedToRain(this.world.game?.weather??this.world.weather,this.world,{x,y:y+.5,z})) {
        this.world.setVoxel(x,y,z,BLOCKS.AIR);continue;
      }
      if (!eternal && (!fuel || fire.age > 20) && this.random() < 0.35) this.world.setVoxel(x, y, z, BLOCKS.AIR);
    }
  }
  update(dt){
    this.time=Math.min(this.time+Math.max(0,dt),3);let changes=0,count=0;
    while(this.time>=LAVA_TICK&&count++<2){this.time-=LAVA_TICK;changes+=this.tick();}
    this.updateFire(Math.min(Math.max(dt,0),1));return changes;
  }
}
