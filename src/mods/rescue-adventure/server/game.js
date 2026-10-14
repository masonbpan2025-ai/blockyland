// Migrated from the user-supplied Shattered Realms source. Gameplay remains mod-owned.
// Presentation constructors below produce engine scene definitions, not Three.js meshes.
import { createPresentationGraph, createUiState } from '../../../engine/presentationGraph.js';
import { gridPassable, moveController } from '../../../engine/gridCollision.js';
export function createRescueGame(options={}) {
const graph=createPresentationGraph(), THREE=graph.api, ui=createUiState(), events=[];
const scene=new THREE.Scene();
const follow=new THREE.Vector3();
const NX=128,NZ=96,S=2;
let seed=1,rngState=1,map=[],points=[],treasures=[];
function random(){rngState^=rngState<<13;rngState^=rngState>>>17;rngState^=rngState<<5;return(rngState>>>0)/4294967296}
function rr(a,b){return a+random()*(b-a)}
function cell(x,z){return x<0||z<0||x>=NX||z>=NZ?null:map[z*NX+x]}
function terrain(wx,wz){return cell(Math.floor(wx/S),Math.floor(wz/S))}
// Each biome is isolated by a continuous channel with exactly one gated bridge.
const difficulties={
 easy:{name:'Easy',xpCost:1,armorWear:1,resistance:.25,attack:1.5,summonEvery:18,summonCount:6,minionCap:18,foodChance:.3,bossFoodChance:.7,placedFood:6,chestFood:2,gemChance:.9,ammoChance:1},
 normal:{name:'Normal',xpCost:1.5,armorWear:1.5,resistance:.45,attack:1.9,summonEvery:12,summonCount:12,minionCap:36,foodChance:.16,bossFoodChance:.5,placedFood:4,chestFood:1,gemChance:.65,ammoChance:.8},
 hard:{name:'Hard',xpCost:2.2,armorWear:2.2,resistance:.65,attack:2.4,summonEvery:7,summonCount:30,minionCap:90,foodChance:.06,bossFoodChance:.3,placedFood:2,chestFood:1,gemChance:.35,ammoChance:.55}
};
const eliteMobs={
 vindicator:{name:'Vindicator',hp:110,damage:24,speed:3.8,range:2.5,cool:1.4,color:0x654a42},
 pillager:{name:'Pillager',hp:85,damage:19,speed:3.4,range:12,cool:2,color:0x674657},
 armored_zombie:{name:'Armored Zombie',hp:180,damage:29,speed:2.8,range:2.4,cool:1.6,color:0x536974,armor:.25},
 geomancer:{name:'Geomancer',hp:155,damage:31,speed:2.7,range:11,cool:3.8,color:0x715c82},
 necromancer:{name:'Necromancer',hp:210,damage:28,speed:3,range:12,cool:2.6,color:0x34304c},
 royal_guard:{name:'Royal Guard',hp:260,damage:38,speed:3.1,range:3,cool:1.8,color:0x805846,armor:.15}
};
const mobPools=[
 ['zombie','skeleton','creeper'],
 ['zombie','skeleton','creeper','vindicator','pillager','vindicator'],
 ['skeleton','creeper','vindicator','pillager','armored_zombie','geomancer','armored_zombie'],
 ['skeleton','creeper','armored_zombie','geomancer','necromancer','royal_guard','necromancer'],
 ['skeleton','creeper','geomancer','necromancer','royal_guard','royal_guard','armored_zombie','royal_guard','necromancer']
];
const biomeMobCounts=[28,32,36,40,44];
let difficulty='normal';
function rules(){return difficulties[difficulty]}
let gates=[],players=[],jayden=null,coOp=false,shockwaves=[],shake=0,blasts=[],flashLife=0,flashPosition={x:0,z:0};
const bossNames=['THORNWOOD ANCIENT','REDSTONE GOLEM','MARSH WRAITH','FROST GUARDIAN','BULLY OF THE WORLD'];
let worldStyle='',worldProfiles=[];
function generate(value){
 seed=value>>>0||1;rngState=seed;map=[];treasures=[];gates=[];
 // Warm up xorshift so neighboring seeds do not all select the same layout.
 for(let i=0;i<12;i++)random();
 const family=Math.floor(rr(0,4)),flip=random()<.5;
 worldStyle=['Winding Wilds','Shattered Highlands','Flooded Realms','Ancient Crossroads'][family]+(flip?' · Northbound':' · Southbound');
 const p=rr(0,100),q=rr(0,100),fx=rr(.065,.24),fz=rr(.055,.2);
 const crossings=[26,51,77,102].map((cx,index)=>({cx:cx+Math.floor(rr(-3,4)),cz:Math.floor(rr(16,80)),bend:rr(-5,5),frequency:rr(.05,.11),index,open:false}));
 function channelAt(i,z){const g=crossings[i],distance=z-g.cz;return g.cx+Math.round(g.bend*Math.sin(distance*g.frequency)*Math.min(1,Math.max(0,Math.abs(distance)-9)/15))}
 function limits(i,z){return{left:i?channelAt(i-1,z)+3:5,right:i<4?channelAt(i,z)-3:NX-6}}
 worldProfiles=Array.from({length:5},(_,i)=>({trees:rr(.06,.23),wet:family===2?rr(-.55,-.15):rr(-1.4,-.6),relief:family===1?rr(4,7):rr(1.8,4),shade:rr(.8,1.15),feature:Math.floor(rr(0,3)),phase:rr(0,40)}));
 for(let z=0;z<NZ;z++)for(let x=0;x<NX;x++){
  const biome=crossings.filter((g,i)=>x>=channelAt(i,z)).length,c=worldProfiles[biome];
  const n=Math.sin(x*fx+p)*Math.cos(z*fz+q)+.5*Math.sin(x*.31+z*.17+c.phase),basin=Math.sin(x*.06+c.phase)+Math.cos(z*.07-c.phase);
  const wet=n<c.wet||(family===2&&basin<-.85),h=wet?.24:.9+Math.floor(Math.max(0,n+.25)*c.relief)*.3;
  map.push({x,z,b:biome,h,wet,road:false,bridge:false,block:false,shade:rr(.86,1.14)*c.shade,prop:0,seen:false});
 }
 points=[{x:9,z:10},...crossings.map(g=>({x:g.cx-9,z:g.cz})),{x:116,z:84}];
 function carve(x,z,r,biome){for(let zz=Math.floor(z-r);zz<=z+r;zz++)for(let xx=Math.floor(x-r);xx<=x+r;xx++){const t=cell(xx,zz);if(t&&t.b===biome&&xx>2&&zz>2&&xx<NX-3&&zz<NZ-3&&Math.hypot(xx-x,zz-z)<=r){t.wet=false;t.road=true;t.h=.9;t.block=false;t.prop=0}}}
 function path(a,b,biome,width=2){const d=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(d*3));for(let n=0;n<=steps;n++){const u=n/steps,z=a.z+(b.z-a.z)*u,range=limits(biome,z),x=clamp(a.x+(b.x-a.x)*u,range.left,range.right);carve(x,z,width,biome)}}
 for(let i=0;i<5;i++){
  const entry=i?{x:crossings[i-1].cx+4,z:crossings[i-1].cz}:points[0],exit=i<4?points[i+1]:points[5],nodes=[entry];
  const turns=family===3?4:2+Math.floor(rr(0,3));
  for(let j=0;j<turns;j++){const z=rr(10,85),bounds=limits(i,z);nodes.push({x:rr(bounds.left+1,bounds.right-1),z})}nodes.push(exit);
  for(let n=1;n<nodes.length;n++)path(nodes[n-1],nodes[n],i,rr(1.6,2.5));
  if(family===3||random()<.55)path(entry,exit,i,1.5);
  // Broad clearings make crowds and guardians playable despite surrounding terrain.
  carve(exit.x,exit.z,i===4?8:6.5,i);carve(entry.x,entry.z,i?3.5:7,i);
  const plaza=nodes[1];carve(plaza.x,plaza.z,rr(3.2,5.2),i);
  if(i<4)path(exit,{x:crossings[i].cx+4,z:crossings[i].cz},i);
  if(i>0)carve(entry.x-2,entry.z,2,i);
  const count=2+Math.floor(rr(0,4));for(let j=0;j<count;j++){
   const anchor=nodes[j%nodes.length],z=clamp(anchor.z+rr(-16,16),8,87),bounds=limits(i,z),x=clamp(anchor.x+rr(-8,8),bounds.left+1,bounds.right-1),target={x,z};
   path(anchor,target,i,1.7);carve(x,z,2.5,i);treasures.push({x:(Math.floor(x)+.5)*S,z:(Math.floor(z)+.5)*S,opened:false,reward:Math.floor(rr(0,3))});
  }
 }
 for(const g of crossings){gates.push({...g,x:(g.cx+.5)*S,z:(g.cz+.5)*S});for(let z=3;z<NZ-3;z++)for(let x=channelAt(g.index,z)-1;x<=channelAt(g.index,z)+1;x++){const t=cell(x,z),bridge=z===g.cz;t.wet=!bridge;t.road=bridge;t.bridge=bridge;t.h=bridge?.9:.24;t.prop=0;t.block=false;t.gate=bridge?g.index:undefined}}
 for(const t of map){const edge=Math.min(t.x,t.z,NX-1-t.x,NZ-1-t.z);if(edge<3){t.block=true;t.road=false;t.bridge=false;t.boundary=true;if([0,2,4].includes(t.b)){t.wet=true;t.h=.24;t.prop=0}else{t.wet=false;t.h=3.6+random()*2;t.prop=2}}else if(!t.road&&!t.wet&&random()<worldProfiles[t.b].trees){t.prop=random()<.12?4+worldProfiles[t.b].feature:1+Math.floor(random()*3);t.block=true}}
 if(flip){const mirrored=new Array(NX*NZ);for(const t of map){t.z=NZ-1-t.z;mirrored[t.z*NX+t.x]=t}map=mirrored;for(const p of points)p.z=NZ-1-p.z;for(const t of treasures)t.z=NZ*S-t.z;for(const g of gates){g.cz=NZ-1-g.cz;g.z=NZ*S-g.z}}
}

