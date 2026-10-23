import {BLOCKS as B, BLOCK_DEFS} from '../blocks.js';
import {getBiomeDef} from '../biomes.js';

// Original terrain implementation of the wiki's cave families. Heights/densities
// fit this engine's 0..63 world; these are not Mojang's seed-compatible equations.
export const CAVE_KIND=Object.freeze({CHEESE:1,SPAGHETTI:2,NOODLE:4,CARVER:8,ENTRANCE:16});
export const CAVE_REGION_SIZE=64;
const REGION=CAVE_REGION_SIZE;
const rock=new Set([B.STONE,B.DEEPSLATE,B.TUFF,B.GRANITE,B.DIORITE,B.ANDESITE,B.DRIPSTONE_BLOCK,B.CLAY,B.MOSS_BLOCK]);
const netherRock=new Set([B.NETHERRACK,B.NETHER_QUARTZ_ORE,B.NETHER_GOLD_ORE,B.BLACKSTONE,B.BASALT,B.SOUL_SAND,B.SOUL_SOIL,B.GRAVEL]);
const mix=(seed,x,z,salt)=>{let h=Math.imul(x,374761393)^Math.imul(z,668265263)^(seed|0)^salt;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
const lerp=(a,b,t)=>a+(b-a)*t;
// Numeric cache keys: these caches are read for every block a structure probes, and building a template string for
// each lookup was a large share of generation. Exact for coordinates within 2^25 of the origin.
const KEY_OFFSET=33554432,KEY_SPAN=67108864;
const columnKey=(x,z)=>(x+KEY_OFFSET)*KEY_SPAN+(z+KEY_OFFSET);
// What a column needs to know about its surface biome, worked out once per biome rather than once per column.
const biomeTraits=new Map();
function traitsOf(biome){
  const def=getBiomeDef(biome);let t=biomeTraits.get(biome);
  // The definition is compared, not just cached: a data pack can replace a biome while the game runs.
  if(!t||t.def!==def){t={def,inland:def.category!=='offshore'&&!/river|beach/.test(biome),humidSurface:/dark_forest|jungle|old_growth/.test(biome)};biomeTraits.set(biome,t);}
  return t;
}

export class CaveTerrain {
  constructor(world){this.world=world;this.regions=new Map();this.columns=new Map();this.tiles=new Map();}
  /** The cache for the current dimension; a dimension change keeps the other dimension's entries apart. */
  cacheFor(store){const dim=this.world.dimension;let m=store.get(dim);if(!m)store.set(dim,m=new Map());return m;}
  hub(gx,gz){
    const w=this.world,r=s=>mix(w.seed,gx,gz,s),x=gx*REGION+16+r(11)*32,z=gz*REGION+16+r(13)*32;
    const height=w.surfaceHeightAt(Math.floor(x),Math.floor(z));
    return [x,Math.max(6,Math.min(18,height-10))+(r(17)-.5)*2,z];
  }
  region(gx,gz){
    const regions=this.cacheFor(this.regions),key=columnKey(gx,gz),known=regions.get(key);if(known!==undefined)return known;
    const w=this.world,r=s=>mix(w.seed,gx,gz,s),hub=this.hub(gx,gz),segments=[];
    const tube=(a,b,salt,entrance=false)=>{
      let last=a;const bend=(r(salt)-.5)*16;
      for(let i=1;i<=10;i++){const t=i/10,s=Math.sin(t*Math.PI),point=[lerp(a[0],b[0],t)+s*bend,lerp(a[1],b[1],t)+s*(r(salt+1)-.5)*5,lerp(a[2],b[2],t)-s*bend];
        const radius=2.1+r(salt+i+2)*1.1;
        segments.push({a:last,b:point,radius,ry:radius*.85,entrance,minX:Math.min(last[0],point[0])-radius,maxX:Math.max(last[0],point[0])+radius,minZ:Math.min(last[2],point[2])-radius,maxZ:Math.max(last[2],point[2])+radius});last=point;
      }
    };
    // Adjacent cells share endpoints. The winding trunks therefore cross chunk
    // borders without seams and have connected rooms/branches rather than bubbles.
    tube(hub,this.hub(gx+1,gz),31);tube(hub,this.hub(gx,gz+1),61);
    const ex=hub[0]+(r(97)<.5?-1:1)*(28+r(101)*15),ez=hub[2]+(r(103)<.5?-1:1)*(20+r(107)*16);
    const entrance=[ex,w.surfaceHeightAt(Math.floor(ex),Math.floor(ez))+1,ez];tube(hub,entrance,109,true);
    const room={x:hub[0],y:hub[1],z:hub[2],rx:7+r(131)*6,ry:3.5+r(137)*3,rz:6+r(139)*5};
    const result={gx,gz,hub,segments,room,entrance};
    if(regions.size>=256)regions.delete(regions.keys().next().value);regions.set(key,result);return result;
  }
  /**
   * The rooms and tunnel segments that can reach any column of a 16 x 16 tile, in the order `column` tests them.
   *
   * A column used to test every segment of the nine regions around it, about 280 boxes, on each cache miss. The
   * tile keeps the few that can matter. The order is kept because `kindAt` stops at the first segment that hits.
   */
  tile(tx,tz){
    const tiles=this.cacheFor(this.tiles),key=columnKey(tx,tz),known=tiles.get(key);if(known!==undefined)return known;
    // A region is a whole number of tiles wide, so every column of the tile has the same nine regions.
    const x0=tx*16+.5,x1=tx*16+15.5,z0=tz*16+.5,z1=tz*16+15.5,gx=Math.floor(tx*16/REGION),gz=Math.floor(tz*16/REGION),segments=[],rooms=[];
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      const region=this.region(gx+dx,gz+dz),room=region.room;
      if(room.x-room.rx<x1&&room.x+room.rx>x0&&room.z-room.rz<z1&&room.z+room.rz>z0)rooms.push(room);
      for(const s of region.segments)if(s.maxX>=x0&&s.minX<=x1&&s.maxZ>=z0&&s.minZ<=z1)segments.push(s);
    }
    const result={segments,rooms};
    if(tiles.size>=1024)tiles.delete(tiles.keys().next().value);tiles.set(key,result);return result;
  }
  column(x,z,height,biome){
    const columns=this.cacheFor(this.columns),key=columnKey(x,z),known=columns.get(key);if(known!==undefined)return known;
    // Worked out only on a miss. These were default parameters, which JavaScript evaluates on every call -- so each
    // cached lookup still paid for a biome and a terrain-height noise sample.
    if(biome===undefined)biome=this.world.getBiome(x,z);
    if(height===undefined)height=this.world.surfaceHeightAt(x,z);
    const segments=[],rooms=[],near=this.tile(Math.floor(x/16),Math.floor(z/16));
    for(const room of near.rooms)if(Math.abs(x+.5-room.x)<room.rx&&Math.abs(z+.5-room.z)<room.rz)rooms.push(room);
    for(const s of near.segments)if(x+.5>=s.minX&&x+.5<=s.maxX&&z+.5>=s.minZ&&z+.5<=s.maxZ)segments.push(s);
    const w=this.world,{def,inland,humidSurface}=traitsOf(biome),n=w.caveNoise;
    const moisture=w.biomeNoise.noise2D((x+713)*.009,(z-311)*.009);
    const caveBiome=def.isCavern?biome:inland&&w.noise.noise2D(x*.004,z*.004)>.35?'dripstone_caves':moisture>(humidSurface?-.35:.25)?'lush_caves':null;
    const aquiferX=Math.floor(x/24),aquiferZ=Math.floor(z/24),wet=mix(w.seed,aquiferX,aquiferZ,401)<.28;
    const c={x,z,height,biome,def,segments,rooms,caveBiome,wet,waterTable:7+Math.floor(mix(w.seed,aquiferX,aquiferZ,409)*6),
      pillar:n.noise2D((x+181)*.11,(z-79)*.11)>.53,
      floor:8+Math.floor(n.noise2D(x*.035,z*.035)*3),ceiling:34+Math.floor(n.noise2D((x+41)*.026,(z-91)*.026)*5)};
    if(columns.size>=8192)columns.delete(columns.keys().next().value);columns.set(key,c);return c;
  }
  biomeAt(x,y,z,column=null){
    const w=this.world,b=w.getBiome(x,z);if(w.dimension!=='overworld'||w.isFlatWorld||w.generationMode==='authored'||getBiomeDef(b).isVoid)return b;
    const c=column??this.column(x,z);
    if(y>c.height-4)return c.def.isCavern?'plains':b;
    if(c.def.isCavern)return b;
    if(y<=9&&c.def.mountainProfile&&w.featureNoise.noise2D(x*.018,z*.018)>.05)return 'deep_dark';
    return c.caveBiome??b;
  }
  kindAt(x,y,z,c=this.column(x,z)){
    if(y<2||y>c.height||y>61)return 0;
    const w=this.world,n=w.caveNoise;let kind=0;
    for(const s of c.segments){
      if(!s.entrance&&y>c.height-3)continue;
      // Distance to a segment in anisotropic space keeps the tunnel round in XZ
      // and lower than it is wide, including at steep entrance ramps.
      const dx=(s.b[0]-s.a[0])/s.radius,dy=(s.b[1]-s.a[1])/s.ry,dz=(s.b[2]-s.a[2])/s.radius;
      const px=(x+.5-s.a[0])/s.radius,py=(y+.5-s.a[1])/s.ry,pz=(z+.5-s.a[2])/s.radius;
      const t=Math.max(0,Math.min(1,(px*dx+py*dy+pz*dz)/(dx*dx+dy*dy+dz*dz)));
      if((px-t*dx)**2+(py-t*dy)**2+(pz-t*dz)**2<1)return s.entrance?CAVE_KIND.ENTRANCE:CAVE_KIND.CARVER;
    }
    if(y>c.height-3)return 0;
    for(const r of c.rooms)if(((x+.5-r.x)/r.rx)**2+((y+.5-r.y)/r.ry)**2+((z+.5-r.z)/r.rz)**2<1)kind|=CAVE_KIND.CARVER;
    if(c.def.isCavern&&y>c.floor&&y<c.ceiling&&!c.pillar)kind|=CAVE_KIND.CHEESE;
    const cheese=n.noise3D(x*.035,y*.065,z*.035);
    if(cheese > .49 + (y > c.height-6 ? .13 : 0) && !c.pillar)kind|=CAVE_KIND.CHEESE;
    // Intersecting two near-zero 3D fields makes tubes, not flat sheets.
    if(Math.abs(n.noise3D(x*.044+31,y*.07,z*.044-17))<.12&&Math.abs(n.noise3D(x*.044-53,y*.07+91,z*.044+29))<.16)kind|=CAVE_KIND.SPAGHETTI;
    if(Math.abs(n.noise3D(x*.095+213,y*.11,z*.095-101))<.09&&Math.abs(n.noise3D(x*.095-71,y*.11+127,z*.095+171))<.11)kind|=CAVE_KIND.NOODLE;
    return kind;
  }
  cellAt(x,y,z,c=this.column(x,z)){
    if(!this.kindAt(x,y,z,c))return null;
    if(y<=3)return B.LAVA;
    // Rock separates the deep lava from water aquifers. Different local water
    // tables have a stone boundary; they don't make a chunk-shaped global sea.
    if(c.wet&&y<=c.waterTable){
      if(y<=5)return null;
      const lx=((x%24)+24)%24,lz=((z%24)+24)%24;if(lx===0||lx===23||lz===0||lz===23)return null;
      return B.WATER;
    }
    if(c.height<this.world.seaLevel&&y>=c.height-3)return B.WATER;
    return B.AIR;
  }
}

