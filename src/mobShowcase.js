import { DEBUG_MOBS } from './mobDebugSession.js';
import { BREEDING_FOODS } from './animalBehaviors.js';
import { executeTrade, unlockTradesForLevel } from './villagerEconomy.js';
import { BLOCKS } from './blocks.js';

export function studioCatalog(library) {
  const existing=library.getAllMobs();
  const builtins=DEBUG_MOBS.map(id=>({id,name:id.split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(' '),description:'Native game model and behaviors',isBuiltin:true,look:{},behavior:{},skills:[],eggColors:{}}));
  return [...builtins,...existing.filter(m=>!DEBUG_MOBS.includes(m.id))];
}

// Expose scalar and structured gameplay data, never Three.js scene graphs or owners.
export function mobProperties(mob,manager,definition) {
  const seen=new WeakSet();
  function clean(v,depth=0){
    if(v===null || ['string','boolean','number'].includes(typeof v))return v;
    if(!v || typeof v!=='object' || depth>3 || v.isObject3D || v.isMaterial || v.isTexture || v.isBufferGeometry || seen.has(v))return undefined;
    seen.add(v);
    if(Array.isArray(v))return v.slice(0,64).map(x=>clean(x,depth+1)).filter(x=>x!==undefined);
    const out={};for(const [k,x] of Object.entries(v)){if(['owner','parent','rider','target','hurtMaterials','deathMaterials'].includes(k))continue;const c=clean(x,depth+1);if(c!==undefined)out[k]=c;}return out;
  }
  return {definition:definition || {id:mob.type,native:true},dimensions:{...manager.getMobDimensions(mob.type),...(mob.width?{width:mob.width,height:mob.height}:{})},breedingFoods:BREEDING_FOODS[mob.type] || [],runtime:clean(mob)};
}
const hostile=new Set('blaze magma_cube ghast piglin zombified_piglin hoglin zoglin wither_skeleton zombie skeleton creeper pillager ravager witch slime enderman shulker guardian elder_guardian drowned warden phantom vindicator evoker vex ender_dragon wither iron_golem'.split(' '));
const aquatic=new Set('cod salmon squid glow_squid dolphin axolotl guardian elder_guardian drowned'.split(' '));
function equip(s,id){s.inventory.active=id?{id,count:64,isBlock:typeof id==='number'}:null;}
function interact(s,id,mob=s.mob){equip(s,id);return s.manager.animalBehaviors.interact(mob,s.player,s.inventory);}
export function mobScenarios(type,definition=null) {
  const cases=[];
  const add=(id,label,duration,setup,check)=>cases.push({id,label,duration,setup,check});
  add('movement',aquatic.has(type)?'Swimming':'Movement / idle animation',4,s=>{if(aquatic.has(type))s.world.fluid=BLOCKS.WATER;s.mob.timer=0;},s=>s.mob.mesh.position.distanceTo(s.startPosition)>.05 || (s.mob.tiers?.[0].rotation.y || 0)!==0);
  if(hostile.has(type)||['hostile','boss'].includes(definition?.behavior?.type))add('attack','Targeting and attack',10,s=>{s.player.gamemode='survival';s.player.position.set(0,0,type==='blaze'||type==='ghast'?6:2);if(type==='iron_golem'){const enemy=s.manager.spawnMob('zombie',0,0,2);s.enemy=enemy;}},s=>s.player.health<100 || s.enemy?.health<s.enemy?.maxHealth || s.manager.customProjectiles.length>0 || s.manager.arrows.length>0);
  if(BREEDING_FOODS[type])add('breeding','Feeding, courtship and baby',8,s=>{const mate=s.manager.spawnMob(type,.8,0,0);s.player.gamemode='creative';s.mob.isTamed=mate.isTamed=true;interact(s,BREEDING_FOODS[type][0]);interact(s,BREEDING_FOODS[type][0],mate);},s=>s.manager.mobs.some(m=>m.isBaby));
  if(type==='piglin'){
    add('barter','Gold ingot admiration and barter',8,s=>{s.player.gamemode='creative';equip(s,'gold_ingot');s.actionAccepted=s.manager.hostileBehaviors.interactPiglin(s.mob,s.player,s.inventory);},s=>s.actionAccepted&&!s.mob.isBartering);
    add('gold_armor','Gold armor neutrality',3,s=>{s.player.gamemode='survival';s.inventory.armor.helmet={id:'golden_helmet'};},s=>s.player.health===100);
    add('hunt','Hoglin hunting',10,s=>{s.prey=s.manager.spawnMob('hoglin',0,0,3);s.mob.huntCooldown=0;},s=>s.prey.health<s.prey.maxHealth);
  }
  if(type==='villager')add('trade','Villager trade and inventory exchange',3,s=>{s.mob.profession='farmer';s.mob.trades=[];unlockTradesForLevel(s.mob,1);const t=s.mob.trades[0];if(t){s.inventory.hotbar=[{...t.cost,count:128},...(t.cost2?[{...t.cost2,count:128}]:[])];s.tradeResult=executeTrade(t,s.mob,s.inventory);}},s=>s.tradeResult?.success===true);
  if(['horse','donkey','pig','strider'].includes(type))add('ride','Saddle, mount and steering',5,s=>{s.player.gamemode='creative';s.mob.isTamed=true;interact(s,'saddle');interact(s,null);equip(s,type==='pig'?'carrot_on_a_stick':type==='strider'?'warped_fungus_on_a_stick':null);s.manager.game.controls={forward:true};s.player.keys={KeyW:true};},s=>s.manager.animalBehaviors.mount?.mob===s.mob && s.mob.mesh.position.distanceTo(s.startPosition)>.1);
  if(['wolf','cat','ocelot'].includes(type)){
    add('tame','Taming with food',3,s=>{s.player.gamemode='creative';for(let n=0;n<20&&!s.mob.isTamed;n++)interact(s,type==='wolf'?'bone':'cod');},s=>!!s.mob.isTamed);
    add('sit','Tamed companion sitting',2,s=>{s.mob.isTamed=true;s.mob.owner=s.player;interact(s,null);},s=>!!s.mob.isSitting);
  }
  if(type==='sheep'){
    add('shear','Shearing wool',2,s=>interact(s,'shears'),s=>!!s.mob.isSheared);
    add('dye','Dyeing wool',2,s=>interact(s,'red_dye'),s=>s.mob.woolColor==='red');
  }
  if(['cow','mooshroom'].includes(type))add('milk','Milking',2,s=>{s.player.gamemode='survival';s.actionAccepted=interact(s,'bucket');},s=>s.actionAccepted&&s.inventory.storage.some(i=>i.id==='milk_bucket'));
  if(type==='chicken')add('egg','Egg laying (timer advanced)',2,s=>{s.mob.eggTimer=.1;},s=>s.mob.eggTimer>2);
  if(type==='blaze')add('water','Water vulnerability',2,s=>{s.world.fluid=BLOCKS.WATER;},s=>s.mob.health<s.mob.maxHealth);
  if(['blaze','magma_cube','ghast','strider','wither_skeleton','zombified_piglin'].includes(type))add('lava','Lava immunity',2,s=>{s.world.fluid=BLOCKS.LAVA;},s=>s.mob.health===s.mob.maxHealth);
  for(const skill of definition?.skills || [])add(`skill_${skill}`,`Skill: ${skill}`,3,s=>{s.mob.skills=[skill];s.mob.health=s.mob.maxHealth*.5;s.mob.skillCooldown=-1;s.manager.handleMobSkills(s.mob,s.player.position,.1);},s=>s.mob.skillCooldown>0);
  add('damage','Damage flash and knockback',.6,s=>{s.hit(Math.min(1,s.mob.health*.25));s.feedbackObserved=s.mob.hurtTime>0;},s=>s.feedbackObserved);
  add('death','Death, drops and splitting',2,s=>s.hit(10000),s=>!s.manager.mobs.includes(s.mob));
  return cases;
}