const $=ui.get,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const biomes=['Creeper Woods','Redstone Canyon','Soggy Marsh','Frostpeak','Obsidian Keep'],colors=[0x567b36,0xaa7142,0x375950,0xb4cdd1,0x403948],roads=[0x8d8155,0xc0905e,0x77775c,0x85949c,0x655769];
const cube=new THREE.BoxGeometry(1,1,1),materials=new Map();
function mat(color,glow=false){const k=color+':'+glow;if(!materials.has(k))materials.set(k,new THREE.MeshStandardMaterial({color,roughness:.88,metalness:.04,emissive:glow?color:0,emissiveIntensity:glow?1.5:0}));return materials.get(k)}
function box(parent,x,y,z,w,h,d,color,glow=false){const m=new THREE.Mesh(cube,mat(color,glow));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=!glow;m.receiveShadow=true;parent.add(m);return m}
function contactShadow(){const m=new THREE.Mesh(new THREE.RingGeometry(0,1,32),new THREE.MeshBasicMaterial({color:0x07101a,transparent:true,opacity:.3,depthWrite:false,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.userData.contactShadow=true;root.add(m);return m}
let root,player,mobs=[],loot=[],bolts=[],effects=[],rings=[],lights=[],bosses=[],cage,suki,introBully,playBall;
let storyStep=0,storyTime=0,rescueTime=0,fireworkTimer=0,celebration=[],rescueStart=null;
let hitFlashTime=0;
let phase='title',keys={},tick=0,weapon=0,gems=0,level=1,xp=0,kills=0,seals=0,swing=0,navTimer=0,toastTime=0,region=-1,elapsed=0,mapOpen=false,checkpoint=0;
let flow=new Int32Array(NX*NZ),audio,sound=true,miniTimer=0;
const weaponData=[{name:'DIAMOND SWORD',damage:26,reach:3.25,arc:1.35,cool:.29}];
function beep(f,d=.09){if(!sound)return;events.push({type:"tone",frequency:f,duration:d});}
function notify(s){$('toast').textContent=s;toastTime=3.5;$('toast').style.opacity=1}
function overlay(title,desc,button){$('title').textContent=title;$('description').textContent=desc;$('go').textContent=button;$('overlay').style.display='grid'}
function pointWorld(i){return{x:(points[i].x+.5)*S,z:(points[i].z+.5)*S}}
function floorAt(x,z){return terrain(x,z)?.h??.9}
function makeActor(type='hero'){
 const group=new THREE.Group(),rig=new THREE.Group();group.add(rig);const boss=['ancient','golem','wraith','frost','king'].includes(type);
 const skin=eliteMobs[type]?(type==='armored_zombie'?0x73965e:0x9b9e99):type==='hero'?0xc8916d:type==='skeleton'?0xe0dccc:type==='spider'?0x392637:type==='creeper'?0x70a448:boss?0x8c8998:0x699950;
 const coat=eliteMobs[type]?eliteMobs[type].color:type==='hero'?0x298f9a:type==='skeleton'?0x777b7a:type==='king'?0x8c2637:type==='frost'?0x6e9cae:type==='golem'?0x754d44:type==='ancient'?0x426b30:0x344d60;
 const leg1=box(rig,-.22,.35,0,.32,.7,.38,0x263340),leg2=box(rig,.22,.35,0,.32,.7,.38,0x263340),torso=box(rig,0,1.08,0,.88,.82,.5,coat);
 box(rig,0,1.83,0,.7,.67,.64,skin);box(rig,0,2.12,0,.73,.17,.67,type==='hero'?0x4d2d24:coat);box(rig,-.17,1.87,.329,.10,.1,.025,boss?0xfc796b:0x151e25,boss);box(rig,.17,1.87,.329,.10,.1,.025,boss?0xfc796b:0x151e25,boss);
 const arm=box(rig,-.61,1.43,0,.3,.78,.35,skin),offArm=box(rig,.61,1.43,0,.3,.78,.35,skin);for(const limb of[arm,offArm]){limb.geometry=cube.clone();limb.geometry.translate(0,-.5,0)}for(const limb of[leg1,leg2]){limb.position.y=.7;limb.geometry=cube.clone();limb.geometry.translate(0,-.5,0)}const hand=new THREE.Group();hand.position.set(.65,.92,.17);rig.add(hand);
 if(type==='hero'){box(rig,0,1.13,-.33,.73,1.02,.12,0x9d3040);box(rig,-.5,1.48,0,.4,.22,.57,0xb9d1d4);box(rig,.5,1.48,0,.4,.22,.57,0xb9d1d4)}else if(type==='skeleton'){box(hand,0,.18,.12,.10,1.1,.1,0xa37a46);box(hand,0,.18,.23,.04,.85,.04,0xe3d1a0)}else if(type==='creeper'){torso.material=mat(0x609843);box(rig,0,1.68,.34,.24,.25,.03,0x1d3328)}else if(type==='spider'){rig.scale.set(1.5,.42,1.3);for(let i=0;i<4;i++)for(const sign of[-1,1])box(rig,sign*.86,.5,-.65+i*.43,1,.18,.15,0x282033)}else if(boss){box(rig,0,2.29,0,.95,.19,.8,0xd5b16a);for(let i=-1;i<=1;i++)box(rig,i*.3,2.48,0,.14,.35,.25,0xe7c176);box(rig,-.61,1.5,0,.58,.5,.7,coat);box(rig,.61,1.5,0,.58,.5,.7,coat)}
 if(type==='creeper'){
 rig.clear();const body=box(rig,0,1.06,0,.63,1.2,.55,0x579637);const head=box(rig,0,1.96,0,.91,.88,.86,0x79b54c);for(const x of[-.22,.22])box(rig,x,2.04,.437,.2,.2,.025,0x14271b);box(rig,0,1.83,.442,.2,.25,.025,0x14271b);for(const x of[-.16,.16])box(rig,x,1.69,.442,.16,.25,.025,0x14271b);for(const limb of[leg1,leg2]){limb.geometry.dispose();limb.geometry=cube;limb.scale.set(.35,.43,.45);limb.position.set(limb===leg1?-.24:.24,.22,.3);limb.material=mat(0x386526);rig.add(limb)}const rear1=box(rig,-.24,.22,-.3,.35,.43,.45,0x386526),rear2=box(rig,.24,.22,-.3,.35,.43,.45,0x386526);rig.userData.rearFeet=[rear1,rear2];for(let i=0;i<9;i++)box(rig,(i%3-1)*.21,.7+Math.floor(i/3)*.3,.286,.13,.17,.025,i%2?0x345e29:0x9fc86a);
 }
 if(eliteMobs[type]){
  const spec=eliteMobs[type];box(rig,0,1.77,.39,.18,.32,.23,0x858b80);
  if(type==='vindicator'){box(hand,0,.55,0,.13,1.25,.13,0x654c36);box(hand,.16,1.06,0,.65,.47,.16,0xcbd5d7)}
  if(type==='pillager'){box(hand,0,.28,.2,.75,.12,.2,0x8e6441);box(hand,0,.28,.35,.14,.14,.7,0xa59d90);box(hand,0,.33,.65,.05,.05,.3,0xe2e7d4)}
  if(type==='armored_zombie'||type==='royal_guard'){box(rig,0,1.11,.3,.94,.7,.15,0x929da4);box(rig,0,2.17,0,.86,.3,.8,0x7c8c96);for(const sign of[-1,1])box(rig,sign*.56,1.5,0,.48,.3,.7,0xa2abb0);box(hand,0,.6,0,.14,1.2,.14,0x76604c);box(hand,0,1.12,0,.45,.45,.45,0xb6c4c9)}
  if(type==='royal_guard'){const shield=new THREE.Group();shield.position.set(-.7,.95,.45);rig.add(shield);box(shield,0,0,0,.65,1.1,.18,0xc1a369);box(shield,0,0,.12,.43,.77,.1,0x934053);rig.userData.shield=shield;box(rig,0,2.43,0,.2,.4,.55,0xcc7560)}
  if(type==='geomancer'||type==='necromancer'){box(rig,0,.7,0,1.05,.75,.65,spec.color);box(rig,0,2.2,0,.86,.32,.8,spec.color);box(hand,0,.7,0,.14,1.8,.14,0x72624f);box(hand,0,1.65,0,.4,.4,.4,type==='geomancer'?0xe9b482:0x79ffbf,true);box(rig,0,1.12,.35,.18,.6,.06,type==='geomancer'?0xe9b482:0x79ffbf,true)}
 }
 const scale=type==='king'?2.1:boss?1.85:type==='royal_guard'?1.25:type==='armored_zombie'?1.12:1;group.scale.setScalar(scale);root.add(group);const shadow=contactShadow();return{group,rig,leg1,leg2,arm,offArm,hand,boss,scale,shadow};
}
const weaponNames=['DIAMOND SWORD','INFERNO SWORD','STORMFIRE SWORD','CATACLYSM SWORD'],weaponColors=[0x6febdc,0xff943d,0x77cfff,0xdf9bff];
function weaponTier(){return level>=8?3:level>=5?2:level>=3?1:0}
function ammoCapacity(){return 10+2*(level-1)}
function xpNeeded(){return Math.ceil(level*90*rules().xpCost-1e-9)}
function gainXP(amount){xp+=amount;let advanced=false;while(xp>=xpNeeded()){xp-=xpNeeded();level++;advanced=true}if(advanced){for(const h of players){h.max=180+20*(level-1);equip(h)}notify('LEVEL '+level+' • '+weaponNames[weaponTier()]+' • '+ammoCapacity()+' ammo capacity • Find food to fill extra health')}}
function awardArmor(boss){
 const tier=boss.index+1,names=['WOODLAND','REDSTONE','WRAITH','FROST','OBSIDIAN'],colors=[0x8aab68,0xb67b60,0x9376b3,0x8dced9,0x8b809f];
 for(const h of players){if(h.armorModel)h.model.rig.remove(h.armorModel);const m=new THREE.Group();h.model.rig.add(m);box(m,0,1.1,.32,.93,.76,.15,colors[tier-1]);for(const side of[-1,1])box(m,side*.53,1.5,0,.5,.25,.66,colors[tier-1]);h.armorModel=m;h.armor={name:names[tier-1],tier,reduction:.15+tier*.05,durability:80+tier*40,max:80+tier*40};}
 notify(names[tier-1]+' ARMOR • '+Math.round((.15+tier*.05)*100)+'% damage reduction • Wears when hit');
}
function armorDamage(hero,damage){const armor=hero.armor;if(!armor||armor.durability<=0)return damage;const reduced=Math.ceil(damage*(1-armor.reduction));armor.durability=Math.max(0,armor.durability-Math.ceil(damage*.25*rules().armorWear));if(!armor.durability){hero.armorModel.visible=false;notify(hero.name+'’s armor broke! Defeat another boss for new armor.');puff(hero.x,floorAt(hero.x,hero.z)+1,hero.z,0xb6b8c5,12)}return reduced}
function lightningArc(a,b){const dx=b.x-a.x,dz=b.z-a.z;for(let i=0;i<7;i++){const u=i/7,v=(i+1)/7,x=a.x+dx*u,z=a.z+dz*u,m=box(root,x+dx/14,floorAt(x,z)+1.2+Math.sin(i*2)*.2,z+dz/14,.1,.1,Math.hypot(dx,dz)/7+.1,0xb5eaff,true);m.rotation.y=Math.atan2(dx,dz);effects.push({m,vx:0,vy:0,vz:0,life:.23,fade:true})}}
function enchantHit(hero,target,tier=weaponTier(),powerLevel=level){
 if(tier<1)return;
 if(!target.dead){target.burn={left:3,timer:0,ticks:3,damage:6+powerLevel};puff(target.x,floorAt(target.x,target.z)+1,target.z,0xffa344,5)}
 if(tier<2||hero.elementCd>0)return;hero.elementCd=.25;
 const nearby=mobs.filter(e=>e!==target&&!e.dead&&Math.hypot(e.x-target.x,e.z-target.z)<4&&lineClear(target.x,target.z,e.x,e.z)).sort((a,b)=>Math.hypot(a.x-target.x,a.z-target.z)-Math.hypot(b.x-target.x,b.z-target.z));
 for(const e of nearby.slice(0,3)){lightningArc(target,e);hurt(e,18+powerLevel*3)}
 if(tier>=3){const x=target.x,z=target.z;addRing(x,z,3.5,0xe4a2ff,.35);rings[rings.length-1].blast=true;puff(x,floorAt(x,z)+1,z,0xd994ff,20);for(const e of mobs)if(e!==target&&!e.dead&&Math.hypot(e.x-x,e.z-z)<3.5&&lineClear(x,z,e.x,e.z))hurt(e,25+powerLevel*4);shake=Math.max(shake,.15)}
}
function updateBurns(dt){for(const e of mobs){if(e.dead||!e.burn)continue;const b=e.burn;b.left-=dt;b.timer-=dt;if(b.timer<=0&&b.ticks>0){b.timer+=1;b.ticks--;hurt(e,b.damage);puff(e.x,floorAt(e.x,e.z)+1,e.z,0xff8d35,3)}if(b.left<=0)e.burn=null}}
function equip(hero=player){const hand=hero.model.hand;hand.clear();box(hand,0,.16,.12,.13,.48,.13,0x795132);box(hand,0,.85,.12,.19,.96,.09,weaponColors[weaponTier()],weaponTier()>0);box(hand,0,.42,.12,.6,.10,.14,0x8eafb4)}

function buildWorld(){
 points.slice(1,5).forEach((p,i)=>{const x=(p.x+.5)*S,z=(p.z+.5)*S;for(const dx of[-8,8])for(const dz of[-8,8]){box(root,x+dx,1.65,z+dz,1.25,1.5,1.25,0x5d6267);box(root,x+dx,2.54,z+dz,1.5,.3,1.5,0xa0a292);lights.push(box(root,x+dx,3.07,z+dz,.53,.8,.53,i===3?0x7bdcff:0xffa353,true));}});
 for(const t of treasures){
  t.group=new THREE.Group();t.group.position.set(t.x,floorAt(t.x,t.z),t.z);root.add(t.group);
  box(t.group,0,.12,0,1.35,.24,1,0x533b29);box(t.group,-.57,.43,0,.18,.62,1,0x926035);box(t.group,.57,.43,0,.18,.62,1,0x926035);box(t.group,0,.43,-.42,1.2,.62,.16,0x926035);box(t.group,0,.43,.42,1.2,.62,.16,0x926035);
  t.lid=new THREE.Group();t.lid.position.set(0,.77,-.5);t.group.add(t.lid);box(t.lid,0,0,.5,1.4,.22,1.05,0xc18b47);box(t.lid,0,-.14,1.04,.2,.3,.08,0xffd674,true);t.openAmount=0;
 }
 for(const g of gates){g.group=new THREE.Group();root.add(g.group);g.group.position.set(g.x,.9,g.z);for(const z of[-1.15,1.15])box(g.group,0,1.8,z,.6,3.6,.5,0x626778);g.barrier=new THREE.Group();g.group.add(g.barrier);for(const z of[-.8,-.4,0,.4,.8])box(g.barrier,0,1.6,z,.22,3.1,.13,0xf1b16b,true);box(g.barrier,0,3.1,0,.3,.2,2.4,0xffd783,true)}
 buildCage();
}
function passable(x,z,fromY,r=.35){
 if(cage&&!cage.broken&&Math.abs(x-cage.x)<1.5+r&&Math.abs(z-cage.z)<1.5+r)return false;
 return gridPassable({map,width:NX,depth:NZ,cellSize:S},x,z,fromY,r,t=>t.gate===undefined||gates[t.gate].open);
}
function move(e,dx,dz){moveController(e,dx,dz,{floor:floorAt,passable});}
function buildFlow(){flow.fill(-1);const t=terrain(player.x,player.z);if(!t)return;const queue=[t.z*NX+t.x];flow[queue[0]]=0;for(let k=0;k<queue.length;k++){const a=map[queue[k]];for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const b=cell(a.x+dx,a.z+dz);if(!b)continue;const idx=b.z*NX+b.x;if(flow[idx]<0&&!b.wet&&!b.block&&(b.gate===undefined||gates[b.gate].open)&&Math.abs(b.h-a.h)<.86){flow[idx]=flow[queue[k]]+1;queue.push(idx)}}}}
function spawn(type,x,z,index=-1){const boss=index>=0,hp=boss?[420,540,620,720,1200][index]*(coOp?1.6:1):eliteMobs[type]?.hp??{zombie:65,skeleton:48,spider:42,creeper:46,brute:145}[type];const e={x,z,r:boss?.7:.32,type,index,boss,hp,max:hp,cd:rr(.3,1.8),wind:0,stun:0,dead:false,face:0,speed:boss?2.8:type==='spider'?5.3:3.1,model:makeActor(type),step:0};if(eliteMobs[type]){e.speed=eliteMobs[type].speed;e.armor=eliteMobs[type].armor||0;e.shield=type==='royal_guard'?100:0;e.attackAge=99}mobs.push(e);if(boss){e.summonTimer=4;e.summonPending=0;bosses.push(e);equipBoss(e)}return e}
function createHero(name,p){const mason=name==='Mason',hero={...p,name,isHero:true,ammo:0,armor:null,armorModel:null,elementCd:0,r:mason?.4:.34,hp:180,max:180,face:Math.PI/2,weapon:0,swing:0,power:0,damageFactor:mason?1.3:1,speed:mason?7.2:8.3,sight:mason?16:20,frozen:0,slow:0,roll:0,rollCd:0,attackCd:0,bowCd:0,inv:0,step:0,rx:0,rz:0,model:makeActor()};
 if(mason)hero.model.group.scale.set(1.12,1.18,1.12);else{hero.model.rig.children[2].material=mat(0xa879da);hero.model.rig.children[1].material=mat(0x543967)}
 const iceMaterial=new THREE.MeshBasicMaterial({color:0x9deaff,transparent:true,opacity:.38,wireframe:false});hero.ice=new THREE.Mesh(cube,iceMaterial);hero.ice.position.y=1.1;hero.ice.scale.set(1.65,2.6,1.45);hero.ice.visible=false;hero.ice.userData.ownedMaterial=true;hero.model.group.add(hero.ice);equip(hero);return hero;
}
const foodTypes=[{name:'Bread',health:20,color:0xd99e4c},{name:'Chicken',health:40,color:0xc97a34},{name:'Ribs',health:60,color:0xa54e32}];
function dropFood(x,z,kind){
 const food=foodTypes[kind],m=new THREE.Group();root.add(m);
 if(kind===0){box(m,0,.18,0,.9,.4,.48,food.color);for(const x of[-.27,0,.27])box(m,x,.395,0,.09,.03,.35,0xffd997)}
 else if(kind===1){box(m,0,.12,0,.7,.5,.58,food.color);box(m,.43,.06,0,.5,.16,.16,0xffebd4);box(m,.67,.06,0,.12,.25,.27,0xffebd4);box(m,-.12,.4,0,.42,.13,.38,0xe6a052)}
 else{box(m,0,.16,0,.95,.3,.58,food.color);for(const x of[-.32,0,.32])box(m,x,.22,0,.12,.17,.86,0xffe4c6)}
 m.position.set(x,floorAt(x,z)+.55,z);const item={m,x,z,type:'food',kind,value:food.health};loot.push(item);return item;
}
function eatFood(item,collector){
 if(item.gone||!players.some(h=>h.hp<h.max))return false;
 for(const h of players){const down=h.hp<=0;h.hp=Math.min(h.max,h.hp+item.value);if(down){h.x=collector.x;h.z=collector.z;h.inv=3;h.frozen=0;h.roll=0}}
 item.gone=true;root.remove(item.m);notify(foodTypes[item.kind].name.toUpperCase()+' • +'+item.value+' health'+(coOp?' for both heroes':''));beep(690,.13);return true;
}
function equipBoss(e){
 const hand=e.model.hand;hand.clear();e.attackAge=99;
 if(e.type==='golem'){box(hand,0,.7,0,.22,1.9,.22,0x67412f);box(hand,0,1.8,0,1.6,.85,.85,0x646875);box(hand,0,1.8,.46,1.15,.4,.1,0xff6335,true);box(hand,0,1.8,-.46,1.15,.4,.1,0xff6335,true)}
 else if(e.type==='frost'){box(hand,0,.65,0,.15,1.9,.15,0x558897);box(hand,0,1.75,0,.65,.75,.65,0x9beaff,true)}
 else if(e.type==='wraith'){box(hand,0,.4,0,.2,1.2,.2,0x51405c);box(hand,0,1.2,0,.65,.85,.65,0xff8c38,true)}
 else if(e.type==='ancient'){for(const a of[-1,1]){box(e.model.rig,a*.55,2.65,0,.2,1,.2,0x775633);box(e.model.rig,a*.8,2.9,0,.7,.18,.2,0x775633)}box(hand,0,.7,0,.3,1.8,.3,0x775633)}
 else{box(e.model.rig,-.65,1,0,.6,.65,.65,0xc89a66);box(hand,0,.2,0,.7,.75,.7,0xc89a66)}
}

function startGame(newSeed){
 cancelQi();
 if(root){scene.remove(root);root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.userData.ownedMaterial)o.material.dispose();if(o.geometry&&o.geometry!==cube){o.geometry.dispose();if(o.material&&!Array.from(materials.values()).includes(o.material))o.material.dispose()}})}
 root=new THREE.Group();scene.add(root);cage=null;suki=null;introBully=null;playBall=null;celebration=[];rescueTime=0;fireworkTimer=0;$('victory').hidden=true;$('story-dialog').hidden=true;$('ui').style.display='block';$('go').hidden=false;keys={};shockwaves=[];blasts=[];flashLife=0;shake=0;mobs=[];loot=[];bolts=[];effects=[];rings=[];lights=[];bosses=[];gems=0;level=1;xp=0;kills=0;seals=0;elapsed=0;checkpoint=0;weapon=0;swing=0;navTimer=0;region=-1;miniTimer=0;
 generate(newSeed);buildWorld();player=createHero('Mason',pointWorld(0));jayden=coOp?createHero('Jayden',{x:player.x-1.4,z:player.z+1.4}):null;players=jayden?[player,jayden]:[player];
 ['ancient','golem','wraith','frost','king'].forEach((type,i)=>{const p=pointWorld(i===4?5:i+1),e=spawn(type,p.x+(i===4?5.5:0),p.z,i);e.home={x:e.x,z:e.z};e.patrolAngle=0});
 for(let biome=0;biome<5;biome++){
  const tiles=map.filter(v=>v.b===biome&&v.road&&!v.bridge&&passable((v.x+.5)*S,(v.z+.5)*S,v.h,.4)&&Math.hypot((v.x+.5)*S-player.x,(v.z+.5)*S-player.z)>17);
  for(let n=tiles.length-1;n>0;n--){const j=Math.floor(random()*(n+1));[tiles[n],tiles[j]]=[tiles[j],tiles[n]]}
  for(let i=0;i<Math.min(biomeMobCounts[biome],tiles.length);i++){const t=tiles[i],pool=mobPools[biome];spawn(pool[i%pool.length],(t.x+.5)*S,(t.z+.5)*S)}
 }

 for(let b=0;b<5;b++){const tiles=map.filter(t=>t.b===b&&t.road&&!t.bridge&&passable((t.x+.5)*S,(t.z+.5)*S,t.h,.4));for(let i=0;i<rules().placedFood;i++){const t=tiles[Math.floor(random()*tiles.length)];if(t)dropFood((t.x+.5)*S,(t.z+.5)*S,i%3)}}buildFlow();for(const h of players)animateActor(h,0,false);for(const e of mobs)animateActor(e,0,false);follow.set(player.x,.9,player.z);phase='play';$('overlay').style.display='none';$('seedtag').textContent=worldStyle+' · WORLD '+seed;notify('Defeat each bridge guardian. Cross all five biomes to rescue Suki.');drawMap();hud();
}

