import { BLOCKS } from './blocks.js';
import { WaterSimulation, waterReplaceable } from './waterSimulation.js';
const SIDES=[[1,0],[-1,0],[0,1],[0,-1]];
const NEIGHBORS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const key=(x,y,z)=>[x,y,z].join(',');
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
  initChunk(chunk){
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
      const isRaining = Boolean(this.world.game?.weather?.isRaining?.() || this.world.weather?.isRaining?.());
      if (!eternal && isRaining && this.world.getHighestSolidY) {
        const topY = this.world.getHighestSolidY(x, z);
        if (y >= topY) {
          this.world.setVoxel(x, y, z, BLOCKS.AIR);
          continue;
        }
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
