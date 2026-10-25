import original from './data/original-levels.js';
// Geometry is decoded from the published original-level dataset. Biomes are
// presentation only: they never move, add, or remove a gameplay object.
// `scenery` picks the biome's backdrop for levels after the first five, whose backdrops are drawn by index.
export const LEVELS = Object.freeze([
  { name:'Back On Track', difficulty:'Easy', stars:2, biome:'Sunlit Meadow', tag:'Find your rhythm', color:'#a9f478', sky:['#123b48','#72b6a0'], ground:'#467c3f', stone:'#624937', bpm:120, mechanic:'Bounce on golden slime pads', motif:[0,4,7,12,7,4,2,7], hills:['#5f9e6e','#79b67a','#94c98a'] },
  { name:'Polargeist', difficulty:'Normal', stars:3, biome:'Frozen Peaks', tag:'Chase the aurora', color:'#7ceeff', sky:['#07152e','#345b7e'], ground:'#c0e3e9', stone:'#3a6078', bpm:128, mechanic:'Tap again inside a glowing jump ring', motif:[0,7,10,14,12,7,5,10] },
  { name:'Dry Out', difficulty:'Normal', stars:4, biome:'Redstone Badlands', tag:'Turn the world upside down', color:'#ffba65', sky:['#45223e','#db855b'], ground:'#dba55e', stone:'#934e3c', bpm:132, mechanic:'Purple portals reverse gravity', motif:[0,3,7,10,7,3,5,12] },
  { name:'Base After Base', difficulty:'Hard', stars:5, biome:'Lush Caverns', tag:'Go deeper. Go faster.', color:'#66ffce', sky:['#06272b','#23534c'], ground:'#649d62', stone:'#264c49', bpm:138, mechanic:'Dense block patterns and ship flight', motif:[0,5,7,12,10,7,3,5] },
  { name:"Can't Let Go", difficulty:'Hard', stars:6, biome:'The End', tag:'One last leap into the void', color:'#d2a2ff', sky:['#100c24','#433758'], ground:'#d6d6a2', stone:'#434050', bpm:144, mechanic:'Inverted jumps beneath floating islands', motif:[0,3,6,10,12,10,6,3] },
  { name:'Jumper', difficulty:'Harder', stars:7, biome:'Jungle Canopy', tag:'Leap from leaf to leaf', color:'#8dff6a', sky:['#0a2618','#3f7a4a'], ground:'#4f8a32', stone:'#5a3d24', bpm:140, mechanic:'Chained jump pads and a long ship climb', motif:[0,7,12,7,9,4,7,2], scenery:'jungle', hills:['#163c22','#205430','#2d6d3a'] },
  { name:'Time Machine', difficulty:'Harder', stars:8, biome:'Deep Dark', tag:'Wind the sculk clock back', color:'#3fe0e8', sky:['#02080e','#0d2733'], ground:'#1f4a52', stone:'#121b22', bpm:143, mechanic:'Mirror portals flip the world; blue orbs flip gravity', motif:[0,3,7,8,7,3,10,7], scenery:'sculk', hills:['#0a1a22','#0f2530','#14313c'] },
  { name:'Cycles', difficulty:'Harder', stars:9, biome:'Nether Wastes', tag:'Roll between floor and ceiling', color:'#ff6a4a', sky:['#240505','#7a2312'], ground:'#8b2f27', stone:'#3d1210', bpm:128, mechanic:'Ball mode: tap to roll onto the other side', motif:[0,5,3,7,5,10,7,12], scenery:'nether', hills:['#3a0d0a','#561611','#6f2016'] },
  { name:'xStep', difficulty:'Insane', stars:10, biome:'Mushroom Fields', tag:'Step to the beat of the spores', color:'#ff7ad9', sky:['#1b0b29','#7a4b8a'], ground:'#9a7096', stone:'#4a3550', bpm:130, mechanic:'Rapid ball and ship switches', motif:[0,12,7,10,5,12,3,7], scenery:'mushroom', hills:['#2c1838','#3d2249','#53305e'] },
  { name:'Clutterfunk', difficulty:'Insane', stars:11, biome:'Abandoned Mineshaft', tag:'Mind the gears', color:'#ffb347', sky:['#100a05','#3b2a16'], ground:'#8a6432', stone:'#3a2a1a', bpm:140, mechanic:'Mini portals shrink you; dodge the saws', motif:[0,3,5,7,10,7,5,3], scenery:'mineshaft', hills:['#22170c','#2f2112','#3f2c18'] },
  { name:'Theory of Everything', difficulty:'Insane', stars:12, biome:'Stronghold', tag:'Climb to the End portal', color:'#7cff9e', sky:['#050c12','#1d3a3a'], ground:'#76857a', stone:'#2c3530', bpm:136, mechanic:'UFO: tap to flap up the tower', motif:[0,7,3,10,7,12,10,5], scenery:'stronghold', hills:['#12201c','#1a2c27','#233a33'] }
].map((level,index)=>({...level,speed:311.58,length:Math.max(...original.levels[index].objects.map(o=>o[1]))+600})));