function lineClear(x,z,tx,tz){const d=Math.hypot(tx-x,tz-z),steps=Math.max(1,Math.ceil(d/.4));let h=floorAt(x,z);for(let i=1;i<=steps;i++){const u=i/steps,nx=x+(tx-x)*u,nz=z+(tz-z)*u;if(!passable(nx,nz,h,.05))return false;h=floorAt(nx,nz)}return true}
function aim(hero=player){if(cage.unlocked&&!cage.broken&&Math.hypot(cage.x-hero.x,cage.z-hero.z)<4.8){hero.face=Math.atan2(cage.x-hero.x,cage.z-hero.z);return}const nearby=mobs.filter(e=>!e.dead&&Math.hypot(e.x-hero.x,e.z-hero.z)<5).sort((a,b)=>Math.hypot(a.x-hero.x,a.z-hero.z)-Math.hypot(b.x-hero.x,b.z-hero.z));if(nearby[0])hero.face=Math.atan2(nearby[0].x-hero.x,nearby[0].z-hero.z)}
function puff(x,y,z,col,n=9){for(let i=0;i<n;i++){const m=box(root,x,y,z,.12,.12,.12,col,true);effects.push({m,vx:rr(-3,3),vy:rr(1,5),vz:rr(-3,3),life:rr(.25,.65)})}}
function addRing(x,z,r,color,time,action=null){const geometry=new THREE.RingGeometry(r-.09,r,48),material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.65,side:THREE.DoubleSide});const m=new THREE.Mesh(geometry,material);m.rotation.x=-Math.PI/2;m.position.set(x,floorAt(x,z)+.055,z);root.add(m);rings.push({m,x,z,r,time,max:time,action})}
function hurt(e,amount){
 if(e.dead)return;const defense=e.boss?rules().resistance:e.shield>0?.55:e.armor||0;if(e.shield>0){e.shield=Math.max(0,e.shield-amount);if(!e.shield){e.model.rig.userData.shield.visible=false;puff(e.x,floorAt(e.x,e.z)+1,e.z,0xe2bd7a,12)}}e.hp-=amount*(1-defense);e.hitPose=.18;e.stun=e.boss?0:.13;puff(e.x,floorAt(e.x,e.z)+1.1,e.z,0xffd698,5);if(e.hp>0)return;e.dead=true;e.model.group.visible=false;e.model.shadow.visible=false;if(e.type==='creeper')queueExplosion(e);else deathFragments(e);if(e.type==='skeleton'&&random()<rules().ammoChance)dropAmmo(e.x,e.z,'arrow',3);if(e.type==='creeper'&&jayden&&random()<rules().ammoChance)dropAmmo(e.x,e.z,'fireball',2);kills++;gainXP(e.boss?120:16);
 if(e.boss||random()<rules().gemChance){const gem=box(root,e.x,floorAt(e.x,e.z)+.7,e.z,.35,.5,.35,0x65f5a8,true);loot.push({m:gem,x:e.x,z:e.z,type:'gem',value:e.boss?50:3})}if(random()<(e.boss?rules().bossFoodChance:rules().foodChance))dropFood(e.x+.8,e.z,e.boss?2:Math.floor(rr(0,3)));
 if(e.boss&&e.index<4){seals++;checkpoint=e.index+1;gates[e.index].open=true;gates[e.index].barrier.visible=false;buildFlow();notify(bossNames[e.index]+' DEFEATED • Bridge opened • '+seals+'/4')}else if(e.type==='king'){checkpoint=4;cage.unlocked=true;notify('The Bully is defeated! Break Suki’s cage with your weapon!');}
 if(e.boss)awardArmor(e);beep(e.boss?800:510,.12);
}
function slashTrail(h){for(let i=0;i<9;i++){const a=h.face-.9+i*.22,r=1.4+i*.06,m=box(root,h.x+Math.sin(a)*r,floorAt(h.x,h.z)+1.1,h.z+Math.cos(a)*r,.12,.1,.42,weaponColors[weaponTier()],true);m.rotation.y=a+.8;effects.push({m,vx:0,vy:.15,vz:0,life:.1+i*.012,fade:true})}}
function deathFragments(e){for(let i=0;i<8;i++){const m=box(root,e.x,floorAt(e.x,e.z)+1,e.z,.22,.22,.22,e.boss?0xc29b70:0x788b71);effects.push({m,vx:rr(-3,3),vy:rr(2,5),vz:rr(-3,3),life:.65,spin:true})}}
function queueExplosion(e){if(e.explosionQueued)return;e.explosionQueued=true;const mesh=box(root,e.x,floorAt(e.x,e.z)+.8,e.z,.65,.65,.65,0xc2ef88,true);blasts.push({x:e.x,z:e.z,age:0,fired:false,mesh,source:e});addRing(e.x,e.z,4.4,0xffbc67,.3);beep(760,.12)}
function updateExplosions(dt){for(const b of blasts){b.age+=dt;if(!b.fired){b.mesh.scale.setScalar(.5+b.age*2);b.mesh.rotation.y+=dt*8;if(b.age>=.3){b.fired=true;root.remove(b.mesh);flashPosition={x:b.x,z:b.z};flashLife=.45;if(players.some(h=>Math.hypot(h.x-b.x,h.z-b.z)<18))shake=Math.max(shake,.5);beep(65,.35);
 for(const h of players){const d=Math.hypot(h.x-b.x,h.z-b.z);if(d<4.4&&lineClear(b.x,b.z,h.x,h.z)){const vulnerable=h.roll<=0&&h.inv<=0;takeDamage(Math.round(38*(1-d/5)),h);if(vulnerable&&d>.01)move(h,(h.x-b.x)/d*.7,(h.z-b.z)/d*.7)}}
 for(const e of mobs)if(!e.dead&&Math.hypot(e.x-b.x,e.z-b.z)<4.4&&lineClear(b.x,b.z,e.x,e.z))hurt(e,45);
 for(let i=0;i<46;i++){const a=rr(0,Math.PI*2),speed=rr(2,8),size=rr(.1,.38),m=box(root,b.x,floorAt(b.x,b.z)+.7,b.z,size,size,size,i<20?[0xfff3c1,0xffbc55,0xff6d2a][i%3]:i<34?0x536d36:0x555965,i<20);effects.push({m,vx:Math.sin(a)*speed,vy:rr(2,8),vz:Math.cos(a)*speed,life:rr(.5,1.25),spin:true,smoke:i>=34})}
 const m=new THREE.Mesh(new THREE.RingGeometry(3.8,4.4,48),new THREE.MeshBasicMaterial({color:0xffd99a,transparent:true,opacity:.75,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(b.x,floorAt(b.x,b.z)+.1,b.z);root.add(m);rings.push({m,x:b.x,z:b.z,r:4.4,time:.3,max:.3,action:null,blast:true});
 }} }blasts=blasts.filter(b=>b.age<1.5)}
function takeDamage(n,hero=player){if(hero.hp<=0||hero.inv>0||hero.roll>0||phase!=='play')return;if(hero===player&&qi.phase==='charging'){n=Math.ceil(n*1.5);cancelQi();notify('Qi interrupted! +50% damage taken. Release L, then hold again.')}n=armorDamage(hero,n);hero.hp=Math.max(0,hero.hp-n);hero.hitPose=.2;hero.inv=.65;$('hit').style.opacity='.35';hitFlashTime=.12;puff(hero.x,floorAt(hero.x,hero.z)+1,hero.z,0xff5577);beep(110,.16);if(!hero.hp){if(players.every(h=>h.hp<=0)){phase='dead';overlay(coOp?'THE TEAM FELL IN BATTLE':'YOU FELL IN BATTLE','The adventure is over. Try this world again with a fresh start.','TRY AGAIN')}else notify(hero.name+' is down! Find food to bring your teammate back.')}}

function melee(hero=player){if(hero===player&&qi.phase!=='idle')return;if(phase!=='play'||hero.hp<=0)return;if(hero.frozen>0||hero.attackCd>0||hero.roll>0)return;aim(hero);const w=weaponData[hero.weapon],tier=weaponTier(),powerLevel=level;hero.attackCd=w.cool;hero.swing=.23;hero.combo=(hero.combo||0)+1;slashTrail(hero);beep(hero.weapon===2?130:300);const x=hero.x,z=hero.z,a=hero.face;strikeCage(w,hero);if(phase!=='play')return;addRing(x,z,w.reach,hero.weapon===2?0xd4a1ff:0xb7fff2,.15);for(const e of mobs){const d=Math.hypot(e.x-x,e.z-z),ang=Math.atan2(e.x-x,e.z-z);if(!e.dead&&lineClear(x,z,e.x,e.z)&&d<w.reach+e.r&&Math.abs(Math.atan2(Math.sin(ang-a),Math.cos(ang-a)))<w.arc){hurt(e,Math.round((w.damage+powerLevel*4+hero.power)*hero.damageFactor));enchantHit(hero,e,tier,powerLevel);const push=hero.weapon===2?.9:.35;if(!e.boss)move(e,Math.sin(ang)*push,Math.cos(ang)*push);e.stun=e.boss?0:.16}}}
function dodge(hero=player){if(phase!=='play'||hero.hp<=0||hero.frozen>0||hero.rollCd>0)return;if(hero===player)cancelQi();const d=inputDirection(hero);hero.rx=d.x||d.z?d.x:Math.sin(hero.face);hero.rz=d.x||d.z?d.z:Math.cos(hero.face);hero.roll=.28;hero.rollCd=1.05;beep(170,.12)}
function projectile(owner,x,z,a,enemy=true,speed=11){const fire=!enemy&&owner===jayden,m=box(root,x,floorAt(x,z)+1.2,z,fire?.5:.12,fire?.5:.12,fire?.5:enemy?.65:.95,fire?0xff773a:enemy?0xffa764:0x8ef3f5,true);m.rotation.y=a;const bolt={m,x,z,vx:Math.sin(a)*speed,vz:Math.cos(a)*speed,enemy,fire,life:2.8,owner,tier:enemy?0:weaponTier(),powerLevel:level,damage:fire?38:15};bolts.push(bolt);return bolt}
function bow(hero=player){if(hero.ammo<=0||(hero===player&&qi.phase!=='idle'))return;if(phase!=='play'||hero.hp<=0||hero.frozen>0||hero.bowCd>0||hero.roll>0)return;const target=mobs.filter(e=>!e.dead&&Math.hypot(e.x-hero.x,e.z-hero.z)<hero.sight&&lineClear(hero.x,hero.z,e.x,e.z)).sort((a,b)=>Math.hypot(a.x-hero.x,a.z-hero.z)-Math.hypot(b.x-hero.x,b.z-hero.z))[0];if(target)hero.face=Math.atan2(target.x-hero.x,target.z-hero.z);hero.ammo--;projectile(hero,hero.x,hero.z,hero.face,false,hero===jayden?17:22);const shot=bolts[bolts.length-1];if(shot.tier)shot.m.material=mat(weaponColors[shot.tier],true);hero.shootPose=.24;hero.bowCd=hero===jayden?.7:.48;beep(hero===jayden?210:520,.08)}


const qi={phase:'idle',charge:0,age:0,target:null,group:null,orb:null,swirls:[],motes:[],beam:null};
function enemyName(e){return e.boss?bossNames[e.index]:(eliteMobs[e.type]?.name||e.type).toUpperCase()}
function qiDamage(){return 180+level*50}
function qiTarget(){return mobs.filter(e=>!e.dead&&Math.hypot(e.x-player.x,e.z-player.z)<player.sight&&lineClear(player.x,player.z,e.x,e.z)).sort((a,b)=>Number(b.boss)-Number(a.boss)||b.max-a.max||Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z))[0]||null}
function cancelQi(){if(qi.group){root.remove(qi.group);qi.group.traverse(o=>{if(o.geometry&&o.geometry!==cube)o.geometry.dispose();if(o.userData.qiMaterial)o.material.dispose()})}qi.phase='idle';qi.charge=0;qi.age=0;qi.target=null;qi.group=null;qi.orb=null;qi.beam=null;qi.swirls=[];qi.motes=[];if(player?.model)player.model.hand.visible=true}
function energyMesh(parent,w,h,d,color,opacity=1){const material=new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:false,blending:THREE.AdditiveBlending}),m=new THREE.Mesh(cube,material);m.scale.set(w,h,d);m.userData.qiMaterial=true;parent.add(m);return m}
function energyRing(parent,r){const m=new THREE.Mesh(new THREE.RingGeometry(r*.9,r,48),new THREE.MeshBasicMaterial({color:0x63d8ff,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));m.userData.qiMaterial=true;parent.add(m);return m}
function beginQi(){if(phase!=='play'||player.hp<=0||player.frozen>0||player.roll>0||qi.phase!=='idle')return;qi.phase='charging';qi.charge=0;qi.age=0;qi.target=qiTarget();qi.group=new THREE.Group();root.add(qi.group);qi.orb=new THREE.Group();qi.group.add(qi.orb);energyMesh(qi.orb,.85,.85,.85,0x168cff,.25);energyMesh(qi.orb,.52,.52,.52,0x50d7ff,.55);energyMesh(qi.orb,.28,.28,.28,0xecffff);for(let i=0;i<3;i++)qi.swirls.push(energyRing(qi.group,1.2+i*.3));for(let i=0;i<24;i++)qi.motes.push(energyMesh(qi.group,.08,.08,.2,i%3?0x65cfff:0xffffff));beep(160,.2)}
function qiImpact(target){
 const x=target.x,z=target.z,damage=qiDamage(),radius=5;
 // Capture the blast before rewards can level Mason up or trigger chained deaths.
 const victims=mobs.filter(e=>e!==target&&!e.dead&&Math.hypot(e.x-x,e.z-z)<radius&&lineClear(x,z,e.x,e.z)).map(e=>({e,damage:Math.round(damage*.75*(1-.6*Math.hypot(e.x-x,e.z-z)/radius))}));
 hurt(target,damage);for(const hit of victims)hurt(hit.e,hit.damage);
 puff(x,floorAt(x,z)+1.5,z,0x8feaff,42);addRing(x,z,radius,0x83e6ff,.65);rings[rings.length-1].blast=true;
 for(let i=0;i<20;i++){const a=i*Math.PI/10,m=box(root,x,floorAt(x,z)+.5,z,.16,.16,.38,i%2?0xeaffff:0x35baff,true);m.rotation.y=a;effects.push({m,vx:Math.sin(a)*7,vy:rr(1,4),vz:Math.cos(a)*7,life:.65,fade:true})}
}
function fireQi(){const target=qiTarget();if(!target){cancelQi();notify('No enemy in Mason’s sight. Hold L again when a target is visible.');return}qi.target=target;qi.phase='firing';qi.age=0;player.face=Math.atan2(target.x-player.x,target.z-player.z);const distance=Math.hypot(target.x-player.x,target.z-player.z);qi.beam=new THREE.Group();qi.group.add(qi.beam);qi.beam.position.y=1.5;for(const [width,color,opacity] of [[1.5,0x167cff,.18],[.9,0x43cfff,.4],[.36,0xecffff,1]]){const m=energyMesh(qi.beam,width,width,distance,color,opacity);m.position.z=distance/2}for(let i=0;i<8;i++){const r=energyRing(qi.beam,.85);r.position.z=distance*i/8;r.userData.beamRipple=i}qi.end={x:target.x,z:target.z};qiImpact(target);shake=Math.max(shake,.45);beep(80,.65)}
function updateQi(dt){if(qi.phase==='idle')return;if(player.hp<=0||player.frozen>0||phase!=='play'){cancelQi();return}if(qi.phase==='charging'){if(!keys.KeyL){cancelQi();return}const old=qi.charge;qi.charge=Math.min(5,qi.charge+dt);qi.target=qiTarget();if(qi.target)player.face=Math.atan2(qi.target.x-player.x,qi.target.z-player.z);if(Math.floor(old)<Math.floor(qi.charge))beep(180+qi.charge*65,.13);if(qi.charge>=5)fireQi()}else{qi.age+=dt;if(qi.age>=.85){cancelQi();return}}if(!qi.group)return;const firing=qi.phase==='firing',charge=qi.charge/5;qi.group.position.set(player.x,floorAt(player.x,player.z),player.z);qi.group.rotation.y=player.face;qi.orb.position.set(firing?0:.55,1.45,firing?.9:.25);qi.orb.scale.setScalar(.35+charge*.9+Math.sin(tick*25)*.04);qi.orb.rotation.set(tick*3,tick*4,tick*2);qi.swirls.forEach((m,i)=>{m.position.y=.12+i*.06;m.rotation.x=-Math.PI/2;m.rotation.z=tick*(i%2?2:-2);m.scale.setScalar((.4+charge*.8)*(1+.12*Math.sin(tick*6+i)));m.material.opacity=firing?.2:.2+charge*.45});qi.motes.forEach((m,i)=>{const u=(tick*(.7+charge*.6)+i/24)%1,a=i*2.4+tick*3,r=(1-u)*(2.4+charge);m.position.set(Math.cos(a)*r,1.45+Math.sin(a*.8)*r*.5,.3+Math.sin(a)*r);m.scale.set(.06+charge*.08,.06+charge*.08,.1+charge*.2)});if(qi.beam){qi.beam.scale.set(1+Math.sin(tick*50)*.1,1+Math.cos(tick*45)*.1,1);for(const m of qi.beam.children)if(m.userData.beamRipple!==undefined){m.scale.setScalar(.6+((qi.age*3+m.userData.beamRipple/8)%1)*.7);m.material.opacity=.7*(1-qi.age/.85)}}}
function dropAmmo(x,z,type,value){const m=new THREE.Group();root.add(m);if(type==='arrow'){for(const offset of[-.2,0,.2]){box(m,offset,.15,0,.07,.07,.85,0xb88852);box(m,offset,.15,.48,.18,.12,.22,0xd6efff,true);box(m,offset,.15,-.35,.2,.06,.18,0xc7e4ee)}}else{box(m,0,.2,0,.5,.5,.5,0xff6b25,true);box(m,0,.35,0,.23,.5,.23,0xffe49c,true)}m.position.set(x,floorAt(x,z)+.6,z);const item={m,x,z,type,value};loot.push(item);return item}
function collectAmmo(item,hero){if(item.gone||hero.hp<=0||hero.ammo>=ammoCapacity()||item.type!==(hero===player?'arrow':'fireball'))return false;const n=Math.min(ammoCapacity()-hero.ammo,item.value);hero.ammo+=n;item.value-=n;if(item.value===0){item.gone=true;root.remove(item.m)}notify(hero.name+' • +'+n+' '+(item.type==='arrow'?'ARROWS':'FIREBALLS')+' • '+hero.ammo+'/'+ammoCapacity());beep(600,.08);return true}
function updateLoot(dt){for(const l of loot){const ammo=l.type==='arrow'||l.type==='fireball',h=ammo?(l.type==='arrow'?player:jayden):nearestHero(l.x,l.z);if(!h)continue;const dis=Math.hypot(l.x-h.x,l.z-h.z),wanted=h.hp>0&&(ammo?h.ammo<ammoCapacity():l.type==='gem'||players.some(p=>p.hp<p.max));if(wanted&&dis<2.4&&dis>.01&&lineClear(l.x,l.z,h.x,h.z)){const travel=Math.min(dis,6*dt);l.x+=(h.x-l.x)/dis*travel;l.z+=(h.z-l.z)/dis*travel}l.m.position.set(l.x,floorAt(l.x,l.z)+.6+Math.sin(tick*4)*.12,l.z);l.m.rotation.y=tick*.5;if(wanted&&dis<.85&&lineClear(l.x,l.z,h.x,h.z)){if(ammo)collectAmmo(l,h);else if(l.type==='gem'){gems+=l.value;l.gone=true;root.remove(l.m)}else eatFood(l,h)}}loot=loot.filter(l=>!l.gone)}

function inputDirection(hero=player){const p2=hero===jayden,right=(keys[p2?'ArrowRight':'KeyD']?1:0)-(keys[p2?'ArrowLeft':'KeyA']?1:0),down=(keys[p2?'ArrowDown':'KeyS']?1:0)-(keys[p2?'ArrowUp':'KeyW']?1:0);let x=(right+down)*.7071,z=(down-right)*.7071;const len=Math.hypot(x,z);if(len){x/=len;z/=len}return{x,z}}
function animateActor(e,dt,moving){const m=e.model;m.group.position.set(e.x,floorAt(e.x,e.z),e.z);const last=e.lastVisualPosition,travel=last?Math.hypot(e.x-last.x,e.z-last.z):0;moving=moving&&travel>.0001;e.lastVisualPosition={x:e.x,z:e.z};const turn=Math.atan2(Math.sin(e.face-m.group.rotation.y),Math.cos(e.face-m.group.rotation.y));m.group.rotation.y+=turn*(dt?1-Math.exp(-dt*18):1);e.step+=moving?travel*1.7:dt*1.5;e.hitPose=Math.max(0,(e.hitPose||0)-dt);e.shootPose=Math.max(0,(e.shootPose||0)-dt);m.leg1.rotation.x=moving?Math.sin(e.step)*.65:0;m.leg2.rotation.x=-m.leg1.rotation.x;m.arm.rotation.x=-m.leg1.rotation.x;m.offArm.rotation.x=m.leg1.rotation.x;m.rig.position.y=moving?Math.abs(Math.sin(e.step))*.07:Math.sin(tick*2)*.025;m.rig.rotation.z=e.hitPose>0?Math.sin(e.hitPose/.2*Math.PI)*.17:0;m.rig.rotation.y=0;if(!e.isHero&&!e.boss&&e.wind>0){m.rig.rotation.x=-.12;m.arm.rotation.x=-1.4;m.offArm.rotation.x=-1.4}else if(!e.isHero)m.rig.rotation.x=0;if(e.type==='creeper'){const pulse=e.wind>0?1+.12*Math.sin(tick*35):1;m.rig.scale.set(pulse,pulse,pulse);if(m.rig.userData.rearFeet)m.rig.userData.rearFeet.forEach((f,i)=>f.rotation.x=(i?1:-1)*m.leg1.rotation.x)}if(e.boss){e.attackAge+=dt;m.hand.rotation.x=e.type==='golem'&&e.attackAge<1.45?(-.4+2.7*Math.sin(Math.min(1,e.attackAge/.9)*Math.PI*.65)):-.15;if(e.type==='king'&&e.jump)m.group.position.y+=Math.sin(Math.min(1,e.jump.age/e.jump.duration)*Math.PI)*6;m.arm.rotation.x=e.attackAge<1?-1.2:0}if(eliteMobs[e.type]){e.attackAge+=dt;const meleeType=['vindicator','armored_zombie','royal_guard'].includes(e.type);m.hand.rotation.x=meleeType&&e.attackAge<1?-.3-1.8*Math.sin(Math.min(1,e.attackAge)*Math.PI):e.wind>0?-1.2:0;m.rig.rotation.y=meleeType&&e.attackAge<1?Math.sin(e.attackAge*Math.PI)*.3:0}if(e.isHero){e.ice.visible=e.frozen>0;const strike=e.swing>0?Math.sin((1-e.swing/.23)*Math.PI):0,side=(e.combo||0)%2?1:-1;m.rig.rotation.y=strike*.42*side;m.rig.position.z=strike*.2;m.hand.rotation.x=-.15-strike*1.6;m.hand.rotation.z=strike*1.1*side;m.offArm.rotation.x=-strike*1.3;m.arm.rotation.x=e.shootPose>0?-1.35:m.arm.rotation.x;if(e.shootPose>0){m.hand.rotation.x=-1.2+e.shootPose*.8;m.rig.rotation.x=-.06}m.rig.rotation.x=e.hp<=0?Math.PI/2:e.roll>0?(1-e.roll/.28)*Math.PI*2:0;m.hand.visible=!(e===player&&qi.phase!=='idle');m.arm.rotation.z=0;m.offArm.rotation.z=0;if(e===player&&qi.phase!=='idle'){const firing=qi.phase==='firing';m.rig.rotation.y=firing?0:-.35;m.arm.rotation.x=firing?-Math.PI/2:-.7;m.offArm.rotation.x=firing?-Math.PI/2:-.9;m.arm.rotation.z=firing?-.2:-.65;m.offArm.rotation.z=firing?.2:.65;m.rig.position.y-=.14}m.group.visible=!(e.inv>0&&Math.floor(tick*14)%2)}const jump=e.jump?Math.sin(Math.min(1,e.jump.age/e.jump.duration)*Math.PI)*6:0;m.shadow.position.set(e.x,floorAt(e.x,e.z)+.025,e.z);m.shadow.scale.set(m.scale*(1.05+jump*.07),m.scale*.65*(1+jump*.07),1);m.shadow.material.opacity=.3/(1+jump*.18);m.shadow.visible=!e.dead;}
function nearestHero(x,z){return players.filter(h=>h.hp>0).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0]||player}
function bossDamage(e,damage){return e.boss?Math.round(damage*rules().attack):damage}
function areaHit(e,x,z,r,damage,slow=0){if(e.dead||phase!=='play')return;for(const h of players)if(h.hp>0&&Math.hypot(h.x-x,h.z-z)<r&&lineClear(x,z,h.x,h.z)){const vulnerable=h.inv<=0&&h.roll<=0;takeDamage(bossDamage(e,damage),h);if(vulnerable)h.slow=Math.max(h.slow,slow)}}
function magicBolt(e,a,kind){const b=projectile(e,e.x,e.z,a,true,kind==='snow'?10:9);b.kind=kind;b.damage=bossDamage(e,kind==='snow'?22:25);b.freeze=kind==='snow'?3:0;b.hitRadius=.6;b.trail=0;b.m.scale.setScalar(kind==='snow'?.8:.7);b.m.material=mat(kind==='snow'?0xe5f8ff:0xff7830,true);return b}
function makeWave(e,x,z,maxRadius,strength,color){const geometry=new THREE.RingGeometry(.82,1,64),material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,side:THREE.DoubleSide}),m=new THREE.Mesh(geometry,material);m.rotation.x=-Math.PI/2;m.position.set(x,floorAt(x,z)+.16,z);m.userData.shockwave=true;root.add(m);shockwaves.push({e,x,z,maxRadius,strength,m,radius:0,hit:new Set()})}
function waveDamage(strength,distance){return Math.round(strength/Math.max(1,distance))}
function updateWaves(dt){
 for(const w of shockwaves){const previous=w.radius;w.radius+=dt*15;w.m.scale.setScalar(w.radius);w.m.material.opacity=.95*(1-w.radius/w.maxRadius);
  for(const h of players){const d=Math.hypot(h.x-w.x,h.z-w.z);if(!w.e.dead&&h.hp>0&&!w.hit.has(h)&&d<=w.radius+.5&&d>=previous-.8&&d<w.maxRadius){w.hit.add(h);if(w.e.type!=='king'||Math.hypot(h.x-cage.x,h.z-cage.z)<12)takeDamage(bossDamage(w.e,waveDamage(w.strength,d)),h)}}
  if(w.radius>=w.maxRadius||w.e.dead){root.remove(w.m);w.m.geometry.dispose();w.m.material.dispose();w.gone=true}
 }shockwaves=shockwaves.filter(w=>!w.gone);
}
function bossSkill(e,target){
 if(e.dead||phase!=='play')return;const x=target.x,z=target.z;e.face=Math.atan2(x-e.x,z-e.z);e.skillUses=(e.skillUses||0)+1;e.attackAge=0;e.wind=1.15;e.cd=e.type==='frost'?4.2:3.1;
 if(e.type==='ancient'){
  notify('Thornwood Ancient • ERUPTING ROOTS!');
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3,tx=x+Math.sin(a)*1.8,tz=z+Math.cos(a)*1.8;addRing(tx,tz,2.2,0xa5eb69,.9,()=>{if(e.dead)return;areaHit(e,tx,tz,2.2,24,2);for(let j=0;j<8;j++){const a=j*Math.PI/4,m=box(root,tx+Math.cos(a)*1.4,.3,tz+Math.sin(a)*1.4,.35,3,.35,0x8a6238);effects.push({m,vx:0,vy:4,vz:0,life:1.3})}puff(tx,1,tz,0xa4cf59,20)})}
 }else if(e.type==='golem'){
  notify('Redstone Golem • HAMMER SMASH!');const tx=e.x+Math.sin(e.face)*3.4,tz=e.z+Math.cos(e.face)*3.4;
  addRing(tx,tz,3.1,0xff9d43,.9,()=>{if(e.dead)return;areaHit(e,tx,tz,3.1,48);shake=.65;makeWave(e,tx,tz,9,40,0xffb25d);puff(tx,1,tz,0xc79569,45)});
 }else if(e.type==='wraith'){
  notify('Marsh Wraith • WILDFIRE BURST!');
  addRing(e.x,e.z,2,0xff9849,.7,()=>{if(e.dead)return;for(let i=0;i<16;i++)magicBolt(e,i*Math.PI/8+e.face,'fire');puff(e.x,2,e.z,0xffa340,28)});
 }else if(e.type==='frost'){
  notify('Frost Guardian • SNOWBALL BLIZZARD — hits freeze you for 3 seconds!');
  addRing(e.x,e.z,2,0xd5f5ff,.85,()=>{if(e.dead)return;for(let i=0;i<10;i++)magicBolt(e,i*Math.PI/5+e.face,'snow');for(const h of players.filter(h=>h.hp>0))magicBolt(e,Math.atan2(h.x-e.x,h.z-e.z),'snow');puff(e.x,2,e.z,0xc3edff,22)});
 }else{
  notify('Bully of the World • LEAP & SHOCKWAVE — run away from the landing!');
  let dx=x-cage.x,dz=z-cage.z,d=Math.hypot(dx,dz);const radius=clamp(d,3.5,7);if(d<.01){dx=1;dz=0;d=1}const tx=cage.x+dx/d*radius,tz=cage.z+dz/d*radius;
  e.jump={fromX:e.x,fromZ:e.z,x:tx,z:tz,age:0,duration:1.25};e.wind=1.25;e.cd=3.8;addRing(tx,tz,2,0xffb65b,1.25);
 }
}
function chase(e,dt,target=player){let tx=target.x,tz=target.z;const t=terrain(e.x,e.z);if(!lineClear(e.x,e.z,tx,tz)&&t){let best=flow[t.z*NX+t.x],chosen=null;for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const b=cell(t.x+dx,t.z+dz);if(!b)continue;const v=flow[b.z*NX+b.x];if(v>=0&&(best<0||v<best)){best=v;chosen=b}}if(chosen){tx=(chosen.x+.5)*S;tz=(chosen.z+.5)*S}}const a=Math.atan2(tx-e.x,tz-e.z);e.face=a;move(e,Math.sin(a)*e.speed*dt,Math.cos(a)*e.speed*dt)}
// Summoning uses its own timer, so ordinary boss attack windups cannot suppress it.
const summonKinds=Object.fromEntries(['ancient','golem','wraith','frost','king'].map((type,i)=>[type,mobPools[i]]));
function summonMobs(boss){
 if(boss.dead||phase!=='play')return 0;
 const room=rules().minionCap-mobs.filter(e=>e.summoner===boss&&!e.dead).length-(boss.summonPending||0),count=rules().summonCount,spots=[],center=boss.type==='king'?cage:boss.home;
 if(room<count)return 0;
 for(let i=0;i<count;i++)for(let attempt=0;attempt<300;attempt++){
  const a=rr(0,Math.PI*2),r=rr(2,boss.type==='king'?10.5:14),x=center.x+Math.cos(a)*r,z=center.z+Math.sin(a)*r;
  if(!passable(x,z,floorAt(x,z),.4)||terrain(x,z)?.b!==terrain(center.x,center.z)?.b||!lineClear(boss.x,boss.z,x,z)||players.some(h=>h.hp>0&&Math.hypot(x-h.x,z-h.z)<2)||spots.some(p=>Math.hypot(x-p.x,z-p.z)<1.05)||mobs.some(e=>!e.dead&&Math.hypot(x-e.x,z-e.z)<1.05))continue;
  spots.push({x,z});break;
 }
 if(spots.length!==count)return 0;
 const color=[0xa5eb69,0xff7953,0xd287ff,0xa5edff,0xffb65b][boss.index];
 if(spots.length){notify(bossNames[boss.index]+' • SUMMONING '+spots.length+' MINIONS!');boss.summonCasts=(boss.summonCasts||0)+1;beep(140,.3)}
 for(const [i,p] of spots.entries()){boss.summonPending++;addRing(p.x,p.z,1.1,color,.9,()=>{boss.summonPending=Math.max(0,boss.summonPending-1);if(boss.dead||phase!=='play')return;const types=summonKinds[boss.type],e=spawn(types[i%types.length],p.x,p.z);e.summoner=boss;e.wind=.5;animateActor(e,0,false);puff(p.x,floorAt(p.x,p.z)+.4,p.z,color,16)})}
 return spots.length;
}
function updateSummons(dt){
 if(phase!=='play')return;
 for(const boss of bosses){if(boss.dead)continue;const center=boss.type==='king'?cage:boss.home,r=boss.type==='king'?12:20;if(!players.some(h=>h.hp>0&&Math.hypot(h.x-center.x,h.z-center.z)<r))continue;boss.summonTimer-=dt;if(boss.summonTimer<=0){boss.summonTimer=summonMobs(boss)?rules().summonEvery:2}}
 // Remove defeated summoned actors; drops and particles have their own lifetimes.
 mobs=mobs.filter(e=>{if(e.summoner&&e.dead){root.remove(e.model.group,e.model.shadow);e.model.group.traverse(o=>{if(o.geometry&&o.geometry!==cube)o.geometry.dispose()});e.model.shadow.geometry.dispose();e.model.shadow.material.dispose();return false}return true});
}
function eliteAttack(e,target){
 const spec=eliteMobs[e.type],x=target.x,z=target.z,a=Math.atan2(x-e.x,z-e.z);e.face=a;e.wind=.65;e.cd=spec.cool;e.skillUses=(e.skillUses||0)+1;e.attackAge=0;
 if(e.type==='geomancer'){
  addRing(x,z,2.5,0xdfa96f,.9,()=>{if(e.dead||phase!=='play')return;areaHit(e,x,z,2.5,spec.damage,1.5);for(let i=0;i<6;i++){const angle=i*Math.PI/3,m=box(root,x+Math.cos(angle)*1.6,floorAt(x,z)+.3,z+Math.sin(angle)*1.6,.5,2.8,.5,0x9a8270);effects.push({m,vx:0,vy:3,vz:0,life:.8})}});
 }else if(e.type==='pillager'||e.type==='necromancer'){
  addRing(e.x,e.z,1,e.type==='necromancer'?0x7effb6:0xffce83,.65,()=>{if(e.dead||phase!=='play')return;for(const offset of(e.type==='necromancer'?[-.22,0,.22]:[0])){const b=projectile(e,e.x,e.z,a+offset,true,e.type==='pillager'?16:10);b.damage=spec.damage;if(e.type==='necromancer'){b.kind='soul';b.m.scale.setScalar(.45);b.m.material=mat(0x7affb5,true)}}});
 }else addRing(x,z,spec.range,0xffab78,.65,()=>{if(e.dead||phase!=='play')return;areaHit(e,x,z,spec.range,spec.damage);puff(x,floorAt(x,z)+.5,z,0xffc390,7)});
}
function enemyAI(e,dt){
 if(e.type==='king'){bullyAI(e,dt);return}const target=nearestHero(e.x,e.z),distance=Math.hypot(e.x-target.x,e.z-target.z);e.model.group.visible=!e.dead&&distance<40;if(e.dead||distance>26)return;
 e.cd-=dt;e.stun=Math.max(0,e.stun-dt);e.wind=Math.max(0,e.wind-dt);if(e.wind>0||(!e.boss&&e.stun>0)){animateActor(e,dt,false);return}
 if(e.boss){const inArena=Math.hypot(target.x-e.home.x,target.z-e.home.z)<20;if(!inArena){if(Math.hypot(e.x-e.home.x,e.z-e.home.z)>.3)chase(e,dt,e.home);animateActor(e,dt,true);return}if(distance>(e.type==='golem'?3.7:6)&&Math.hypot(e.x-e.home.x,e.z-e.home.z)<7){chase(e,dt,target);animateActor(e,dt,true)}else animateActor(e,dt,false);if(e.cd<=0)bossSkill(e,target);return}
 if(eliteMobs[e.type]){const spec=eliteMobs[e.type];if(distance>spec.range||!lineClear(e.x,e.z,target.x,target.z)){chase(e,dt,target);animateActor(e,dt,true)}else{animateActor(e,dt,false);if(e.cd<=0)eliteAttack(e,target)}return}
 const range=e.type==='skeleton'?12:2.05;if(distance>range){chase(e,dt,target);animateActor(e,dt,true)}else{e.face=Math.atan2(target.x-e.x,target.z-e.z);animateActor(e,dt,false);if(e.cd<=0){const x=target.x,z=target.z,a=e.face;e.wind=.52;e.cd=e.type==='skeleton'?1.75:1.25;if(e.type==='skeleton')addRing(e.x,e.z,.9,0xffc17e,.52,()=>{if(!e.dead)projectile(e,e.x,e.z,a)});else{const r=e.type==='creeper'?3.5:1.75;addRing(x,z,r,0xff845e,.52,()=>{if(e.type!=='creeper')areaHit(e,x,z,r,e.type==='brute'?24:13);if(!e.dead&&e.type==='creeper')hurt(e,9999)})}}}
}

