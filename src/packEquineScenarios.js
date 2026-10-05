import { horseScenarios } from './horseScenarios.js';
import { chestSlots, storePackItem, takePackItem } from './packEquine.js';
import { syncPackEquineAppearance } from './packEquineModel.js';
import { BLOCKS } from './blocks.js';

export const usePackItem=(s,id,m=s.mob)=>{s.inventory.active=id?{id,count:4,isBlock:typeof id==='number'}:null;return s.manager.animalBehaviors.interact(m,s.player,s.inventory);};
const ride=s=>{s.mob.isTamed=true;usePackItem(s,'saddle');usePackItem(s,null);};
export function packEquineScenarios(type) {
  const cases=horseScenarios().filter(c=>['horse_tame','horse_unsaddled','horse_ride','horse_jump'].includes(c.id)).map(c=>({...c,id:c.id.replace('horse_',`${type}_`),label:c.label.replaceAll('horse',type)}));
  cases.push(
    {id:`${type}_appearance`,label:'Long ears, visible eyes, flat mane, dark ankles and tufted tail',duration:.1,setup(){},check:s=>s.mob.legs.every(l=>l.getObjectByName('dark-ankle'))&&s.mob.mesh.getObjectByName('ear-inner')&&s.mob.mesh.getObjectByName('eye')&&s.mob.mesh.getObjectByName('tail-tuft')&&s.mob.movementSpeed===.175&&s.mob.jumpStrength===.5},
    {id:`${type}_wild_equipment`,label:'Untamed saddle attempt rears without consuming; chest rejected',duration:.1,setup(s){s.reared=usePackItem(s,'saddle')&&s.mob.rearTime>0&&s.inventory.active.count===4;s.rejected=!usePackItem(s,BLOCKS.CHEST);},check:s=>s.reared&&s.rejected&&!s.mob.isSaddled&&!s.mob.hasChest},
    {id:`${type}_chest`,label:'Tamed chest adds 15 slots; horse armor is rejected',duration:.1,setup(s){s.mob.isTamed=true;s.accepted=usePackItem(s,BLOCKS.CHEST);s.rejected=!usePackItem(s,'diamond_horse_armor')&&!usePackItem(s,BLOCKS.CHEST);},check:s=>s.accepted&&s.rejected&&chestSlots(s.mob).length===15&&s.mob.chestMesh.visible&&!s.mob.horseArmor},
    {id:`${type}_storage`,label:'Store and retrieve an item stack with metadata',duration:.1,setup(s){s.mob.isTamed=true;usePackItem(s,'chest');s.inventory.active={id:'diamond',count:12,customName:'Cargo',enchantments:[{id:'fortune',level:2}]};s.stored=storePackItem(s.mob,s.inventory,14);s.saved=JSON.stringify(chestSlots(s.mob)[14]);s.taken=takePackItem(s.mob,s.inventory,14);},check:s=>s.stored&&s.taken&&s.saved===JSON.stringify(s.inventory.hotbar[0])&&!chestSlots(s.mob)[14]},
    {id:`${type}_shears`,label:'Shears remove saddle; attached chest stays',duration:.1,setup(s){s.mob.isTamed=true;usePackItem(s,'saddle');usePackItem(s,'chest');usePackItem(s,'shears');},check:s=>!s.mob.isSaddled&&s.mob.hasChest&&s.mob.chestMesh.visible&&s.entities.drops.filter(d=>d.id==='saddle').length===1},
    {id:`${type}_food`,label:'Carrot heals and raises temper without breeding',duration:.1,setup(s){s.mob.health=s.mob.maxHealth-5;s.before=s.mob.health;usePackItem(s,'carrot');},check:s=>s.mob.health===s.before+3&&s.mob.temper===3&&!s.mob.inLove},
    {id:`${type}_baby`,label:'Half-size foal grows with sugar; equipment and mounting rejected',duration:.1,setup(s){s.mob.isBaby=true;s.mob.babyGrowthTimer=1200;syncPackEquineAppearance(s.mob);s.rejected=[null,'saddle','chest','diamond_horse_armor'].every(id=>!usePackItem(s,id));usePackItem(s,'sugar');},check:s=>s.rejected&&s.mob.mesh.scale.x===.5&&s.mob.babyGrowthTimer<1170.1&&!s.mob.isTamed},
    {id:`${type}_age_lock`,label:'Golden dandelion pauses baby growth',duration:3,setup(s){s.mob.isBaby=true;s.mob.babyGrowthTimer=30;usePackItem(s,'golden_dandelion');},check:s=>s.mob.isBaby&&s.mob.ageLocked&&s.mob.babyGrowthTimer===1200},
    {id:`${type}_lead`,label:'Wild pack animal follows a lead',duration:2,setup(s){s.player.position.set(0,0,6);usePackItem(s,'lead');},check:s=>s.mob.leashHolder===s.player&&s.mob.mesh.position.z>1&&s.mob.leashLine},
    {id:`${type}_float`,label:'Ridden pack animal floats and steers through water',duration:2,setup(s){s.world.fluid=BLOCKS.WATER;s.mob.mesh.position.y=2.65;ride(s);s.manager.game.controls={forward:true};s.origin=s.mob.mesh.position.clone();},check:s=>s.player.ridingMob===s.mob&&s.mob.mesh.position.y>2&&s.mob.mesh.position.distanceTo(s.origin)>3},
    {id:`${type}_submerged`,label:'A submerged mount dismounts its rider',duration:.1,setup(s){ride(s);s.world.fluid=BLOCKS.WATER;},check:s=>!s.player.ridingMob&&!s.mob.rider},
    {id:`${type}_death`,label:'Death returns saddle, chest and stored cargo once',duration:1.1,setup(s){s.mob.isTamed=true;usePackItem(s,'saddle');usePackItem(s,BLOCKS.CHEST);s.inventory.active={id:'diamond',count:13};storePackItem(s.mob,s.inventory);s.hit(1000);},check:s=>s.entities.drops.filter(d=>d.id==='saddle').length===1&&s.entities.drops.filter(d=>d.id===BLOCKS.CHEST&&d.isBlock).length===1&&s.entities.drops.filter(d=>d.id==='diamond'&&d.count===13).length===1&&s.entities.xp>=1&&s.entities.xp<=3}
  );
  if(type==='donkey')cases.push(
    {id:'donkey_breed',label:'Two tamed donkeys produce an untamed donkey foal',duration:4,setup(s){s.mob.isTamed=true;const mate=s.manager.spawnDonkey(0,0,1.5);mate.isTamed=true;usePackItem(s,'golden_carrot');usePackItem(s,'golden_carrot',mate);},check:s=>s.manager.mobs.some(m=>m.type==='donkey'&&m.isBaby&&m.mesh.scale.x===.5&&!m.isTamed)&&s.mob.breedingCooldown>290},
    {id:'donkey_mule',label:'Horse × donkey produces a brown sterile mule',duration:4,setup(s){s.mob.isTamed=true;const mate=s.manager.spawnHorse(0,0,1.5);mate.isTamed=true;usePackItem(s,'golden_carrot');usePackItem(s,'golden_carrot',mate);},check:s=>s.manager.mobs.some(m=>m.type==='mule'&&m.isBaby&&m.mesh.scale.x===.5&&!m.isTamed)}
  );
  else cases.push({id:'mule_sterile',label:'Golden foods heal a mule but never enable breeding',duration:.1,setup(s){s.mob.isTamed=true;s.mob.health-=4;usePackItem(s,'golden_carrot');s.healed=s.mob.health===s.mob.maxHealth;s.noConsume=!usePackItem(s,'golden_apple');},check:s=>s.healed&&s.noConsume&&!s.mob.inLove});
  return cases;
}
