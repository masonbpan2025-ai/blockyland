import { installWitherSkeletonInspector } from './witherSkeletonInspector.js';
import { installSquidInspector } from './squidInspector.js';
import { installZombifiedInspector } from './zombifiedPiglinInspector.js';
import { installStriderInspector } from './striderInspector.js';
import { installHorseInspector } from './horseInspector.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createMobDebugSession, DEBUG_MOBS } from './mobDebugSession.js';
import { BLOCKS } from './blocks.js';
import { MobShowcase, mobScenarios } from './mobShowcase.js';
import { flushPendingSkinBindings } from './mobVisuals/modelBuilder.js';
import { ModLoader } from './mods/loader.js';
import { inspectorContent, fillInspectorSource } from './mods/inspectorSelector.js';
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
const modLoader = new ModLoader();
const inspectorGame = { ...session.manager.game, mobs: session.manager, scene, isInspector: true };
session.manager.game = inspectorGame;
let selectedMod = fillInspectorSource($('content-source'), new URLSearchParams(location.search).get('mod'));
window.__debugSession = session;
window.__mobInspectDump = () => {
  const mob = session.mob;
  if (!mob?.mesh) return { error: 'no mob mesh' };
  function dump(obj) {
    return {
      name: obj.name,
      type: obj.type,
      visible: obj.visible,
      pos: [obj.position.x, obj.position.y, obj.position.z],
      mat: obj.material ? {
        color: obj.material.color?.getHexString(),
        map: !!obj.material.map,
        imageWidth: obj.material.map?.image?.width,
        transparent: obj.material.transparent,
        opacity: obj.material.opacity,
        alphaTest: obj.material.alphaTest
      } : null,
      children: (obj.children || []).map(dump)
    };
  }
  return dump(mob.mesh);
};

// --- Showcase: run every behavioural scenario built for the selected mob -------------
let showcase=null;
function showReadout(){
  const box=$('showcase-status'), list=$('showcase-results');
  const results=showcase?.results || [];
  if(!results.length && !showcase?.running){box.className='';box.textContent='Idle - press Run showcase to exercise this mob behaviours.';list.textContent='';return;}
  // Scenarios the game cannot exercise yet are reported but not scored: a missing feature
  // is not the mob failing its own test.
  const scored=results.filter(r=>r.status!=='unsupported');
  const passed=scored.filter(r=>r.status==='observed').length;
  const unsupported=results.length-scored.length;
  const running=showcase?.running;
  box.className=running?'running':(passed!==scored.length?'partial':(unsupported?'skipped':'pass'));
  box.textContent=running
    ? `${showcase.cases[showcase.index]?.label} (${results.length}/${showcase.cases.length})`
    : `${passed}/${scored.length} scenarios passed`
      + (unsupported?` - ${unsupported} not implemented yet`:'')
      + ` - ${selected.replaceAll('_',' ')}`;
  list.textContent=results.map(r=>{
    const icon=r.status==='observed'?'[ok] ':r.status==='unsupported'?'[--] ':r.status==='error'?'[!!] ':'[ x] ';
    const note=r.status==='unsupported'?' - not implemented yet':(r.detail?' - '+r.detail:'');
    return icon+r.label+note;
  }).join('\n');
}
function stopShowcase(cancelled=true){if(showcase?.running)showcase.stop(cancelled);showcase=null;$('showcase-stop').disabled=true;$('showcase').disabled=false;showReadout();updateReadout();}
function runShowcase(){
  // Start from a clean mob so the first scenario is unaffected by whatever the controls
  // had been doing.
  const chosen=$('test-case').value;reset();$('test-case').value=chosen;
  paused=false;$('pause').textContent='Pause';
  showcase=new MobShowcase(session,onShowcaseReport);
  showcase.start(selected,$('test-case').value || null);
  $('showcase-stop').disabled=false;$('showcase').disabled=true;
  showReadout();updateReadout();
}
function onShowcaseReport(report){
  if(report.cancelled){showcase=null;$('showcase-stop').disabled=true;$('showcase').disabled=false;}
  else if(report.done){
    paused=true;$('pause').textContent='Play';
    $('showcase-stop').disabled=true;$('showcase').disabled=false;
    const scored=(report.results||[]).filter(r=>r.status!=='unsupported');
    const passed=scored.filter(r=>r.status==='observed').length;
    log(`Showcase finished: ${passed}/${scored.length} scenarios passed`);
  }
  showReadout();
}

