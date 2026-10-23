import { BLOCKS, BLOCK_DEFS } from './blocks.js';

export const WATER_TICK = 0.25; // Five 20 Hz game ticks.
export const FALLING_WATER = 8;
const SIDES = [[1,0],[-1,0],[0,1],[0,-1]];
const NEIGHBORS = [[0,0,0],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
// Water cannot propagate upwards. An ocean's air surface is not an exposed
// outlet, and an adjoining source-filled chunk does not need a fluid tick.
const OUTLETS = [[1,0,0],[-1,0,0],[0,-1,0],[0,0,1],[0,0,-1]];
const key = (x,y,z) => `${x},${y},${z}`;

// Per-id answers the chunk scans ask of every voxel, rebuilt only when the registry changes size.
let idTables = null;
export function fluidIdTables() {
  const size = Object.keys(BLOCK_DEFS).length;
  if (idTables && idTables.size === size) return idTables;
  const outlet = new Uint8Array(65536), waterPlant = new Uint8Array(65536), redstone = new Uint8Array(65536);
  for (const k in BLOCK_DEFS) {
    const id = Number(k); if (!(id >= 0 && id < 65536)) continue;
    // A cell water can flow into that holds no water of its own: what needsTick calls an outlet.
    outlet[id] = id !== BLOCKS.WATER && waterReplaceable(id) ? 1 : 0;
    waterPlant[id] = BLOCK_DEFS[k]?.waterPlant ? 1 : 0;
    redstone[id] = BLOCK_DEFS[k]?.redstone ? 1 : 0;
  }
  outlet[BLOCKS.AIR] = 1; outlet[BLOCKS.FIRE] = 1;
  idTables = { size, outlet, waterPlant, redstone };
  return idTables;
}

/**
 * Can a new chunk's scan read its own arrays (and its neighbours') in place of world lookups? Only when it is
 * the chunk the world holds and no barrier floor rewrites low cells -- then the answers are the same.
 */
export function chunkScanIsLocal(world, chunk) {
  return world.getChunk?.(chunk.cx, chunk.cz) === chunk && !(world.floorY > 0) && chunk.voxels?.length === 16 * 64 * 16;
}

export function waterReplaceable(id) {
  const def = BLOCK_DEFS[id];
  // Aquatic plants occupy waterlogged cells, not air that flowing water can
  // wash away. Replacing them dirtied every reef chunk and spawned item drops.
  if (def?.waterPlant) return false;
  return id === BLOCKS.AIR || id === BLOCKS.FIRE || id === BLOCKS.WATER || !!def?.plant || def?.shape === 'torch';
}

export class WaterSimulation {
  /** Scratch space for directions(), made on first use. */
  #search = null;

  /**
   * @param {object} world
   * @param {object} [options]
   * @param {boolean} [options.queuesOwnChanges] queue the cells around each change itself. The world's own water is
   *   queued by World.setVoxel; a second simulation over the same world (or over one chunk) is not.
   */
  constructor(world, { queuesOwnChanges = false } = {}) {
    this.world = world;
    this.queuesOwnChanges = queuesOwnChanges;
    this.pending = new Set();
    this.time = 0;
    this.routes = new Map();
  }

  reset() { if(this===this.world.water){this.world.redstone?.reset();this.world.fallingBlocks?.reset();this.world.leafDecay?.reset();} if(this!==this.world.lava)this.world.lava?.reset(); this.pending.clear(); this.routes.clear(); this.time = 0; }

  loaded(x,y,z) { return y >= 0 && y < 64 && !!this.world.getChunk(Math.floor(x / 16), Math.floor(z / 16)); }
  level(x,y,z) { return this.world.getWaterLevel(x,y,z); }
  passable(x,y,z) { return this.loaded(x,y,z) && waterReplaceable(this.world.getVoxel(x,y,z)); }
  canFall(x,y,z) { return this.passable(x,y - 1,z) && this.level(x,y - 1,z) !== 0; }
  enqueue(x,y,z) { if (this.loaded(x,y,z)) this.pending.add(key(x,y,z)); }

  needsTick(x,y,z,level = this.level(x,y,z)) {
    return level > 0 || (level === 0 && OUTLETS.some(([dx,dy,dz]) =>
      this.passable(x+dx,y+dy,z+dz) && this.level(x+dx,y+dy,z+dz)<0));
  }

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

  /**
   * @param {object} [options]
   * @param {boolean} [options.wake] queue the chunk's water; false for new terrain already run to rest
   *   (World #settleNewWater), whose flowing water would otherwise all be ticked once to find it does not move.
   */
  initChunk(chunk, { wake = true } = {}) {
    this.world.lava?.initChunk(chunk);
    this.world.redstone?.initChunk(chunk);
    if (wake) this.wakeChunk(chunk);
  }

  /**
   * Queue a new chunk's water that may need to move, and its neighbours' water along the shared edges.
   * @param {object} [options]
   * @param {boolean} [options.edgesOnly] only the chunk's edge columns: its inside is already at rest (the generator
   *   settled it, worldgen/settleWater.js), and only what lies beyond its edges is new.
   */
  wakeChunk(chunk, { edgesOnly = false } = {}) {
    if (chunkScanIsLocal(this.world, chunk)) { this.#initChunkLocal(chunk, edgesOnly); return; }
    // Old maps and generated oceans have zero metadata, meaning source water.
    // Wake exposed water, not every interior voxel of a large ocean.
    for (let y=0;y<64;y++) for(let z=0;z<16;z++) for(let x=0;x<16;x++) {
      if (edgesOnly && x!==0 && x!==15 && z!==0 && z!==15) continue;
      if (chunk.getVoxel(x,y,z)!==BLOCKS.WATER) continue;
      const wx=chunk.cx*16+x, wz=chunk.cz*16+z;
      if (this.needsTick(wx,y,wz,chunk.waterLevels[chunk.getIndex(x,y,z)])) this.notify(wx,y,wz);
    }
    // Resume streams waiting on an unloaded chunk boundary, including negative coordinates.
    for(let y=0;y<64;y++) for(let i=0;i<16;i++) {
      for(const [x,z] of [[chunk.cx*16-1,chunk.cz*16+i],[chunk.cx*16+16,chunk.cz*16+i],[chunk.cx*16+i,chunk.cz*16-1],[chunk.cx*16+i,chunk.cz*16+16]]) {
        if(this.needsTick(x,y,z)) this.notify(x,y,z);
      }
    }
  }

  /**
   * initChunk, reading the chunk's arrays. The same cells are woken in the same order: the world lookups it
   * replaces were five `getChunk` + `getVoxel` pairs per water voxel (an ocean chunk holds thousands) and
   * 4,096 more along the borders, which was a sixth of generating a chunk. Cells on the chunk's edge, whose
   * outlets lie in a neighbour, still ask the world.
   */
  #initChunkLocal(chunk, edgesOnly = false) {
    const { outlet, waterPlant } = fluidIdTables();
    const vox = chunk.voxels, levels = chunk.waterLevels, W = BLOCKS.WATER;
    const bx = chunk.cx * 16, bz = chunk.cz * 16;
    for (let i = 0; i < vox.length; i++) {
      if (vox[i] !== W) continue;
      const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
      if (edgesOnly && x !== 0 && x !== 15 && z !== 0 && z !== 15) continue;
      const level = levels[i];
      let wake = level > 0;
      if (!wake && level === 0) {
        if (x === 0 || x === 15 || z === 0 || z === 15) wake = this.needsTick(bx + x, y, bz + z, level);
        // OUTLETS: +x, -x, below, +z, -z (water does not flow up).
        else wake = outlet[vox[i + 1]] === 1 || outlet[vox[i - 1]] === 1 || (y > 0 && outlet[vox[i - 256]] === 1)
          || outlet[vox[i + 16]] === 1 || outlet[vox[i - 16]] === 1;
      }
      if (wake) this.notify(bx + x, y, bz + z);
    }
    // Resume streams waiting on an unloaded chunk boundary. Only a water (or water-plant) cell in a loaded
    // neighbour can need a tick, so the rest are skipped without asking the world.
    const sides = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dz]) => this.world.getChunk(chunk.cx + dx, chunk.cz + dz) ?? null);
    const holdsWater = (n, lx, y, lz) => { if (!n) return false; const id = n.voxels[(y * 16 + lz) * 16 + lx]; return id === W || waterPlant[id] === 1; };
    for (let y = 0; y < 64; y++) for (let i = 0; i < 16; i++) {
      if (holdsWater(sides[0], 15, y, i) && this.needsTick(bx - 1, y, bz + i)) this.notify(bx - 1, y, bz + i);
      if (holdsWater(sides[1], 0, y, i) && this.needsTick(bx + 16, y, bz + i)) this.notify(bx + 16, y, bz + i);
      if (holdsWater(sides[2], i, y, 15) && this.needsTick(bx + i, y, bz - 1)) this.notify(bx + i, y, bz - 1);
      if (holdsWater(sides[3], i, y, 0) && this.needsTick(bx + i, y, bz + 16)) this.notify(bx + i, y, bz + 16);
    }
  }

  /**
   * The sides water at x,y,z prefers: those with the shortest way, within four blocks, to a place it can fall. For each
   * side, a breadth-first search over passable cells from the cell on that side (never back through x,z), three steps
   * deep. The four searches share one 9x9 window around x,z, whose passable and can-fall answers are looked up once
   * each: this was most of the water simulation's time, as strings, sets and arrays made for every cell it visited.
   */
  directions(x,y,z) {
    const id=key(x,y,z);
    const cached=this.routes.get(id);
    if(cached) return cached;
    const s=this.#search ??= { stamp:0, passStamp:new Int32Array(81), pass:new Uint8Array(81), fallStamp:new Int32Array(81), fall:new Uint8Array(81),
      seen:new Int32Array(81), seenStamp:0, qx:new Int8Array(81), qz:new Int8Array(81), qd:new Int8Array(81) };
    const stamp=++s.stamp;
    // Window cells by offset from x,z (each within four steps, so -4..4).
    const passableAt=(dx,dz)=>{ const i=(dx+4)*9+dz+4; if(s.passStamp[i]!==stamp){ s.passStamp[i]=stamp; s.pass[i]=this.passable(x+dx,y,z+dz)?1:0; } return s.pass[i]===1; };
    const fallsAt=(dx,dz)=>{ const i=(dx+4)*9+dz+4; if(s.fallStamp[i]!==stamp){ s.fallStamp[i]=stamp; s.fall[i]=this.canFall(x+dx,y,z+dz)?1:0; } return s.fall[i]===1; };
    const costs=[Infinity,Infinity,Infinity,Infinity];
    for(let side=0;side<4;side++) {
      const [dx,dz]=SIDES[side];
      if(!passableAt(dx,dz)) continue;
      const seen=++s.seenStamp;
      s.seen[40]=seen; // x,z itself
      s.seen[(dx+4)*9+dz+4]=seen;
      s.qx[0]=dx; s.qz[0]=dz; s.qd[0]=0;
      for(let head=0,tail=1;head<tail;head++) {
        const px=s.qx[head],pz=s.qz[head],depth=s.qd[head];
        if(fallsAt(px,pz)) { costs[side]=depth; break; }
        if(depth>=3) continue;
        for(const [sx,sz] of SIDES) {
          const nx=px+sx,nz=pz+sz,i=(nx+4)*9+nz+4;
          if(s.seen[i]===seen || !passableAt(nx,nz)) continue;
          s.seen[i]=seen; s.qx[tail]=nx; s.qz[tail]=nz; s.qd[tail]=depth+1; tail++;
        }
      }
    }
    const best=Math.min(costs[0],costs[1],costs[2],costs[3]);
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
      if(this.queuesOwnChanges) this.notify(x,y,z);
    }
    return changes.length;
  }
}
