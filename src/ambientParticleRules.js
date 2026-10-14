import {BLOCKS as B,BLOCK_DEFS} from './blocks.js';
import {getBiomeDef} from './biomes.js';

// Original sprite shapes and palettes; source/biome rules follow the wiki's
// Java particle catalogue and the Spring to Life falling-leaf additions.
export const AMBIENT_PARTICLES=Object.freeze({
  ash:{color:0x827a77,size:.08,vy:-.22,life:12,shape:0},
  white_ash:{color:0xe2dcdf,size:.10,vy:-.55,life:12,shape:0},
  crimson_spore:{color:0xf18163,size:.07,vy:-.10,life:14,shape:0},
  warped_spore:{color:0x36bac1,size:.08,vy:-.18,life:14,shape:0},
  cherry_leaves:{color:0xd193b4,size:.17,vy:-.45,life:14,shape:2,leaf:true},
  pale_oak_leaves:{color:0xe1e3dd,size:.16,vy:-.42,life:14,shape:1,leaf:true},
  tinted_leaves:{color:0x7caa43,size:.16,vy:-.48,life:14,shape:1,leaf:true},
  spore_blossom_air:{color:0x80b649,size:.07,vy:-.06,life:12,shape:0},
  falling_spore_blossom:{color:0xadd861,size:.09,vy:-.65,life:7,shape:4},
  mycelium:{color:0x9f8aa1,size:.055,vy:.09,life:3,shape:0},
  underwater:{color:0x75b6c5,size:.045,vy:.025,life:10,shape:0,water:true},
  lava:{color:0xffb040,size:.10,vy:1.6,life:2.2,shape:3,glow:1.5,gravity:2.2},
  flame:{color:0xffbb53,size:.07,vy:.8,life:3,shape:3,glow:1.8},
  soul_fire_flame:{color:0x68e5ff,size:.07,vy:.8,life:3,shape:3,glow:1.5},
  smoke:{color:0x807c79,size:.24,vy:.45,life:3.5,shape:6},
  falling_water:{color:0x8fc2e9,size:.07,vy:-.8,life:4,shape:4,gravity:3},
  falling_lava:{color:0xffab40,size:.07,vy:-.7,life:4,shape:4,glow:1,gravity:3},
  falling_obsidian_tear:{color:0xb268ec,size:.07,vy:-.5,life:4,shape:4,glow:.8,gravity:2},
  end_rod:{color:0xf2e5c5,size:.07,vy:.06,life:3,shape:3,glow:1},
  firefly:{color:0xdbed75,size:.055,vy:.03,life:4,shape:5,glow:2},
});
const NETHER={soul_sand_valley:'ash',basalt_deltas:'white_ash',crimson_forest:'crimson_spore',warped_forest:'warped_spore'};
const LEAVES=new Set(Object.entries(B).filter(([name])=>name.endsWith('_LEAVES')).map(([,id])=>id));
export function leafParticle(id){return id===B.CHERRY_LEAVES?'cherry_leaves':id===B.PALE_OAK_LEAVES?'pale_oak_leaves':LEAVES.has(id)?'tinted_leaves':null;}
export function biomeParticle(biome,dimension){const def=typeof biome==='object'?biome:getBiomeDef(biome);return dimension==='nether'?NETHER[def.id]??null:null;}
export function isParticleCellOpen(world,x,y,z,kind){
  if(world.getChunk&&!world.getChunk(Math.floor(x/16),Math.floor(z/16)))return false;
  const id=world.getVoxel(Math.floor(x),Math.floor(y),Math.floor(z));
  if(kind==='underwater')return id===B.WATER||id===B.BUBBLE_COLUMN||!!BLOCK_DEFS[id]?.waterPlant;
  if(BLOCK_DEFS[id]?.waterPlant||id===B.BUBBLE_COLUMN)return false;
  if(id===B.WATER||id===B.LAVA)return false;
  const def=BLOCK_DEFS[id];
  if(def?.slab&&(y-Math.floor(y))>.5)return true;
  if(def?.carpet&&(y-Math.floor(y))>(def.carpetHeight??1/16))return true;
  return [B.AIR,B.CAVE_AIR,B.VOID_AIR,B.COBWEB].includes(id)||BLOCK_DEFS[id]?.solid===false||!!BLOCK_DEFS[id]?.plant||!!BLOCK_DEFS[id]?.rod;
}
export function isFireflyNight(time){const t=((time??6000)%24000+24000)%24000;return t>=12600&&t<23400;}
export function leafTint(id,biome){
  if(id===B.BIRCH_LEAVES)return 0x88ab57;
  if(id===B.SPRUCE_LEAVES)return 0x638776;
  const def=typeof biome==='object'?biome:getBiomeDef(biome);
  if(def.foliageColor!==undefined)return def.foliageColor;
  if(/badlands|savanna|desert/.test(def.id))return 0xb2a15c;
  if(/swamp/.test(def.id))return 0x657947;
  if(/jungle/.test(def.id))return 0x56a943;
  return 0x7caa43;
}
export function blockParticleSources(id){
  const leaf=leafParticle(id);if(leaf)return [leaf];
  if(id===B.SPORE_BLOSSOM)return ['falling_spore_blossom','spore_blossom_air'];
  if(id===B.MYCELIUM)return ['mycelium'];
  if(id===B.LAVA)return ['lava'];
  if([B.FIRE,B.TORCH,B.WALL_TORCH,B.CAMPFIRE].includes(id))return ['flame','smoke'];
  if([B.SOUL_FIRE,B.SOUL_TORCH,B.SOUL_WALL_TORCH,B.SOUL_CAMPFIRE].includes(id))return ['soul_fire_flame','smoke'];
  if(id===B.WET_SPONGE)return ['falling_water'];
  if(id===B.CRYING_OBSIDIAN)return ['falling_obsidian_tear'];
  if(id===B.END_ROD)return ['end_rod'];
  if(id===B.FIREFLY_BUSH)return ['firefly'];
  return [];
}
export const AMBIENT_SOURCE_IDS=new Set(Object.values(B).filter(id=>blockParticleSources(id).length));
