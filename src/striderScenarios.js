import { BLOCKS } from './blocks.js';
import { boostStrider, spawnNaturalStrider, splashStriderWater, restoreStrider, serializeStrider } from './striderBehavior.js';
const use=(s,id,m=s.mob)=>{s.inventory.active=id?{id,count:8}:null;return s.manager.animalBehaviors.interact(m,s.player,s.inventory);};
export function striderScenarios(){
  const cases=[];const add=(id,label,duration,setup,check)=>cases.push({id:'strider_'+id,label,duration,setup:s=>{s.manager.game.weather.weatherType='clear';setup(s);},check});
  add('warm','Lava flotation and warm appearance',3,s=>{s.world.fluid=BLOCKS.LAVA;s.mob.velocity.set(0,0,0);},s=>s.mob.inLava&&!s.mob.isCold&&Math.abs(s.mob.mesh.position.y-(2+8/9))<.05&&s.mob.health===20);
  add('cold','Purple skin, frown and shivering on land',1,s=>{s.mob.walking=false;s.mob.timer=20;},s=>s.mob.isCold&&s.mob.bodyMesh.material===s.mob.striderColdMat&&s.mob.legs[0].scale.y===.9);
  add('water','Water damages 1 HP every half-second',2,s=>{s.world.fluid=BLOCKS.WATER;s.mob.walking=false;s.mob.timer=20;},s=>s.mob.health===16);
  add('rain','Rain still hurts while floating in lava',2,s=>{s.world.fluid=BLOCKS.LAVA;s.world.dimension='overworld';s.manager.game.weather.weatherType='rain';},s=>s.mob.health===16);
  add('ride','Saddled riding moves automatically with fungus stick',2,s=>{s.world.fluid=BLOCKS.LAVA;s.mob.mesh.position.y=2+8/9;use(s,'saddle');use(s,null);s.inventory.active={id:'warped_fungus_on_a_stick',count:1,durability:100};s.player.yaw=0;},s=>s.mob.rider===s.player&&s.mob.mesh.position.z<-7&&s.mob.health===20);
  add('no_stick','Rider cannot steer without fungus stick',1,s=>{use(s,'saddle');use(s,null);s.player.keys={KeyW:true};s.mob.walking=false;},s=>Math.hypot(s.mob.velocity.x,s.mob.velocity.z)===0);
  add('boost','Boost consumes durability and increases speed',2,s=>{use(s,'saddle');use(s,null);s.inventory.active={id:'warped_fungus_on_a_stick',count:1,durability:2};s.accepted=boostStrider(s.manager.animalBehaviors,s.player,s.inventory.active);},s=>s.accepted&&s.inventory.active.durability===1&&s.mob.boostRemaining>0&&Math.hypot(s.mob.velocity.x,s.mob.velocity.z)>1.78);
  add('shears','Shears remove and return the saddle',.2,s=>{use(s,'saddle');use(s,'shears');},s=>!s.mob.isSaddled&&!s.mob.saddleMesh.visible&&s.entities.drops.some(d=>d.id==='saddle'));
  add('breed','Saddled parents breed; baby grows over 20 minutes',4,s=>{use(s,'saddle');s.mate=s.manager.spawnStrider(.9,0,0);use(s,'warped_fungus');use(s,BLOCKS.WARPED_FUNGUS,s.mate);},s=>s.mob.breedingCooldown>295&&s.mate.breedingCooldown>295&&s.manager.mobs.some(m=>m.isBaby&&m.babyGrowthTimer>1195)&&s.entities.xp>=1&&s.entities.xp<=7);
  add('growth','Baby feeding removes 10% of remaining age',.2,s=>{s.mob.isBaby=true;s.mob.babyGrowthTimer=1000;s.mob.mesh.scale.setScalar(.5);use(s,'warped_fungus');},s=>s.mob.babyGrowthTimer<=900&&s.mob.babyGrowthTimer>899);
  add('age_lock','Golden dandelion pauses baby growth',3,s=>{s.mob.isBaby=true;s.mob.mesh.scale.setScalar(.5);use(s,'golden_dandelion');},s=>s.mob.ageLocked&&s.mob.babyGrowthTimer===1200);
  add('baby_jockey','Baby passenger stays attached after growing',2,s=>{s.manager.random=()=>0;s.carrier=spawnNaturalStrider(s.manager,4,0,0);s.passenger=s.carrier.rider;s.passenger.babyGrowthTimer=.5;},s=>!s.passenger.isBaby&&s.passenger.vehicle===s.carrier&&s.passenger.mesh.position.distanceTo(s.carrier.mesh.position)>1.6);
  add('piglin_jockey','Angry zombified piglin steers its saddled mount',2,s=>{let n=0;s.manager.random=()=>n++<2?.5:0;s.carrier=spawnNaturalStrider(s.manager,4,0,0);s.carrier.rider.angerTimer=20;s.carrier.rider.target=s.player;s.carrier.rider.aggroToPlayer=true;s.player.gamemode='survival';s.player.position.set(4,0,8);s.begin=s.carrier.mesh.position.clone();},s=>s.carrier.isSaddled&&s.carrier.rider.weapon==='warped_fungus_on_a_stick'&&s.carrier.mesh.position.z>s.begin.z+1);
  add('splash','Splash water bottle deals exactly 1 damage',.2,s=>splashStriderWater(s.manager,s.mob.mesh.position),s=>s.mob.health===19);
  add('save','Saddle and baby age survive save restoration',.2,s=>{use(s,'saddle');s.mob.breedingCooldown=300;const record=JSON.parse(JSON.stringify(serializeStrider(s.mob)));s.restored=s.manager.spawnStrider(4,0,0);restoreStrider(s.restored,record);},s=>s.restored.isSaddled&&s.restored.saddleMesh.visible&&s.restored.breedingCooldown>299);
  return cases;
}
