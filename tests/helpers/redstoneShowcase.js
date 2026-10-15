import * as THREE from 'three';
import {redstoneBotFixture} from './redstoneBotFixture.js';
import {REDSTONE_TUTORIALS,tutorialById} from '../../src/redstoneTutorials.js';
import {BLOCKS as B} from '../../src/blocks.js';
import {TextureManager} from '../../src/textures.js';
import {ChunkMesher} from '../../src/mesher.js';
import {buildRedstoneDemo} from '../../src/redstoneDemos.js';

const positions={and:[2.5,1,-2.5],nor:[-2.5,1,-2.5],clock:[-4.5,1,2.5],memory:[-1.5,1,3.5],music:[-3.5,1,2.5]};
export const SHOWCASES=[...REDSTONE_TUTORIALS,{id:'elevator',title:'Slime piston platform and rider'},{id:'flyer',title:'Six-block observer flying engine'}];
let textures,renderer,mesher,current,scene,camera;
const checks=[];
function check(condition,message){if(!condition)throw new Error(message);checks.push(message);}

export async function runShowcase(id){
 checks.length=0;const f=redstoneBotFixture(positions[id]);current=f;
 if(id==='elevator'||id==='flyer'){
   const actors=f.actors;const anchor=[3,2,2],result=buildRedstoneDemo(f.world,id,anchor);f.result=result;
   if(id==='elevator'){
     const rider={position:new THREE.Vector3(4.5,4,2.5),width:.6,height:1.8};actors.push(rider);
     // Use the demo's actual control via PlayerBot's raycast interaction.
     f.player.position.set(1.5,2,4.5);await f.run({type:'activate',position:[2,2,2]});
     for(let i=0;i<4;i++)f.world.redstone.tick(actors);
     check(rider.position.y===5,'rider carried one block up');
     await f.run({type:'activate',position:[2,2,2]});for(let i=0;i<4;i++)f.world.redstone.tick(actors);
     check(rider.position.y===4,'rider carried back down');
   }else{
     const initial=[...f.world.redstone.states.values()].filter(s=>s.id===B.PISTON||s.id===B.STICKY_PISTON).map(s=>s.p[0]);
     f.ticks(24);const moved=[...f.world.redstone.states.values()].filter(s=>s.id===B.PISTON||s.id===B.STICKY_PISTON).map(s=>s.p[0]);
     check(Math.min(...moved)>Math.min(...initial)+2,'ordinary components propelled the flying engine');
   }
 }else{
   const plan=tutorialById(id);f.plan=plan;await f.run({type:'build',position:[0,0,0],schematic:plan.schematic});
   const state=name=>f.world.redstone.state(plan.controls[name]);const activate=name=>f.run({type:'activate',position:plan.controls[name]});
   if(id==='transmission'){await activate('input');f.ticks(5);check(state('output').on,'repeater restored long line');check(f.world.redstone.state([15,1,0]).power===1,'wire attenuation 15 to 1');await activate('input');f.ticks(7);check(!state('output').on,'line discharged');await activate('input');f.ticks(6);}
   if(id==='nor'||id==='and'){for(const [a,b]of [[false,false],[true,false],[true,true],[false,true]]){if(state('a').on!==a)await activate('a');if(state('b').on!==b)await activate('b');f.ticks(8);check(!!state('output').on===(id==='nor'?!a&&!b:a&&b),`${id} A=${a} B=${b}`);}}
   if(id==='pulse'){f.ticks(4);for(let n=0;n<2;n++){await activate('input');const values=[state('observer').output];for(let i=0;i<5;i++){f.ticks(1);values.push(state('observer').output);}check(values.includes(15)&&values.at(-1)===0,'observer emitted one finite edge pulse');}}
   if(id==='clock'){f.ticks(6);await activate('input');let edges=0,last=0;for(let i=0;i<100;i++){f.ticks(1);const now=state('probe').output;if(now&&!last)edges++;last=now;}check(edges>=4,`clock produced ${edges} rising edges`);}
   if(id==='memory'){await activate('data');f.ticks(4);await activate('lock');f.ticks(3);await activate('data');f.ticks(6);check(state('probe').locked&&state('probe').output===15,'latch retained bit while data changed');await activate('lock');f.ticks(5);check(state('probe').output===0,'unlock accepted new data');}
   if(id==='qc'){f.ticks(4);await f.run({type:'build',position:[0,0,0],schematic:[{item:B.REDSTONE_BLOCK,offset:plan.controls.power}]});f.ticks(3);check(!state('piston').extended,'QC power remained latent');await f.run({type:'build',position:[0,0,0],schematic:[{item:B.STONE,offset:plan.controls.update}]});f.ticks(2);check(state('piston').extended,'neighbor update triggered QC');}
   if(id==='cud'){f.ticks(4);await f.run({type:'store',item:'diamond',count:1,position:plan.controls.container});f.ticks(4);check(state('probe').output===1&&state('output').on,'inventory read through solid block');await f.run({type:'withdraw',item:'diamond',count:1,position:plan.controls.container});f.ticks(6);check(!state('output').on,'comparator tracked emptied chest');}
   if(id==='piston'){f.ticks(4);await activate('input');f.ticks(6);check(f.world.getVoxel(...plan.controls.far)===B.STONE,'short pulse spat block');await activate('input');f.ticks(6);check(f.world.getVoxel(...plan.controls.near)===B.STONE,'second pulse retrieved block');}
   if(id==='music'){
     const context=new OfflineAudioContext(1,48000,48000);f.game.sounds.ctx=context;f.game.sounds.soundEnabled=true;
     await activate('input');f.ticks(8);const buffer=await context.startRendering();check(buffer.getChannelData(0).some(v=>Math.abs(v)>.001),'real Web Audio generated non-silent note output');
   }
 }
 await draw();return{id,checks:[...checks],commands:f.commands,interactions:f.events};
}