function targetObjective(){return bosses.find(b=>!b.dead)||cage}
function openChest(t){if(t.opened)return;t.opened=true;gems+=20;gainXP(20);
 const kinds=(t.reward===0?[2,1]:t.reward===1?[0]:[0,1,2]).slice(0,rules().chestFood);for(let i=0;i<kinds.length;i++)dropFood(t.x+(i-1)*.85,t.z+1.2,kinds[i]);
 if(t.reward===1){for(const h of players)h.power+=5;notify('SHARPENING RUNE • +5 attack damage • Bread inside')}else notify('FOOD CHEST • '+kinds.map(i=>foodTypes[i].name+' +'+foodTypes[i].health).join(' · '));
 puff(t.x,1.5,t.z,0xffd276,18);beep(740,.18);
}

function update(dt){
 if(phase==='win')return;tick+=dt;if(phase==='intro'){updateIntro(dt);return}if(phase==='rescue'){updateRescue(dt);return}if(phase!=='play')return;
 animateCat(suki,dt,false);elapsed+=dt;toastTime-=dt;if(toastTime<=0)$('toast').style.opacity=0;
 for(const h of players){
  if(h.hp<=0){animateActor(h,dt,false);continue}
  for(const k of['roll','rollCd','attackCd','bowCd','inv','slow','swing','frozen','elementCd'])h[k]=Math.max(0,h[k]-dt);
  if(h.frozen>0){if(h===player)cancelQi();h.roll=0;animateActor(h,dt,false);continue}
  if(h===player&&qi.phase!=='idle'){animateActor(h,dt,false);continue}
  const d=inputDirection(h),old={x:h.x,z:h.z};
  if(h.roll>0)move(h,h.rx*23*dt,h.rz*23*dt);else{if(d.x||d.z){h.face=Math.atan2(d.x,d.z);const speed=h.speed*(h.slow>0?.55:1);move(h,d.x*speed*dt,d.z*speed*dt)}if(keys[h===jayden?'Enter':'KeyJ'])melee(h);if(phase!=='play')return;if(h===jayden?keys.Backslash:keys.KeyK)bow(h)}
  const mate=players.find(p=>p!==h&&p.hp>0);if(mate&&Math.hypot(h.x-mate.x,h.z-mate.z)>20&&Math.hypot(h.x-mate.x,h.z-mate.z)>Math.hypot(old.x-mate.x,old.z-mate.z)){h.x=old.x;h.z=old.z;if(toastTime<=0)notify('Stay together — your teammate is at the edge of the shared view.')}
  animateActor(h,dt,!!(d.x||d.z));
 }
 updateQi(dt);updateBurns(dt);updateSummons(dt);
 navTimer-=dt;if(navTimer<0){buildFlow();navTimer=.32}for(const e of mobs)enemyAI(e,dt);updateExplosions(dt);updateWaves(dt);if(phase!=='play')return;
 const expired=rings.filter(r=>{r.time-=dt;r.m.material.opacity=r.blast?Math.max(0,r.time/r.max)*.85:.25+.4*Math.abs(Math.sin(r.time*12));if(r.blast)r.m.scale.setScalar(.2+(1-r.time/r.max));return r.time<=0});rings=rings.filter(r=>r.time>0);for(const r of expired){if(r.action)r.action();root.remove(r.m);r.m.geometry.dispose();r.m.material.dispose()}
 if(phase!=='play')return;
 for(const b of bolts){b.life-=dt;const y=floorAt(b.x,b.z),oldX=b.x,oldZ=b.z;b.x+=b.vx*dt;b.z+=b.vz*dt;if(!lineClear(oldX,oldZ,b.x,b.z))b.life=0;
  if(b.life>0&&b.enemy){const h=players.find(h=>h.hp>0&&Math.hypot(b.x-h.x,b.z-h.z)<(b.hitRadius||.3)+h.r);if(h){const vulnerable=h.inv<=0&&h.roll<=0;takeDamage(b.damage,h);if(vulnerable&&b.freeze){h.frozen=b.freeze;h.roll=0;puff(h.x,1.2,h.z,0xbbeaff,22);notify(h.name+' is frozen for 3 seconds!')}b.life=0}}
  if(b.life>0&&!b.enemy){const e=mobs.find(e=>!e.dead&&Math.hypot(b.x-e.x,b.z-e.z)<e.r+(b.fire?.6:.35));if(e){hurt(e,Math.round(((b.fire?26:24)+b.powerLevel*4+(b.owner.power||0))*b.owner.damageFactor));enchantHit(b.owner,e,b.tier,b.powerLevel);if(b.fire){puff(b.x,y+1,b.z,0xff793a,18);for(const other of mobs)if(other!==e&&!other.dead&&Math.hypot(other.x-b.x,other.z-b.z)<2.3&&lineClear(b.x,b.z,other.x,other.z))hurt(other,Math.round((12+level*2+(b.owner.power||0))*b.owner.damageFactor))}b.life=0}}
  if(b.kind||b.fire||b.tier){b.trail=(b.trail||0)-dt;if(b.trail<=0){b.trail=.07;puff(b.x,y+1.15,b.z,b.kind==='snow'?0xe4faff:b.kind==='soul'?0x7affb5:b.tier?weaponColors[b.tier]:0xff923a,2)}}b.m.position.set(b.x,y+1.15,b.z);b.m.rotation.z+=dt*4;if(b.life<=0)root.remove(b.m)
 }bolts=bolts.filter(b=>b.life>0);
 for(const p of effects){p.life-=dt;p.vy-=(p.smoke?1.5:p.fade?0:12)*dt;if(p.spin){p.m.rotation.x+=dt*5;p.m.rotation.z+=dt*3}if(p.smoke)p.m.scale.multiplyScalar(1+dt*.5);if(p.fade)p.m.scale.multiplyScalar(Math.max(.1,1-dt*5));p.m.position.x+=p.vx*dt;p.m.position.y+=p.vy*dt;p.m.position.z+=p.vz*dt;if(p.life<=0)root.remove(p.m)}effects=effects.filter(p=>p.life>0);
 updateLoot(dt);

 for(const t of treasures){if(!t.opened&&players.some(h=>h.hp>0&&Math.hypot(t.x-h.x,t.z-h.z)<2))openChest(t);if(t.opened){t.openAmount=Math.min(1,t.openAmount+dt*3);t.lid.rotation.x=-t.openAmount*Math.PI*.64}}
 for(const l of lights)l.scale.y=.65+Math.sin(tick*9+l.position.x)*.15;const t=terrain(nearestHero(follow.x,follow.z).x,nearestHero(follow.x,follow.z).z);if(t&&t.b!==region){region=t.b;$('region').textContent=biomes[region];$('enemy-tier').textContent=['Zombies · Skeletons · Creepers','Vindicators · Pillagers','Armored Zombies · Geomancers','Necromancers · Royal Guards','Royal Guard elite battalions'][region]}
 miniTimer-=dt;if(miniTimer<=0){miniTimer=.18;drawMap()}hud();
}

