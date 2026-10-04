import {BLOCKS} from './blocks.js';
import {setZombifiedBaby,clearZombifiedAnger,mountZombified,serializeZombified,restoreZombified,convertLightningPigs} from './zombifiedPiglin.js';
export function zombifiedScenarios(skip){
 const cases=[],add=(id,label,duration,setup,check)=>cases.push({id:'zp-'+id,label,duration,setup,check});
 add('neutral','Neutral around a survival player',3,s=>{s.player.gamemode='survival';s.player.position.set(0,0,1.4);},s=>s.player.damageEvents===0&&!s.mob.target);
 add('alarm','Nearby peers retaliate against the same attacker',.4,s=>{s.player.gamemode='survival';s.peer=s.manager.spawnZombifiedPiglin(3,0,0,{natural:false});s.hit(1);},s=>s.peer.target===s.player&&s.peer.angerTimer>0);
 add('visible','Anger stays while the target is visible',3,s=>{s.player.gamemode='survival';s.player.position.set(0,0,8);s.hit(1);s.anger=s.mob.angerTimer;},s=>s.mob.angerTimer===s.anger);
 add('forgive','Lost targets are forgiven',1,s=>{s.player.gamemode='survival';s.hit(1);s.mob.angerTimer=.3;s.player.position.set(0,0,200);},s=>!s.mob.target&&s.mob.angerTimer===0);
 add('baby','Babies stay small and never grow',3,s=>{setZombifiedBaby(s.mob,true);s.mob.babyGrowthTimer=.1;},s=>s.mob.isBaby&&s.mob.mesh.scale.x===.5);
 add('crossbow','Converted crossbow is melee only',2,s=>{s.mob.weapon='crossbow';s.player.gamemode='survival';s.player.position.set(0,0,1.3);s.hit(1);},s=>s.player.damageEvents>0&&(s.manager.arrows?.length||0)===0);
 add('jockey','Chicken jockey follows its rider',2,s=>{setZombifiedBaby(s.mob,true);mountZombified(s.mob,s.manager.spawnChicken(0,0,0));s.player.gamemode='survival';s.player.position.set(0,0,8);s.hit(1);},s=>s.mob.jockeyMount.mesh.position.z>.5&&Math.abs(s.mob.mesh.position.y-s.mob.jockeyMount.mesh.position.y-.55)<.01);
 add('save','Age and equipment survive reconstruction',.2,s=>{setZombifiedBaby(s.mob,true);s.mob.weapon='crossbow';const data=serializeZombified(s.mob);clearZombifiedAnger(s.mob);restoreZombified(s.mob,JSON.parse(JSON.stringify(data)),s.manager);},s=>s.mob.isBaby&&s.mob.weapon==='crossbow'&&!!s.mob.weaponMesh);
 add('undead','Lava does not damage this undead mob',2,s=>{s.world.fluid=BLOCKS.LAVA;},s=>s.mob.health===20);
 add('effects','Undead potion inversion and immunity',.2,s=>{s.mob.health=10;s.mob.applyStatusEffect('harming',0,1);s.mob.applyStatusEffect('healing',0,1);s.immune=s.mob.applyStatusEffect('poison',10)===false;},s=>s.mob.health===8&&s.immune);
 add('lightning','Lightning converts pigs without death loot',.2,s=>{const pig=s.manager.spawnPig(2,0,0);pig.name='Lightning pig';s.converted=convertLightningPigs(s.manager,pig.mesh.position.clone());},s=>s.converted.some(m=>m.name==='Lightning pig')&&s.entities.drops.length===0);
 if(skip){for(const [id,label] of [['world-spawn','Natural light checks and portal random-tick spawning'],['eggs','Turtle egg seeking and trampling'],['seasonal','Halloween headgear and natural weapon enchantments'],['spear-velocity','Exact velocity-based spear damage']])add('unsupported-'+id,label,.1,()=>{},()=>skip);}
 return cases;
}