export async function draw(){
 if(!textures){textures=new TextureManager();await textures.init();mesher=new ChunkMesher(textures);renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,680);document.querySelector('#view').append(renderer.domElement);camera=new THREE.PerspectiveCamera(55,1200/680,.1,180);}
 if(scene)scene.traverse(o=>{if(o.isMesh)o.geometry.dispose();});scene=new THREE.Scene();scene.background=new THREE.Color(0x23344b);scene.add(new THREE.HemisphereLight(0xd8eaff,0x879681,2));
 const sun=new THREE.DirectionalLight(0xffe2b0,2.5);sun.position.set(8,24,12);scene.add(sun);
 const positions=[...current.world.redstone.states.values()].map(s=>s.p);const minX=Math.min(...positions.map(p=>p[0])),maxX=Math.max(...positions.map(p=>p[0])),minZ=Math.min(...positions.map(p=>p[2])),maxZ=Math.max(...positions.map(p=>p[2]));
 for(const chunk of current.world.chunks.values())if(chunk.cx>=Math.floor((minX-2)/16)&&chunk.cx<=Math.floor((maxX+2)/16)&&chunk.cz>=Math.floor((minZ-2)/16)&&chunk.cz<=Math.floor((maxZ+2)/16)){
   const g=mesher.meshChunk(chunk,current.world);for(const [key,mat]of [['opaqueGeo',textures.opaqueMaterial],['transparentGeo',textures.transparentMaterial],['lightGeo',textures.lightMaterial]])if(g[key])scene.add(new THREE.Mesh(g[key],mat));
 }
 const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,extent=Math.max(maxX-minX,maxZ-minZ,6);camera.position.set(cx+extent*.5,extent*.65+4,cz+extent*.75+7);camera.lookAt(cx,1.4,cz);textures.update(0);renderer.render(scene,camera);
}

export function fixture(){return current;}
