import original from './data/original-levels.js';
// Geometry is decoded from the published original-level dataset. Biomes are
// presentation only: they never move, add, or remove a gameplay object.
export const LEVELS = Object.freeze([
  { name:'Back On Track', difficulty:'Easy', stars:2, biome:'Sunlit Meadow', tag:'Find your rhythm', color:'#a9f478', sky:['#123b48','#72b6a0'], ground:'#467c3f', stone:'#624937', bpm:120, mechanic:'Bounce on golden slime pads', motif:[0,4,7,12,7,4,2,7] },
  { name:'Polargeist', difficulty:'Normal', stars:3, biome:'Frozen Peaks', tag:'Chase the aurora', color:'#7ceeff', sky:['#07152e','#345b7e'], ground:'#c0e3e9', stone:'#3a6078', bpm:128, mechanic:'Tap again inside a glowing jump ring', motif:[0,7,10,14,12,7,5,10] },
  { name:'Dry Out', difficulty:'Normal', stars:4, biome:'Redstone Badlands', tag:'Turn the world upside down', color:'#ffba65', sky:['#45223e','#db855b'], ground:'#dba55e', stone:'#934e3c', bpm:132, mechanic:'Purple portals reverse gravity', motif:[0,3,7,10,7,3,5,12] },
  { name:'Base After Base', difficulty:'Hard', stars:5, biome:'Lush Caverns', tag:'Go deeper. Go faster.', color:'#66ffce', sky:['#06272b','#23534c'], ground:'#649d62', stone:'#264c49', bpm:138, mechanic:'Dense block patterns and ship flight', motif:[0,5,7,12,10,7,3,5] },
  { name:"Can't Let Go", difficulty:'Hard', stars:6, biome:'The End', tag:'One last leap into the void', color:'#d2a2ff', sky:['#100c24','#433758'], ground:'#d6d6a2', stone:'#434050', bpm:144, mechanic:'Inverted jumps beneath floating islands', motif:[0,3,6,10,12,10,6,3] }
].map((level,index)=>({...level,speed:311.58,length:Math.max(...original.levels[index].objects.map(o=>o[1]))+600})));

export const GAMEPLAY_IDS=Object.freeze([1,2,3,4,5,6,7,8,9,10,11,12,13,35,36,39,40,62,67,68,140,1329]);
export const ORIGINAL_LEVELS=original.levels;

export function createCourse(index) {
  if(!original.levels[index])throw new RangeError('Unknown Geometry Dash level');
  return original.levels[index].objects.flatMap((raw,sourceIndex)=>{
    const [id,cx,cy,flipX,flipY,rotation,scale,coinId]=raw;
    if(!GAMEPLAY_IDS.includes(id))return [];
    let type='block',w=30,h=30,extra={};
    if(id===8||id===39){type='spike';h=id===39?12:30;}
    if(id===9){type='pit';h=8;}
    if([40,62,68].includes(id))h=id===40?14:12;
    if([35,67,140].includes(id)){type='pad';w=25;h=4;extra={pad:id===67?'gravity':id===140?'pink':'yellow'};}
    if(id===36){type='ring';w=h=30;}
    if(id===1329){type='coin';w=h=24;extra={coinId};}
    if([10,11,12,13].includes(id)){type='portal';w=30;h=100;extra=id===10?{gravity:1}:id===11?{gravity:-1}:{mode:id===12?'cube':'ship'};}
    w*=scale;h*=scale;
    const radians=rotation*Math.PI/180;
    const width=Math.abs(Math.cos(radians))*w+Math.abs(Math.sin(radians))*h;
    const height=Math.abs(Math.sin(radians))*w+Math.abs(Math.cos(radians))*h;
    // Centers and transformations stay in the original 30-unit coordinate grid.
    return [{id,sourceIndex,cx,cy,x:cx-width/2,y:cy-height/2,w:width,h:height,
      localW:w,localH:h,rotation,flipX:Boolean(flipX),flipY:Boolean(flipY),scale,
      inverted:Boolean(flipY)!==(Math.cos(radians)<0),type,...extra}];
  }).sort((a,b)=>a.x-b.x||a.sourceIndex-b.sourceIndex);
}

// Normal-speed movement is identical for all five original levels. The finish
// runout is separate from the imported objects; no hazards are generated there.
export const COURSES=Object.freeze(original.levels.map((_,i)=>Object.freeze(createCourse(i))));
export const COURSE_META=Object.freeze(original.levels.map((l,i)=>({
  speed:311.58,length:Math.max(...l.objects.map(o=>o[1]))+600,
  shipStart:COURSES[i].find(o=>o.mode==='ship').cx,
  shipEnd:COURSES[i].find(o=>o.mode==='cube').cx,
  objectCount:l.objects.length,gameplayCount:COURSES[i].length
})));

