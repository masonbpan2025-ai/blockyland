import test from 'node:test';
import assert from 'node:assert/strict';
import {BLOCKS as B} from '../src/blocks.js';
import {redstoneBotFixture} from './helpers/redstoneBotFixture.js';
import {tutorialById} from '../src/redstoneTutorials.js';

async function build(id,position){const f=redstoneBotFixture(position),plan=tutorialById(id);await f.run({type:'build',position:[0,0,0],schematic:plan.schematic});f.plan=plan;f.state=name=>f.world.redstone.state(plan.controls[name]);f.activate=name=>f.run({type:'activate',position:plan.controls[name]});return f;}

test('bot builds a 15-wire transmission line, activates it and waits for the four-tick repeater',async()=>{
 const f=await build('transmission');await f.activate('input');f.ticks(3);assert.equal(f.state('output').on,false);f.ticks(2);assert.equal(f.state('output').on,true);
 assert.equal(f.world.redstone.state([1,1,0]).power,15);assert.equal(f.world.redstone.state([15,1,0]).power,1);
 await f.activate('input');f.ticks(7);assert.equal(f.state('output').on,false);assert.equal(f.events.filter(e=>e.kind==='interaction').length,2);
});

for(const id of ['nor','and'])test(`bot checks all four inputs of the ${id.toUpperCase()} tutorial circuit`,async()=>{
 const f=await build(id,id==='and'?[2.5,1,-2.5]:[-2.5,1,-2.5]);
 for(const [a,b]of [[false,false],[true,false],[true,true],[false,true],[false,false]]){
   if(f.state('a').on!==a)await f.activate('a');if(f.state('b').on!==b)await f.activate('b');f.ticks(8);
   assert.equal(!!f.state('output').on,id==='nor'?!a&&!b:a&&b,`A=${a} B=${b}`);
 }
});

test('bot tests observer pulses on both rising and falling edges, with no steady-state retrigger',async()=>{
 const f=await build('pulse');f.ticks(4);for(let edge=0;edge<2;edge++){await f.activate('input');const samples=[f.state('observer').output];for(let i=0;i<5;i++){f.ticks(1);samples.push(f.state('observer').output);}assert.ok(samples.includes(15));assert.equal(samples.at(-1),0);}f.ticks(10);assert.equal(f.state('observer').output,0);
});

test('bot starts a repeater ring and observes repeated clock edges',async()=>{
 const f=await build('clock',[-4.5,1,2.5]);f.ticks(6);await f.activate('input');let edges=0,previous=0;
 for(let i=0;i<100;i++){f.ticks(1);const current=f.state('probe').output;if(current&&!previous)edges++;previous=current;}
 assert.ok(edges>=4,`only ${edges} clock edges`);
});

test('bot stores a bit in a locked repeater, changes data and unlocks it',async()=>{
 const f=await build('memory',[-1.5,1,3.5]);await f.activate('data');f.ticks(4);assert.equal(f.state('probe').output,15);
 await f.activate('lock');f.ticks(3);await f.activate('data');f.ticks(6);assert.equal(f.state('probe').output,15);assert.equal(f.state('probe').locked,true);
 await f.activate('lock');f.ticks(5);assert.equal(f.state('probe').output,0);
});

test('bot verifies the QC/BUD tutorial using a distant source and a neighboring block update',async()=>{
 const f=await build('qc');f.ticks(4);await f.run({type:'build',position:[0,0,0],schematic:[{item:B.REDSTONE_BLOCK,offset:f.plan.controls.power}]});f.ticks(3);assert.equal(f.state('piston').extended,false);
 await f.run({type:'build',position:[0,0,0],schematic:[{item:B.STONE,offset:f.plan.controls.update}]});f.ticks(2);assert.equal(f.state('piston').extended,true);
});

test('bot changes real chest contents and the comparator detects the change through one block',async()=>{
 const f=await build('cud');f.ticks(4);assert.equal(f.state('output').on,false);
 await f.run({type:'store',item:'diamond',count:1,position:f.plan.controls.container});f.ticks(4);assert.equal(f.state('probe').output,1);assert.equal(f.state('output').on,true);
 await f.run({type:'withdraw',item:'diamond',count:1,position:f.plan.controls.container});f.ticks(6);assert.equal(f.state('output').on,false);
});

test('bot runs a sticky-piston T flip-flop from actual observer pulses',async()=>{
 const f=await build('piston');f.ticks(4);await f.activate('input');f.ticks(6);assert.equal(f.world.getVoxel(...f.plan.controls.far),B.STONE);
 await f.activate('input');f.ticks(6);assert.equal(f.world.getVoxel(...f.plan.controls.near),B.STONE);
});

test('bot builds a sequenced three-note doorbell and triggers notes once per rising edge',async()=>{
 const f=await build('music',[-3.5,1,2.5]),notes=[];const redstone=f.world.redstone,original=redstone.playNote.bind(redstone);
 redstone.playNote=s=>{notes.push({tick:redstone.tickNumber,note:s.note??0});original(s);};
 await f.activate('input');f.ticks(7);assert.equal(notes.length,3);assert.deepEqual(notes.map(n=>n.note),[12,16,20]);assert.ok(notes[0].tick<notes[1].tick&&notes[1].tick<notes[2].tick);
 f.ticks(10);assert.equal(notes.length,3);
});
