import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BLOCKS as B } from './blocks.js';
import { FishingController, FISHING_STATE as S } from './fishingRod.js';
import { RailSystem } from './rails.js';
import { EntityManager } from './entities.js';

const viewport = document.querySelector('#viewport');
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xadd6ed);
const renderer = new THREE.WebGLRenderer({ antialias:true }); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; viewport.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(48,1,0.1,70); camera.position.set(9,10,11);
const controls = new OrbitControls(camera,renderer.domElement);controls.target.set(0,3.6,-3); controls.update();
scene.add(new THREE.HemisphereLight(0xe4f4ff,0x756d58,2));
const sun=new THREE.DirectionalLight(0xffeac9,2.5);sun.position.set(7,15,4);sun.castShadow=true;sun.shadow.camera.left=-12;sun.shadow.camera.right=12;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-12;scene.add(sun);
const roof=document.querySelector('#roof'),rain=document.querySelector('#rain');
const world={ getVoxel(x,y,z) {
  if(y<0)return B.SAND;
  if(roof.checked && y===6 && z<=-1 && z>=-12 && Math.abs(x)<6)return B.OAK_PLANKS;
  if(z>=0 && y<=3)return B.OAK_PLANKS;
  return y<=3?B.WATER:B.AIR;
},getWaterLevel:()=>0,getBiome:()=> 'plains' };
const waterY=3+8/9;
const water=new THREE.Mesh(new THREE.PlaneGeometry(28,24),new THREE.MeshPhongMaterial({color:0x298faf,transparent:true,opacity:0.5,shininess:80,side:THREE.DoubleSide,depthWrite:false}));water.rotation.x=-Math.PI/2;water.position.set(0,waterY,-12);scene.add(water);
const sand=new THREE.Mesh(new THREE.BoxGeometry(28,0.3,24),new THREE.MeshLambertMaterial({color:0xe0d1a8}));sand.position.set(0,-0.15,-12);sand.receiveShadow=true;scene.add(sand);
const plankCanvas=document.createElement('canvas');plankCanvas.width=plankCanvas.height=16;
const ctx=plankCanvas.getContext('2d');ctx.fillStyle='#bb945a';ctx.fillRect(0,0,16,16);
for(let y=0;y<16;y++){ctx.fillStyle=y%4===0?'#806337':y%4===1?'#d1af76':'#b28c50';ctx.fillRect(0,y,16,1);ctx.fillStyle='#a27b42';ctx.fillRect((y*7)%13,y,3,1);}
const texture=new THREE.CanvasTexture(plankCanvas);texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.colorSpace=THREE.SRGBColorSpace;
const textures={atlasTexture:texture,getFaceUVs:()=>({u0:0,v0:0,u1:1,v1:1})};
const dock=new THREE.Mesh(new THREE.BoxGeometry(5,0.35,3),new THREE.MeshLambertMaterial({map:texture}));dock.position.set(0,3.825,1.5);dock.receiveShadow=true;scene.add(dock);
const cover=new THREE.Mesh(new THREE.BoxGeometry(12,0.2,12),new THREE.MeshLambertMaterial({map:texture}));cover.position.set(0,6.1,-6);cover.visible=false;scene.add(cover);
const rod={id:'fishing_rod',isBlock:false,count:1,durability:64};
const player={position:new THREE.Vector3(0,4,0.3),eyeHeight:1.62,keys:{},statusEffects:new Map(),gamemode:'survival'};
const game={scene,world,player,textures,camera:{getWorldDirection:v=>v.set(0,-0.25,-1).normalize()},
  inventory:{getActiveItem:()=>rod,addItem(stack){game.catch=stack;game.catches++;return true;}},
  sounds:{playSplash(){game.splashes++;},playClick(){}},ui:{addChatMessage(message){game.message=message;}},
  weather:{isRaining:()=>rain.checked},mobs:{mobs:[]},catches:0,splashes:0};
game.entities=new EntityManager(scene,world,game.sounds);
const fishing=new FishingController(game),rails=new RailSystem(world,game);
let boat=rails.spawnBoat([3,3,-3]);
let showcase=false,shortened=false,rowing=0;
const status=document.querySelector('#status');
function reset(){fishing.cancel();for(const drop of game.entities.droppedItems)game.entities.itemVisuals.release(drop.group);game.entities.droppedItems=[];for(const orb of game.entities.xpOrbs){orb.mesh.removeFromParent();orb.mesh.geometry.dispose();orb.mesh.material.dispose();}game.entities.xpOrbs=[];showcase=false;shortened=false;game.message='';game.catches=0;game.splashes=0;rod.durability=64;player.position.set(0,4,0.3);player.keys={};boat.rider=null;rowing=0;updateStatus();}
document.querySelector('#cast').onclick=()=>{showcase=false;fishing.cast();};
document.querySelector('#showcase').onclick=()=>{reset();showcase=true;fishing.cast();};
document.querySelector('#reset').onclick=reset;
document.querySelector('#wood').onchange=e=>{rails.remove(boat);boat=rails.spawnBoat([3,3,-3],{subType:e.target.value});};
document.querySelector('#row').onclick=()=>{reset();boat.position.set(3,waterY-0.13,-3);boat.velocity.set(0,0,0);boat.yaw=0;boat.rider=player;player.keys={KeyW:true};rowing=4;};
roof.onchange=()=>{cover.visible=roof.checked;};
window.addEventListener('keydown',e=>{player.keys[e.code]=true;});window.addEventListener('keyup',e=>{player.keys[e.code]=false;});
window.addEventListener('blur',()=>{player.keys={};});
function advance(dt){
  if(showcase && fishing.state===S.WAITING && !shortened){fishing.waitTicks=40;shortened=true;}
  fishing.update(dt);
  if(showcase && fishing.state===S.BITING && fishing.biteLeft<0.9){fishing.reel();showcase=false;}
  rails.updateBoats(dt);game.entities.update(dt,player,game.inventory);
  if(rowing>0){rowing-=dt;if(rowing<=0){player.keys={};boat.rider=null;player.position.set(0,4,0.3);}}
  updateStatus();
}
function updateStatus(){status.textContent=`Fishing: ${fishing.state}\nWait: ${Math.max(0,fishing.waitTicks/20).toFixed(1)} s\nOpen water: ${fishing.openWater()}\nRod: ${rod.durability}/64\nCatches: ${game.catches} · Splashes: ${game.splashes}\nBoat: ${boat.surface ?? 'water'}\n${game.message ?? ''}`;}
let lastFrame=performance.now();
function frame(now=performance.now()){requestAnimationFrame(frame);const dt=Math.min((now-lastFrame)/1000,0.1);lastFrame=now;if(!window.fishingDebug.paused)advance(dt);controls.update();renderer.render(scene,camera);}
window.fishingDebug={game,fishing,rails,get boat(){return boat;},camera,paused:false,advance,reset,
  setView(position,target){camera.position.set(...position);controls.target.set(...target);controls.update();},
  render:()=>renderer.render(scene,camera)};
new ResizeObserver(()=>{const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}).observe(viewport);
frame();
