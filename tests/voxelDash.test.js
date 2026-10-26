import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/mods/voxel-dash/server/game.js';
import {createSimulation,PHYSICS} from '../src/mods/voxel-dash/server/simulation.js';
import {LEVELS,COURSES,COURSE_META,ORIGINAL_LEVELS,GAMEPLAY_IDS} from '../src/mods/voxel-dash/levels.js';
import {ModSession} from '../src/engine/modSession.js';
const button=(g,id)=>g.input(0,{type:'button',id});
const advance=(s,seconds)=>{for(let i=0;i<Math.round(seconds*240);i++)s.advance(1/240);};
const block=(x,y,w,h,sourceIndex=0)=>({type:'block',x,y,w,h,sourceIndex});
test('all eleven courses preserve every original gameplay object center, ID and transformation',()=>{
  // Levels 2-12 of Geometry Dash, Back On Track to Theory of Everything, each in its own Minecraft biome.
  assert.deepEqual(LEVELS.map(l=>l.stars),[2,3,4,5,6,7,8,9,10,11,12]);assert.equal(new Set(LEVELS.map(l=>l.biome)).size,11);
  assert.deepEqual(LEVELS.slice(5).map(l=>l.name),['Jumper','Time Machine','Cycles','xStep','Clutterfunk','Theory of Everything']);
  assert.deepEqual(LEVELS.slice(5).map(l=>l.difficulty),['Harder','Harder','Harder','Insane','Insane','Insane']);
  assert.deepEqual(ORIGINAL_LEVELS.map(l=>l.objects.length),[1545,1531,1444,2146,1704,2813,3599,3921,4716,4863,4345]);
  for(let i=0;i<LEVELS.length;i++){
    const original=ORIGINAL_LEVELS[i].objects,course=COURSES[i];
    assert.equal(course.length,original.filter(o=>GAMEPLAY_IDS.includes(o[0])).length);
    assert.equal(course.filter(o=>o.type==='coin').length,3);
    for(const o of course){const raw=original[o.sourceIndex];assert.deepEqual([o.id,o.cx,o.cy,Number(o.flipX),Number(o.flipY),o.rotation,o.scale],raw.slice(0,7));}
    assert.equal(COURSE_META[i].speed,311.58);
  }
});
test('original portal coordinates replace the uniform generated ship and gravity sections',()=>{
  assert.deepEqual(COURSE_META.slice(0,5).map(l=>[l.shipStart,l.shipEnd]),[[12645,16785],[9645,13305],[16991,21225],[13793,17985],[14409,17721]]);
  assert.ok(COURSES[0].some(o=>o.id===35&&o.cx===405));
  assert.ok(COURSES[1].some(o=>o.id===36&&o.cx===517&&o.cy===51));
  assert.ok(COURSES[2].some(o=>o.id===11&&o.cx===8775));
});
test('ship can ride clear floor, lift off, ride clear ceiling, then descend',()=>{
  const s=createSimulation([],{length:5000},{mode:'ship',y:100,grounded:false});
  advance(s,1);assert.equal(s.snapshot().phase,'play');assert.equal(s.snapshot().y,0);assert.equal(s.snapshot().vy,0);
  s.jump(true);advance(s,1);assert.equal(s.snapshot().phase,'play');assert.equal(s.snapshot().y,270);assert.equal(s.snapshot().vy,0);
  s.jump(false);advance(s,.2);assert.ok(s.snapshot().y<270);assert.equal(s.snapshot().phase,'play');
});
test('ship slides on solid horizontal faces but a side collision still kills',()=>{
  const floor=createSimulation([block(-50,0,1000,60)],{length:5000},{mode:'ship',y:90,grounded:false});advance(floor,.5);assert.equal(floor.snapshot().y,60);assert.equal(floor.snapshot().phase,'play');
  const roof=createSimulation([block(-50,200,1000,100)],{length:5000},{mode:'ship',y:150,grounded:false});roof.jump(true);advance(roof,.5);assert.equal(roof.snapshot().y,170);assert.equal(roof.snapshot().phase,'play');
  const wall=createSimulation([block(100,0,30,300)],{length:5000},{mode:'ship',y:130,grounded:false});advance(wall,.5);assert.equal(wall.snapshot().phase,'dead');
});
test('ship transition resets cube spin and always faces forward while pitching',()=>{
  const portal={type:'portal',sourceIndex:1,x:0,y:0,w:30,h:100,mode:'ship',cy:150};
  const s=createSimulation([portal],{length:5000},{angle:Math.PI*5,y:0});s.advance(1/240);
  assert.equal(s.snapshot().mode,'ship');assert.ok(Math.abs(s.snapshot().angle)<.1);
  s.jump(true);advance(s,.5);assert.ok(s.snapshot().angle<0);assert.ok(Math.cos(s.snapshot().angle)>0);
  s.jump(false);advance(s,.5);assert.ok(Math.cos(s.snapshot().angle)>0);
});
test('gravity portals on elevated coin routes do not affect players passing below',()=>{
  const portal={type:'portal',sourceIndex:1,x:100,y:250,w:100,h:30,gravity:-1,cy:265};
  const s=createSimulation([portal],{length:5000});advance(s,1);assert.equal(s.snapshot().gravity,1);
  const touched=createSimulation([portal],{length:5000},{x:95,y:250,grounded:false});touched.advance(1/240);assert.equal(touched.snapshot().gravity,-1);
});
test('cube, inverted cube, yellow pads and buffered jump rings have distinct mechanics',()=>{
  const cube=createSimulation([],{length:5000});cube.jump(true);advance(cube,.1);assert.ok(cube.snapshot().y>0);assert.equal(cube.snapshot().mode,'cube');
  const pad={type:'pad',sourceIndex:0,x:35,y:0,w:25,h:4,pad:'yellow',inverted:false};
  const bounce=createSimulation([pad],{length:5000});advance(bounce,.03);assert.ok(bounce.snapshot().vy>PHYSICS.jump);
  const ring={type:'ring',sourceIndex:0,x:50,y:80,w:30,h:30};
  const held=createSimulation([ring],{length:5000});held.jump(true);advance(held,.12);assert.equal(held.snapshot().used.length,0,'Ground jump consumes orb input until a fresh press');
  const tap=createSimulation([ring],{length:5000},{y:60,grounded:false});tap.jump(true);advance(tap,.1);assert.ok(tap.snapshot().used.includes(0));
  const inverted=createSimulation([block(-50,180,1000,30)],{length:5000},{y:150,gravity:-1,grounded:true});inverted.jump(true);advance(inverted,.1);assert.ok(inverted.snapshot().y<150);
});
test('spikes and black pit hazards kill ships even though clear ground is safe',()=>{
  for(const type of ['spike','pit']){
    const o={type,id:type==='spike'?8:9,sourceIndex:0,x:90,y:0,w:30,h:type==='spike'?30:8,cx:105,cy:type==='spike'?15:2,rotation:0,scale:1};
    const s=createSimulation([o],{length:5000},{mode:'ship',y:0});advance(s,.5);assert.equal(s.snapshot().phase,'dead');
  }
});
test('authority rejects spoofed slots and malformed inputs; pause freezes state',()=>{
  const g=createGame();assert.equal(g.input(1,{type:'button',id:'start'}),false);assert.equal(g.input(0,{type:'select',level:99}),false);assert.equal(g.input(0,{type:'jump',down:'yes'}),false);assert.equal(button(g,'setHealth'),false);
  button(g,'start');g.input(0,{type:'jump',down:true});g.update(1/30);assert.ok(g.snapshot().y>0);g.release(0);button(g,'pause');const before=g.snapshot();g.update(1/30);assert.deepEqual(g.snapshot(),before);button(g,'pause');g.update(1/30);assert.ok(g.snapshot().x>before.x);
});
test('practice checkpoints preserve airborne position, velocity and mode; new run clears them',()=>{
  const g=createGame();button(g,'practice');button(g,'start');g.input(0,{type:'jump',down:true});g.update(.1);assert.equal(button(g,'checkpoint'),true);const cp=g.snapshot();g.update(.1);button(g,'retry');assert.equal(g.snapshot().x,cp.x);assert.equal(g.snapshot().vy,cp.vy);assert.equal(g.snapshot().attempt,2);button(g,'start');assert.equal(g.snapshot().checkpoint,null);
});
test('worlds isolate state and fixed-tick journals restore exact gameplay',()=>{
  const s=new ModSession(createGame),other=createGame();s.command(0,1,{type:'button',id:'start'});for(let i=0;i<20;i++)s.step();s.command(0,2,{type:'jump',down:true});for(let i=0;i<8;i++)s.step();s.command(0,3,{type:'jump',down:false});
  assert.deepEqual(ModSession.restore(createGame,s.save()).game.snapshot(),s.game.snapshot());assert.equal(other.snapshot().phase,'menu');
});