export class MobShowcase {
  constructor(session,report=()=>{}) {this.session=session;this.report=report;this.running=false;this.results=[];}
  start(selection) {this.selection=selection;this.cases=mobScenarios(typeof selection==='string'?selection:'custom',typeof selection==='object'?selection:null);this.results=[];this.index=-1;this.running=true;this.next();}
  next(){this.index++;if(this.index>=this.cases.length){this.stop(false);this.report({done:true,results:this.results});return;}const s=this.session;s.reset(this.selection);s.inventory.armor={};s.player.keys={};s.startPosition=s.mob.mesh.position.clone();s.actionAccepted=false;s.feedbackObserved=false;
    // The mob must be live for a scenario to observe anything. Mob Studio freezes the mob
    // it opens so it poses on the pedestal, and `reset` can carry that flag onto the fresh
    // instance, so clear it here — per scenario, since each one spawns a new mob.
    if(s.mob)s.mob.frozen=false;
    this.elapsed=0;const c=this.cases[this.index];try{c.setup(s);}catch(e){this.finish('error',e.message);return;}this.report({id:c.id,label:c.label,index:this.index,total:this.cases.length,results:this.results});}
  tick(dt){if(!this.running)return;try{this.session.tick(dt);this.elapsed+=dt;if(this.elapsed>=this.cases[this.index].duration){const ok=this.cases[this.index].check(this.session);this.finish(ok?'observed':'not observed');}}catch(e){this.finish('error',e.message);}}
  finish(status,detail=''){const c=this.cases[this.index];this.results.push({id:c.id,label:c.label,status,detail});this.next();}
  stop(cancelled=true){this.running=false;if(this.selection)this.session.reset(this.selection);if(cancelled)this.report({cancelled:true,results:this.results});}
}
