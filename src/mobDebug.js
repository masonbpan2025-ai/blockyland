import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createMobDebugSession, DEBUG_MOBS } from './mobDebugSession.js';
import { BLOCKS } from './blocks.js';
const $=id=>document.getElementById(id);
const scene=new THREE.Scene();scene.background=new THREE.Color('#233044');
const camera=new THREE.PerspectiveCamera(42,1,.05,200);camera.position.set(3,2.5,6);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
$('view').append(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,1,0);controls.enableDamping=true;
const ambient=new THREE.HemisphereLight(0xffffff,0x708099,2);scene.add(ambient);
const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(3,7,5);scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(120,120),new THREE.MeshLambertMaterial({color:0x354252}));floor.rotation.x=-Math.PI/2;floor.position.y=-.01;scene.add(floor);
scene.add(new THREE.GridHelper(100,100,0x66758b,0x435269));
const dummy=new THREE.Mesh(new THREE.BoxGeometry(.6,1.8,.6),new THREE.MeshBasicMaterial({color:0xffa451,wireframe:true}));scene.add(dummy);
const fluidMesh=new THREE.Mesh(new THREE.BoxGeometry(16,3,16),new THREE.MeshBasicMaterial({color:0x2786cb,transparent:true,opacity:.15,depthWrite:false}));fluidMesh.position.y=1.5;fluidMesh.visible=false;scene.add(fluidMesh);
const events=[];
function log(message){events.unshift(message);events.length=Math.min(30,events.length);$('events').textContent=events.join('\n');$('events').style.whiteSpace='pre-wrap';}
const session=createMobDebugSession(scene,log);
let paused=false,selected='blaze',last=performance.now(),accumulator=0,refresh=0;
for(const id of DEBUG_MOBS){const o=document.createElement('option');o.value=id;o.textContent=id.replaceAll('_',' ');$('mob').append(o);}
const requested=new URLSearchParams(location.search).get('mob');if(DEBUG_MOBS.includes(requested))selected=requested;$('mob').value=selected;
const checklists={blaze:['20 HP; a golden cubical head and 12 rods in three rotating rings.','Idle: smoke and slow descent. Flames appear during attacks, not continuously.','Combat: 3-second charge, three fireballs, then a 5-second cooldown.','Water harms it; fire and lava do not. Snowballs deal 3 damage.'],magma_cube:['Eight crust segments expand during jumps around a glowing core.','Sizes 1/2/4: health 1/4/16 and armor 3/6/12.','Hops start on the ground. Even the smallest cube deals contact damage.','Kill a large cube: 2–4 half-size children. Tiny cubes do not split or drop cream.']};
function front(){const h=session.mob?.height || session.manager.getMobDimensions(selected).height;controls.target.set(0,h*.6,0);camera.position.set(0,h*.7+1,Math.max(4,h*2.5));controls.update();}
function reset(){selected=$('mob').value;events.length=0;$('error').textContent='';session.reset(selected);$('distance').value=6;$('distance-value').textContent='6';front();log(`Spawned ${selected}`);$('wiki').href=`https://minecraft.wiki/w/${selected.split('_').map(s=>s[0].toUpperCase()+s.slice(1)).join('_')}`;$('checklist').replaceChildren();for(const text of checklists[selected] || ['Inspect every side for missing textures.','Use Combat to observe targeting, movement and attacks.','Hit tests damage feedback; Kill records drops and XP.']){const li=document.createElement('li');li.textContent=text;$('checklist').append(li);}history.replaceState(null,'',`?mob=${selected}`);updateReadout();}
function updateReadout(){const s=session.snapshot();$('badge').textContent=`${selected.replaceAll('_',' ')} · ${paused?'paused':$('mode').value} · ${s.health?.toFixed(1)} / ${s.maxHealth} HP`;$('telemetry').textContent=Object.entries(s).filter(([,v])=>v!==undefined).map(([k,v])=>`${k}: ${Array.isArray(v)?v.join(', '):v}`).join('\n');}
$('mob').onchange=reset;$('reset').onclick=reset;$('front').onclick=front;
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Play':'Pause';updateReadout();};
function tick(){session.player.gamemode=$('mode').value==='combat'?'survival':'spectator';session.tick(1/60);dummy.position.copy(session.player.position).y+=.9;dummy.visible=$('mode').value==='combat';}
$('step').onclick=()=>{paused=true;$('pause').textContent='Play';try{for(let i=0;i<6;i++)tick();updateReadout();}catch(e){fail(e);}};
$('hit').onclick=()=>{session.hit();updateReadout();};$('kill').onclick=()=>{session.hit(10000);updateReadout();};
$('distance').oninput=()=>{session.player.position.set(0,0,+$('distance').value);$('distance-value').textContent=$('distance').value;};
$('lighting').onchange=()=>{const nether=$('lighting').value==='nether';ambient.color.set(nether?0xff7133:0xffffff);ambient.groundColor.set(nether?0x371718:0x708099);sun.color.set(nether?0xff9d28:0xffffff);scene.background.set(nether?0x360f12:0x233044);};
$('fluid').onchange=()=>{session.world.fluid=({air:BLOCKS.AIR,water:BLOCKS.WATER,lava:BLOCKS.LAVA})[$('fluid').value];fluidMesh.visible=$('fluid').value!=='air';fluidMesh.material.color.set($('fluid').value==='lava'?0xff7700:0x2786cb);};
function fail(e){paused=true;$('pause').textContent='Play';$('error').textContent=e.stack || e.message;}
const resize=new ResizeObserver(()=>{const w=$('view').clientWidth,h=$('view').clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});resize.observe($('view'));
reset();
renderer.setAnimationLoop(now=>{const dt=Math.min(.1,(now-last)/1000);last=now;try{if(!paused){accumulator+=dt*+$('speed').value;while(accumulator>=1/60){tick();accumulator-=1/60;}}else accumulator=0;controls.update();renderer.render(scene,camera);refresh+=dt;if(refresh>.1){updateReadout();refresh=0;}}catch(e){fail(e);}});
