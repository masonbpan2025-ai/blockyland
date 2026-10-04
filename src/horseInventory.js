import {HORSE_ARMOR} from './horseBehavior.js';
// Equipment panel lives inside the existing inventory modal, using its normal
// pointer-lock and close lifecycle. Removing a slot returns the item to inventory.
export function renderHorseInventory(ui,mob){
 document.getElementById('horse-equipment')?.remove();
 if(!mob||!mob.isTamed||mob.isBaby)return;
 const panel=document.createElement('section');panel.id='horse-equipment';
 const title=document.createElement('h3');title.textContent=`${mob.name || 'Horse'} equipment`;panel.append(title);
 for(const [label,key,id] of [['Saddle','isSaddled','saddle'],['Horse armor','horseArmor',mob.horseArmor]]){
  const button=document.createElement('button');button.style.cssText='padding:12px;margin:8px;border:1px solid #789;background:#243247;color:white';button.textContent=`${label}: ${mob[key]?(id || 'saddle').replaceAll('_',' '):'empty'} — click to ${mob[key]?'remove':'equip held item'}`;
  button.onclick=()=>{
   if(mob[key]){if(ui.inv.addItem(id,false,1)===false)return;mob[key]=key==='isSaddled'?false:null;if(key==='isSaddled')mob.saddleMesh.visible=false;else{mob.armor=0;mob.armorMesh.visible=false;}}
   else {const item=ui.inv.getActiveItem();if(!item||!(key==='isSaddled'?item.id==='saddle':mob.type==='horse'&&HORSE_ARMOR[item.id]))return;ui.mobs?.animalBehaviors?.interact(mob,ui.player,ui.inv);}
   ui.updateHotbar();renderHorseInventory(ui,mob);
  };panel.append(button);
 }
 ui.invModal.append(panel);
}
export function updateHorseHud(mob){
 let hud=document.getElementById('horse-health');
 if(!mob){if(hud)hud.hidden=true;return;}
 if(!hud){hud=document.createElement('div');hud.id='horse-health';hud.style.cssText='position:fixed;bottom:102px;left:50%;transform:translateX(-50%);padding:5px 12px;background:#17212bdd;color:#fff;font:14px monospace;pointer-events:none;z-index:1000';document.body.append(hud);}
 hud.hidden=false;hud.textContent=`Horse health ${Math.ceil(mob.health)} / ${Math.ceil(mob.maxHealth)} · ${mob.isSaddled?'Hold Space to jump':'Saddle required to steer'}`;
}