let paused=true,selected='blaze',last=performance.now(),accumulator=0,refresh=0;
function fillMobs(requested = null) {
  const view = inspectorContent('mob', DEBUG_MOBS.map(id => ({name:id, data:{name:id.replaceAll('_',' ')}})), selectedMod);
  $('mob').replaceChildren(...view.content.map(entry => new Option(entry.data.name, entry.name)));
  const ids = view.content.map(entry => entry.name);
  selected = ids.includes(requested) ? requested : ids[0];
  $('mob').value = selected ?? '';
}
fillMobs(new URLSearchParams(location.search).get('mob'));
const checklists={
  donkey:['Gray coat, long ears, flat mane, pale muzzle and tufted tail.','Taming, saddles, charged jumping and permanent 15-slot chest storage.','Golden foods breed donkeys; horse + donkey produces a sterile mule.','Foals grow in 20 minutes; food speeds growth, golden dandelions pause it.','Ridden animals float; submerged mounts dismount the rider.'],mule:['Brown coat, long ears, visible eyes and paired chests.','Tame adults to equip a saddle and a permanent 15-slot chest.','Sterile: golden foods heal but never enable breeding.','Created by horse + donkey; offspring inherit health, speed and jumping.','Shears remove saddles; death returns equipment and every stored stack.'],
  wither_skeleton:['20 HP; 2.4 blocks tall, skull face, ribs, thin limbs and stone sword.','Java melee: 5/8/12 damage; Wither I for 10 seconds.','Fire and Wither immunity; sinks without drowning.','Hunts players, golems and piglins; flees wolves; ignores villagers.','Rare skull drops, equipment pickup and command-equipped flaming bow.'],squid:['10 HP; eight pulsing tentacles, side eyes and an underside mouth.','Swims freely in 3D; passive and cannot breed, ride or be bucketed.','Ink and escape when hurt; stationary on land and suffocates after 15 seconds.','Babies grow in 20 minutes; golden dandelions lock growth.','Leads and naming work; guardians and axolotls hunt it.'],glow_squid:['10 HP; eight pulsing tentacles, side eyes and an underside mouth.','Swims freely in 3D; passive and cannot breed, ride or be bucketed.','Ink and escape when hurt; stationary on land and suffocates after 15 seconds.','Babies grow in 20 minutes; golden dandelions lock growth.','Leads and naming work; guardians and axolotls hunt it.'].concat(['Emissive aqua pixels and crystalline particles; emits no block light.','Hurt glow squid darkens for five seconds, then recovers.']),zombified_piglin:['Asymmetric exposed skull and ribs, torn ear, one tusk and jointed limbs.','Neutral undead: gold, villagers and ordinary piglins do not provoke it.','Retaliates against its attacker and recruits nearby zombified piglins.','Visible targets freeze anger; lost targets are forgiven after 20–55 seconds.','Babies stay small; retained crossbows are used only in melee.','Equipment upgrades, player-credit loot and save/load use the gameplay code.'],strider:['20 HP; a red cube with pale side bristles and two hip-pivot legs.','Lava warms and floats it; dry ground turns it purple and slows its gait.','Saddle adults; hold fungus stick to steer automatically and boost.','Warped fungus breeds and accelerates 20-minute baby growth.','Shears remove saddles; golden dandelions pause baby growth.'],horse:['Seven coats × five markings; articulated head, mane, tail and hooves.','Temper 0–100; adults must be tamed before equipment or breeding.','Golden foods breed; ordinary foods heal and accelerate 20-minute foal growth.','Saddle required for WASD steering and charged jumping; Shift dismounts.','Horse + donkey produces a sterile mule; offspring inherit stats.'],blaze:['20 HP; a golden cubical head and 12 rods in three rotating rings.','Idle: smoke and slow descent. Flames appear during attacks, not continuously.','Combat: 3-second charge, three fireballs, then a 5-second cooldown.','Water harms it; fire and lava do not. Snowballs deal 3 damage.'],magma_cube:['Eight crust segments expand during jumps around a glowing core.','Sizes 1/2/4: health 1/4/16 and armor 3/6/12.','Hops start on the ground. Even the smallest cube deals contact damage.','Kill a large cube: 2–4 half-size children. Tiny cubes do not split or drop cream.']};
/**
 * Frame whatever the mob's ACTUAL render bounds are.
 *
 * The old code framed off the collision height, which is a gameplay number and not a drawing one. It put the
 * camera at `h*2.5` distance, which is far too close for a wide animal: a panda's head filled the viewport and its
 * body ran off the bottom, so a correct model still looked wrong. Measuring the mesh instead means every mob,
 * large or small, is framed to fit with a margin.
 */