// --- levels 7-12: the mechanics they bring ----------------------------------------------------------------------

test('the new levels keep their real sections: Cycles\' ball, Clutterfunk\'s mini and saws, Theory of Everything\'s UFO',()=>{
  const at=(level,pred)=>COURSES[LEVELS.findIndex(l=>l.name===level)].filter(pred).map(o=>o.cx);
  assert.deepEqual(at('Cycles',o=>o.mode==='ball'),[9075,18165]);
  assert.equal(at('Clutterfunk',o=>o.size===.6)[0],4425,'mini from x 4425');
  assert.ok(at('Clutterfunk',o=>o.type==='saw').length>100,'Clutterfunk is full of saws');
  assert.deepEqual(at('Theory of Everything',o=>o.mode==='ufo'),[6945,16665]);
  assert.ok(at('Time Machine',o=>o.mirror===true).includes(8775),'Time Machine mirrors the world at 8775');
  for(const [i,l] of LEVELS.entries())assert.equal(COURSES[i].filter(o=>o.type==='coin').length,3,`${l.name} has its three coins`);
});
test('ball: a press on the floor rolls it to the ceiling, where it lands; pressed again, it rolls back',()=>{
  const s=createSimulation([],{length:5000},{mode:'ball',y:0,floor:0,ceiling:300});
  advance(s,.2);assert.equal(s.snapshot().y,0,'resting on the floor');assert.equal(s.snapshot().grounded,true);
  s.jump(true);s.advance(1/240);assert.equal(s.snapshot().gravity,-1,'gravity flipped');assert.ok(s.snapshot().vy>0,'pushed off towards the ceiling');s.jump(false);
  advance(s,1.2);assert.equal(s.snapshot().y,270,'on the ceiling');assert.equal(s.snapshot().grounded,true);assert.equal(s.snapshot().phase,'play');
  s.jump(true);advance(s,.05);assert.equal(s.snapshot().gravity,1,'and back');
});
test('ball: gravity is 0.6 of the cube\'s, so it falls slower',()=>{
  const ball=createSimulation([],{length:5000},{mode:'ball',y:200,floor:0,ceiling:400,grounded:false});
  const cube=createSimulation([],{length:5000},{mode:'cube',y:200,grounded:false});
  advance(ball,.2);advance(cube,.2);
  assert.ok(Math.abs(ball.snapshot().vy/cube.snapshot().vy-PHYSICS.ballGravity)<.01);
});
test('ball and UFO portals give a ten-block corridor, as the ship\'s',()=>{
  for(const mode of ['ball','ufo']){
    const s=createSimulation([{type:'portal',sourceIndex:1,x:0,y:0,w:30,h:100,mode,cy:165}],{length:5000});s.advance(1/240);
    assert.deepEqual([s.snapshot().mode,s.snapshot().floor,s.snapshot().ceiling],[mode,0,300]);
  }
});
test('UFO: each press flaps once; holding does not keep it rising; it falls in between',()=>{
  const s=createSimulation([],{length:5000},{mode:'ufo',y:100,floor:0,ceiling:300,grounded:false});
  s.jump(true);s.advance(1/240);assert.ok(Math.abs(s.snapshot().vy-(PHYSICS.ufoFlap-PHYSICS.cubeGravity*PHYSICS.ufoGravity/240))<1e-6,'one flap');
  advance(s,.6);assert.ok(s.snapshot().vy<0,'held, it is falling again');
  s.jump(false);s.jump(true);s.advance(1/240);assert.ok(s.snapshot().vy>0,'a new press flaps again');
});
test('UFO: an orb in reach takes the press, not the flap',()=>{
  const orb={type:'ring',orb:'yellow',sourceIndex:5,x:-10,y:90,w:30,h:30};
  const s=createSimulation([orb],{length:5000},{mode:'ufo',y:100,floor:0,ceiling:400,grounded:false});
  s.jump(true);s.advance(1/240);assert.ok(s.snapshot().used.includes(5));assert.ok(s.snapshot().vy>PHYSICS.ufoFlap,'the orb\'s launch');
});
test('mini: a smaller box and lower jumps (0.8), the same gravity',()=>{
  const portal={type:'portal',sourceIndex:1,x:0,y:0,w:30,h:100,size:.6,cy:50};
  const s=createSimulation([portal],{length:5000});s.advance(1/240);assert.equal(s.snapshot().scale,.6);
  const mini=createSimulation([],{length:5000},{scale:.6}),big=createSimulation([],{length:5000});
  mini.jump(true);big.jump(true);mini.advance(1/240);big.advance(1/240);
  assert.ok(Math.abs((mini.snapshot().vy+PHYSICS.cubeGravity/240)/(big.snapshot().vy+PHYSICS.cubeGravity/240)-.8)<1e-9);
  // A roof 15 above the floor: into a full-size cube's kill box (its middle, 10.5-19.5), clear of a mini one's (6.3-11.7).
  const roof=[block(60,15,200,100)];
  const smallRun=createSimulation(roof,{length:400},{scale:.6});advance(smallRun,1.4);assert.equal(smallRun.snapshot().phase,'complete');
  const bigRun=createSimulation(roof,{length:400});advance(bigRun,1.4);assert.equal(bigRun.snapshot().phase,'dead');
  const back=createSimulation([{...portal,size:1}],{length:5000},{scale:.6});back.advance(1/240);assert.equal(back.snapshot().scale,1);
});
test('pink orbs launch lower than yellow; blue orbs flip gravity and send the player towards the new down',()=>{
  const launch=(orb,state={})=>{const s=createSimulation([{type:'ring',orb,sourceIndex:0,x:-10,y:50,w:30,h:30}],{length:5000},{y:60,grounded:false,...state});s.jump(true);s.advance(1/240);return s.snapshot();};
  const yellow=launch('yellow'),pink=launch('pink'),blue=launch('blue');
  assert.ok(pink.vy<yellow.vy&&pink.vy>0,'pink is lower');
  assert.equal(blue.gravity,-1,'blue flips gravity');assert.ok(blue.vy>0,'and sends the player up, towards its new floor');
  const back=launch('blue',{gravity:-1});assert.equal(back.gravity,1);assert.ok(back.vy<0,'and down again');
});
test('a gravity pad fires only for a player falling onto it, and launches away from it',()=>{
  const floorPad={type:'pad',pad:'gravity',sourceIndex:0,x:35,y:0,w:25,h:4,inverted:false};
  const s=createSimulation([floorPad],{length:5000});advance(s,.05);
  assert.equal(s.snapshot().gravity,-1);assert.ok(s.snapshot().vy>0,'up, away from the floor pad');
  const ceilingPad={...floorPad,y:296,inverted:true};
  const upside=createSimulation([ceilingPad],{length:5000},{y:270,gravity:-1,grounded:false});advance(upside,.05);
  assert.equal(upside.snapshot().gravity,1);assert.ok(upside.snapshot().vy<0,'down, away from the ceiling pad');
  const wrongWay=createSimulation([ceilingPad],{length:5000},{y:270,vy:300,gravity:1,grounded:false});advance(wrongWay,.05);
  assert.equal(wrongWay.snapshot().gravity,1,'a ceiling pad does nothing for a player whose gravity points away from it');
});
test('just after gravity flips, a block\'s side puts the player back on a face instead of killing',()=>{
  // The wall's side is already inside the player's kill box on the first tick.
  const wall=[block(18,0,60,60)];
  const fresh=createSimulation(wall,{length:400},{y:20,grounded:false,flipAt:0,time:0});fresh.advance(1/240);
  assert.equal(fresh.snapshot().phase,'play','within 0.1 s of a flip');assert.equal(fresh.snapshot().y,60,'put on the top face');
  const late=createSimulation(wall,{length:400},{y:20,grounded:false});late.advance(1/240);assert.equal(late.snapshot().phase,'dead','without one');
});
test('sawblades kill by their round edge, not their square box',()=>{
  const saw=(cy,r=30)=>({type:'saw',sourceIndex:0,id:88,cx:200,cy,x:200-r,y:cy-r,w:r*2,h:r*2,radius:r,scale:1});
  const clear=createSimulation([saw(30+30+2)],{length:400});advance(clear,1.3);assert.equal(clear.snapshot().phase,'complete','under it, clear of the blade');
  const hit=createSimulation([saw(40)],{length:400});advance(hit,1.3);assert.equal(hit.snapshot().phase,'dead');
});
test('mirror portals turn the view round and back; they change nothing else',()=>{
  const on={type:'portal',sourceIndex:1,x:0,y:0,w:30,h:100,mirror:true,cy:50},off={...on,sourceIndex:2,x:100,mirror:false};
  const s=createSimulation([on,off],{length:5000});s.advance(1/240);assert.equal(s.snapshot().mirrored,true);
  const plain=createSimulation([],{length:5000});plain.advance(1/240);
  assert.equal(s.snapshot().y,plain.snapshot().y);assert.equal(s.snapshot().vy,plain.snapshot().vy);
  advance(s,.5);assert.equal(s.snapshot().mirrored,false);
});
test('every level can be chosen and started from the menu, and records are kept for all eleven',()=>{
  const g=createGame();
  for(let i=0;i<LEVELS.length;i++){assert.equal(g.input(0,{type:'select',level:i}),true);button(g,'start');g.update(1/30);assert.equal(g.snapshot().levelIndex,i);}
  assert.equal(g.snapshot().best.length,11);
});
test('each tile set\'s inner square is fill: drawn, but with no collision',()=>{
  for(const [i,l] of LEVELS.entries())for(const o of COURSES[i].filter(o=>[5,73,80,94,120].includes(o.id)))assert.equal(o.type,'fill',`${l.name} ${o.id}`);
  const fill={type:'fill',sourceIndex:0,x:40,y:0,w:90,h:90};
  const s=createSimulation([fill],{length:400});advance(s,1.5);assert.equal(s.snapshot().phase,'complete','straight through it');
  // Clutterfunk's third pillar gap: passable only because its column's inner squares are fill.
  const clutterfunk=COURSES[LEVELS.findIndex(l=>l.name==='Clutterfunk')];
  assert.deepEqual(clutterfunk.filter(o=>o.cx===1605&&o.cy<150&&['block','fill'].includes(o.type)).sort((a,b)=>a.cy-b.cy).map(o=>[o.id,o.type]),[[71,'block'],[73,'fill'],[73,'fill'],[69,'block']]);
});

