import { BLOCKS, BLOCK_DEFS } from './blocks.js';

export const WATER_TICK = 0.25; // Five 20 Hz game ticks.
export const FALLING_WATER = 8;
const SIDES = [[1,0],[-1,0],[0,1],[0,-1]];
const NEIGHBORS = [[0,0,0],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const key = (x,y,z) => `${x},${y},${z}`;

export function waterReplaceable(id) {
  const def = BLOCK_DEFS[id];
  return id === BLOCKS.AIR || id === BLOCKS.FIRE || id === BLOCKS.WATER || !!def?.plant || def?.shape === 'torch';
}

export class WaterSimulation {
  constructor(world) {
    this.world = world;
    this.pending = new Set();
    this.time = 0;
    this.routes = new Map();
  }

  reset() { if(this===this.world.water)this.world.redstone?.reset(); if(this!==this.world.lava)this.world.lava?.reset(); this.pending.clear(); this.routes.clear(); this.time = 0; }

  loaded(x,y,z) { return y >= 0 && y < 64 && !!this.world.getChunk(Math.floor(x / 16), Math.floor(z / 16)); }
  level(x,y,z) { return this.world.getWaterLevel(x,y,z); }
  passable(x,y,z) { return this.loaded(x,y,z) && waterReplaceable(this.world.getVoxel(x,y,z)); }
  canFall(x,y,z) { return this.passable(x,y - 1,z) && this.level(x,y - 1,z) !== 0; }
  enqueue(x,y,z) { if (this.loaded(x,y,z)) this.pending.add(key(x,y,z)); }

  notify(x,y,z, topology = false) {
    for (const [dx,dy,dz] of NEIGHBORS) this.enqueue(x+dx,y+dy,z+dz);
    // A new hole can change the preferred downhill route up to four blocks away.
    if (topology) for (let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) {
      if (Math.abs(dx)+Math.abs(dz)>4) continue;
      for (const dy of [0,1]) if (this.level(x+dx,y+dy,z+dz)>=0) {
        for (const [sx,sy,sz] of NEIGHBORS) this.enqueue(x+dx+sx,y+dy+sy,z+dz+sz);
      }
    }
  }

  initChunk(chunk) {
    this.world.lava?.initChunk(chunk);
    this.world.redstone?.initChunk(chunk);
    // Old maps and generated oceans have zero metadata, meaning source water.
    // Wake exposed water, not every interior voxel of a large ocean.
    for (let y=0;y<64;y++) for(let z=0;z<16;z++) for(let x=0;x<16;x++) {
      if (chunk.getVoxel(x,y,z)!==BLOCKS.WATER) continue;
      const wx=chunk.cx*16+x, wz=chunk.cz*16+z;
      if (chunk.waterLevels[chunk.getIndex(x,y,z)] || NEIGHBORS.slice(1).some(([dx,dy,dz]) => this.passable(wx+dx,y+dy,wz+dz) && this.level(wx+dx,y+dy,wz+dz)<0)) this.notify(wx,y,wz);
    }
    // Resume streams waiting on an unloaded chunk boundary, including negative coordinates.
    for(let y=0;y<64;y++) for(let i=0;i<16;i++) {
      for(const [x,z] of [[chunk.cx*16-1,chunk.cz*16+i],[chunk.cx*16+16,chunk.cz*16+i],[chunk.cx*16+i,chunk.cz*16-1],[chunk.cx*16+i,chunk.cz*16+16]]) {
        if(this.level(x,y,z)>=0) this.notify(x,y,z);
      }
    }
  }

  directions(x,y,z) {
    const id=key(x,y,z);
    if(this.routes.has(id)) return this.routes.get(id);
    const costs = SIDES.map(([dx,dz]) => {
      if(!this.passable(x+dx,y,z+dz)) return Infinity;
      const queue=[[x+dx,z+dz,0]], seen=new Set([`${x},${z}`]);
      for(let i=0;i<queue.length;i++) {
        const [px,pz,depth]=queue[i], k=`${px},${pz}`;
        if(seen.has(k)) continue;
        seen.add(k);
        if(this.canFall(px,y,pz)) return depth;
        if(depth>=3) continue;
        for(const [sx,sz] of SIDES) if(this.passable(px+sx,y,pz+sz)) queue.push([px+sx,pz+sz,depth+1]);
      }
      return Infinity;
    });
    const best=Math.min(...costs);
    const result=SIDES.filter((_,i)=>costs[i]===best);
    this.routes.set(id,result);
    return result;
  }

  desired(x,y,z) {
    if(!this.passable(x,y,z)) return -1;
    if(this.level(x,y,z)===0) return 0; // Sources are not a finite volume of water.
    const sources=SIDES.filter(([dx,dz])=>this.level(x+dx,y,z+dz)===0).length;
    const below=this.world.getVoxel(x,y-1,z), belowDef=BLOCK_DEFS[below];
    const supported=this.loaded(x,y-1,z) && (this.level(x,y-1,z)===0 || (belowDef && belowDef.solid!==false && !belowDef.plant));
    if(sources>=2 && supported) return 0;
    if(this.level(x,y+1,z)>=0) return FALLING_WATER;
    let best=8;
    for(const [dx,dz] of SIDES) {
      const nx=x+dx,nz=z+dz, level=this.level(nx,y,nz);
      if(level<0 || this.canFall(nx,y,nz)) continue;
      if(!this.directions(nx,y,nz).some(([sx,sz])=>sx===-dx&&sz===-dz)) continue;
      best=Math.min(best,(level===FALLING_WATER?0:level)+1);
    }
    return best<=7?best:-1;
  }

  update(dt) {
    this.world.lava?.update(dt);
    this.time=Math.min(this.time+Math.max(0,dt),1);
    let ticks=0, changes=0;
    while(this.time>=WATER_TICK && ticks++<2) { this.time-=WATER_TICK; changes+=this.tick(); }
    return changes;
  }

  tick(budget=4096) {
    this.routes.clear();
    const batch=[];
    for(const id of this.pending) {
      this.pending.delete(id); batch.push(id.split(',').map(Number));
      if(batch.length>=budget) break;
    }
    const changes=[];
    // Compute the whole batch before writing: one layer of propagation per tick,
    // independent of insertion order and render frame rate.
    for(const [x,y,z] of batch) {
      const block=this.world.getVoxel(x,y,z);
      if(block===BLOCKS.LAVA && this.world.lava?.touchesWater(x,y,z)) {
        changes.push([x,y,z,-1,this.world.getLavaLevel(x,y,z)===0?BLOCKS.OBSIDIAN:BLOCKS.COBBLESTONE]); continue;
      }
      if(!this.passable(x,y,z)) continue;
      const level=this.desired(x,y,z);
      if(level!==this.level(x,y,z)) changes.push([x,y,z,level]);
    }
    for(const [x,y,z,level,replacement] of changes) {
      const previous=this.world.getVoxel(x,y,z);
      if(level>=0 && previous!==BLOCKS.AIR && previous!==BLOCKS.WATER) this.onDisplace?.(x,y,z,previous);
      this.world.setVoxel(x,y,z,replacement ?? (level<0?BLOCKS.AIR:BLOCKS.WATER),Math.max(0,level),true);
    }
    return changes.length;
  }
}
