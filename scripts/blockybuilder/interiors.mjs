// Original architecture and interior detailing by BlockyBuilder.
const stairs=(wood,facing)=>`${wood}_stairs[facing=${facing},half=bottom,shape=straight,waterlogged=false]`;
const slab=(wood,type='bottom')=>`${wood}_slab[type=${type},waterlogged=false]`;
const lantern='lantern[hanging=false,waterlogged=false]';
const hanging='lantern[hanging=true,waterlogged=false]';

export function copyAudit(target,source,dx=0,dy=0,dz=0){
  const move=p=>[p[0]+dx,p[1]+dy,p[2]+dz];
  for(const d of source.audit.doors)target.audit.doors.push({...d,pos:move(d.pos),outside:move(d.outside),inside:move(d.inside)});
  for(const r of source.audit.rooms)target.audit.rooms.push({...r,name:`${source.name} / ${r.name}`,floor:r.floor+dy,bounds:[r.bounds[0]+dx,r.bounds[1]+dz,r.bounds[2]+dx,r.bounds[3]+dz],entry:move(r.entry),camera:move(r.camera),look:move(r.look)});
  for(const l of source.audit.ladders)target.audit.ladders.push({...l,x:l.x+dx,z:l.z+dz,bottom:l.bottom+dy,top:l.top+dy,levels:l.levels.map(v=>({...v,floor:v.floor+dy,landing:move(v.landing)}))});
  for(const r of source.audit.routes)target.audit.routes.push({...r,name:`${source.name} / ${r.name}`,from:move(r.from),to:move(r.to)});
}

export function fittedDoor(b,x,y,z,{facing='north',wall='smooth_sandstone',name='Entrance',outside,inside}={}){
  // A one-block door has exactly a one-by-two aperture, with solid jambs and lintel.
  for(const dx of [-1,1])b.box(x+dx,y,z,x+dx,y+2,z,'stripped_spruce_log[axis=y]');
  b.put(x,y+2,z,'spruce_planks');
  for(let k=0;k<2;k++)b.put(x,y+k,z,`spruce_door[facing=${facing},half=${k?'upper':'lower'},hinge=left,open=false,powered=false]`);
  const dir=facing==='north'?-1:1;
  b.audit.doors.push({name,pos:[x,y,z],facing,outside:outside||[x,y,z+dir*2],inside:inside||[x,y,z-dir*2]});
}

export function ladderShaft(b,{x,z,floors,ceiling,facing='north',name='Ladder',guard=true,exit='west'}){
  const back=facing==='north'?[0,1]:facing==='east'?[-1,0]:facing==='west'?[1,0]:[0,-1];
  b.box(x+back[0],floors[0]+1,z+back[1],x+back[0],ceiling-1,z+back[1],'stripped_spruce_log[axis=y]');
  const top=floors.at(-1)+2;
  for(let y=floors[0]+1;y<=top;y++)b.put(x,y,z,`ladder[facing=${facing},waterlogged=false]`);
  const levels=floors.slice(1).map(floor=>{
    // The opening is one cell. The west landing has two clear blocks of headroom.
    const landing=[x+(exit==='west'?-1:1),floor+1,z];
    b.box(landing[0],floor+1,z,landing[0],floor+2,z,'air');
    if(guard){b.put(x,floor+1,z-1,'spruce_fence');if(exit==='west'){b.put(x+1,floor+1,z-1,'spruce_fence');b.put(x+1,floor+1,z,'spruce_fence');}else b.put(x,floor+1,z+1,'spruce_fence');}
    return {floor,landing};
  });
  const result={name,x,z,bottom:floors[0]+1,top,facing,levels};b.audit.ladders.push(result);return result;
}

function window(b,x,y,z,outward=-1){
  b.box(x-1,y,z,x+1,y+2,z,'light_blue_stained_glass');
  b.box(x-2,y+3,z,x+2,y+3,z,'smooth_sandstone');
  b.box(x-2,y+3,z+outward,x+2,y+3,z+outward,slab('sandstone'));
  b.box(x-2,y-1,z+outward,x+2,y-1,z+outward,slab('sandstone','top'));
  for(const dx of [-2,2])b.box(x+dx,y,z+outward,x+dx,y+2,z+outward,'spruce_planks');
}

function bed(b,x,y,z,color='red'){
  b.put(x,y,z,`${color}_bed[facing=south,part=foot,occupied=false]`);
  b.put(x,y,z+1,`${color}_bed[facing=south,part=head,occupied=false]`);
}

function table(b,x,y,z){
  b.put(x,y,z,'spruce_fence');b.put(x,y+1,z,'spruce_pressure_plate[powered=false]');
  b.put(x-1,y,z,stairs('spruce','west'));b.put(x+1,y,z,stairs('spruce','east'));
}