// Square solids in every tile style the levels use: plain (1-7), cross (69), bevelled (70-75), mechanical (76-83),
// black (90-96) and brick (116-122). Their art differs in Geometry Dash; their 30-unit collision does not.
const SOLIDS=new Set([1,2,3,4,6,7,69,70,71,72,74,75,76,77,78,81,82,83,90,91,92,93,95,96,116,117,118,119,121,122]);
// Each tile set's inner square (grid 5, bevelled 73, mechanical 80, black 94, brick 120): the filler drawn inside walls,
// with no collision. Treating them as solid shut real gaps: Clutterfunk's third pillar gap and Theory of Everything's
// brick climb could not be passed, and each level completes once they are passable (RESEARCH.md).
const FILLS=new Set([5,73,80,94,120]);
// Pit hazards: the black pit (9), its wavy (61) and thorn (135) forms.
const PITS=new Set([9,61,135]);
// Black sawblades and their hitbox radii, in original units.
const SAWS=new Map([[88,32],[89,21.6],[98,12]]);
// Slabs: 40, and the wavy slab (62) with its end pieces (65, 66), and 68.
const SLABS=new Set([40,62,65,66,68]);
export const GAMEPLAY_IDS=Object.freeze([...new Set([...SOLIDS,...FILLS,...PITS,...SAWS.keys(),...SLABS,
  8,10,11,12,13,35,36,39,45,46,47,67,84,99,101,103,111,140,141,1329])].sort((a,b)=>a-b));
export const ORIGINAL_LEVELS=original.levels;

// Portals: gravity (10/11), game mode (12 cube, 13 ship, 47 ball, 111 UFO), size (99 normal, 101 mini) and mirror
// (45 on, 46 off).
const PORTALS={10:{gravity:1},11:{gravity:-1},12:{mode:'cube'},13:{mode:'ship'},47:{mode:'ball'},111:{mode:'ufo'},
  99:{size:1},101:{size:.6},45:{mirror:true},46:{mirror:false}};
// Orbs: yellow (36) jumps, pink (141) jumps lower, blue (84) flips gravity.
const ORBS={36:'yellow',141:'pink',84:'blue'};

export function createCourse(index) {
  if(!original.levels[index])throw new RangeError('Unknown Geometry Dash level');
  return original.levels[index].objects.flatMap((raw,sourceIndex)=>{
    const [id,cx,cy,flipX,flipY,rotation,scale,coinId]=raw;
    if(!GAMEPLAY_IDS.includes(id))return [];
    let type=FILLS.has(id)?'fill':'block',w=30,h=30,extra={};
    if(id===8||id===39||id===103){type='spike';h=id===8?30:12;}
    if(PITS.has(id)){type='pit';h=8;}
    if(SLABS.has(id))h=id===40?14:12;
    if(SAWS.has(id)){type='saw';w=h=SAWS.get(id)*2;extra={radius:SAWS.get(id)*scale};}
    if([35,67,140].includes(id)){type='pad';w=25;h=4;extra={pad:id===67?'gravity':id===140?'pink':'yellow'};}
    if(ORBS[id]){type='ring';w=h=30;extra={orb:ORBS[id]};}
    if(id===1329){type='coin';w=h=24;extra={coinId};}
    if(PORTALS[id]){type='portal';w=30;h=100;extra={...PORTALS[id]};}
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

// Normal-speed movement is identical for all the original levels. The finish
// runout is separate from the imported objects; no hazards are generated there.
export const COURSES=Object.freeze(original.levels.map((_,i)=>Object.freeze(createCourse(i))));
export const COURSE_META=Object.freeze(original.levels.map((l,i)=>({
  speed:311.58,length:Math.max(...l.objects.map(o=>o[1]))+600,
  // The first ship section's portals; null in a level with no ship.
  shipStart:COURSES[i].find(o=>o.mode==='ship')?.cx??null,
  shipEnd:COURSES[i].find(o=>o.mode==='cube')?.cx??null,
  objectCount:l.objects.length,gameplayCount:COURSES[i].length
})));