function drawMap(){for(const t of map)if(players.some(h=>h.hp>0&&Math.hypot((t.x+.5)*S-h.x,(t.z+.5)*S-h.z)<h.sight))t.seen=true;}
function hud(){
 const barWidth=Math.min(100,60+(level-1)*4)+'%';$('health-track').style.width=barWidth;$('p2-health-track').style.width=barWidth;for(const h of players){const a=h.armor,id=h===player?'armor-state':'p2-armor-state';$(id).textContent=a&&a.durability>0?a.name+' ARMOR · '+Math.round(a.reduction*100)+'% DEF · '+a.durability+'/'+a.max:'NO ARMOR · Defeat a boss'}$('progression').textContent='XP '+xp+' / '+xpNeeded()+' · '+(level<3?'Lv 3: Fire':level<5?'Lv 5: Lightning':level<8?'Lv 8: Explosive':'All elements unlocked');if(jayden)$('p2-weapon').textContent=weaponNames[weaponTier()];
 $('ammo').textContent=player.ammo+' / '+ammoCapacity()+' ARROWS';$('qi-fill').style.width=(qi.phase==='charging'?qi.charge/5*100:qi.phase==='firing'?100:0)+'%';$('qi-state').textContent=qi.phase==='charging'?'CHARGING '+qi.charge.toFixed(1)+' / 5s':qi.phase==='firing'?'KAMEHAMEHA!':'HOLD L · 5 SECOND CHARGE';$('qi-target').textContent=qi.phase==='charging'?(qi.target?'LOCK: '+enemyName(qi.target):'NO VISIBLE TARGET')+' · TAKE 50% MORE DAMAGE':'Release to cancel · Hit interrupts';if(jayden)$('p2-ammo').textContent=jayden.ammo+' / '+ammoCapacity()+' FIREBALLS';
 $('p2-panel').hidden=!coOp;if(jayden){$('p2-health').style.width=(100*jayden.hp/jayden.max)+'%';$('p2-hp').textContent=jayden.hp>0?Math.ceil(jayden.hp)+' / '+jayden.max:'NEEDS FOOD';$('p2-fire').textContent=jayden.ammo===0?'EMPTY':jayden.bowCd>0?jayden.bowCd.toFixed(1)+'s':'READY';$('p2-roll').textContent=jayden.rollCd>0?jayden.rollCd.toFixed(1)+'s':'READY'}$('mason-name').textContent=player.hp>0?'MASON':'MASON · NEEDS FOOD';$('health').style.width=(100*player.hp/player.max)+'%';$('hptext').textContent=Math.ceil(player.hp)+' / '+player.max;$('xp').style.width=(100*xp/xpNeeded())+'%';$('level').textContent='LEVEL '+level;$('gems').textContent='◆ '+gems;$('weapon').textContent=weaponNames[weaponTier()];$('roll').textContent=player.rollCd>0?player.rollCd.toFixed(1)+'s':'READY';$('mason-state').textContent=player.frozen>0?'FROZEN '+player.frozen.toFixed(1)+'s':'+30% damage · 16m sight';if(jayden)$('jayden-state').textContent=jayden.frozen>0?'FROZEN '+jayden.frozen.toFixed(1)+'s':'Faster movement · 20m sight';$('game-status').textContent=rules().name+' · '+(coOp?'Mason + Jayden':'Mason')+' · '+kills+' defeated · Food restores health';const objective=targetObjective();$('objective').textContent=seals<4?'Defeat '+bossNames[seals]+' · '+seals+'/4 bridges':!bosses[4].dead?'Find and defeat the Bully of the World':cage.broken?'Suki is free!':'Break Suki’s cage · '+(coOp?'J / Enter':'J')+' to strike';const boss=mobs.find(e=>e.boss&&!e.dead&&Math.hypot(e.x-player.x,e.z-player.z)<23);$('boss').style.display=boss?'block':'none';if(boss){$('bossname').textContent=bossNames[boss.index];$('bossfill').style.width=(100*boss.hp/boss.max)+'%'}$('marker').textContent='◆ '+Math.floor(Math.hypot(objective.x-player.x,objective.z-player.z))+'m';
}
function pause(){cancelQi();keys={};if(phase==='play'){phase='paused';overlay('PAUSED','Find the Bully of the World, defeat him, and break the cage to rescue Suki.','RESUME')}else if(phase==='paused'){phase='play';$('overlay').style.display='none'}}
let firstAdventure=true;
function newSeed(){return(seed+0x9e3779b9)>>>0}
$('go').onclick=()=>{beep(440);if(phase==='paused'){pause();return}if(phase==='dead'){startGame(seed);notify('Fresh attempt • Find food to restore health.');return}if(phase==='mode'){startGame(firstAdventure?seed:newSeed());firstAdventure=false;beginIntro()}else chooseMode()};
$('pause-button').onclick=pause;
$('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'SOUND ON':'SOUND OFF'};
let restartPhase='play';
$('restart').onclick=()=>{if(['restart','intro','rescue','win'].includes(phase))return;cancelQi();restartPhase=phase;phase='restart';overlay('GENERATE A NEW WORLD?','This starts a new adventure and resets your current run.','GENERATE WORLD');$('cancel').hidden=false};
$('cancel').onclick=()=>{$('cancel').hidden=true;phase=restartPhase;if(phase==='play')$('overlay').style.display='none';else if(phase==='dead')overlay('YOU FELL IN BATTLE','Try this world again with a fresh start.','TRY AGAIN');else overlay('PAUSED','Continue your adventure.','RESUME')};
$('go').addEventListener('click',()=>{$('cancel').hidden=true;keys={};$('go').blur()});
function makeCat(x,z){
 const group=new THREE.Group();root.add(group);
 box(group,0,.55,0,.55,.52,.95,0xe7a556);box(group,0,.96,.38,.66,.6,.56,0xf3bd76);
 box(group,0,.78,.69,.4,.2,.10,0xffeedb);
 for(const a of[-1,1]){box(group,a*.22,1.34,.35,.2,.3,.25,0xe7a556);box(group,a*.22,1.35,.49,.1,.16,.03,0xf7b4b2);box(group,a*.15,1.01,.673,.1,.14,.025,0x243b28);box(group,a*.19,.18,-.3,.15,.35,.2,0xffeedb);box(group,a*.19,.18,.3,.15,.35,.2,0xffeedb)}
 box(group,0,.91,.708,.09,.07,.025,0xe58192);
 const tail=box(group,0,.95,-.65,.14,.85,.16,0xe7a556);tail.rotation.x=-.32;
 box(group,0,.67,.33,.57,.12,.2,0x65d6c2);box(group,0,.63,.46,.12,.15,.07,0xffd65a,true);
 return {x,z,group,tail,step:0};
}
function animateCat(cat,dt,happy){if(!cat)return;cat.step+=dt;cat.group.position.set(cat.x,floorAt(cat.x,cat.z)+(happy?Math.abs(Math.sin(cat.step*8))*.55:Math.sin(cat.step*3)*.035),cat.z);cat.tail.rotation.z=Math.sin(cat.step*4)*.35;}
function buildCage(){
 const p=pointWorld(5),group=new THREE.Group();root.add(group);group.position.set(p.x,floorAt(p.x,p.z),p.z);
 cage={...p,group,hp:90,max:90,unlocked:false,broken:false};
 box(group,0,.12,0,3.1,.24,3.1,0x3d414c);
 const bars=new THREE.Group();group.add(bars);cage.bars=bars;
 for(const a of[-1.4,1.4]){for(const b of[-1.4,-.7,0,.7,1.4]){box(bars,a,1.55,b,.11,2.9,.11,0xabb5bd);box(bars,b,1.55,a,.11,2.9,.11,0xabb5bd)}}
 for(const y of[.35,2.8]){for(const a of[-1.4,1.4]){box(bars,a,y,0,.16,.18,2.95,0x727b8a);box(bars,0,y,a,2.95,.18,.16,0x727b8a)}}
 for(const a of[-1.4,-.7,0,.7,1.4])box(bars,a,3,0,.13,.13,2.9,0xabb5bd);
 cage.lock=box(bars,0,1.5,1.49,.48,.55,.17,0xd44c55,true);
 suki=makeCat(p.x,p.z);animateCat(suki,0,false);
}
function showSpeech(speaker,line,button){$('speaker').textContent=speaker;$('story-line').textContent=line;$('story-next').textContent=button;$('story-dialog').hidden=false;$('story-next').hidden=!button;}
function beginIntro(){
 phase='intro';storyStep=0;storyTime=0;keys={};$('overlay').style.display='none';$('ui').style.display='none';$('victory').hidden=true;
 const p=pointWorld(0);player.x=p.x;player.z=p.z;player.face=Math.PI/2;animateActor(player,0,false);
 introBully={x:p.x+11,z:p.z+1,face:-Math.PI/2,step:0,model:makeActor('king')};introBully.model.group.visible=false;
 playBall=box(root,p.x+2,.6,p.z+2,.32,.32,.32,0xff6d85,true);
 suki.x=p.x+2;suki.z=p.z;animateCat(suki,0,true);
 showSpeech(coOp?'Mason and Jayden':'Mason','You defeated the Wicked Witch and now you are finally a real cat','CONTINUE');
}
function advanceIntro(){
 if(phase!=='intro')return;storyStep++;storyTime=0;beep(360);
 if(storyStep===1){introBully.model.group.visible=true;playBall.visible=false;showSpeech('Bully of the World','This cat is mine','CONTINUE')}
 else if(storyStep===2){showSpeech('Suki has been taken!','The Bully grabs Suki and carries her away across the realm.','CONTINUE')}
 else if(storyStep===3){introBully.model.group.visible=false;suki.x=cage.x;suki.z=cage.z;animateCat(suki,0,false);showSpeech(coOp?'Mason and Jayden':'Mason',coOp?'We must work together to defeat the Bully and rescue Suki':'I must defeat this Bully and rescue Suki!','BEGIN ADVENTURE')}
 else {root.remove(introBully.model.group);root.remove(introBully.model.shadow);introBully.model.shadow.geometry.dispose();introBully.model.shadow.material.dispose();root.remove(playBall);introBully=null;playBall=null;suki.x=cage.x;suki.z=cage.z;animateCat(suki,0,false);phase='play';keys={};$('story-dialog').hidden=true;$('ui').style.display='block';notify('Defeat the four bridge guardians, find the Bully, then break Suki’s cage.');hud();drawMap()}
}
function updateIntro(dt){
 storyTime+=dt;for(const h of players)animateActor(h,dt,false);player.model.arm.rotation.x=-.7+Math.sin(tick*4)*.3;
 if(storyStep===0){suki.x=player.x+2+Math.sin(tick*1.8)*.75;suki.z=player.z+Math.cos(tick*1.8)*1.2;suki.group.rotation.y=tick*1.8;animateCat(suki,dt,true);playBall.position.set(player.x+2+Math.sin(tick*1.8+.8),floorAt(player.x,player.z)+.24,player.z+Math.cos(tick*1.8+.8)*1.4)}
 else if(storyStep===1){const u=Math.min(1,storyTime/1.4);introBully.x=player.x+11-u*8;introBully.z=player.z+1;introBully.face=-Math.PI/2;animateActor(introBully,dt,u<1);suki.x=player.x+2;suki.z=player.z;animateCat(suki,dt,false)}
 else if(storyStep===2){introBully.x=player.x+3+Math.min(storyTime/2.3,1)*18;introBully.z=player.z+1;introBully.face=Math.PI/2;animateActor(introBully,dt,true);suki.x=introBully.x;suki.z=introBully.z+1;animateCat(suki,dt,false);suki.group.position.y=floorAt(introBully.x,introBully.z)+2.7;}
}
function clearAttacks(){cancelQi();for(const b of bosses)b.summonPending=0;for(const b of blasts)root.remove(b.mesh);blasts=[];for(const w of shockwaves){root.remove(w.m);w.m.geometry.dispose();w.m.material.dispose()}shockwaves=[];for(const b of bolts)root.remove(b.m);bolts=[];for(const r of rings){root.remove(r.m);r.m.geometry.dispose();r.m.material.dispose()}rings=[];}
function bullyAI(e,dt){
 const target=nearestHero(e.x,e.z);e.model.group.visible=!e.dead&&Math.hypot(e.x-target.x,e.z-target.z)<40;if(e.dead)return;e.cd=Math.max(0,e.cd-dt);
 if(e.jump){const j=e.jump;j.age+=dt;const u=Math.min(1,j.age/j.duration);e.x=j.fromX+(j.x-j.fromX)*u;e.z=j.fromZ+(j.z-j.fromZ)*u;animateActor(e,dt,false);if(u>=1){e.jump=null;e.wind=0;e.patrolAngle=Math.atan2(e.z-cage.z,e.x-cage.x);e.model.group.position.y=floorAt(e.x,e.z);shake=.8;makeWave(e,e.x,e.z,12,78,0xffbc6d);puff(e.x,.8,e.z,0xc0986b,55)}return}
 e.patrolAngle=(e.patrolAngle??0)+dt*.43;const tx=cage.x+Math.cos(e.patrolAngle)*5.5,tz=cage.z+Math.sin(e.patrolAngle)*5.5;e.x+=(tx-e.x)*Math.min(1,dt*4);e.z+=(tz-e.z)*Math.min(1,dt*4);e.face=-e.patrolAngle;animateActor(e,dt,true);
 if(Math.hypot(target.x-cage.x,target.z-cage.z)<12&&e.cd<=0)bossSkill(e,target);
}

function strikeCage(w,hero=player){
 if(!cage||cage.broken)return;const dx=cage.x-hero.x,dz=cage.z-hero.z,d=Math.hypot(dx,dz);
 if(d>w.reach+1.3)return;
 const a=Math.atan2(dx,dz);if(Math.abs(Math.atan2(Math.sin(a-hero.face),Math.cos(a-hero.face)))>w.arc)return;
 const approach=Math.max(0,d-1.9)/Math.max(d,.01);if(!lineClear(hero.x,hero.z,hero.x+dx*approach,hero.z+dz*approach))return;
 if(!cage.unlocked){notify('Defeat the Bully first to break Suki’s cage.');return}
 cage.hp=Math.max(0,cage.hp-Math.round((w.damage+level*4+hero.power)*hero.damageFactor));cage.lock.material=mat(0x6bf5be,true);puff(cage.x,floorAt(cage.x,cage.z)+1.5,cage.z,0xb9ced7,12);beep(750,.1);
 if(cage.hp===0)beginRescue(hero);else notify('Keep striking the cage with your weapon! '+Math.ceil(cage.hp/cage.max*100)+'% remains');
}
let rescuer;
function beginRescue(hero=player){
 rescuer=hero;for(const h of players){if(h.hp<=0){h.x=hero.x-1;h.z=hero.z}h.inv=0;h.model.group.visible=true}
 cage.broken=true;cage.group.remove(cage.bars);clearAttacks();phase='rescue';keys={};rescueTime=0;fireworkTimer=0;rescueStart={x:suki.x,z:suki.z};player.inv=0;player.model.group.visible=true;
 $('ui').style.display='none';$('story-dialog').hidden=true;
 puff(cage.x,floorAt(cage.x,cage.z)+1.5,cage.z,0xc6d6dd,30);
}
function firework(){
 const x=cage.x+rr(-7,7),z=cage.z+rr(-6,5),y=rr(7,12),col=[0xffd568,0xff649c,0x79ffdd,0x9c9fff,0xffffff][Math.floor(rr(0,5))];
 for(let i=0;i<30;i++){const a=i/30*Math.PI*2,m=box(root,x,y,z,.16,.16,.16,col,true);celebration.push({m,vx:Math.cos(a)*rr(2,4),vy:Math.sin(a)*rr(2,4),vz:rr(-1.7,1.7),life:2.5})}beep(440+rr(0,400),.18);
}
function updateRescue(dt){
 if(rescueTime===0)clearAttacks();rescueTime+=dt;
 for(const p of effects){p.life-=dt;p.vy-=(p.smoke?1.5:p.fade?0:12)*dt;if(p.spin){p.m.rotation.x+=dt*5;p.m.rotation.z+=dt*3}if(p.smoke)p.m.scale.multiplyScalar(1+dt*.5);if(p.fade)p.m.scale.multiplyScalar(Math.max(.1,1-dt*5));p.m.position.x+=p.vx*dt;p.m.position.y+=p.vy*dt;p.m.position.z+=p.vz*dt;if(p.life<=0)root.remove(p.m)}effects=effects.filter(p=>p.life>0);
 const u=Math.min(1,rescueTime/1.5),targetX=rescuer.x+Math.sin(rescuer.face)*1.1,targetZ=rescuer.z+Math.cos(rescuer.face)*1.1;
 suki.x=rescueStart.x+(targetX-rescueStart.x)*u;suki.z=rescueStart.z+(targetZ-rescueStart.z)*u;animateCat(suki,dt,u>=1);suki.group.position.y+=Math.sin(u*Math.PI)*2;suki.group.rotation.y=Math.atan2(rescuer.x-suki.x,rescuer.z-suki.z);for(const h of players)animateActor(h,dt,false);
 if(rescueTime>=1.5)showSpeech(coOp?'Mason and Jayden':'Mason','Finally you are back, Suki!','');
 if(rescueTime>=2.3){fireworkTimer-=dt;if(fireworkTimer<=0){fireworkTimer=.55;firework()}}
 for(const p of celebration){p.life-=dt;p.vy-=1.5*dt;p.m.position.x+=p.vx*dt;p.m.position.y+=p.vy*dt;p.m.position.z+=p.vz*dt;if(p.life<=0)root.remove(p.m)}celebration=celebration.filter(p=>p.life>0);
 if(rescueTime>=7){phase='win';$('victory').hidden=false;$('victory-stats').textContent=coOp?'Mason, Jayden and Suki are together again. The adventure is complete.':'Mason and Suki are together again. The adventure is complete.';keys={};}
}
$('story-next').onclick=advanceIntro;
function chooseMode(){phase='mode';setMode(coOp);$('solo-mode').disabled=Boolean(options.online);keys={};$('ui').style.display='none';$('story-dialog').hidden=true;$('victory').hidden=true;$('mode-choice').hidden=false;$('difficulty-choice').hidden=false;setDifficulty(difficulty);overlay('RESCUE SUKI','Five realms. Four guarded bridges. One friend to bring home. Choose your adventure.','BEGIN STORY')}
function setMode(value){if(options.online&&!value)return;coOp=value;$('solo-mode').setAttribute('aria-pressed',String(!value));$('coop-mode').setAttribute('aria-pressed',String(value));$('jayden-controls').hidden=!value}
$('solo-mode').onclick=()=>setMode(false);$('coop-mode').onclick=()=>setMode(true);
function setDifficulty(value){if(phase!=='mode'||!difficulties[value])return;difficulty=value;for(const key of Object.keys(difficulties))$('difficulty-'+key).setAttribute('aria-pressed',String(key===value));const r=rules();$('difficulty-detail').textContent=Math.round(r.resistance*100)+'% boss resistance · '+Math.round(r.attack*100)+'% attack damage · '+r.summonCount+' minions every '+r.summonEvery+'s · '+Math.round(r.foodChance*100)+'% enemy food chance · '+r.xpCost+'× XP required · '+r.armorWear+'× armor wear'}
for(const key of Object.keys(difficulties))$('difficulty-'+key).onclick=()=>setDifficulty(key);
const originalBeginIntro=beginIntro;beginIntro=function(){$('mode-choice').hidden=true;$('difficulty-choice').hidden=true;originalBeginIntro()};

$('play-again').onclick=()=>{if(phase==='win')chooseMode();};
coOp=Boolean(options.coop);difficulty=options.difficulty??'normal';
if(!difficulties[difficulty])throw new Error('Unknown difficulty');
if(options.previewOnly){root=new THREE.Group();return {modelDefinition};}
startGame(options.seed??2026);chooseMode();
$('go').disabled=false;
const buttonsAllowed=new Set(['go','cancel','story-next','play-again','pause-button','restart','solo-mode','coop-mode','difficulty-easy','difficulty-normal','difficulty-hard','sound']);
const p1Keys=new Set(['KeyW','KeyA','KeyS','KeyD','KeyJ','KeyK','KeyL','KeyU','KeyN']);
const p2Keys=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Backslash','Backspace']);
function input(slot,intent){
 if(intent.type==='button') {if(slot!==0||!buttonsAllowed.has(intent.id))return false;$(intent.id).onclick?.();return true;}
 if(typeof intent.down!=='boolean'||intent.type!=='key'||!(slot===0?p1Keys:p2Keys).has(intent.code))return false;
 if(!intent.down){keys[intent.code]=false;if(intent.code==='KeyL'&&qi.phase==='charging')cancelQi();return true;}
 const repeat=keys[intent.code];keys[intent.code]=true;if(repeat)return true;
 if(phase!=='play')return true;
 if(slot===0){if(intent.code==='KeyL')beginQi();if(intent.code==='KeyJ')melee();if(intent.code==='KeyK')bow();if(intent.code==='KeyU'||intent.code==='KeyN')dodge();}
 if(slot===1&&jayden){if(intent.code==='Enter')melee(jayden);if(intent.code==='Backslash')bow(jayden);if(intent.code==='Backspace')dodge(jayden);}
 return true;
}
function modelDefinition(type){const model=makeActor(type);if(['ancient','golem','wraith','frost','king'].includes(type))equipBoss({type,model});const nodes=graph.snapshot(model.group);root.remove(model.group,model.shadow);return nodes;}
function publicState(){
 const actor=h=>({name:h.name,x:h.x,z:h.z,hp:h.hp,max:h.max,sight:h.sight,face:h.face,ammo:h.ammo,armor:h.armor});
 return {phase,seed,level,xp,gems,kills,seals,coop:coOp,difficulty,style:worldStyle,
 players:players.map(actor),bosses:bosses.map(e=>({type:e.type,x:e.x,z:e.z,hp:e.hp,max:e.max,dead:e.dead})),
 gates:gates.map(g=>({x:g.x,z:g.z,open:g.open})),cage:{x:cage.x,z:cage.z,broken:cage.broken,unlocked:cage.unlocked},
 objective:{x:targetObjective().x,z:targetObjective().z},lighting:{torches:lights.map(m=>({x:m.position.x,y:m.position.y,z:m.position.z,color:m.material.color.getHex()})),spell:qi.phase!=='idle'?{x:player.x,z:player.z,intensity:qi.phase==='firing'?65:12+qi.charge*8,color:0x49bbff}:(()=>{const bolt=bolts.find(b=>b.fire||b.kind);return bolt?{x:bolt.x,z:bolt.z,intensity:18,color:bolt.kind==='snow'?0xa9eaff:bolt.kind==='soul'?0x7affb5:0xff873b}:null;})(),flash:flashLife>0?{x:flashPosition.x,z:flashPosition.z,life:flashLife}:null},
 ui:ui.snapshot(),scene:graph.snapshot(root),events:events.splice(0),
 terrain:map.map(t=>({shade:t.shade,x:t.x,z:t.z,h:t.h,b:t.b,wet:t.wet,road:t.road,prop:t.prop,block:t.block,bridge:t.bridge,seen:t.seen}))};
}
return {input,update(dt){flashLife=Math.max(0,flashLife-dt);hitFlashTime=Math.max(0,hitFlashTime-dt);$('hit').style.opacity=hitFlashTime>0?'.35':'0';update(dt);if(players.length){follow.set(players.reduce((n,p)=>n+p.x,0)/players.length,.9,players.reduce((n,p)=>n+p.z,0)/players.length);}hud();},snapshot:publicState,release(slot){for(const key of slot===0?p1Keys:p2Keys)keys[key]=false;if(slot===0&&qi.phase==='charging')cancelQi();},
 modelDefinition,
 inspect(){return {players,mobs,bosses,map,gates,treasures,cage,phase,level,qi,hurt,takeDamage,bossSkill,eatFood,dropFood,openChest,gainXP,beginRescue,advanceIntro,startGame,passable,move,melee,bow,dodge,clearAttacks,spawn,buildFlow,pointWorld,beginQi,cancelQi,bullyAI,collectAmmo,qiDamage,qiTarget,updateQi,magicBolt,bossDamage,updateWaves,waveDamage,updateSummons,summonMobs,rules,updateExplosions,enchantHit,updateBurns,get bolts(){return bolts;},get shockwaves(){return shockwaves;},get blasts(){return blasts;},get flow(){return flow;},get loot(){return loot;},get rings(){return rings;}};}};
}

// Uniform factory export consumed by the engine package catalog.
export const createGame = createRescueGame;
