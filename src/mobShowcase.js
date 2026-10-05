import { packEquineScenarios } from './packEquineScenarios.js';
import { witherSkeletonScenarios } from './witherSkeletonScenarios.js';
import { isSquid } from './squidBehavior.js';
import { squidScenarios } from './squidScenarios.js';
import { zombifiedScenarios } from './zombifiedPiglinScenarios.js';
import { striderScenarios } from './striderScenarios.js';
import { horseScenarios } from './horseScenarios.js';
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
const hostile=new Set('blaze magma_cube ghast piglin zombified_piglin hoglin zoglin wither_skeleton zombie skeleton creeper spider pillager ravager witch slime enderman shulker guardian elder_guardian drowned warden phantom vindicator evoker vex ender_dragon wither iron_golem'.split(' '));
const aquatic=new Set('cod salmon squid glow_squid dolphin axolotl guardian elder_guardian drowned'.split(' '));
function equip(s,id){s.inventory.active=id?{id,count:64,isBlock:typeof id==='number'}:null;}
function interact(s,id,mob=s.mob){equip(s,id);return s.manager.animalBehaviors.interact(mob,s.player,s.inventory);}
/**
 * Returned by a scenario check when the behaviour cannot be evaluated because the game
 * does not implement it yet. Distinct from `false`: a missing feature is not a mob
 * failing its own test, and reporting it as one buries the scenarios that do work.
 */
export const SCENARIO_SKIP = Symbol('scenario-skip');

/**
 * Hostile mobs whose attack AI is actually implemented, and how the scenario must reach
 * it:
 *
 *   melee    walks up and hits once the player is inside its reach
 *   ranged   needs room and time for the projectile to land
 *   anger    passive until provoked, so the scenario has to provoke it
 *   special  handled by its own timer (witch potions, slime hopping)
 */
const ATTACK_AI = {
  zombie: 'melee', drowned: 'melee', husk: 'melee',
  zombie_villager: 'melee', iron_golem: 'melee', spider: 'melee',
  skeleton: 'ranged', stray: 'ranged', blaze: 'ranged', ghast: 'ranged',
  wither_skeleton: 'melee', pillager: 'ranged',
  zombified_piglin: 'anger', zombie_pigman: 'anger',
  witch: 'special', slime: 'special', magma_cube: 'special',
  piglin: 'melee', hoglin: 'melee', zoglin: 'melee',
  phantom: 'special', guardian: 'special', elder_guardian: 'special'
};

/**
 * Reach a melee mob must be inside to land a hit. The wither skeleton and zombified
 * piglin both check `dist < 1.8`.
 */
const MELEE_REACH = 1.4;

/**
 * Is this mob`s locomotion actually running?
 *
 * A mob can be correctly stationary -- a hostile mob with no target stands still rather
 * than wandering -- so demanding travel from every mob reports working behaviour as a
 * failure. A mob that has not moved must at least show the locomotion system active: a
 * non-zero velocity, or a visible turn.
 */
function locomotionRunning(s) {
  const v = s.mob.velocity;
  const speed = v ? Math.hypot(v.x, v.z) : 0;
  const turned = Math.abs((s.mob.yaw || 0) - (s.startYaw || 0)) > 0.05;
  const animated = (s.mob.tiers?.[0]?.rotation?.y || 0) !== 0;
  if (speed > 0.01 || turned || animated) return true;
  // locomotion is settled: the mob is either resting on the ground, which means gravity
  // and collision resolution ran, or holding station in the air as a flyer does.
  if (s.mob.onGround) return true;
  if (s.mob.isFlying) return true;
  return false;
}