function furnish(b,kind,floor,index,bounds){
  const [x1,z1,x2,z2]=bounds,cx=Math.floor((x1+x2)/2),y=floor+1;
  const names={cottage:['Kitchen & living room'],tavern:['Taproom & kitchen','Guest sleeping room'],blacksmith:['Smith’s workshop'],bakery:['Bakery & bread counter'],shop:['General store'],watchtower:['Guard office','Bunkroom','Chart & signal room','Observation room']};
  const name=names[kind][index]||'Living room';
  // Every accessible level has storage, seating/workspace and its own supported lighting.
  b.put(x1+2,y,z1+2,'barrel[facing=up,open=false]');b.put(x1+2,y+1,z1+2,lantern);
  b.put(x1+1,y,z2-2,'chest[facing=east,type=single,waterlogged=false]');
  b.box(x2-1,y,z1+2,x2-1,y+2,z1+4,'bookshelf');
  b.box(cx-1,y,z1+2,cx+1,y,z1+3,kind==='watchtower'?'blue_carpet':'red_carpet');
  b.box(x1,floor+6,Math.floor((z1+z2)/2),x2,floor+6,Math.floor((z1+z2)/2),'stripped_spruce_log[axis=x]');
  b.put(cx,floor+5,Math.floor((z1+z2)/2),hanging);
  table(b,cx,y,z1+5);
  if(kind==='cottage'||(kind==='tavern'&&index>0)||(kind==='watchtower'&&index===1)){
    for(const x of [x1+2,x1+4])bed(b,x,y,z2-4,kind==='watchtower'?'blue':'red');
    b.box(x1+1,y,z1+5,x1+1,y+2,z1+7,'bookshelf');
  }
  if((kind==='cottage'&&index===0)||(kind==='tavern'&&index===0)){
    b.box(x1+2,y,z2-2,x1+5,y,z2-1,'spruce_planks');
    b.put(x1+2,y+1,z2-1,'furnace[facing=north,lit=false]');b.put(x1+3,y+1,z2-1,'crafting_table');
    b.put(x1+5,y+1,z2-1,lantern);
  }
  if(kind==='tavern'&&index===0){
    for(const x of [cx-5,cx+5])table(b,x,y,z1+8);
    b.box(cx-3,y,z2-2,cx+2,y,z2-2,'barrel[facing=up,open=false]');
    for(const x of [cx-2,cx+1])b.put(x,y+1,z2-2,lantern);
  }
  if(kind==='watchtower'){
    if(index===0){b.put(x1+2,y,z2-5,'lectern[facing=east,has_book=false,powered=false]');b.put(x1+1,y,z1+5,'loom[facing=east]');}
    if(index===2){b.box(x1+2,y,z2-4,x1+5,y,z2-3,'cartography_table');b.put(x1+2,y,z1+5,'lectern[facing=east,has_book=false,powered=false]');b.put(x1+1,y,z1+7,'loom[facing=east]');}
    if(index===3){b.box(x1+1,y,z1+5,x1+1,y+1,z1+7,'barrel[facing=east,open=false]');b.put(x1+3,y,z2-3,'cartography_table');b.put(x1+4,y+1,z2-3,lantern);b.put(x1+4,y,z2-3,'spruce_planks');}
  }
  if(kind==='blacksmith'){
    b.put(x1+2,y,z2-4,'anvil[facing=north]');b.put(x1+4,y,z2-4,'smithing_table');
    b.box(x1+1,y,z1+5,x1+3,y+2,z1+7,'bricks');
    b.put(x1+2,y,z1+5,'furnace[facing=north,lit=true]');b.put(x1+2,y+1,z1+5,'blast_furnace[facing=north,lit=true]');
  }
  if(kind==='bakery'){
    b.box(x1+1,y,z2-3,x1+5,y+2,z2-1,'bricks');
    for(const x of [x1+2,x1+4])b.put(x,y,z2-3,'furnace[facing=north,lit=true]');
    b.box(x1+1,y,z1+5,x1+1,y+2,z1+8,'barrel[facing=east,open=false]');
    b.put(x1+3,y,z1+7,'crafting_table');
  }
  if(kind==='shop'){
    b.box(x1+1,y,z1+5,x1+1,y+2,z1+9,'barrel[facing=east,open=false]');
    b.box(x1+3,y,z2-3,cx+1,y,z2-3,'spruce_planks');b.put(x1+3,y+1,z2-3,lantern);
    b.put(cx+1,y+1,z2-3,'lectern[facing=north,has_book=false,powered=false]');
  }
  const entry=[cx,floor+1,z1+2];
  b.audit.rooms.push({name,floor,bounds:[x1+1,z1+1,x2-1,z2-1],entry,camera:[cx,floor+3,z1+3],look:[cx-1,floor+2,z2-3],minFurnitureTypes:4});
  return entry;
}

