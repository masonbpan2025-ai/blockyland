// Reproducible builds using ordinary components. No scripted gate outputs or movement.
import {BLOCKS as B} from './blocks.js';
const cell=(item,x,y,z,extra={})=>({item,offset:[x,y,z],...extra});
const dust=(x,y,z)=>cell(B.REDSTONE_WIRE,x,y,z);
const source=(x,y,z)=>cell(B.LEVER,x,y,z);
const support=blocks=>{
  const cells=new Map(blocks.map(b=>[b.offset.join(','),b]));
  for(const b of blocks)if(b.item!==B.STONE&&b.offset[1]>1){const p=[b.offset[0],b.offset[1]-1,b.offset[2]];if(!cells.has(p.join(',')))cells.set(p.join(','),cell(B.STONE,...p));}
  return [...cells.values()];
};
const wiki=page=>'https://minecraft.wiki/w/'+page;
export const REDSTONE_TUTORIALS=[
 {id:'transmission',title:'Signal attenuation and repeater restoration',category:'Transmission circuit',url:wiki('Redstone_circuits/Transmission'),
  schematic:[source(0,1,0),...Array.from({length:15},(_,i)=>dust(i+1,1,0)),cell(B.REPEATER,16,1,0,{delay:4}),cell(B.REDSTONE_LAMP,17,1,0)],controls:{input:[0,1,0],output:[17,1,0]}},
 {id:'nor',title:'NOR / NOT gate',category:'Logic circuit',url:wiki('Redstone_circuits/Logic'),
  schematic:[source(-1,1,0),source(0,1,-1),cell(B.STONE,0,1,0),cell(B.REDSTONE_TORCH,0,2,0),dust(1,2,0),cell(B.REDSTONE_LAMP,2,2,0)],controls:{a:[-1,1,0],b:[0,1,-1],output:[2,2,0]}},
 {id:'and',title:'Two-inverter AND gate',category:'Advanced redstone circuits',url:wiki('Tutorial:Advanced_redstone_circuits'),
  schematic:support([source(-1,1,0),source(5,1,0),cell(B.STONE,0,1,0),cell(B.STONE,4,1,0),cell(B.REDSTONE_TORCH,0,2,0),cell(B.REDSTONE_TORCH,4,2,0),...Array.from({length:5},(_,x)=>dust(x,2,1)),cell(B.REPEATER,2,2,2,{dir:4}),cell(B.STONE,2,2,3),cell(B.REDSTONE_TORCH,2,3,3),dust(2,3,4),cell(B.REDSTONE_LAMP,2,3,5)]),controls:{a:[-1,1,0],b:[5,1,0],output:[2,3,5]}},
 {id:'pulse',title:'Observer dual-edge pulse detector',category:'Pulse circuit',url:wiki('Redstone_circuits/Pulse'),
  schematic:[source(0,1,0),cell(B.OBSERVER,1,1,0,{dir:1}),cell(B.REDSTONE_LAMP,2,1,0)],controls:{input:[0,1,0],observer:[1,1,0],output:[2,1,0]}},
 {id:'clock',title:'Four-repeater ring clock',category:'Clock circuit',url:wiki('Redstone_circuits/Clock'),
  schematic:[source(-3,1,0),cell(B.OBSERVER,-2,1,0,{dir:1}),dust(-1,1,0),cell(B.REPEATER,0,1,0,{dir:0,delay:4}),dust(1,1,0),dust(2,1,0),dust(2,1,1),cell(B.REPEATER,2,1,2,{dir:4,delay:4}),dust(2,1,3),dust(1,1,3),cell(B.REPEATER,0,1,3,{dir:1,delay:4}),dust(-1,1,3),dust(-1,1,2),cell(B.REPEATER,-1,1,1,{dir:5,delay:4})],controls:{input:[-3,1,0],probe:[0,1,0]}},
 {id:'memory',title:'Locked repeater data latch',category:'Memory circuit',url:wiki('Redstone_circuits/Memory'),
  schematic:[source(0,1,0),cell(B.REPEATER,1,1,0,{delay:2}),cell(B.REDSTONE_LAMP,2,1,0),cell(B.REPEATER,1,1,1,{dir:5}),source(1,1,2)],controls:{data:[0,1,0],lock:[1,1,2],probe:[1,1,0],output:[2,1,0]}},
 {id:'qc',title:'Latent quasi-connectivity and neighbor update',category:'Quasi-connectivity / BUD',url:wiki('Tutorial:Quasi-connectivity'),
  schematic:[cell(B.PISTON,0,1,0),cell(B.STONE,1,1,0)],controls:{piston:[0,1,0],power:[0,3,0],update:[0,1,1]}},
 {id:'cud',title:'Comparator detects a chest inventory change',category:'Comparator readout (CUD prerequisite)',url:wiki('Tutorial:Comparator_update_detector'),
  schematic:[cell(B.CHEST,0,1,0),cell(B.STONE,1,1,0),cell(B.COMPARATOR,2,1,0),cell(B.REPEATER,3,1,0),cell(B.REDSTONE_LAMP,4,1,0)],controls:{container:[0,1,0],probe:[2,1,0],output:[4,1,0]}},
 {id:'piston',title:'Sticky-piston short-pulse T flip-flop',category:'Piston circuits',url:wiki('Tutorial:Piston_circuits'),
  schematic:[source(0,1,0),cell(B.OBSERVER,1,1,0,{dir:1}),cell(B.STICKY_PISTON,2,1,0),cell(B.STONE,3,1,0)],controls:{input:[0,1,0],piston:[2,1,0],near:[3,1,0],far:[4,1,0]}},
 {id:'music',title:'Delayed three-note doorbell',category:'Redstone music / mechanisms',url:wiki('Tutorial:Redstone_music'),
  schematic:[source(-2,1,0),...Array.from({length:7},(_,z)=>dust(-1,1,z)),...Array.from({length:3},(_,i)=>cell(B.REPEATER,0,1,i*3,{delay:i+1})),...Array.from({length:3},(_,i)=>cell(B.NOTE_BLOCK,1,1,i*3,{note:12+i*4}))],controls:{input:[-2,1,0],notes:[[1,1,0],[1,1,3],[1,1,6]]}},
];

export function tutorialById(id){const result=REDSTONE_TUTORIALS.find(t=>t.id===id);if(!result)throw new Error('Unknown redstone tutorial: '+id);return result;}