// --- what the player sees and hears ----------------------------------------------------------------------------

test('every object stands out from its level\'s background, by fill or outline, at 3:1 or better',async()=>{
  const {levelPalette,backgroundColors,contrast}=await import('../src/mods/voxel-dash/client/theme.js');
  for(const l of LEVELS){
    const p=levelPalette(l),bg=backgroundColors(l),worst=c=>Math.min(...bg.map(b=>contrast(c,b)));
    const readable=(fill,edge)=>Math.max(worst(fill),worst(edge));
    assert.ok(readable(p.solidTop,p.solidEdge)>=3,`${l.name}: platforms`);
    assert.ok(readable(p.spike,p.spikeEdge)>=3,`${l.name}: spikes`);
    for(const pad of [p.padYellow,p.padPink,p.padGravity])assert.ok(readable(pad,p.edge)>=3,`${l.name}: pads`);
    for(const orb of [p.orbYellow,p.orbPink,p.orbBlue])assert.ok(readable(orb,p.edge)>=3,`${l.name}: orbs`);
    assert.ok(worst(p.outline)>=3,`${l.name}: the player's outline`);
  }
});
test('the player is outlined light on a dark level and dark on a light one',async()=>{
  const {levelPalette,luminance}=await import('../src/mods/voxel-dash/client/theme.js');
  const light=LEVELS.filter(l=>levelPalette(l).light).map(l=>l.name);
  assert.deepEqual(light,['Back On Track','Dry Out'],'the two daylight levels');
  for(const l of LEVELS){const p=levelPalette(l);assert.ok(p.light?luminance(p.outline)<.05:luminance(p.outline)>.9,l.name);}
});
test('each level has its own soundtrack, in its own style, at its own tempo',async()=>{
  const {songFor,LEVEL_STYLES,STYLES,noteOf}=await import('../src/mods/voxel-dash/client/music.js');
  assert.equal(new Set(LEVEL_STYLES).size,LEVELS.length,'a style per level');
  for(const [i,l] of LEVELS.entries()){
    const song=songFor(l,i),style=STYLES[LEVEL_STYLES[i]];
    assert.equal(song.bpm,l.bpm);
    for(const row of ['kick','snare','hat','rhythm','bassLine'])assert.equal(style[row].length,16,`${l.name} ${row}`);
    const steps=Array.from({length:16*16},(_,s)=>song.at(s));
    assert.ok(steps.some(b=>b.kick)&&steps.some(b=>b.snare)&&steps.some(b=>b.hat),`${l.name} has a beat`);
    assert.ok(steps.slice(0,32).every(b=>!b.snare),'the two-bar intro holds the snare back');assert.ok(steps.slice(32,64).some(b=>b.snare),'and the beat is in by bar 3');
    const scaleNotes=new Set(Array.from({length:40},(_,d)=>noteOf(style,d-14)%12));
    for(const b of steps)for(const n of b.notes)if(n.part==='lead'||n.part==='bass')assert.ok(scaleNotes.has(((n.midi%12)+12)%12),`${l.name}: ${n.part} ${n.midi} in its scale`);
    assert.ok(steps.filter(b=>b.notes.some(n=>n.part==='lead')).length>=60,`${l.name} has a melody`);
    assert.equal(song.flightAt(0).part,'arp','flight brings an arpeggio');
  }
  // Different tunes: the levels' lead lines are not the same.
  const leads=LEVELS.map((l,i)=>JSON.stringify(Array.from({length:64},(_,s)=>songFor(l,i).at(s+64).notes.filter(n=>n.part==='lead').map(n=>n.midi))));
  assert.equal(new Set(leads).size,LEVELS.length);
});

