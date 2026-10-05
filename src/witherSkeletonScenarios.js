import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { poseWitherSkeleton } from './witherSkeletonModel.js';
export function witherSkeletonScenarios() {
  const cases=[],add=(id,label,duration,setup,check)=>cases.push({id,label,duration,setup,check});
  const combat=s=>{s.player.gamemode='survival';s.player.position.set(0,0,1.4);};
  add('appearance','Tall skull, hollow eyes, ribs, thin limbs and stone sword',.1,s=>{s.mob.frozen=true;},s=>s.mob.head.material.length===6&&s.mob.ribs.length===3&&s.mob.weapon==='stone_sword'&&s.mob.height===2.4);
  add('movement','Idle walk uses hip and shoulder pivots',1,s=>{s.mob.wanderGoal=new THREE.Vector3(10,0,0);s.mob.wanderTimer=10;},s=>s.mob.mesh.position.length()>.3&&Math.abs(s.mob.leftLeg.rotation.x)>.01);
  for(const [difficulty,damage] of [['easy',5],['normal',8],['hard',12]])add(`melee_${difficulty}`,`${difficulty}: ${damage} melee damage and Wither`,.1,s=>{combat(s);s.manager.game.difficulty=difficulty;},s=>s.player.health===100-damage&&s.player.statusEffects.wither);
  add('melee','Sprint toward a visible survival player',1,s=>{s.player.gamemode='survival';},s=>s.mob.target===s.player&&s.mob.mesh.position.z>.5&&s.mob.movementSpeed===.3125);
  add('shield','Blocked attack does not apply Wither',.1,s=>{combat(s);s.player.isBlocking=true;},s=>s.player.health===100&&!s.player.statusEffects.wither);
  for(const mode of ['creative','spectator'])add(mode,`Ignore ${mode} player`,1,s=>{s.player.gamemode=mode;s.player.position.set(0,0,1);},s=>s.player.health===100&&!s.mob.target);
  add('peaceful','Peaceful removes the hostile without drops',1,s=>{s.manager.game.difficulty='peaceful';},s=>!s.manager.mobs.includes(s.mob)&&s.entities.drops.length===0&&s.entities.xp===0);
  add('range','Player outside 16 blocks is not targeted',.1,s=>{s.player.gamemode='survival';s.player.position.set(0,0,17);},s=>!s.mob.target);
  add('wall','Cannot attack through a wall',.1,s=>{combat(s);s.player.position.z=2.4;for(let y=0;y<4;y++)s.world.setVoxel(0,y,1,BLOCKS.STONE);},s=>s.player.damageEvents===0);
  add('wolf','Flee a hunting wolf',.3,s=>{s.wolf=s.manager.spawnWolf(0,0,3);s.startDistance=s.mob.mesh.position.distanceTo(s.wolf.mesh.position);},s=>s.mob.fleeingWolf&&s.wolf.skeletonPrey===s.mob&&s.mob.velocity.z<0);
  add('golem','Attack iron golems and apply Wither',.1,s=>{s.victim=s.manager.spawnIronGolem(0,0,1.4);s.victim.frozen=true;s.initialHealth=s.victim.health;},s=>s.victim.health<s.initialHealth&&s.victim.witherEffect?.duration>0);
  add('villager','Ignore villagers',.1,s=>{s.victim=s.manager.spawnVillager(0,0,1.4);s.victim.frozen=true;s.initialHealth=s.victim.health;},s=>s.victim.health===s.initialHealth&&!s.mob.target);
  add('bow','Command-equipped bow fires flaming arrows',.1,s=>{s.player.gamemode='survival';s.mob.weapon='bow';poseWitherSkeleton(s.mob);},s=>s.manager.arrows.some(a=>a.flaming&&a.shooter===s.mob)&&s.mob.bowVisual.visible);
  add('lava','Fire and lava immunity',2,s=>{s.world.fluid=BLOCKS.LAVA;},s=>s.mob.health===20);
  add('water','Sinks in water without drowning',16,s=>{s.world.fluid=BLOCKS.WATER;s.mob.mesh.position.y=1;},s=>s.mob.health===20&&s.mob.mesh.position.y<1);
  add('wither_immunity','Immune to Wither, poison and regeneration',.1,s=>{s.immune=['wither','poison','regeneration'].every(id=>s.mob.applyStatusEffect(id,10)===false);},s=>s.immune&&s.mob.health===20);
  add('damage','Damage feedback across every visible material',.05,s=>{s.hit(3);},s=>s.mob.health===17&&s.mob.hurtTime>0&&s.mob.hurtMaterials.length>1);
  add('death','Player credit: bones, rare skull and equipment XP',1,s=>{s.manager.random=()=>.01;s.hit(100);},s=>s.entities.drops.some(d=>d.id==='wither_skeleton_skull')&&s.entities.xp>=5&&!s.manager.mobs.includes(s.mob));
  return cases;
}