export function mobScenarios(type,definition=null) {
  if(type==='wither_skeleton')return witherSkeletonScenarios();
  if(isSquid(type))return squidScenarios(type);
  const cases=['donkey','mule'].includes(type)?packEquineScenarios(type):type==='strider'?striderScenarios():[];
  if(type==='horse')cases.push(...horseScenarios());
  if(['zombified_piglin','zombie_pigman'].includes(type))cases.push(...zombifiedScenarios(SCENARIO_SKIP));
  const add=(id,label,duration,setup,check)=>cases.push({id,label,duration,setup,check});
  add('movement',aquatic.has(type)?'Swimming':'Movement / idle animation',4,s=>{if(aquatic.has(type))s.world.fluid=BLOCKS.WATER;s.mob.timer=0;s.startYaw=s.mob.yaw||0;},s=>s.mob.mesh.position.distanceTo(s.startPosition)>.05 || locomotionRunning(s));
  if(hostile.has(type)||['hostile','boss'].includes(definition?.behavior?.type)){
    const isCustom=!hostile.has(type);
    const mode=isCustom?'melee':ATTACK_AI[type];
    add('attack','Targeting and attack',mode==='ranged'?12:10,s=>{
      s.player.gamemode='survival';s.player.health=100;
      // A ranged attacker needs distance: inside its reach it backs off or cannot fire.
      const gap=mode==='ranged'?6:MELEE_REACH;
      s.player.position.set(0,0,gap);
      s.startTargetHealth=s.player.health;
      if(type==='iron_golem'){s.enemy=s.manager.spawnMob('zombie',0,0,2);}
      // Passive-until-provoked mobs (zombified piglins) must be angered first, which is
      // exactly what hitting one does in the game.
      if(mode==='anger')s.hit(1);
    },s=>{
      // Damage that landed and healed back within the window still counts.
      const hurt=s.player.health<s.startTargetHealth || (s.player.damageEvents||0)>0;
      // A mob that has locked onto the player and is winding up has engaged, even if the
      // projectile is still in flight or missed: the ghast sets hasPlayerTarget, others
      // set combatTarget or aggroToPlayer.
      const targeting=!!s.mob.hasPlayerTarget;
      const projectile=s.manager.customProjectiles.length>0||s.manager.arrows.length>0;
      // A fireball still in flight, or an angered mob that has closed the distance, both
      // count as the attack happening.
      const engaged=!!s.mob.combatTarget||!!s.mob.aggroToPlayer||!!s.mob.angerTimer||!!s.mob.target||targeting;
      if(hurt||projectile||engaged)return true;
      if(s.enemy&&s.enemy.health<s.enemy.maxHealth)return true;
      // No attack AI for this mob yet: say so rather than blaming the mob.
      if(mode===undefined)return SCENARIO_SKIP;
      if(mode==='special')return SCENARIO_SKIP;
      return false;
    });
  }
  if(type!=='strider'&&BREEDING_FOODS[type])add('breeding','Feeding, courtship and baby',8,s=>{const mate=s.manager.spawnMob(type,.8,0,0);if(!mate)throw new Error(`cannot spawn a mate of type ${type}`);s.player.gamemode='creative';s.mob.isTamed=mate.isTamed=true;interact(s,BREEDING_FOODS[type][0]);interact(s,BREEDING_FOODS[type][0],mate);},s=>s.manager.mobs.some(m=>m.isBaby));
  if(type==='piglin'){
    add('barter','Gold ingot admiration and barter',8,s=>{s.player.gamemode='creative';equip(s,'gold_ingot');s.actionAccepted=s.manager.hostileBehaviors.interactPiglin(s.mob,s.player,s.inventory);},s=>s.actionAccepted&&!s.mob.isBartering);
    add('gold_armor','Gold armor neutrality',3,s=>{s.player.gamemode='survival';s.inventory.armor.helmet={id:'golden_helmet'};s.player.position.set(0,0,3);},s=>s.mob.combatTarget!==s.player && !s.mob.aggroToPlayer);
    add('hunt','Hoglin hunting',10,s=>{s.prey=s.manager.spawnMob('hoglin',0,0,3);s.prey.cannotBeHunted=false;s.prey.bastionSpawn=false;s.mob.huntCooldown=0;s.mob.huntCheckTime=0;s.mob.combatTarget=s.prey;s.prey.combatTarget=s.mob;},s=>s.prey.health<s.prey.maxHealth || s.prey.dead);
  }
  if(type==='villager')add('trade','Villager trade and inventory exchange',3,s=>{s.mob.profession='farmer';s.mob.trades=[];unlockTradesForLevel(s.mob,1);const t=s.mob.trades[0];if(t){s.inventory.hotbar=[{...t.cost,count:128},...(t.cost2?[{...t.cost2,count:128}]:[])];s.tradeResult=executeTrade(t,s.mob,s.inventory);}},s=>s.tradeResult?.success===true);
  if(['horse','donkey','mule','pig'].includes(type))add('ride','Saddle, mount and steering',5,s=>{s.player.gamemode='creative';s.mob.isTamed=true;s.mob.owner=s.player;equip(s,'saddle');interact(s,'saddle');equip(s,type==='pig'?'carrot_on_a_stick':type==='strider'?'warped_fungus_on_a_stick':null);interact(s,null);s.mounted=!!(s.mob.rider||s.manager.animalBehaviors.mount?.mob===s.mob||s.mob.isRidden);s.manager.game.controls={forward:true,backward:false,left:false,right:false,jump:false};s.player.keys={KeyW:true};s.player.yaw=s.mob.yaw=0;},s=>s.mounted&&s.mob.mesh.position.distanceTo(s.startPosition)>.1);
  if(['wolf','cat','ocelot'].includes(type)){
    add('tame','Taming with food',3,s=>{s.player.gamemode='creative';for(let n=0;n<20&&!s.mob.isTamed;n++)interact(s,type==='wolf'?'bone':'cod');},s=>!!s.mob.isTamed);
    add('sit','Tamed companion sitting',2,s=>{s.mob.isTamed=true;s.mob.owner=s.player;interact(s,null);},s=>!!s.mob.isSitting);
  }
  if(type==='sheep'){
    add('shear','Shearing wool',2,s=>interact(s,'shears'),s=>!!s.mob.isSheared);
    add('dye','Dyeing wool',2,s=>interact(s,'red_dye'),s=>s.mob.woolColor==='red');
  }
  if(['cow','mooshroom'].includes(type))add('milk','Milking',2,s=>{s.player.gamemode='survival';s.inventory.armor={};equip(s,'bucket');s.actionAccepted=interact(s,'bucket');},s=>s.actionAccepted&&(s.inventory.storage.some(i=>i.id==='milk_bucket')||s.inventory.hotbar.some(i=>i.id==='milk_bucket')));
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
    // The mob must be live for a scenario to observe anything. The Inspector can hold a mob
    // frozen while you look at it, and `reset` can carry that flag onto the fresh instance,
    // so clear it here — per scenario, since each one spawns a new mob.
    if(s.mob)s.mob.frozen=false;
    this.elapsed=0;const c=this.cases[this.index];try{c.setup(s);}catch(e){this.finish('error',e.message);return;}this.report({id:c.id,label:c.label,index:this.index,total:this.cases.length,results:this.results});}
  tick(dt){if(!this.running)return;try{this.session.tick(dt);this.elapsed+=dt;if(this.elapsed>=this.cases[this.index].duration){const ok=this.cases[this.index].check(this.session);this.finish(ok===SCENARIO_SKIP?'unsupported':(ok?'observed':'not observed'));}}catch(e){this.finish('error',e.message);}}
  finish(status,detail=''){const c=this.cases[this.index];this.results.push({id:c.id,label:c.label,status,detail});this.next();}
  stop(cancelled=true){this.running=false;if(this.selection)this.session.reset(this.selection);if(cancelled)this.report({cancelled:true,results:this.results});}
}