export function furnishedHouse(Build,kind,w=27,l=29){
  const names={cottage:'Olive Cottage',tavern:'The Copper Kettle Tavern',blacksmith:'Ember & Anvil Smithy',bakery:'Sunrise Bakery',shop:'Mariner’s General Store',watchtower:'Harbor Watchtower'};
  const b=new Build(`harbor_${kind}`,names[kind],w,52,l,'Village kit',`A detailed Mediterranean ${kind} with fitted doors, furnished rooms, supported lighting and a continuous tiled roof.`);
  b.base();const x1=6,x2=w-7,z1=8,z2=l-7,cx=Math.floor((x1+x2)/2);
  const floors=kind==='watchtower'?[5,12,19,26]:kind==='tavern'?[5,12]:[5],top=floors.at(-1)+7;
  b.box(x1-1,4,z1-1,x2+1,5,z2+1,'stone_bricks');
  b.box(x1,6,z1,x2,top,z2,'smooth_sandstone');b.box(x1+1,6,z1+1,x2-1,top-1,z2-1,'air');
  for(const x of [x1,x2])for(const z of [z1,z2])b.box(x,6,z,x,top,z,'stripped_spruce_log[axis=y]');
  for(const fy of floors){
    b.box(x1+1,fy,z1+1,x2-1,fy,z2-1,'spruce_planks');
    if(fy>5){for(const z of [z1-1,z2+1])b.box(x1-1,fy,z,x2+1,fy,z,'stripped_spruce_log[axis=x]');for(const x of [x1-1,x2+1])b.box(x,fy,z1,x,fy,z2,'stripped_spruce_log[axis=z]');}
    const centers=[x1+3,x2-3];
    if(x2-x1>22)centers.push(cx-6,cx+6);
    for(const x of [...new Set(centers)]){window(b,x,fy+2,z2,1);if(fy>5||Math.abs(x-cx)>=4)window(b,x,fy+2,z1);}
    for(const x of [x1,x2])for(const z of [z1+4,z2-4])b.box(x,fy+2,z-1,x,fy+4,z+1,'light_blue_stained_glass');
  }
  b.box(x1,top,z1,x2,top,z2,'spruce_planks');
  b.roof(x1-1,x2+1,z1-1,z2+1,top+1,kind==='shop'?'dark_oak':'brick');
  const entrances=[];
  for(let i=0;i<floors.length;i++)entrances.push(furnish(b,kind,floors[i],i,[x1,z1,x2,z2]));
  if(floors.length>1){
    const shaft=ladderShaft(b,{x:x2-2,z:z2-2,floors,ceiling:top,name:'Guarded single-cell stairwell'});
    b.audit.routes.push({name:'Entrance to ladder',from:entrances[0],to:[shaft.x-1,6,shaft.z]});
    for(let i=0;i<shaft.levels.length;i++)b.audit.routes.push({name:`Landing to ${b.audit.rooms[i+1].name}`,from:shaft.levels[i].landing,to:entrances[i+1]});
  }
  b.box(cx-2,5,z1-2,cx+2,5,z1-1,'stone_bricks');
  for(let x=cx-2;x<=cx+2;x++)b.put(x,4,z1-3,stairs('stone_brick','south'));
  b.path(cx,0,cx,z1-4,3);
  fittedDoor(b,cx,6,z1,{outside:[cx,5,z1-4],inside:entrances[0]});
  b.audit.routes.push({name:'Front path through fitted door',from:[cx,5,z1-4],to:entrances[0]});
  b.box(cx-2,9,z1-2,cx+2,9,z1-1,'stripped_spruce_log[axis=x]');
  for(const x of [cx-2,cx+2])b.put(x,8,z1-1,hanging);
  if(kind!=='watchtower'){
    b.box(x1+2,top+1,z2-2,x1+3,top+10,z2-1,'bricks');
    b.box(x1+1,top+11,z2-3,x1+4,top+11,z2,slab('stone_brick'));
  }
  if(kind==='bakery'||kind==='shop'){
    for(let x=x1-1;x<=x2+1;x++)for(const z of [z1-5,z1-4])b.put(x,10,z,x%4<2?'white_wool':kind==='bakery'?'orange_wool':'cyan_wool');
    for(const x of [x1-1,x2+1])b.box(x,5,z1-5,x,9,z1-5,'spruce_fence');
    b.box(x1,5,z1-4,x1+3,6,z1-4,'barrel[facing=up,open=false]');
  }
  if(kind==='blacksmith'){
    b.box(2,4,z1+5,5,4,z2-2,'stone_bricks');b.put(3,5,z1+6,'anvil[facing=north]');
    b.put(3,5,z2-3,'grindstone[face=floor,facing=north]');
    for(const z of [z1+4,z2-1])b.box(2,5,z,2,9,z,'spruce_fence');
    b.box(2,10,z1+4,5,10,z2-1,slab('spruce'));
  }
  for(const x of [3,w-4]){b.box(x,5,z1+2,x,5,z1+6,'oak_leaves[distance=1,persistent=true,waterlogged=false]');b.lamp(x,5,z1-3,'spruce',3);}
  b.features=[`${floors.length} individually furnished ${floors.length===1?'room':'floors'}`,'Fitted one-by-two entrance','Continuous roof backing','Supported lanterns',...(floors.length>1?['Guarded one-cell ladder shaft and walk-off landings']:[])];
  b.pois=[{label:'Entrance',pos:[cx,6,z1-1]}];b.anchor=[cx,4,2];return b;
}
