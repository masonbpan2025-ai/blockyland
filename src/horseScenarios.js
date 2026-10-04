// These scenarios run through the same debug session as gameplay and the inspector.
export function horseScenarios(){
 const use=(s,id,m=s.mob)=>{s.inventory.active=id?{id,count:64,isBlock:false}:null;return s.manager.animalBehaviors.interact(m,s.player,s.inventory);};
 const ride=s=>{s.mob.isTamed=true;use(s,'saddle');use(s,null);};
 return [
 {id:'horse_tame',label:'Temper: buck, remount and tame',duration:3.5,setup(s){s.mob.temper=0;use(s,null);s.manager.animalBehaviors.updateMountSteering(3.1,s.player,{});s.bucked=!s.player.ridingMob&&s.mob.temper===5;s.mob.temper=100;use(s,null);},check:s=>s.bucked&&s.mob.isTamed},
 {id:'horse_unsaddled',label:'Unsaddled horse rejects steering and jumping',duration:1,setup(s){s.mob.isTamed=true;use(s,null);s.manager.game.controls={forward:true,jump:true};s.origin=s.mob.mesh.position.clone();},check:s=>s.mob.mesh.position.distanceTo(s.origin)<.05&&!s.mob.jumpCharge},
 {id:'horse_ride',label:'Saddled riding moves horse and rider together',duration:2,setup(s){ride(s);s.origin=s.mob.mesh.position.clone();s.manager.game.controls={forward:true};},check:s=>s.mob.mesh.position.distanceTo(s.origin)>5&&Math.abs(s.player.position.z-s.mob.mesh.position.z)<.01},
 {id:'horse_jump',label:'Charged grounded jump launches and lands',duration:2,setup(s){ride(s);s.mob.onGround=true;s.manager.animalBehaviors.updateMountSteering(.7,s.player,{jump:true});s.manager.animalBehaviors.updateMountSteering(0,s.player,{jump:false});s.launched=s.mob.velocity.y>5;},check:s=>s.launched&&s.mob.onGround},
 {id:'horse_food',label:'Apple heals; golden food breeds only tamed adults',duration:.1,setup(s){s.mob.health-=5;use(s,'apple');s.appleGood=s.mob.health===s.mob.maxHealth-2&&!s.mob.inLove;use(s,'golden_carrot');s.wildGood=!s.mob.inLove;s.mob.isTamed=true;use(s,'golden_carrot');},check:s=>s.appleGood&&s.wildGood&&s.mob.inLove>0},
 {id:'horse_mule',label:'Horse and donkey produce a sterile mule foal',duration:4,setup(s){s.mob.isTamed=true;const mate=s.manager.spawnMob('donkey',0,0,1.5);mate.isTamed=true;use(s,'golden_carrot');use(s,'golden_carrot',mate);},check:s=>s.manager.mobs.some(m=>m.type==='mule'&&m.isBaby&&m.babyGrowthTimer>1190&&m.mesh.scale.x===.7)},
 {id:'horse_armor',label:'Armor protects and shears remove armor before saddle',duration:.1,setup(s){s.mob.isTamed=true;use(s,'saddle');use(s,'diamond_horse_armor');const h=s.mob.health;s.hit(5);s.protected=s.mob.health>h-5;use(s,'shears');s.order=!s.mob.horseArmor&&s.mob.isSaddled;use(s,'shears');},check:s=>s.protected&&s.order&&!s.mob.isSaddled&&s.entities.drops.length===2},
 {id:'horse_foal',label:'Foal feeding accelerates growth; cannot mount',duration:.1,setup(s){s.mob.isBaby=true;s.mob.babyGrowthTimer=1200;s.mob.mesh.scale.setScalar(.7);s.rejected=!use(s,null);use(s,'sugar');},check:s=>s.rejected&&s.mob.isBaby&&s.mob.babyGrowthTimer<1171&&s.mob.babyGrowthTimer>1169}
 ];
}