export function decorateCaves(world,chunk){
  const ox=chunk.cx*16,oz=chunk.cz*16,caves=world.caves;
  const put=(x,y,z,id,state)=>{chunk.setVoxel(x,y,z,id);if(state)world.structureOrientations.set(`${ox+x},${y},${oz+z}`,{x:ox+x,y,z:oz+z,id,...state});};
  for(let x=0;x<16;x++)for(let z=0;z<16;z++){
    const wx=ox+x,wz=oz+z,c=caves.column(wx,wz),r=(y,s)=>mix(world.seed,wx+y*71,wz,s);
    for(let y=3;y<c.height-3;y++){
      const id=chunk.getVoxel(x,y,z);if(!rock.has(id))continue;
      const biome=caves.biomeAt(wx,y,wz,c),above=chunk.getVoxel(x,y+1,z),below=chunk.getVoxel(x,y-1,z);
      if(biome==='lush_caves'){
        if(above===B.AIR){put(x,y,z,B.MOSS_BLOCK);const v=r(y,503);if(v<.08)put(x,y+1,z,B.AZALEA);else if(v<.2)put(x,y+1,z,B.MOSS_CARPET);else if(v<.23)put(x,y+1,z,B.BIG_DRIPLEAF);}
        else if(above===B.WATER)put(x,y,z,B.CLAY);
        if(below===B.AIR){
          const v=r(y,509);if(v<.12){const length=2+Math.floor(r(y,521)*5);for(let i=1;i<=length&&chunk.getVoxel(x,y-i,z)===B.AIR;i++)put(x,y-i,z,i===length?B.CAVE_VINES:B.CAVE_VINES_PLANT,{berries:r(y-i,523)<.4});}
          else if(v<.14)put(x,y-1,z,B.SPORE_BLOSSOM);
        }
      }else if(biome==='dripstone_caves'){
        if(above===B.AIR||below===B.AIR)put(x,y,z,B.DRIPSTONE_BLOCK);
        for(const [side,empty]of [[1,above],[-1,below]])if(empty===B.AIR&&r(y,side>0?541:547)<.17){const length=1+Math.floor(r(y,557)*4);for(let i=1;i<=length&&chunk.getVoxel(x,y+side*i,z)===B.AIR;i++)put(x,y+side*i,z,B.POINTED_DRIPSTONE,{verticalDirection:side>0?'up':'down',thickness:i===length?'tip':'base'});}
      }else if(biome==='deep_dark'){
        if(above===B.AIR||below===B.AIR)put(x,y,z,B.SCULK);
        if(above===B.AIR){const v=r(y,563);if(v<.012)put(x,y+1,z,B.SCULK_SHRIEKER);else if(v<.035)put(x,y+1,z,B.SCULK_SENSOR);else if(v<.045)put(x,y+1,z,B.SCULK_CATALYST);}
      }
    }
  }
}

export function carveNetherCaves(world,chunk){
  const caves=world.caves;
  for(let x=0;x<16;x++)for(let z=0;z<16;z++){
    const wx=chunk.cx*16+x,wz=chunk.cz*16+z,floor=world.surfaceHeightAt(wx,wz),c=caves.column(wx,wz);
    for(let y=2;y<62;y++){
      const id=chunk.getVoxel(x,y,z);if(!netherRock.has(id))continue;
      const lower=y<=floor&&caves.kindAt(wx,y,wz,c),upper=y>=55&&world.caveNoise.noise3D(wx*.06,y*.12,wz*.06)>.52;
      if(lower||upper)chunk.setVoxel(x,y,z,y<world.seaLevel?B.LAVA:B.AIR);
    }
    // Don't leave fire or roots suspended above a newly opened entrance.
    const id=chunk.getVoxel(x,floor+1,z);if(BLOCK_DEFS[id]?.plant||id===B.FIRE||id===B.SOUL_FIRE)if(chunk.getVoxel(x,floor,z)===B.AIR||chunk.getVoxel(x,floor,z)===B.LAVA)chunk.setVoxel(x,floor+1,z,B.AIR);
  }
}
