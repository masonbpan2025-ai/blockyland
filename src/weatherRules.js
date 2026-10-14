import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { getBiomeDef } from './biomes.js';

const DRY = new Set('desert badlands eroded_badlands wooded_badlands savanna savanna_plateau windswept_savanna'.split(' '));
const SNOWY = new Set('snowy_plains ice_spikes snowy_taiga snowy_beach frozen_river frozen_peaks jagged_peaks snowy_slopes grove'.split(' '));
const TEMPERATURES = {taiga:.25,old_growth_pine_taiga:.3,old_growth_spruce_taiga:.25,windswept_hills:.2,windswept_gravelly_hills:.2,windswept_forest:.2,stony_shore:.2,cold_ocean:.5,deep_cold_ocean:.5};

export function weatherDimension(world) {
  const dim=world?.dimension||(world?.isNether?'nether':getBiomeDef(world?.selectedBiome).dimension);
  return dim==='end'?'the_end':dim||'overworld';
}

export function precipitationForBiome(biome, y=22, world=null, x=0, z=0) {
  const def=typeof biome==='object'?biome:getBiomeDef(biome),id=def.id;
  if(def.dimension!=='overworld'||def.hasPrecipitation===false||DRY.has(id))return 'none';
  if(SNOWY.has(id))return 'snow';
  let temperature=def.temperature??TEMPERATURES[id]??.8;
  if(id==='frozen_ocean'||id==='deep_frozen_ocean'){
    const patch=world?.featureNoise?.noise2D?.(x*.035,z*.035)??Math.sin(x*.11+z*.07);
    temperature=patch>.25?.2:0;
  }
  // This world is 64 blocks high. Preserve the vanilla temperature lapse rate
  // in climate coordinates, scaling heights above its sea level by four.
  temperature-=Math.max(0,y-(world?.seaLevel??22))*4/600;
  return temperature<.15?'snow':'rain';
}

export function precipitationBlockHeight(id) {
  if(id===BLOCKS.AIR||id==null)return 0;
  if(id===BLOCKS.WATER)return .9;
  if(id===BLOCKS.LAVA||id===BLOCKS.POWDER_SNOW)return 1;
  const def=BLOCK_DEFS[id];
  if(!def)return 0;
  if(def.carpet)return def.carpetHeight??1/16;
  if(def.plant||def.solid===false)return 0;
  return def.slab?.5:1;
}

// Motion-blocking surfaces stop precipitation, including glass, leaves and
// liquids. Optical transparency is not a valid test for a weather-proof roof.
export function precipitationColumn(world, x, z) {
  x=Math.floor(x);z=Math.floor(z);
  if(!world?.getVoxel||weatherDimension(world)!=='overworld')return {kind:'none',height:Infinity,id:BLOCKS.AIR};
  if(world.getChunk&&!world.getChunk(Math.floor(x/16),Math.floor(z/16)))return {kind:'none',height:Infinity,id:BLOCKS.AIR};
  const max=world.maxHeight??64;
  for(let y=max-1;y>=0;y--){
    const id=world.getVoxel(x,y,z),h=precipitationBlockHeight(id);
    if(h){const biome=getBiomeDef(world.getBiome?.(x,z)??world.selectedBiome);return {biome,kind:precipitationForBiome(biome,y+h,world,x,z),height:y+h,id,y};}
  }
  const biome=getBiomeDef(world.getBiome?.(x,z)??world.selectedBiome);
  return {biome,kind:precipitationForBiome(biome,0,world,x,z),height:0,id:BLOCKS.AIR,y:-1};
}

export function precipitationAt(world,x,y,z) {
  const column=precipitationColumn(world,x,z);
  if(y<column.height-1e-6)return 'none';
  return precipitationForBiome(world?.getBiome?.(Math.floor(x),Math.floor(z))??world?.selectedBiome,y,world,x,z);
}

// Shared by farming, fire, fishing and mob AI; lightweight inspector stubs can
// use this same rule without constructing a renderer or particle system.
export function exposedToRain(weather,world,position) {
  if(!weather||!position)return false;
  const {x,y,z}=position;
  if(weather.isRainingAt)return weather.isRainingAt(x,y,z);
  const wet=typeof weather.isRaining==='function'?weather.isRaining():['rain','thunder'].includes(weather.weatherType);
  return wet&&precipitationAt(world,x,y,z)==='rain';
}
