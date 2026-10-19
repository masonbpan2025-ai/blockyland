import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readSpongeSchematic } from '../src/io/codecs.js';
import { CHUNK_HEIGHT } from '../src/world.js';
import { STUDIO_GROUND_Y } from '../src/buildingStudio.js';

const root=new URL('../outputs/BlockyBuilder/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',root)));
const registry=JSON.parse(fs.readFileSync(new URL('./fixtures/minecraft/blocks-1.21.4.json',import.meta.url)));
const structures=new Map();for(const item of manifest.items){const {structure}=await readSpongeSchematic(fs.readFileSync(new URL(item.file,root)));structures.set(item.id,structure);}

test('all 14 delivery schematics carry BlockyBuilder credit and their declared dimensions/counts',()=>{
  assert.equal(manifest.items.length,14);assert.equal(new Set(manifest.items.map(i=>i.file)).size,14);
  for(const item of manifest.items){const s=structures.get(item.id);assert.equal(item.author,'BlockyBuilder');assert.equal(s.main.metadata.Author,'BlockyBuilder');assert.equal(s.main.metadata.Name,item.name);assert.equal(s.source.dataVersion,4189);assert.deepEqual(Object.values(s.main.size),item.size);assert.equal(s.main.blocks.length,item.nonAir);}
});

test('all portfolio states belong to the Java 1.21.4 registry, including each property value',()=>{
  for(const item of manifest.items)for(const s of new Set(structures.get(item.id).main.blocks.map(b=>b.state.toString()))){const [name,props]=s.replace('minecraft:','').split('[');assert(registry[name],`${item.id}: ${name}`);for(const part of (props||'').replace(']','').split(',').filter(Boolean)){const [k,v]=part.split('=');assert(registry[name][0][k]?.includes(v),`${item.id}: ${s}`);}}
});

test('every occupied vertical span fits in the actual Building Studio world',()=>{
  for(const item of manifest.items){let low=Infinity,high=-Infinity;for(const {pos} of structures.get(item.id).main.blocks){low=Math.min(low,pos.y);high=Math.max(high,pos.y);}assert(high-low+STUDIO_GROUND_Y<CHUNK_HEIGHT,`${item.id} would clip above Studio's ceiling`);}
});

test('all doors and beds have matching halves, and ladders have backing blocks',()=>{
  for(const item of manifest.items){const blocks=structures.get(item.id).main.blocks,map=new Map(blocks.map(b=>[`${b.pos.x},${b.pos.y},${b.pos.z}`,b.state]));const at=(x,y,z)=>map.get(`${x},${y},${z}`);
    for(const {pos:p,state:s} of blocks){const props=s.properties;
      if(s.name.endsWith('_door')){const other=at(p.x,p.y+(props.half==='lower'?1:-1),p.z);assert.equal(other?.name,s.name,`${item.id}: unpaired door`);assert.notEqual(other.properties.half,props.half);}
      if(s.name.endsWith('_bed')){const [dx,dz]={north:[0,-1],south:[0,1],east:[1,0],west:[-1,0]}[props.facing],dir=props.part==='foot'?1:-1,other=at(p.x+dx*dir,p.y,p.z+dz*dir);assert.equal(other?.name,s.name,`${item.id}: unpaired bed`);assert.notEqual(other.properties.part,props.part);}
      if(s.name==='minecraft:ladder'){const [dx,dz]={north:[0,1],south:[0,-1],east:[-1,0],west:[1,0]}[props.facing];assert(at(p.x+dx,p.y,p.z+dz),`${item.id}: unsupported ladder ${JSON.stringify(p)}`);}
    }
  }
});

test('arrival points provide solid ground and two blocks of clear headroom',()=>{
  for(const item of manifest.items){const map=new Map(structures.get(item.id).main.blocks.map(b=>[`${b.pos.x},${b.pos.y},${b.pos.z}`,b.state.name]));const [x,y,z]=item.anchor;assert(map.has(`${x},${y},${z}`),`${item.id}: missing arrival floor`);for(const dy of [1,2])assert(!map.has(`${x},${y+dy},${z}`),`${item.id}: obstructed arrival headroom`);}
});
