// Geometry audit by BlockyBuilder. Reads delivered schematics, not generator voxels.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readSpongeSchematic } from '../../src/io/codecs.js';
import { gameBlockFromState } from '../../src/io/gameBlockStates.js';
import { BLOCK_DEFS } from '../../src/blocks.js';
import { OUTPUT } from './generate.mjs';

export function inspectBuild(structure,item){
  const [w,h,l]=item.size,volume=w*h*l,grid=new Uint16Array(volume),states=[null],ids=new Map(),problems=[],checks=[];
  const key=(x,y,z)=>x+z*w+y*w*l;
  const valid=(x,y,z)=>x>=0&&y>=0&&z>=0&&x<w&&y<h&&z<l;
  for(const b of structure.main.blocks){const s=b.state.toString();if(!ids.has(s)){ids.set(s,states.length);states.push(b.state);}grid[key(b.pos.x,b.pos.y,b.pos.z)]=ids.get(s);}
  const at=(x,y,z)=>valid(x,y,z)?states[grid[key(x,y,z)]]:null;
  const pass=states.map(s=>{if(!s)return true;if(s.name.endsWith('_door'))return true;const def=BLOCK_DEFS[gameBlockFromState(s).id];return def?.solid===false||Boolean(def?.plant);});
  const clear=(x,y,z)=>valid(x,y,z)&&pass[grid[key(x,y,z)]];
  const clearBody=(x,y,z)=>clear(x,y,z)&&clear(x,y+1,z)&&!at(x,y-1,z)?.name.match(/_fence$|_wall$/);
  const ladder=(x,y,z)=>at(x,y,z)?.name==='minecraft:ladder';
  const walk=(x,y,z)=>clearBody(x,y,z)&&((at(x,y-1,z)&&!pass[grid[key(x,y-1,z)]])||ladder(x,y,z)||ladder(x,y-1,z));
  const bad=(text)=>problems.push(text);
  const route=(from,to)=>{
    if(!walk(...from)||!walk(...to))return false;
    const start=key(...from),end=key(...to),seen=new Uint8Array(volume),queue=[start];seen[start]=1;
    for(let i=0;i<queue.length;i++){
      const k=queue[i];if(k===end)return true;const x=k%w,z=Math.floor(k/w)%l,y=Math.floor(k/(w*l));
      const visit=(xx,yy,zz)=>{if(!valid(xx,yy,zz))return;const n=key(xx,yy,zz);if(!seen[n]&&walk(xx,yy,zz)){seen[n]=1;queue.push(n);}};
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])for(const dy of [0,1,-1]){
        if(dy>0&&!clearBody(x,y+1,z))continue;
        visit(x+dx,y+dy,z+dz);
      }
      if(ladder(x,y,z)||ladder(x,y-1,z)){visit(x,y+1,z);visit(x,y-1,z);}
    }
    return false;
  };
  for(const b of structure.main.blocks){const p=b.pos,s=b.state;
    if(s.name.endsWith('_door')&&s.properties.half==='lower'){
      const upper=at(p.x,p.y+1,p.z);if(upper?.name!==s.name||upper.properties.half!=='upper')bad(`Unpaired door at ${p.x},${p.y},${p.z}`);
      if(!at(p.x,p.y+2,p.z)||pass[grid[key(p.x,p.y+2,p.z)]])bad(`Door has no fitted lintel at ${p.x},${p.y},${p.z}`);
      const axis=['north','south'].includes(s.properties.facing)?[1,0]:[0,1];
      for(const n of [-1,1])for(const dy of [0,1])if(!at(p.x+axis[0]*n,p.y+dy,p.z+axis[1]*n)||pass[grid[key(p.x+axis[0]*n,p.y+dy,p.z+axis[1]*n)]])bad(`Door has an oversized jamb opening at ${p.x},${p.y},${p.z}`);
    }
    if(s.name==='minecraft:lantern'){
      const supportY=p.y+(s.properties.hanging==='true'?1:-1);if(!at(p.x,supportY,p.z))bad(`Unsupported lantern at ${p.x},${p.y},${p.z}`);
    }
    if(s.name.endsWith('_leaves')&&s.properties.persistent!=='true')bad(`Decaying leaf block at ${p.x},${p.y},${p.z}`);
  }
  for(const shaft of item.audit?.ladders||[]){
    for(let y=shaft.bottom;y<=shaft.top;y++)if(!ladder(shaft.x,y,shaft.z))bad(`${shaft.name}: broken ladder at Y=${y}`);
    for(const level of shaft.levels){
      if(!walk(...level.landing))bad(`${shaft.name}: blocked landing at Y=${level.floor}`);
      if(!route([shaft.x,level.floor+1,shaft.z],level.landing))bad(`${shaft.name}: cannot step off at Y=${level.floor}`);
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(!at(shaft.x+dx,level.floor,shaft.z+dz))bad(`${shaft.name}: oversized hole next to floor ${level.floor}`);
    }
    checks.push({type:'ladder',name:shaft.name,levels:shaft.levels.length});
  }
  const furnishing=/_bed$|chest$|barrel$|bookshelf$|lectern$|furnace$|crafting_table$|cartography_table$|smithing_table$|loom$|anvil$|grindstone$|_stairs$/;
  for(const room of item.audit?.rooms||[]){
    const [x1,z1,x2,z2]=room.bounds,types=new Set();let lights=0;
    const ceiling=room.ceiling||room.floor+7;
    for(let y=room.floor+1;y<Math.min(ceiling,room.floor+6);y++)for(let z=z1;z<=z2;z++)for(let x=x1;x<=x2;x++){
      const s=at(x,y,z);if(s&&furnishing.test(s.name))types.add(s.name);if(s?.name==='minecraft:lantern')lights++;
    }
    if(types.size<(room.minFurnitureTypes||4))bad(`${room.name}: only ${types.size} furniture types`);
    if(!lights)bad(`${room.name}: no room lighting`);
    if(!walk(...room.entry))bad(`${room.name}: entry/landing obstructed`);
    if(room.enclosed!==false){
      for(let y=room.floor+1;y<=room.floor+5;y++){
        for(let x=x1;x<=x2;x++)for(const z of [z1-1,z2+1])if(!at(x,y,z))bad(`${room.name}: exterior wall gap at ${x},${y},${z}`);
        for(let z=z1;z<=z2;z++)for(const x of [x1-1,x2+1])if(!at(x,y,z))bad(`${room.name}: exterior wall gap at ${x},${y},${z}`);
      }
    }
    checks.push({type:'room',name:room.name,floor:room.floor,furnitureTypes:types.size,lights});
  }
  for(const r of item.audit?.routes||[]){if(!route(r.from,r.to))bad(`Unusable route: ${r.name} (${r.from} -> ${r.to})`);checks.push({type:'route',name:r.name});}
  return {id:item.id,author:'BlockyBuilder',status:problems.length?'failed':'passed',problems:[...new Set(problems)],checks,rooms:checks.filter(c=>c.type==='room').length,routes:checks.filter(c=>c.type==='route').length};
}

export async function auditPortfolio(){
  const manifest=JSON.parse(fs.readFileSync(path.join(OUTPUT,'manifest.json'))),results=[];
  for(const item of manifest.items){const bytes=fs.readFileSync(path.join(OUTPUT,item.file));const {structure}=await readSpongeSchematic(bytes);const result=inspectBuild(structure,item);result.sha256=createHash('sha256').update(bytes).digest('hex');results.push(result);console.log(`${item.id}: ${result.status}; ${result.rooms} rooms, ${result.routes} routes`);for(const p of result.problems.slice(0,12))console.log('  '+p);}
  fs.writeFileSync(path.join(OUTPUT,'verification/detail-audit.json'),JSON.stringify({author:'BlockyBuilder',checkedAt:new Date().toISOString(),scope:'Delivered block geometry, fitted doors, ladder continuity/landings, room furnishing, wall closure and two-block-high navigation; doors considered openable',results},null,2));return results;
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){const r=await auditPortfolio();if(r.some(r=>r.status!=='passed'))process.exitCode=1;}
