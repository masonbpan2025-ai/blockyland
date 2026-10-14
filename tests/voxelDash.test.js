import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/mods/voxel-dash/server/game.js';
import {createSimulation,PHYSICS} from '../src/mods/voxel-dash/server/simulation.js';
import {LEVELS,COURSES,COURSE_META,ORIGINAL_LEVELS,GAMEPLAY_IDS} from '../src/mods/voxel-dash/levels.js';
import {ModSession} from '../src/engine/modSession.js';
const button=(g,id)=>g.input(0,{type:'button',id});
const advance=(s,seconds)=>{for(let i=0;i<Math.round(seconds*240);i++)s.advance(1/240);};
const block=(x,y,w,h,sourceIndex=0)=>({type:'block',x,y,w,h,sourceIndex});
test('all five courses preserve every original gameplay object center, ID and transformation',()=>{
  assert.deepEqual(LEVELS.map(l=>l.stars),[2,3,4,5,6]);assert.equal(new Set(LEVELS.map(l=>l.biome)).size,5);
  assert.deepEqual(ORIGINAL_LEVELS.map(l=>l.objects.length),[1545,1531,1444,2146,1704]);
  for(let i=0;i<5;i++){
    const original=ORIGINAL_LEVELS[i].objects,course=COURSES[i];
    assert.equal(course.length,original.filter(o=>GAMEPLAY_IDS.includes(o[0])).length);
    assert.equal(course.filter(o=>o.type==='coin').length,3);
    for(const o of course){const raw=original[o.sourceIndex];assert.deepEqual([o.id,o.cx,o.cy,Number(o.flipX),Number(o.flipY),o.rotation,o.scale],raw.slice(0,7));}
    assert.equal(COURSE_META[i].speed,311.58);
  }
});
test('original portal coordinates replace the uniform generated ship and gravity sections',()=>{
  assert.deepEqual(COURSE_META.map(l=>[l.shipStart,l.shipEnd]),[[12645,16785],[9645,13305],[16991,21225],[13793,17985],[14409,17721]]);
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