function fitCamera(direction){
  const mob=session.mob;
  if(!mob?.mesh){front();return;}
  mob.mesh.updateWorldMatrix(true,true);
  // Measure only the SOLID geometry. Sprites are effects -- a blaze's ten smoke puffs reach twice as high as its whole
  // body -- and including them framed the mob with most of the viewport empty, which then read as the model being
  // misplaced. The head and rods are correct; the smoke was inflating the box.
  const box=new THREE.Box3();
  mob.mesh.traverse(o=>{
    if(!o.isMesh)return;                       // skips Sprite, which has no geometry to measure
    box.expandByObject(o);
  });
  if(box.isEmpty())box.setFromObject(mob.mesh); // a mob made only of sprites still frames
  const size=box.getSize(new THREE.Vector3());
  const centre=box.getCenter(new THREE.Vector3());
  const radius=Math.max(size.x,size.y,size.z)*0.5;
  // Fit the largest dimension, plus a margin, against the narrower of the two field-of-view axes.
  const vFov=camera.fov*Math.PI/180;
  const hFov=2*Math.atan(Math.tan(vFov/2)*camera.aspect);
  const distance=(radius*1.6)/Math.tan(Math.min(vFov,hFov)/2);
  controls.target.copy(centre);
  const dir=direction.clone().normalize();
  camera.position.copy(centre).addScaledVector(dir,Math.max(distance,1.2));
  camera.updateProjectionMatrix();
  controls.update();
}
/** The default view: straight on, from the front and slightly above. */
function front(){
  const h=session.mob?.height||session.manager.getMobDimensions(selected).height;
  fitCamera(new THREE.Vector3(0,Math.min(0.35,h*0.18),1));
}
const angleView=document.createElement('button');angleView.textContent='3/4 view';$('front').after(angleView);
angleView.onclick=()=>{const h=session.mob?.height||session.manager.getMobDimensions(selected).height;fitCamera(new THREE.Vector3(1,Math.min(0.5,h*0.22),1.25));};
const topView=document.createElement('button');topView.textContent='Top view';angleView.after(topView);
topView.onclick=()=>{fitCamera(new THREE.Vector3(0.01,2.5,0.4));};
function reset(){if (!$('mob').value) { paused=true;session.manager.clearMobs();return; }paused=true;$('pause').textContent='Play';selected=$('mob').value;events.length=0;$('error').textContent='';const coatParam=new URLSearchParams(location.search).get('coat');session.reset(coatParam?{type:selected,coat:coatParam}:selected);$('test-case').replaceChildren(new Option('All cases',''),...mobScenarios(selected).map(c=>new Option(c.label,c.id)));$('distance').value=6;$('distance-value').textContent='6';front();log(`Spawned ${selected}`);$('wiki').href=`https://minecraft.wiki/w/${selected.split('_').map(s=>s[0].toUpperCase()+s.slice(1)).join('_')}`;$('checklist').replaceChildren();for(const text of checklists[selected] || ['Inspect every side for missing textures.','Use Combat to observe targeting, movement and attacks.','Hit tests damage feedback; Kill records drops and XP.']){const li=document.createElement('li');li.textContent=text;$('checklist').append(li);}history.replaceState(null,'',(selectedMod ? `?mod=${encodeURIComponent(selectedMod)}&` : '?') + (coatParam?`mob=${encodeURIComponent(selected)}&coat=${coatParam}`:`mob=${encodeURIComponent(selected)}`));updateReadout();}
function updateReadout(){const s=session.snapshot();$('badge').textContent=`${selected.replaceAll('_',' ')} · ${paused?'paused':$('mode').value} · ${s.health?.toFixed(1)} / ${s.maxHealth} HP`;$('telemetry').textContent=Object.entries(s).filter(([,v])=>v!==undefined).map(([k,v])=>`${k}: ${Array.isArray(v)?v.join(', '):v}`).join('\n');}
$('mob').onchange=()=>{stopShowcase();reset();};$('reset').onclick=()=>{stopShowcase();reset();};$('front').onclick=front;
$('showcase').onclick=runShowcase;$('showcase-stop').onclick=()=>stopShowcase(true);
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Play':'Pause';updateReadout();};
function tickShowcase(){if(showcase?.running)showcase.tick(1/60);}
function tick(){if(selected==='zombified_piglin')session.mob.frozen=$('mode').value==='inspect';session.player.gamemode=$('mode').value==='combat'?'survival':'spectator';session.tick(1/60);dummy.position.copy(session.player.position).y+=.9;dummy.visible=$('mode').value==='combat';}
$('step').onclick=()=>{paused=true;$('pause').textContent='Play';try{for(let i=0;i<6;i++)tick();updateReadout();}catch(e){fail(e);}};
$('hit').onclick=()=>{session.hit();updateReadout();};$('kill').onclick=()=>{session.hit(10000);updateReadout();};
$('distance').oninput=()=>{session.player.position.set(0,0,+$('distance').value);$('distance-value').textContent=$('distance').value;};
$('lighting').onchange=()=>{const nether=$('lighting').value==='nether';ambient.color.set(nether?0xff7133:0xffffff);ambient.groundColor.set(nether?0x371718:0x708099);sun.color.set(nether?0xff9d28:0xffffff);scene.background.set(nether?0x360f12:0x233044);};
$('fluid').onchange=()=>{session.world.fluid=({air:BLOCKS.AIR,water:BLOCKS.WATER,lava:BLOCKS.LAVA})[$('fluid').value];fluidMesh.visible=$('fluid').value!=='air';fluidMesh.material.color.set($('fluid').value==='lava'?0xff7700:0x2786cb);};
function fail(e){paused=true;$('pause').textContent='Play';$('error').textContent=e.stack || e.message;}
const resize=new ResizeObserver(()=>{const w=$('view').clientWidth,h=$('view').clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});resize.observe($('view'));
if (selectedMod) {
  const result = await modLoader.load(selectedMod, {game: inspectorGame});
  if (!result.ok) { selectedMod = null; $('content-source').value = ''; fillMobs(); log(result.reason); }
}
reset();
$('content-source').onchange = async () => {
  stopShowcase(); paused = true;
  $('content-source').disabled = true;
  try {
    if (selectedMod) modLoader.unload(selectedMod);
    selectedMod = $('content-source').value || null;
    if (selectedMod) {
      const result = await modLoader.load(selectedMod, {game: inspectorGame});
      if (!result.ok) throw new Error(result.reason);
    }
    fillMobs(); reset();
  } catch (error) {
    selectedMod = null; $('content-source').value = ''; fillMobs(); reset(); fail(error);
  } finally { $('content-source').disabled = false; }
};
installHorseInspector(session,log);
installSquidInspector(session,log);
installWitherSkeletonInspector(session,log);
installZombifiedInspector(session,log);
installStriderInspector(session,log);
renderer.setAnimationLoop(now=>{flushPendingSkinBindings();const dt=Math.min(.1,(now-last)/1000);last=now;try{if(!paused){accumulator+=dt*+$('speed').value;while(accumulator>=1/60){if(showcase?.running)tickShowcase();else if(!paused)tick();accumulator-=1/60;}}else accumulator=0;dummy.position.copy(session.player.position).y+=.9;dummy.visible=session.player.gamemode==='survival';fluidMesh.visible=session.world.fluid!==BLOCKS.AIR;fluidMesh.material.color.set(session.world.fluid===BLOCKS.LAVA?0xff7700:session.world.fluid===BLOCKS.POWDER_SNOW?0xe9efff:0x2786cb);syncArena();if(['strider','squid','glow_squid'].includes(selected)&&session.mob?.mesh){const target=session.mob.mesh.position.clone();target.y+=(session.mob.isBaby?.5:1);const delta=target.clone().sub(controls.target);camera.position.add(delta);controls.target.copy(target);}controls.update();renderer.render(scene,camera);refresh+=dt;if(refresh>.1){updateReadout();refresh=0;}}catch(e){fail(e);}});

const arenaBlocks=new THREE.Group();scene.add(arenaBlocks);
const arenaGeometry=new THREE.BoxGeometry(1,1,1),arenaMaterial=new THREE.MeshLambertMaterial({color:0x65738a});let arenaSignature='';
function syncArena(){const entries=[...session.world.edits].filter(([,id])=>id!==BLOCKS.AIR);const signature=JSON.stringify(entries);if(signature===arenaSignature)return;arenaSignature=signature;arenaBlocks.clear();for(const [key] of entries.slice(0,256)){const block=new THREE.Mesh(arenaGeometry,arenaMaterial);block.position.fromArray(key.split(',').map(n=>+n+.5));arenaBlocks.add(block);}}