// Coyote time (Geometry Dash 2.2/2.201): a cube that walks off a ledge may still jump while it has turned no more than 30
// degrees -- PHYSICS.coyoteTilt -- since leaving it; after that, or after a jump, a pad or an orb, a press in the air does nothing.
/** A cube running along a block whose top is at 60 and whose end is at x 200; stepped to the first tick in the air. */
function offTheEdge(extra=[]){
  const s=createSimulation([block(-100,0,300,60),...extra],{length:5000},{x:0,y:60,grounded:true});
  for(let i=0;i<400&&s.snapshot().grounded;i++)s.advance(1/240);
  assert.equal(s.snapshot().grounded,false,'walked off the edge');
  return s;
}
const tilt=(s)=>Math.abs(s.snapshot().angle-s.snapshot().coyote)*180/Math.PI;
test('coyote jump: just off the edge, a press still jumps',()=>{
  const s=offTheEdge();
  advance(s,6/240);
  assert.ok(tilt(s)<30,`tilted ${tilt(s).toFixed(1)} degrees`);
  const before=s.snapshot().y;
  s.jump(true);s.advance(1/240);
  assert.ok(s.snapshot().vy>500,'launched with a full jump');
  advance(s,.15);
  assert.ok(s.snapshot().y>before+40,'and rose above the ledge');
});
test('coyote jump: the window is 30 degrees of turn -- 1/15 s at the cube\'s 450 degrees a second',()=>{
  assert.equal(PHYSICS.coyoteTilt,Math.PI/6);
  let last=0;
  for(let ticks=0;ticks<30;ticks++){
    const s=offTheEdge();advance(s,ticks/240);
    const open=s.snapshot().coyote!==null;
    s.jump(true);s.advance(1/240);
    if(s.snapshot().vy>500){assert.ok(open);last=ticks;}
    else assert.equal(open,false,`no jump at ${ticks} ticks while the window was open`);
  }
  // 30 degrees at 2.5 pi rad/s is 1/15 s: 16 ticks of 240.
  assert.ok(last>=14&&last<=16,`last coyote jump after ${last} ticks`);
});
test('coyote jump: once tilted past 30 degrees, a press does nothing',()=>{
  const s=offTheEdge();advance(s,30/240);
  assert.equal(s.snapshot().coyote,null);
  s.jump(true);s.advance(1/240);
  assert.ok(s.snapshot().vy<0,'still falling');
});
test('coyote jump: only after walking off -- not after a jump, a pad or an orb, and only once',()=>{
  // After a jump the cube is in the air but has no coyote time.
  const jumped=createSimulation([],{length:5000});jumped.jump(true);jumped.advance(1/240);jumped.jump(false);
  advance(jumped,2/240);assert.equal(jumped.snapshot().coyote,null);
  jumped.jump(true);const vy=jumped.snapshot().vy;jumped.advance(1/240);assert.ok(jumped.snapshot().vy<vy,'no second jump in the air');
  // A pad launch is not walking off.
  const pad={type:'pad',sourceIndex:5,x:10,y:0,w:30,h:4,pad:'yellow'};
  const padded=createSimulation([pad],{length:5000});advance(padded,6/240);
  assert.ok(padded.snapshot().vy>0);assert.equal(padded.snapshot().coyote,null);
  // The coyote jump is used up: a second press in the air does not jump again.
  const s=offTheEdge();advance(s,4/240);s.jump(true);s.advance(1/240);s.jump(false);s.advance(1/240);
  assert.equal(s.snapshot().coyote,null);
  const rising=s.snapshot().vy;s.jump(true);s.advance(1/240);assert.ok(s.snapshot().vy<rising);
});
test('coyote time survives a practice checkpoint (fork) and only the cube has it',()=>{
  const s=offTheEdge();advance(s,3/240);
  const copy=s.fork();assert.equal(copy.snapshot().coyote,s.snapshot().coyote);
  copy.jump(true);copy.advance(1/240);assert.ok(copy.snapshot().vy>500);
  const ship=createSimulation([block(-100,0,300,60)],{length:5000},{mode:'ship',x:0,y:60,grounded:true});
  advance(ship,1);assert.equal(ship.snapshot().coyote,null);
});
